// The phone app for the browser tests: serves its test build (e2e/app-host/, the app's own
// start-up with stand-ins) and bridges the page's TCP to the fakes, over one WebSocket at /tcp
// per page (the protocol is in e2e/app-host/tcp-bridge.ts). Only to the fakes given: loopback,
// their ports.
import { createServer, type Server } from "node:http";
import { createSocket } from "node:dgram";
import { connect as tcpConnect, type Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptWebSocket, frame } from "@app/fake-hqp";
import type { InstanceConfig } from "@app/core";

const ROOT = fileURLToPath(new URL("app-host/dist/", import.meta.url));
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

/** The test LAN (192.0.2.x): what the app's Scan can find, mapped to fakes on loopback. */
export type TestLan = Map<string, { tcp: number; discovery: number }>;

export async function startAppHost(port: number, instances: InstanceConfig[], lan: TestLan = new Map()): Promise<Server> {
  const reachable = new Set(instances.flatMap((i) => [i.port, i.meterPort].filter((p): p is number => p !== undefined)));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/instances") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(instances));
    }
    // Only files inside the build: a path that resolves outside it (../) is refused.
    let file: string;
    try {
      const path = decodeURIComponent(url.pathname);
      file = resolve(ROOT, "." + (path.endsWith("/") ? path + "index.html" : path));
    } catch {
      return res.writeHead(400).end();
    }
    if (!file.startsWith(resolve(ROOT) + sep)) return res.writeHead(403).end();
    readFile(file).then(
      (body) => res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body),
      () => res.writeHead(404).end(),
    );
  });

  // One WebSocket per page carries all its TCP connections (e2e/app-host/tcp-bridge.ts).
  server.on("upgrade", (req, ws: Socket) => {
    if (req.url !== "/tcp") return ws.destroy();
    const conns = new Map<number, Socket>();
    const send = (msg: object) => !ws.destroyed && ws.write(frame(Buffer.from(JSON.stringify(msg)), 1));
    const onMessage = (payload: Buffer, text: boolean) => {
      if (!text) return void conns.get(payload.readUInt32BE(0))?.write(payload.subarray(4));
      const m = JSON.parse(payload.toString("utf8")) as {
        op: string;
        id: number;
        host?: string;
        port?: number;
        timeoutMs?: number;
      };
      if (m.op === "close") return void conns.get(m.id)?.destroy();
      if (m.op === "udp") return void askLan(m as unknown as UdpAsk).then(send);
      if (m.op !== "open") return;
      // HQPlayer's port at a test-LAN address is that fake's; anything else there, nobody.
      const onLan = lan.get(m.host ?? "");
      const to = onLan ? (m.port === 4321 ? onLan.tcp : 0) : m.port!;
      // Port 1 is where a flow without a meter points: nothing listens, as on a real network.
      if (!(onLan ? to : m.host === "127.0.0.1" && (reachable.has(to) || to === 1)))
        return send({ op: "closed", id: m.id, error: `not a test fake: ${m.host}:${m.port}` });
      const tcp = tcpConnect({ host: "127.0.0.1", port: to, timeout: m.timeoutMs || 15_000 });
      conns.set(m.id, tcp);
      tcp.setNoDelay(true);
      let error = "";
      tcp.once("connect", () => {
        tcp.setTimeout(0);
        send({ op: "open", id: m.id, localAddress: tcp.localAddress });
      });
      tcp.on("data", (d: Buffer) => {
        const head = Buffer.alloc(4);
        head.writeUInt32BE(m.id);
        if (!ws.destroyed) ws.write(frame(Buffer.concat([head, d])));
      });
      tcp.once("timeout", () => tcp.destroy(new Error(`timeout connecting to ${m.host}:${m.port}`)));
      tcp.on("error", (e) => (error = e.message));
      tcp.once("close", () => {
        conns.delete(m.id);
        send({ op: "closed", id: m.id, ...(error ? { error } : {}) });
      });
    };
    acceptWebSocket(req, ws, onMessage);
    const drop = () => {
      for (const c of conns.values()) c.destroy();
    };
    ws.on("close", drop);
    ws.on("error", drop);
  });

  type UdpAsk = { id: number; hosts: string[]; port: number; data: string; waitMs: number };
  /** The app's udpAsk on the test LAN: each test address's fake answers HQPlayer's discovery. */
  function askLan(m: UdpAsk): Promise<object> {
    return new Promise((done) => {
      const sock = createSocket("udp4");
      const replies: { host: string; data: string }[] = [];
      const byPort = new Map([...lan].map(([address, p]) => [p.discovery, address]));
      sock.on("message", (msg, from) => {
        const host = byPort.get(from.port);
        if (host) replies.push({ host, data: msg.toString("base64") });
      });
      sock.bind(0, "127.0.0.1", () => {
        const data = Buffer.from(m.data, "base64");
        for (const h of m.hosts) {
          const p = lan.get(h);
          if (p && m.port === 4321) sock.send(data, p.discovery, "127.0.0.1");
        }
        setTimeout(() => (sock.close(), done({ op: "udp", id: m.id, replies })), m.waitMs);
      });
    });
  }

  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
