import { describe, expect, it } from "vitest";
import { OnsetDetector } from "./meter-onset.ts";

/** Frames 50 ms apart (the meter's ~20 a second), peak level in dB per frame; the times of hits. */
const hits = (levels: number[]) => {
  const d = new OnsetDetector();
  return levels.flatMap((db, i) => (d.feed(i * 50, db) ? [i * 50] : []));
};
const steady = (n: number, db: number) => Array.from({ length: n }, () => db);

describe("hits in the meter, for lining it up by ear", () => {
  it("finds a sharp rise, like a drum hit", () => {
    expect(hits([...steady(10, -30), -18, ...steady(10, -30)])).toEqual([500]);
  });

  it("ignores steady music and gentle swells", () => {
    expect(hits(steady(40, -25))).toEqual([]);
    expect(hits(Array.from({ length: 40 }, (_, i) => -40 + i * 0.5))).toEqual([]);
  });

  it("counts one hit once, not each frame of it", () => {
    expect(hits([...steady(10, -30), -18, -16, -17, ...steady(10, -30)])).toEqual([500]);
  });

  it("finds hits in a beat, about twice a second", () => {
    const beat = Array.from({ length: 40 }, (_, i) => (i % 10 === 5 ? -14 : -28));
    expect(hits(beat)).toEqual([250, 750, 1250, 1750]);
  });

  it("ignores near-silence", () => {
    expect(hits([...steady(10, -90), -75, ...steady(10, -90)])).toEqual([]);
  });
});
