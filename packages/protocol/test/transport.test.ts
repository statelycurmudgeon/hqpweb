// The client over an in-memory transport (transport.ts): no sockets and no Node, as a phone
// app would run it. Real-socket behaviour is in client.test.ts.
import { describe, expect, it } from "vitest";
import { HqpClient, PeerError } from "../src/client.ts";
import type { Connect, ConnectionEvents } from "../src/transport.ts";

const enc = new TextEncoder();
const STATE = '<?xml version="1.0" encoding="utf-8"?><State state="2" mode="0" volume="-30.5"/>\n';

/** A transport that answers each request line with `reply(line, n)`, split into the given chunks. */
function memory(reply: (line: string, n: number) => Uint8Array[] | "close") {
  const opened: { events: ConnectionEvents; closed: boolean }[] = [];
  const connect: Connect = async (_t, events) => {
    const c = { events, closed: false };
    opened.push(c);
    let n = 0;
    const dec = new TextDecoder();
    const close = () => {
      if (c.closed) return;
      c.closed = true;
      queueMicrotask(() => events.closed());
    };
    return {
      localAddress: "192.0.2.50",
      write(bytes) {
        const line = dec.decode(bytes).trimEnd();
        queueMicrotask(() => {
          const r = reply(line, ++n);
          if (r === "close") return close();
          for (const chunk of r) events.data(chunk);
        });
      },
      close,
    };
  };
  return { connect, opened };
}

describe("HqpClient over any transport", () => {
  it("reads a reply split mid-character, as bytes may arrive", async () => {
    const bytes = enc.encode(STATE.replace("<State ", '<State name="Café" '));
    const cut = bytes.indexOf(0xc3) + 1; // inside "é" (0xC3 0xA9)
    const { connect } = memory(() => [bytes.subarray(0, cut), bytes.subarray(cut)]);
    const c = new HqpClient("192.0.2.10", { connect });
    const el = await c.request("<State/>");
    expect(el.attrs.name).toBe("Café");
    expect(el.attrs.volume).toBe("-30.5");
    expect(c.localAddress).toBe("192.0.2.50");
  });

  it("closes the connection on a reply that never ends, and says why", async () => {
    const chunk = enc.encode("x".repeat(1024 * 1024));
    const { connect, opened } = memory(() => Array.from({ length: 6 }, () => chunk));
    const c = new HqpClient("192.0.2.10", { connect });
    await expect(c.request("<State/>")).rejects.toThrow(/too long/);
    expect(opened[0]!.closed).toBe(true);
  });

  it("names the expired-trial cause when a connection closes without a byte", async () => {
    const { connect } = memory(() => "close");
    const c = new HqpClient("192.0.2.10", { connect });
    await expect(c.state()).rejects.toThrow(/unlicensed \(trial\) HQPlayer/);
  });

  it("reports a connection that can't be opened as HQPlayer's problem (PeerError)", async () => {
    const connect: Connect = () => Promise.reject(new Error("no route to host"));
    const err = await new HqpClient("192.0.2.10", { connect }).state().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PeerError);
    expect((err as Error).message).toMatch(/no route/);
  });
});
