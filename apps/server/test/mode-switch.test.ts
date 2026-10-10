// Switching mode while playing (change-engine.ts, stopForModeSwitch). Measured 2026-10-08:
// SetMode during playback crashed HQPlayer Desktop (macOS) twice. Measured 2026-10-09: on
// Embedded 6.2.5, SetMode while paused crashed it too; stopped first, never. The fake crashes
// both ways (its defaults). With Roon as the source, Roon resumed from the same spot.
import { afterEach, describe, expect, it } from "vitest";
import { FakeHqp, loadProfile } from "@app/fake-hqp";
import { buildApp } from "../src/app.ts";
import type { RoonTransport } from "../src/change-engine.ts";
import type { WatchTiming } from "../src/watch.ts";
import { client } from "./http.ts";

const FAST: WatchTiming = { graceMs: 100, healthyMs: 300, maxMs: 1200, sampleMs: 40, minSpeed: 0.85 };

let fake: FakeHqp;
let app: ReturnType<typeof buildApp>;
let req: ReturnType<typeof client>;
afterEach(async () => {
  await app.close();
  await fake.close();
});

/**
 * `roon`: a stand-in for Roon's transport on the linked zone, driving HQPlayer as Roon did
 * (measured 2026-10-09, Embedded 6.2.5): pause pauses; after HQPlayer has been stopped, the
 * first play only re-attaches Roon's stream (HQPlayer paused, the zone still paused), and the
 * next one plays, from where the zone paused.
 *
 * `slow`: as Desktop 5.35.10 at DSD1024 did (measured 2026-10-09): the first play after the
 * switch shows "playing" and drops back to paused; the next takes seconds to start HQPlayer
 * (4 to 7 s measured; 3.5 s here). Pressing play again while it starts wedged it: the zone
 * "playing", HQPlayer stopped (seen twice, only when hqpweb pressed again within 3 s; inferred).
 */
async function setup(roon: "linked" | "slow" | "none" = "none") {
  fake = new FakeHqp(loadProfile("desktop5-mac-sdm"), { timeScale: 0 });
  await fake.listen();
  const calls: string[] = [];
  let zone: "playing" | "paused" = "playing";
  // The slow stand-in works out where it is from when play was pressed, whenever it's asked.
  let plays = 0;
  let pressedAt = 0;
  let wedged = false;
  const since = () => Date.now() - pressedAt;
  const settle = () => {
    if (roon !== "slow" || !plays) return;
    if (plays === 1 && since() >= 300) zone = "paused";
    if (plays > 1 && !wedged && since() >= 3500) fake.playback = 2;
  };
  const slowPlay = () => {
    settle();
    if (plays > 1 && fake.playback !== 2) wedged = true; // pressed again while it starts
    plays++;
    pressedAt = Date.now();
    zone = "playing";
  };
  const transport: RoonTransport = {
    pause: async () => {
      calls.push("pause");
      zone = "paused";
      if (fake.playback === 2) fake.playback = 1;
    },
    play: async () => {
      calls.push("play");
      if (roon === "slow") return slowPlay();
      if (fake.playback === 0)
        fake.playback = 1; // re-attached, not playing yet
      else {
        fake.playback = 2;
        zone = "playing";
      }
    },
    playing: () => {
      settle();
      return zone === "playing";
    },
  };
  app = buildApp(
    { instances: [{ id: "mac", name: "Mac", host: "127.0.0.1", port: fake.port }] },
    {
      pollMs: 50,
      timing: { quick: FAST, major: FAST },
      playWaitMs: 400,
      roonTransport: () => (roon === "none" ? null : transport),
    },
  );
  req = client(await app.listen(0, "127.0.0.1"));
  return calls;
}
const change = (body: object) => req("POST", "/api/instances/mac/change", { body });
const sentTransport = () => fake.received.map((x) => /<(Pause|Stop|SetMode|Play|Seek)\b/.exec(x)?.[1]).filter(Boolean);

describe("switching mode while playing", () => {
  // Measured 2026-10-09 (Embedded 6.2.5): SetMode while paused can crash HQPlayer too; stopped
  // first, never. Own playlist: Stop forgets the position, so Play, then Seek back to it.
  it("stops before switching mode, then plays its own playlist again from where it was", async () => {
    await setup();
    fake.feeder = "playlist";
    fake.playlist = ["/music/Example Artist/Example Album/01 - Example.flac"];
    fake.position = 42;
    expect(fake.playback).toBe(2);
    const body = (await change({ mode: "PCM" })).json();
    expect(fake.crashed).toBe(false);
    expect(body.results[0]).toMatchObject({ field: "mode", actual: "PCM", applied: true });
    expect(body.playback).toEqual({ kind: "playing" });
    expect(sentTransport()).toEqual(["Stop", "SetMode", "Play", "Seek"]);
    expect(fake.received.find((x) => /<Seek\b/.test(x))).toMatch(/position="42"/);
  });

  it("the old way, pausing, crashes the fake as it crashed Embedded", async () => {
    await setup();
    fake.feeder = "playlist";
    fake.playlist = ["/music/Example Artist/Example Album/01 - Example.flac"];
    await fake.handle("<Pause/>");
    await fake.handle('<SetMode value="1"/>');
    expect(fake.crashed).toBe(true);
  });

  // Measured 2026-10-08: HQPlayer's Play doesn't resume Roon; so without the zone, say so.
  it("with Roon as the source and no zone linked, stops for the switch and leaves resuming to Roon", async () => {
    await setup();
    const body = (await change({ mode: "PCM" })).json();
    expect(fake.crashed).toBe(false);
    expect(fake.mode.name).toBe("PCM");
    expect(body.playback.detail).toMatch(/press play in Roon/);
    expect(body.rolledBack).toBeNull();
    expect(sentTransport()).toEqual(["Stop", "SetMode"]);
  });

  it("switches mode without stopping or playing when nothing is playing", async () => {
    await setup();
    fake.playback = 0;
    await change({ mode: "PCM" });
    expect(fake.mode.name).toBe("PCM");
    expect(sentTransport()).toEqual(["SetMode"]);
  });

  it("paused by the listener: stops before switching (paused can crash), and stays stopped", async () => {
    await setup();
    fake.feeder = "playlist";
    fake.playlist = ["/music/Example Artist/Example Album/01 - Example.flac"];
    fake.playback = 1;
    await change({ mode: "PCM" });
    expect(fake.crashed).toBe(false);
    expect(fake.mode.name).toBe("PCM");
    expect(sentTransport()).toEqual(["Stop", "SetMode"]);
  });

  it("with Roon linked: pauses Roon, stops HQPlayer, switches, then plays Roon until it's playing", async () => {
    const calls = await setup("linked");
    const body = (await change({ mode: "PCM" })).json();
    expect(fake.crashed).toBe(false);
    expect(calls).toEqual(["pause", "play", "play"]); // the first play only re-attaches (measured)
    expect(sentTransport()).toEqual(["Stop", "SetMode"]);
    expect(body.playback).toEqual({ kind: "playing" });
  });

  it("with Roon slow to start (Desktop at DSD1024): presses play again only once Roon gives up, then waits", async () => {
    const calls = await setup("slow");
    const body = (await change({ mode: "PCM" })).json();
    expect(fake.crashed).toBe(false);
    expect(calls).toEqual(["pause", "play", "play"]);
    expect(fake.playback).toBe(2);
    expect(body.playback).toEqual({ kind: "playing" });
  }, 15_000);
});
