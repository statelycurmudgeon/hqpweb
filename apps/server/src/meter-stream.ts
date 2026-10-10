// HQPlayer's meter stream, for the browser (docs/design-v2-layout.md rule 9). Connects to
// the meter port (control port + 1) only while someone is watching, and lets go a few
// seconds after the last viewer leaves; reconnects if HQPlayer drops it. Frames are paced
// (meter-pace.ts) and condensed to log bands (@app/protocol meter.ts), ~20 updates a second.
// Read-only: the port takes no commands. Measured cost to HQPlayer: none (2026-10-08, PCM
// 384k on Linux; DSD256 and DSD1024 on macOS, alternating runs).
import {
  bandEdges,
  condense,
  edgeHz,
  meterFrameSize,
  parseMeterFrame,
  peakAcross,
  type Connect,
  type Connection,
  type MeterFrame,
} from "@app/protocol";
import { MeterPacer } from "./meter-pace.ts";

export interface MeterEvent {
  /** Frames are coming (HQPlayer is playing). */
  live: boolean;
  /** The meter port is connected. False: HQPlayer doesn't offer a meter here, or isn't reachable. */
  connected: boolean;
  /** Per channel: peakMax, peak, rms, rmsMax (dB). */
  levels?: number[][];
  /** Per channel: log-spaced bands from 20 Hz (40 at 1025 bins), dB. */
  bands?: number[][];
  /** The bands' edges in Hz (one more than bands), so low bands are drawn as wide as they are. */
  edgesHz?: number[];
  /** Left/right correlation per band, −1..1 (protocol bandCorrelation); absent for one channel. */
  corr?: number[];
}

export interface MeterTiming {
  tickMs: number;
  lingerMs: number;
  retryMs: number;
  /** Give up opening the meter port after this long (then retry). Inferred, not measured. */
  connectMs: number;
}
const TIMING: MeterTiming = { tickMs: 50, lingerMs: 5000, retryMs: 2000, connectMs: 5000 };
const EMPTY = new Uint8Array(0);

export class MeterStream {
  private readonly host: string;
  private readonly port: number;
  private readonly connect: Connect;
  private readonly timing: MeterTiming;
  private readonly listeners = new Set<(e: MeterEvent) => void>();
  /** Opening or open; `gen` tells this connection's events from an earlier one's. */
  private active = false;
  private gen = 0;
  private conn: Connection | null = null;
  private connected = false;
  private buf: Uint8Array = EMPTY;
  private pacer = new MeterPacer<MeterFrame>();
  private edges: { key: string; edges: number[]; hz: number[] } | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private linger: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(host: string, port: number, connect: Connect, timing: Partial<MeterTiming> = {}) {
    this.host = host;
    this.port = port;
    this.connect = connect;
    this.timing = { ...TIMING, ...timing };
  }

  subscribe(fn: (e: MeterEvent) => void): () => void {
    this.listeners.add(fn);
    if (this.linger) clearTimeout(this.linger);
    this.linger = null;
    if (!this.active) this.open();
    if (!this.tick) this.tick = setInterval(() => this.emit(), this.timing.tickMs);
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.linger = setTimeout(() => this.stop(), this.timing.lingerMs);
    };
  }

  private open() {
    const gen = ++this.gen;
    this.active = true;
    const ended = () => {
      if (gen !== this.gen) return; // an earlier connection, already let go
      this.active = this.connected = false;
      this.conn = null;
      this.buf = EMPTY;
      if (this.listeners.size && !this.retry)
        this.retry = setTimeout(() => ((this.retry = null), this.open()), this.timing.retryMs);
    };
    this.connect(
      { host: this.host, port: this.port, timeoutMs: this.timing.connectMs },
      { data: (d) => gen === this.gen && this.onData(d), closed: ended },
    ).then((c) => {
      if (gen !== this.gen) return c.close(); // stopped while it was opening
      this.conn = c;
      this.connected = true;
    }, ended);
  }

  private onData(d: Uint8Array) {
    this.buf = this.buf.length ? concat(this.buf, d) : d;
    const now = Date.now();
    while (this.buf.length >= 32) {
      const size = meterFrameSize(this.buf);
      if (size > 1_000_000) {
        this.conn?.close(); // not a meter stream: give up on this connection
        return;
      }
      if (this.buf.length < size) return;
      this.pacer.push(parseMeterFrame(this.buf.subarray(0, size)), now);
      this.buf = this.buf.subarray(size);
    }
  }

  private emit() {
    const now = Date.now();
    const frame = this.pacer.take(now);
    const live = !!frame && this.pacer.live(now);
    const e: MeterEvent = { live, connected: this.connected };
    if (live && frame) {
      const key = `${frame.length}|${frame.bandwidth}`;
      if (this.edges?.key !== key) {
        const edges = bandEdges(frame.length, frame.bandwidth);
        this.edges = { key, edges, hz: edgeHz(edges, frame.length, frame.bandwidth).map((x) => Math.round(x)) };
      }
      const c = condense(frame, this.edges.edges);
      Object.assign(e, c, { levels: peakAcross(c.levels, this.pacer.passed()), edgesHz: this.edges.hz });
    }
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        // one broken listener (a closed response) mustn't stop the others
      }
    }
  }

  private stop() {
    if (this.tick) clearInterval(this.tick);
    if (this.retry) clearTimeout(this.retry);
    this.tick = this.retry = this.linger = null;
    this.gen++; // whatever is open or opening now belongs to no one
    this.conn?.close();
    this.conn = null;
    this.active = this.connected = false;
    this.buf = EMPTY;
    this.pacer = new MeterPacer<MeterFrame>();
  }

  close() {
    this.listeners.clear();
    if (this.linger) clearTimeout(this.linger);
    this.stop();
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
