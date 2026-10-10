// TCP for the protocol (@app/protocol Connect) through the app's native Tcp plugin
// (packages/capacitor-tcp, Swift): HQPlayer's control port and its meter. Bytes cross the
// bridge as base64; each connection has an id, and its data and close come as events.
import { registerPlugin } from "@capacitor/core";
import type { Connect, ConnectionEvents } from "@app/protocol";

export interface TcpPlugin {
  connect(o: { host: string; port: number; timeoutMs: number }): Promise<{ id: string; localAddress?: string }>;
  write(o: { id: string; data: string }): Promise<void>;
  close(o: { id: string }): Promise<void>;
  addListener(event: "data", fn: (e: { id: string; data: string }) => void): Promise<unknown>;
  addListener(event: "closed", fn: (e: { id: string; error?: string }) => void): Promise<unknown>;
}

export const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** A Connect over a Tcp plugin (the native one, or a stand-in in tests). */
export function tcpConnectVia(Tcp: TcpPlugin): Connect {
  /** Open connections by id; what arrives for one not yet known waits (the meter talks at once). */
  const open = new Map<string, ConnectionEvents>();
  const early = new Map<string, ({ data: string } | { closed: string | undefined })[]>();
  let listening: Promise<unknown> | null = null;
  const listen = () =>
    (listening ??= Promise.all([
      Tcp.addListener("data", ({ id, data }) => {
        const ev = open.get(id);
        if (ev) ev.data(fromBase64(data));
        else early.set(id, [...(early.get(id) ?? []), { data }]);
      }),
      Tcp.addListener("closed", ({ id, error }) => {
        const ev = open.get(id);
        open.delete(id);
        if (ev) ev.closed(error ? new Error(error) : undefined);
        else early.set(id, [...(early.get(id) ?? []), { closed: error }]);
      }),
    ]));

  return async ({ host, port, timeoutMs }, events) => {
    await listen();
    const { id, localAddress } = await Tcp.connect({ host, port, timeoutMs });
    open.set(id, events);
    for (const e of early.get(id) ?? []) {
      if ("data" in e) events.data(fromBase64(e.data));
      else {
        open.delete(id);
        events.closed(e.closed ? new Error(e.closed) : undefined);
      }
    }
    early.delete(id);
    return {
      localAddress,
      write: (bytes) => void Tcp.write({ id, data: toBase64(bytes) }).catch(() => Tcp.close({ id }).catch(() => undefined)),
      close: () => void Tcp.close({ id }).catch(() => undefined),
    };
  };
}

export const tcpConnect: Connect = tcpConnectVia(registerPlugin<TcpPlugin>("Tcp"));
