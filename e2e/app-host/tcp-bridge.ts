// The native plugin's stand-in for the browser tests: the same calls and events (apps/mobile
// tcp.ts TcpPlugin, udp.ts UdpPlugin), as the native one: "closed" exactly once, however a
// connection ends. e2e/app-host.ts opens the real TCP connections and answers UDP asks on the
// test LAN, where this "phone" is 192.0.2.10. All of a page's go over one
// WebSocket: a browser caps WebSockets per host and opens them one at a time, which the phone's
// native sockets don't. Text messages steer ({op, id, …}); binary ones carry bytes, after a
// 4-byte connection id.
import { fromBase64, toBase64, type TcpPlugin } from "../../apps/mobile/src/tcp.ts";
import type { UdpPlugin } from "../../apps/mobile/src/udp.ts";

type Data = { id: string; data: string };
type Closed = { id: string; error?: string };
type Reply =
  | { op: "open"; id: number; localAddress: string }
  | { op: "closed"; id: number; error?: string }
  | { op: "udp"; id: number; replies: { host: string; data: string }[] };

/** This "phone's" interfaces: Wi-Fi on the test LAN, and cellular, which a sweep must leave alone. */
const INTERFACES = [
  { name: "en0", address: "192.0.2.10", netmask: "255.255.255.0" },
  { name: "pdp_ip0", address: "198.51.100.7", netmask: "255.255.255.0" },
];

export function bridge(url: string): { tcp: TcpPlugin; udp: UdpPlugin } {
  const asking = new Map<number, (r: { host: string; data: string }[]) => void>();
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
    if (r.op === "udp") {
      asking.get(r.id)?.(r.replies);
      asking.delete(r.id);
      return;
    }
    const waiting = opening.get(r.id);
    opening.delete(r.id);
    if (r.op === "open") {
      open.add(r.id);
      waiting?.resolve({ id: `${r.id}`, localAddress: r.localAddress });
    } else if (waiting) waiting.reject(new Error(r.error || "can't connect"));
    else if (open.delete(r.id)) for (const fn of onClosed) fn(r.error ? { id: `${r.id}`, error: r.error } : { id: `${r.id}` });
  };
  const steer = (msg: object) => ws.send(JSON.stringify(msg));

  const tcp: TcpPlugin = {
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
  const udp: UdpPlugin = {
    udpAsk: async (o) => {
      await ready;
      const id = ++next;
      return { replies: await new Promise((resolve) => (asking.set(id, resolve), steer({ op: "udp", id, ...o }))) };
    },
    interfaces: async () => ({ interfaces: INTERFACES }),
  };
  return { tcp, udp };
}
