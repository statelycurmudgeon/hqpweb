// The native Tcp plugin's stand-in for the browser tests: the same calls and events
// (apps/mobile tcp.ts TcpPlugin), as the native one: "closed" exactly once, however a
// connection ends. e2e/app-host.ts opens the real TCP connections. All of a page's go over one
// WebSocket: a browser caps WebSockets per host and opens them one at a time, which the phone's
// native sockets don't. Text messages steer ({op, id, …}); binary ones carry bytes, after a
// 4-byte connection id.
import { fromBase64, toBase64, type TcpPlugin } from "../../apps/mobile/src/tcp.ts";

type Data = { id: string; data: string };
type Closed = { id: string; error?: string };
type Reply = { op: "open"; id: number; localAddress: string } | { op: "closed"; id: number; error?: string };

export function bridgeTcp(url: string): TcpPlugin {
  const onData: ((e: Data) => void)[] = [];
  const onClosed: ((e: Closed) => void)[] = [];
  const opening = new Map<number, { resolve: (v: { id: string; localAddress: string }) => void; reject: (e: Error) => void }>();
  const open = new Set<number>();
  let next = 0;

  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const ready = new Promise<void>((ok, fail) => {
    ws.onopen = () => ok();
    ws.onerror = () => fail(new Error("the test bridge isn't there"));
  });
  ws.onmessage = (m) => {
    if (typeof m.data !== "string") {
      const bytes = new Uint8Array(m.data as ArrayBuffer);
      const id = new DataView(bytes.buffer).getUint32(0);
      const data = toBase64(bytes.subarray(4));
      for (const fn of onData) fn({ id: `${id}`, data });
      return;
    }
    const r = JSON.parse(m.data) as Reply;
    const waiting = opening.get(r.id);
    opening.delete(r.id);
    if (r.op === "open") {
      open.add(r.id);
      waiting?.resolve({ id: `${r.id}`, localAddress: r.localAddress });
    } else if (waiting) waiting.reject(new Error(r.error || "can't connect"));
    else if (open.delete(r.id)) for (const fn of onClosed) fn(r.error ? { id: `${r.id}`, error: r.error } : { id: `${r.id}` });
  };
  const steer = (msg: object) => ws.send(JSON.stringify(msg));

  return {
    connect: async ({ host, port, timeoutMs }) => {
      await ready;
      const id = ++next;
      return new Promise((resolve, reject) => {
        opening.set(id, { resolve, reject });
        steer({ op: "open", id, host, port, timeoutMs });
      });
    },
    write: async ({ id, data }) => {
      if (!open.has(Number(id))) throw new Error("not connected");
      const bytes = fromBase64(data);
      const msg = new Uint8Array(4 + bytes.length);
      new DataView(msg.buffer).setUint32(0, Number(id));
      msg.set(bytes, 4);
      ws.send(msg);
    },
    close: async ({ id }) => steer({ op: "close", id: Number(id) }),
    addListener: (async (event: "data" | "closed", fn: (e: Data & Closed) => void) => {
      if (event === "data") onData.push(fn as (e: Data) => void);
      else onClosed.push(fn as (e: Closed) => void);
    }) as TcpPlugin["addListener"],
  };
}
