// The meter stream over an in-memory transport (no sockets): opening, letting go, retrying.
// Frames through a real socket are in meter-live.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connect, Connection, ConnectionEvents } from "@app/protocol";
import { MeterStream } from "../src/meter-stream.ts";

afterEach(() => vi.useRealTimers());

/** Each connect waits until the test opens or refuses it. */
function pending() {
  const calls: { open: (c: Connection) => void; refuse: (e: Error) => void; events: ConnectionEvents }[] = [];
  const connect: Connect = (_t, events) => new Promise((open, refuse) => calls.push({ open, refuse, events }));
  return { connect, calls };
}
const conn = () => ({
  closed: 0,
  write() {},
  close() {
    this.closed++;
  },
});

describe("the meter stream", () => {
  it("closes a connection that opens after it was let go, and doesn't use it", async () => {
    vi.useFakeTimers();
    const { connect, calls } = pending();
    const m = new MeterStream("192.0.2.10", 4322, connect, { tickMs: 50, lingerMs: 0, retryMs: 100 });
    const events: { connected: boolean }[] = [];
    const off = m.subscribe((e) => events.push(e));
    off();
    await vi.advanceTimersByTimeAsync(10); // the linger runs out: let go while still opening
    const late = conn();
    calls[0]!.open(late);
    await vi.advanceTimersByTimeAsync(500);
    expect(late.closed).toBe(1);
    expect(calls).toHaveLength(1); // and no retry: nobody is watching
    expect(events.every((e) => !e.connected)).toBe(true);
  });

  it("tries again after a failed open while someone watches, and reports connected once open", async () => {
    vi.useFakeTimers();
    const { connect, calls } = pending();
    const m = new MeterStream("192.0.2.10", 4322, connect, { tickMs: 50, lingerMs: 1000, retryMs: 100 });
    const events: { connected: boolean }[] = [];
    m.subscribe((e) => events.push(e));
    calls[0]!.refuse(new Error("connection refused"));
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toHaveLength(2);
    calls[1]!.open(conn());
    await vi.advanceTimersByTimeAsync(60);
    expect(events.at(-1)?.connected).toBe(true);
    // An earlier connection's late close doesn't count against the open one.
    calls[0]!.events.closed();
    await vi.advanceTimersByTimeAsync(60);
    expect(events.at(-1)?.connected).toBe(true);
    m.close();
  });
});
