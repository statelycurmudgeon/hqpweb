// HQPlayer sends meter frames in bursts (~12 at a time, ~4 times a second: measured
// 2026-10-08). Shown as they come, the meter jerks 4 times a second; paced, it moves smoothly
// at the cost of ~0.3 s of delay.
import { describe, expect, it } from "vitest";
import { MeterPacer } from "../src/meter-pace.ts";

/** Feed 12 frames every 250 ms for `ms`, ticking every 50 ms; returns the frame shown at each tick. */
function run(ms: number) {
  const p = new MeterPacer<number>();
  const shown: (number | null)[] = [];
  let next = 0;
  for (let t = 0; t < ms; t += 50) {
    if (t % 250 === 0) for (let i = 0; i < 12; i++) p.push(next++, t);
    shown.push(p.take(t));
  }
  return shown;
}

describe("pacing burst frames", () => {
  it("shows a new frame at nearly every tick, not one per burst", () => {
    const shown = run(3000).slice(10); // after the first ~0.5 s
    const changes = shown.filter((v, i) => i > 0 && v !== shown[i - 1]).length;
    expect(changes).toBeGreaterThan(shown.length * 0.8);
  });

  it("keeps the delay bounded in time: a flood shows its newest frame within the hold, every frame passed", () => {
    const p = new MeterPacer<number>();
    for (let i = 0; i < 200; i++) p.push(i, 0);
    expect(p.take(100)).toBeNull(); // still held
    expect(p.take(350)).toBe(199);
    expect(p.passed()).toHaveLength(200);
  });

  it("says when frames stopped coming (track change, stop): nothing new after 3 s", () => {
    const p = new MeterPacer<number>();
    p.push(1, 0);
    expect(p.live(1000)).toBe(true);
    expect(p.live(3500)).toBe(false);
  });
});

describe("frames passed at each tick", () => {
  it("hands over every frame it moves past, so a peak in a skipped one isn't lost", () => {
    const p = new MeterPacer<number>();
    const seen: number[] = [];
    let next = 0;
    for (let t = 0; t < 3000; t += 50) {
      if (t % 250 === 0) for (let i = 0; i < 12; i++) p.push(next++, t);
      p.take(t);
      seen.push(...p.passed());
    }
    // Every frame up to the last one shown, in order, once (none trimmed at this rate).
    expect(seen).toEqual(Array.from({ length: seen.length }, (_, i) => i));
    expect(seen.length).toBeGreaterThan(100);
  });
});

describe("the same lag in PCM and DSD", () => {
  /**
   * Bursts every 250 ms of `perBurst` frames (PCM ~43 a second: 11; DSD ~180: 45), ticking every
   * 50 ms. Each frame's music time is its place in the stream; returns how long after that it's
   * first shown, on average once settled.
   */
  function lag(perBurst: number) {
    const p = new MeterPacer<number>();
    const frameMs = 250 / perBurst;
    const lags: number[] = [];
    let next = 0;
    let last = -1;
    for (let t = 0; t < 6000; t += 50) {
      if (t % 250 === 0) for (let i = 0; i < perBurst; i++) p.push(next++, t);
      const shown = p.take(t);
      if (shown !== null && shown !== last && t > 2000) lags.push(t - (shown + 1) * frameMs);
      if (shown !== null) last = shown;
    }
    return lags.reduce((a, b) => a + b, 0) / lags.length;
  }

  it("holds frames for the same time whatever the frame rate (a calibration made in DSD holds in PCM)", () => {
    expect(Math.abs(lag(11) - lag(45))).toBeLessThan(40);
  });
});
