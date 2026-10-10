// The first request on a new connection costs 265–606 ms; later requests on the
// same connection take ~1 ms (measured 2026-10-02, both instances). So the client
// keeps one connection per instance and sends requests over it one at a time.
// The connection itself comes from a Connect (transport.ts), so this runs anywhere.
import { cmd } from "./commands.ts";
import * as p from "./parse.ts";
import type { Connect, Connection } from "./transport.ts";
import { PROLOG, parseDocument, type Element } from "./xml.ts";

export const DEFAULT_PORT = 4321;
/**
 * Longest reply line accepted. Real replies are a few KB (filter lists ~10 KB);
 * a peer that sends more without a newline is broken or hostile, and is dropped
 * rather than buffered until the process runs out of memory.
 */
export const MAX_REPLY = 4 * 1024 * 1024;

/** Commands that change something relative to the current state: never resent. */
const NOT_IDEMPOTENT = new Set([
  "Next",
  "Previous",
  "Forward",
  "Backward",
  "VolumeUp",
  "VolumeDown",
  "VolumeMute",
  "PlaylistAdd",
  "PlaylistRemove",
  "PlaylistMoveUp",
  "PlaylistMoveDown",
]);

/** Anything that went wrong talking to HQPlayer: network, timeout, or a reply we couldn't read. */
export class PeerError extends Error {
  override name = "PeerError";
}
const asPeerError = (e: unknown) => (e instanceof PeerError ? e : new PeerError((e as Error).message, { cause: e }));

export interface ClientOptions {
  /** How to open the connection: nodeConnect (@app/protocol/node) on the server. */
  connect: Connect;
  port?: number;
  /** The first SetFilter blocked ~5 s while the filter was prepared (measured). */
  timeoutMs?: number;
}

const encoder = new TextEncoder();

export class HqpClient {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
  /** Close our idle connection before HQPlayer closes it (~156 s, measured). */
  readonly idleMs: number;

  private readonly connect: Connect;
  private conn: Connection | null = null;
  private buf = "";
  private waiting: ((line: string) => void) | null = null;
  private failWaiting: ((e: Error) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Connections opened so far (diagnostics and tests). */
  connections = 0;

  constructor(host: string, opts: ClientOptions & { idleMs?: number }) {
    this.host = host;
    this.connect = opts.connect;
    this.port = opts.port ?? DEFAULT_PORT;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.idleMs = opts.idleMs ?? 120_000;
  }

  /** Send one request and parse the reply. Requests are queued, one in flight at a time. */
  request(body: string): Promise<Element> {
    const run = this.queue.then(() => this.exchange(body));
    this.queue = run.catch(() => undefined);
    return run.then(parseDocument).catch((e) => {
      throw asPeerError(e);
    });
  }

  /** Request and parse; a reply that doesn't parse is HQPlayer's problem, not ours. */
  private async ask<T>(body: string, parse: (el: Element) => T): Promise<T> {
    const el = await this.request(body);
    try {
      return parse(el);
    } catch (e) {
      throw asPeerError(e);
    }
  }

  private async exchange(body: string): Promise<string> {
    const reused = this.conn !== null;
    try {
      return await this.once(body);
    } catch (e) {
      // A reused connection may have been closed by HQPlayer while idle. Retry once
      // on a fresh one, but only commands that are safe to repeat: setters carry
      // absolute values; Next, VolumeUp and the like don't.
      const name = /^<(\w+)/.exec(body)?.[1] ?? "";
      if (reused && (e as { stale?: boolean }).stale && !NOT_IDEMPOTENT.has(name)) return this.once(body);
      throw e;
    }
  }

  private async once(body: string): Promise<string> {
    const conn = await this.connected();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.drop();
        reject(new Error(`timeout after ${this.timeoutMs} ms waiting for ${this.host}:${this.port}`));
      }, this.timeoutMs);
      const done = () => {
        clearTimeout(timer);
        this.waiting = this.failWaiting = null;
        this.idleTimer = setTimeout(() => this.drop(), this.idleMs);
        // Node: don't keep the process alive for it. Elsewhere there's no such thing.
        (this.idleTimer as { unref?: () => void }).unref?.();
      };
      this.waiting = (line) => {
        done();
        resolve(line);
      };
      this.failWaiting = (e) => {
        done();
        reject(e);
      };
      conn.write(encoder.encode(PROLOG + body + "\n"));
    });
  }

  private async connected(): Promise<Connection> {
    if (this.conn) return this.conn;
    // Characters can be split across chunks: decode as a stream.
    const decoder = new TextDecoder();
    let received = 0;
    let conn: Connection | undefined;
    this.buf = ""; // before connecting: data can arrive as soon as it's open
    const lost = (e?: Error) => {
      if (conn && this.conn === conn) this.conn = null;
      // Accepted, then closed without a byte: measured on unlicensed HQPlayer 6
      // Embedded once its ~30-minute trial runs out (the port stays open).
      const closed =
        received === 0
          ? `${this.host}:${this.port} accepted the connection but closed it without replying. ` +
            "An unlicensed (trial) HQPlayer does this after about 30 minutes; restarting it fixes that."
          : `connection to ${this.host}:${this.port} closed`;
      this.failWaiting?.(Object.assign(e ?? new Error(closed), { stale: true }));
    };
    conn = await this.connect(
      { host: this.host, port: this.port, timeoutMs: this.timeoutMs },
      {
        data: (bytes) => {
          received += bytes.length;
          const d = decoder.decode(bytes, { stream: true });
          // Search only the new chunk for line ends: rescanning the whole buffer
          // on every chunk is quadratic.
          let start = 0;
          let nl: number;
          while ((nl = d.indexOf("\n", start)) >= 0) {
            const line = this.buf + d.slice(start, nl);
            this.buf = "";
            start = nl + 1;
            this.waiting?.(line);
          }
          this.buf += d.slice(start);
          if (this.buf.length > MAX_REPLY) {
            this.buf = "";
            lost(new Error(`reply from ${this.host}:${this.port} too long`));
            conn?.close();
          }
        },
        closed: (e) => lost(e),
      },
    );
    this.connections++;
    this.conn = conn;
    return conn;
  }

  private drop() {
    this.conn?.close();
    this.conn = null;
  }

  /** This end's address on the open connection to HQPlayer: an address HQPlayer can reach us at (unless NAT is between). */
  get localAddress(): string | undefined {
    return this.conn?.localAddress ?? undefined;
  }

  /** Close the connection. The client reconnects on the next request. */
  close() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.drop();
  }

  /** Send a command and report its outcome. An OK is NOT proof of effect: read State back. */
  send(body: string): Promise<p.Outcome> {
    return this.ask(body, p.outcome);
  }

  info = () => this.ask(cmd.getInfo(), p.parseInfo);
  state = () => this.ask(cmd.state(), p.parseState);
  status = () => this.ask(cmd.status(), p.parseStatus);
  modes = () => this.ask(cmd.getModes(), p.parseModes);
  filters = () => this.ask(cmd.getFilters(), p.parseFilters);
  shapers = () => this.ask(cmd.getShapers(), p.parseShapers);
  rates = () => this.ask(cmd.getRates(), p.parseRates);
  volumeRange = () => this.ask(cmd.volumeRange(), p.parseVolumeRange);
  configurations = () => this.ask(cmd.configurationList(), p.parseConfigurationList);
  matrixProfiles = () => this.ask(cmd.matrixListProfiles(), p.parseMatrixProfiles);
}
