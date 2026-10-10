// HTTP API on node:http, no framework.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import {
  HttpError,
  ROON_ACTIONS,
  RoonLink,
  Service,
  type RoonAction,
  wireError,
  type AppConfig,
  type DocStore,
  type HistoryStore,
  type Instance,
  type KeptTiming,
  type LearnedStore,
  type MeterTiming,
  type PresetStore,
  type RoonTransport,
  type WatchTiming,
} from "@app/core";
import type { DiscoverOptions } from "@app/protocol";
import { serveStatic } from "./static.ts";
import { SECURITY_HEADERS } from "./headers.ts";
import { GITHUB_CLAPS_URL, serveClapTrack } from "./calibration.ts";
import { playClapTrack } from "./calibrate-play.ts";
import { COMMIT, VERSION } from "./version.ts";
import { nodeNet, type Net } from "./node-net.ts";
import { discoverCores } from "./roon/sood.ts";

export interface AppOptions {
  pollMs?: number;
  /**
   * Hostnames this server answers to, besides loopback. Anything else is refused,
   * which blocks DNS rebinding: a hostile page can point its own name at this
   * server, but the browser still sends that name in Host.
   */
  allowedHosts?: string[];
  /** Built web app to serve (production). Unset in development, where Vite serves it. */
  staticDir?: string;
  /** Where instances added in Settings are saved (docs.ts); unset = in memory only. */
  docs?: DocStore;
  /** Discovery settings; false disables it (tests default to false). */
  discovery?: DiscoverOptions | false;
  /** Control port assumed for discovered instances (default 4321). */
  discoveredPort?: number;
  /** Where presets are kept. Default: in memory only. */
  presets?: PresetStore;
  /** Where failed combinations are remembered. Default: in memory only. */
  learned?: LearnedStore;
  /** Change history and settings last seen per mode (history.ts). Default: in memory. */
  history?: HistoryStore;
  /** Playback-check timing; tests shorten it. */
  timing?: { quick: WatchTiming; major: WatchTiming };
  /** Live playback-speed window (default 30 s). */
  speedWindowMs?: number;
  /** Tests: shorten when a playing combination counts as settled (kept-up.ts). */
  keptTiming?: KeptTiming;
  /** Tests: shorten the meter stream's timing (meter-stream.ts). */
  meterTiming?: Partial<MeterTiming>;
  /** Playlist re-read interval while stopped (default 5 s). */
  queueEveryMs?: number;
  /** How long Play may take before "didn't start" (default 5 s). */
  playWaitMs?: number;
  /** Optional Roon link. Default: off, in memory only. */
  roon?: RoonLink;
  /** Tests: stand in for Roon's transport per instance (default: the RoonLink's linked zone). */
  roonTransport?: (instanceId: string) => RoonTransport | null;
  /** How HQPlayer is reached and found (node-net.ts). Default: Node's. */
  net?: Net;
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1"];
const MAX_BODY = 16 * 1024;
/** The meter stream's most unsent output per client before frames are skipped (~250 updates). */
const METER_BACKLOG = 256 * 1024;

const hostnameOf = (hostHeader: string) => hostHeader.replace(/:\d+$/, "").toLowerCase();

/**
 * IP literals are always allowed as Host: DNS rebinding needs an attacker-chosen
 * hostname, so a request addressed to a bare IP can't be a rebinding attack.
 * Hostnames must be listed in ALLOWED_HOSTS.
 */
const isIpLiteral = (h: string) => isIP(h.replace(/^\[|\]$/g, "")) !== 0;

/** A body is a value, never a promise: forgetting an `await` would send `{}` (seen in review). */
function send<T>(res: ServerResponse, status: number, body: T extends PromiseLike<unknown> ? never : T) {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) throw new HttpError(415, "expected application/json");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "body too large");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function parseRoonSettings(body: unknown): { enabled?: boolean; host?: string; port?: number } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, "body must be a JSON object");
  const { enabled, host, port, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) throw new HttpError(400, `unknown field "${Object.keys(rest)[0]}"`);
  if (enabled !== undefined && typeof enabled !== "boolean") throw new HttpError(400, "enabled must be a boolean");
  if (host !== undefined && typeof host !== "string") throw new HttpError(400, "host must be a string");
  if (port !== undefined && !Number.isInteger(port)) throw new HttpError(400, "port must be a whole number");
  return {
    ...(enabled !== undefined ? { enabled: enabled as boolean } : {}),
    ...(host !== undefined ? { host: (host as string).trim() } : {}),
    ...(port !== undefined ? { port: port as number } : {}),
  };
}

type Handler = (req: IncomingMessage, res: ServerResponse, inst: Instance) => Promise<unknown> | void;

export function buildApp(config: AppConfig, opts: AppOptions = {}) {
  const roon = opts.roon ?? new RoonLink(null);
  // Pausing for a mode switch goes through Roon when hqpweb has the instance's zone (change-engine.ts).
  const roonTransport =
    opts.roonTransport ??
    ((id: string): RoonTransport | null =>
      roon.zoneFor(id)
        ? {
            pause: () => roon.control(id, "pause"),
            play: () => roon.control(id, "play"),
            playing: () => roon.zoneFor(id)?.state === "playing",
          }
        : null);
  // Everything else is the core's (packages/core service.ts): this file is HTTP around it.
  const service = new Service(config, {
    net: opts.net ?? nodeNet,
    docs: opts.docs ?? null,
    roonTransport,
    ...(opts.learned ? { learned: opts.learned } : {}),
    ...(opts.history ? { history: opts.history } : {}),
    ...(opts.presets ? { presets: opts.presets } : {}),
    discovery: opts.discovery ?? false,
    ...(opts.discoveredPort ? { discoveredPort: opts.discoveredPort } : {}),
    ...(opts.timing ? { timing: opts.timing } : {}),
    ...(opts.speedWindowMs ? { speedWindowMs: opts.speedWindowMs } : {}),
    ...(opts.keptTiming ? { keptTiming: opts.keptTiming } : {}),
    ...(opts.meterTiming ? { meterTiming: opts.meterTiming } : {}),
    ...(opts.queueEveryMs ? { queueEveryMs: opts.queueEveryMs } : {}),
    ...(opts.playWaitMs ? { playWaitMs: opts.playWaitMs } : {}),
  });
  const listedHosts = new Set((opts.allowedHosts ?? []).map((h) => h.toLowerCase()));
  const allowed = new Set([...LOOPBACK, ...listedHosts]);

  const events: Handler = (req, res, inst) => {
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Stops reverse proxies from buffering the stream.
      "x-accel-buffering": "no",
    });
    res.write(": connected\n\n");
    const unsubscribe = service.subscribe(
      inst.cfg.id,
      (e) => {
        if (e.snapshot) res.write(`event: now\ndata: ${JSON.stringify({ ...e.snapshot, health: e.health })}\n\n`);
        else res.write(`event: unreachable\ndata: ${JSON.stringify({ error: e.error })}\n\n`);
      },
      opts.pollMs,
    );
    // Roon now-playing for this instance's zone, only when Roon is switched on.
    // Roon reports the seek position every second. The page advances it itself, so
    // send it only with other changes or when it jumps (a seek, a stall).
    let lastRoon = "";
    let sent: { seek: number; at: number; playing: boolean } | null = null;
    const sendRoon = () => {
      if (!roon.enabled && lastRoon === "") return;
      const status = roon.currentStatus;
      const zone = roon.zoneFor(inst.cfg.id);
      const seek = zone?.nowPlaying?.seek;
      const { seek: _s, ...rest } = zone?.nowPlaying ?? {};
      const key = JSON.stringify({ status, zone: zone && { ...zone, nowPlaying: zone.nowPlaying && rest } });
      const playing = zone?.state === "playing";
      const expected = sent ? sent.seek + (sent.playing ? (Date.now() - sent.at) / 1000 : 0) : null;
      const jumped = seek != null && (expected == null || Math.abs(seek - expected) > 2);
      if (key === lastRoon && !jumped) return;
      lastRoon = key;
      sent = seek != null ? { seek, at: Date.now(), playing } : null;
      res.write(`event: roon\ndata: ${JSON.stringify({ status, zone })}\n\n`);
    };
    sendRoon();
    const offRoon = roon.onChange(sendRoon);
    req.on("close", () => {
      unsubscribe();
      offRoon();
    });
  };

  // Per-instance routes: /api/instances/:id/<action>
  const routes: Record<string, Handler> = {
    "GET now": (_q, _r, i) => service.now(i.cfg.id),
    "GET capabilities": (_q, _r, i) => service.capabilities(i.cfg.id),
    "POST change": async (q, _r, i) => service.change(i.cfg.id, await readJson(q)),
    "POST undo": (_q, _r, i) => service.undo(i.cfg.id),
    "POST dismissjump": async (_q, _r, i) => service.dismissVolumeJump(i.cfg.id),
    "POST transport": async (q, _r, i) => service.transport(i.cfg.id, await readJson(q)),
    // Play the clap track for the tap calibration, from the address this page was opened at.
    "POST calibrate": async (q, _r, i) => {
      await i.client.status(); // an open connection, for its local address
      const self = i.client.localAddress?.replace(/^::ffff:/, "");
      const at = self && `http://${self.includes(":") ? `[${self}]` : self}:${q.socket.localPort}/api/calibration.wav`;
      // Behind an HTTPS proxy (Caddy and the like say so), the page's own scheme: no redirect to follow.
      const scheme = q.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const page = `${scheme}://${q.headers.host}/api/calibration.wav`;
      return playClapTrack(i.client, [GITHUB_CLAPS_URL, page, ...(at ? [at] : [])]);
    },
    "POST seek": async (q, _r, i) => service.seek(i.cfg.id, await readJson(q)),
    "GET learned": async (_q, _r, i) => service.learned(i.cfg.id),
    "GET history": async (_q, _r, i) => service.history(i.cfg.id),
    "DELETE learned": async (_q, _r, i) => service.forget(i.cfg.id),
    "POST forget": async (q, _r, i) => service.forget(i.cfg.id, await readJson(q)),
    "GET events": events,
    "GET meter": (req, res, inst) => {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(": connected\n\n");
      // A stalled client (a phone asleep, the tab still open) mustn't make Node buffer frames
      // without end: skip them while its unsent output is over a small cap.
      const off = service.subscribeMeter(inst.cfg.id, (e) => {
        if (res.writableLength < METER_BACKLOG) res.write(`event: meter\ndata: ${JSON.stringify(e)}\n\n`);
      });
      req.on("close", off);
    },
    "PUT roonzone": async (q, _r, i) => {
      const body = (await readJson(q)) as { zone?: unknown };
      if (
        typeof body !== "object" ||
        body === null ||
        !(body.zone === null || (typeof body.zone === "string" && body.zone.length > 0))
      )
        throw new HttpError(400, "zone must be a Roon zone id or null");
      return roon.setZone(i.cfg.id, body.zone as string | null);
    },
    "POST roonseek": async (q, _r, i) => {
      const body = (await readJson(q)) as { seconds?: unknown };
      if (
        typeof body !== "object" ||
        body === null ||
        typeof body.seconds !== "number" ||
        !Number.isFinite(body.seconds) ||
        body.seconds < 0
      )
        throw new HttpError(400, "seconds must be a number ≥ 0");
      return roon.seek(i.cfg.id, body.seconds);
    },
    "POST roontransport": async (q, _r, i) => {
      const body = (await readJson(q)) as { action?: unknown };
      if (typeof body !== "object" || body === null || !ROON_ACTIONS.includes(body.action as RoonAction))
        throw new HttpError(400, `action must be one of ${ROON_ACTIONS.join(", ")}`);
      return roon.control(i.cfg.id, body.action as RoonAction);
    },
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const host = hostnameOf(req.headers.host ?? "");
    if (!allowed.has(host) && !isIpLiteral(host)) throw new HttpError(403, `host "${host}" not allowed; add it to ALLOWED_HOSTS`);
    // Writes must come from our own pages: the Origin must be the very host and
    // port the request was sent to, or a listed name on its default port (a
    // reverse proxy). Anything else, including another app on a different port
    // of this machine, is refused.
    if (req.method !== "GET" && req.headers.origin) {
      let origin: URL | null = null;
      try {
        origin = new URL(req.headers.origin);
      } catch {}
      const sameOrigin = !!origin && origin.host.toLowerCase() === (req.headers.host ?? "").toLowerCase();
      const listed = !!origin && origin.port === "" && listedHosts.has(origin.hostname.toLowerCase());
      if (!sameOrigin && !listed) throw new HttpError(403, "cross-origin request refused");
    }

    const path = new URL(req.url ?? "/", "http://x").pathname;
    // The clap track for the meter's tap calibration, fetched by HQPlayer (calibration.ts).
    if ((req.method === "GET" || req.method === "HEAD") && path === "/api/calibration.wav")
      return serveClapTrack(req, res, SECURITY_HEADERS);
    if (req.method === "GET" && path === "/api/health")
      return send(res, 200, { ok: true, version: VERSION, ...(COMMIT ? { commit: COMMIT } : {}) });
    if (path === "/api/instances") {
      if (req.method === "GET") return send(res, 200, await service.instances());
      if (req.method === "POST") return send(res, 200, await service.addInstance(await readJson(req)));
    }
    if (req.method === "POST" && path === "/api/discover") return send(res, 200, await service.discover());
    // ---- Roon (optional) ----
    if (path === "/api/roon") {
      if (req.method === "GET") return send(res, 200, roon.view());
      if (req.method === "PUT") return send(res, 200, roon.configure(parseRoonSettings(await readJson(req))));
    }
    if (req.method === "POST" && path === "/api/roon/discover")
      return send(res, 200, opts.discovery === false ? [] : await discoverCores({ timeoutMs: 1500 }));
    const ra = /^\/api\/roon\/art\/([A-Za-z0-9_-]{1,128})$/.exec(path);
    if (ra && req.method === "GET") {
      const size = Math.min(1000, Math.max(50, Number(new URL(req.url ?? "/", "http://x").searchParams.get("size")) || 300));
      const img = await roon.image(ra[1]!, size);
      const type = /^image\/(jpeg|png)$/i.test(img.type) ? img.type : "application/octet-stream";
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "max-age=86400",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "x-frame-options": "DENY",
      });
      return res.end(img.data);
    }

    // ---- presets (global) ----
    if (path === "/api/presets") {
      if (req.method === "GET") return send(res, 200, await service.listPresets());
      if (req.method === "POST") return send(res, 200, await service.createPreset(await readJson(req)));
    }
    const pm = /^\/api\/presets\/([^/]+)$/.exec(path);
    if (pm) {
      const id = decodeURIComponent(pm[1]!);
      if (req.method === "DELETE") return send(res, 200, await service.deletePreset(id));
      if (req.method === "PATCH") return send(res, 200, await service.updatePreset(id, await readJson(req)));
    }
    const ipm = /^\/api\/instances\/([^/]+)\/presets(?:\/([^/]+)\/apply)?$/.exec(path);
    if (ipm) {
      const id = decodeURIComponent(ipm[1]!);
      service.instance(id); // 404 for an unknown instance, before anything else
      if (!ipm[2] && req.method === "GET") return send(res, 200, await service.presetsFor(id));
      if (ipm[2] && req.method === "POST") return send(res, 200, await service.applyPreset(id, decodeURIComponent(ipm[2])));
      throw new HttpError(404, "not found");
    }

    // ---- named DACs behind one HQPlayer (dac-scope.ts) ----
    const dacsRoute = /^\/api\/instances\/([^/]+)\/dacs(?:\/([^/]+))?$/.exec(path);
    if (dacsRoute) {
      const id = decodeURIComponent(dacsRoute[1]!);
      const dacId = dacsRoute[2] ? decodeURIComponent(dacsRoute[2]) : undefined;
      const body = req.method === "DELETE" ? {} : await readJson(req);
      if (!dacId && req.method === "POST") return send(res, 200, await service.addDac(id, body));
      if (dacId && req.method === "PATCH") return send(res, 200, await service.renameDac(id, dacId, body));
      if (dacId && req.method === "DELETE") return send(res, 200, await service.removeDac(id, dacId));
      throw new HttpError(404, "not found");
    }
    const dacRoute = /^\/api\/instances\/([^/]+)\/dac$/.exec(path);
    if (dacRoute && req.method === "PUT")
      return send(res, 200, await service.selectDac(decodeURIComponent(dacRoute[1]!), await readJson(req)));
    const setupRoute = /^\/api\/instances\/([^/]+)\/setup$/.exec(path);
    if (setupRoute && req.method === "PUT")
      return send(res, 200, await service.saveSetup(decodeURIComponent(setupRoute[1]!), await readJson(req)));
    const capRoute = /^\/api\/instances\/([^/]+)\/restartcap$/.exec(path);
    if (capRoute && req.method === "PUT")
      return send(res, 200, await service.setRestartCap(decodeURIComponent(capRoute[1]!), await readJson(req)));
    const one = /^\/api\/instances\/([^/]+)$/.exec(path);
    if (one && req.method === "PATCH")
      return send(res, 200, await service.renameInstance(decodeURIComponent(one[1]!), await readJson(req)));
    if (one && req.method === "DELETE") {
      const out = await service.removeInstance(decodeURIComponent(one[1]!));
      roon.forgetInstance(decodeURIComponent(one[1]!));
      return send(res, 200, out);
    }

    const m = /^\/api\/instances\/([^/]+)\/([a-z]+)$/.exec(path);
    if (!m) {
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        opts.staticDir &&
        !path.startsWith("/api/") &&
        (await serveStatic(opts.staticDir, path, res, req.method === "HEAD"))
      )
        return;
      throw new HttpError(404, "not found");
    }
    const inst = service.instance(decodeURIComponent(m[1]!));
    const route = routes[`${req.method} ${m[2]}`];
    if (!route) throw new HttpError(404, "not found");
    const out = await route(req, res, inst);
    if (out !== undefined) send(res, 200, out);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: Error) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof URIError) return send(res, 400, { error: "malformed URL" });
      // The same status and words an in-process caller gets (core wire-error.ts).
      const w = wireError(err);
      if (w.unexpected) console.error(err);
      send(res, w.status, { error: w.error });
    });
  });

  return {
    server,
    listen(port: number, host: string): Promise<string> {
      return new Promise((resolve) =>
        server.listen(port, host, () => {
          const a = server.address();
          resolve(`http://${host}:${typeof a === "object" && a ? a.port : port}`);
        }),
      );
    },
    async close() {
      service.close();
      roon.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
