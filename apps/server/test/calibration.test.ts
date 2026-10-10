import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAPS_MS, TRACK_MS, clapTrack } from "../src/calibration.ts";

describe("the clap track", () => {
  const wav = clapTrack();
  const sample = (ms: number) => wav.readInt16LE(44 + Math.round((ms / 1000) * 44_100) * 4);

  it("is a 44.1 kHz, 16-bit stereo WAV of the right length", () => {
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect([wav.readUInt16LE(22), wav.readUInt32LE(24), wav.readUInt16LE(34)]).toEqual([2, 44_100, 16]);
    expect(wav.readUInt32LE(40)).toBe(Math.round((TRACK_MS / 1000) * 44_100) * 4);
  });

  it("has a clap at each time, silence between, and never comes near full scale", () => {
    for (const at of CLAPS_MS) {
      const loud = Math.max(...Array.from({ length: 20 }, (_, i) => Math.abs(sample(at + i * 0.1))));
      expect(loud).toBeGreaterThan(1000);
      expect(sample(at + 500)).toBe(0);
    }
    expect(sample(1000)).toBe(0);
    let max = 0;
    for (let i = 44; i < wav.length; i += 2) max = Math.max(max, Math.abs(wav.readInt16LE(i)));
    expect(max).toBeLessThanOrEqual(Math.round(32767 * 10 ** (-12 / 20)));
  });

  it("has irregular gaps, each at least 2 s", () => {
    const gaps = CLAPS_MS.slice(1).map((t, i) => t - CLAPS_MS[i]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2000);
    expect(new Set(gaps).size).toBe(gaps.length);
  });
});

describe("the copy kept in the repository for HQPlayer to fetch from GitHub", () => {
  it("is exactly what the generator makes (a new pattern needs a new file name)", () => {
    const kept = readFileSync(new URL("../../../calibration/claps-v1.wav", import.meta.url));
    expect(kept.equals(clapTrack())).toBe(true);
  });
});
