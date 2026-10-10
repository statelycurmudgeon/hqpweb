// The phone app for the browser tests: serves its test build (e2e/app-host/, the app's own
// start-up with stand-ins) and bridges the page's TCP to the fakes, over one WebSocket at /tcp
// per page (the protocol is in e2e/app-host/tcp-bridge.ts). Only to the fakes given: loopback,
// their ports.
import { createServer, type Server } from "node:http";
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

export async function startAppHost(port: number, instances: InstanceConfig[]): Promise<Server> {
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
      if (m.op !== "open") return;
      // Port 1 is where a flow without a meter points: nothing listens, as on a real network.
      if (m.host !== "127.0.0.1" || !(reachable.has(m.port!) || m.port === 1))
        return send({ op: "closed", id: m.id, error: `not a test fake: ${m.host}:${m.port}` });
      const tcp = tcpConnect({ host: m.host, port: m.port!, timeout: m.timeoutMs || 15_000 });
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

  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
