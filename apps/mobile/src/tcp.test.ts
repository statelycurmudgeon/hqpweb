import { describe, expect, it } from "vitest";
import type { ConnectionEvents } from "@app/protocol";
import { fromBase64, tcpConnectVia, toBase64, type TcpPlugin } from "./tcp.ts";

/** A Tcp plugin the test drives: it can send data or a close before connect has answered. */
function fakeTcp() {
  const fire: { data?: (e: { id: string; data: string }) => void; closed?: (e: { id: string; error?: string }) => void } = {};
  const written: string[] = [];
  const closed: string[] = [];
  let beforeAnswer: () => void = () => undefined;
  const plugin: TcpPlugin = {
    addListener: (async (event: "data" | "closed", fn: never) => {
      fire[event] = fn;
    }) as TcpPlugin["addListener"],
    connect: async () => {
      beforeAnswer();
      return { id: "c1", localAddress: "192.0.2.50" };
    },
    write: async ({ data }) => void written.push(data),
    close: async ({ id }) => void closed.push(id),
  };
  return { plugin, fire, written, closed, before: (f: () => void) => (beforeAnswer = f) };
}
const recorder = () => {
  const got: (string | null)[] = [];
  const events: ConnectionEvents = {
    data: (b) => got.push(new TextDecoder().decode(b)),
    closed: (e) => got.push(e ? `closed: ${e.message}` : null),
  };
  return { got, events };
};

describe("TCP through the native plugin", () => {
  it("carries bytes both ways as base64, whatever they are", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });

  it("keeps what arrives before connect has answered (the meter talks at once), in order", async () => {
    const t = fakeTcp();
    t.before(() => {
      t.fire.data?.({ id: "c1", data: toBase64(new TextEncoder().encode("first")) });
      t.fire.data?.({ id: "c1", data: toBase64(new TextEncoder().encode("second")) });
    });
    const r = recorder();
    const conn = await tcpConnectVia(t.plugin)({ host: "192.0.2.10", port: 4322, timeoutMs: 1000 }, r.events);
    t.fire.data?.({ id: "c1", data: toBase64(new TextEncoder().encode("third")) });
    expect(r.got).toEqual(["first", "second", "third"]);
    expect(conn.localAddress).toBe("192.0.2.50");
  });

  it("reports a close once, with its error, even one that came before connect answered", async () => {
    const t = fakeTcp();
    t.before(() => t.fire.closed?.({ id: "c1", error: "connection reset" }));
    const r = recorder();
    await tcpConnectVia(t.plugin)({ host: "192.0.2.10", port: 4321, timeoutMs: 1000 }, r.events);
    t.fire.closed?.({ id: "c1" }); // a second close for the same id: ignored
    expect(r.got).toEqual(["closed: connection reset"]);
  });

  it("writes base64 and closes by id", async () => {
    const t = fakeTcp();
    const conn = await tcpConnectVia(t.plugin)({ host: "192.0.2.10", port: 4321, timeoutMs: 1000 }, recorder().events);
    conn.write(new TextEncoder().encode("<State/>\n"));
    conn.close();
    await Promise.resolve();
    expect([t.written.map((w) => new TextDecoder().decode(fromBase64(w))), t.closed]).toEqual([["<State/>\n"], ["c1"]]);
  });
});
