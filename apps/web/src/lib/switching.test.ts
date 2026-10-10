import { describe, expect, it } from "vitest";
import type { Snapshot } from "./api.ts";
import { switchFooter, switchHold } from "./switching.ts";

const snap = (state: 0 | 1 | 2, activeMode: string): Snapshot => ({ status: { state, activeMode } }) as unknown as Snapshot;
const switching = { kind: "info" as const, text: "Switching to PCM: this can take up to 20 seconds…" };

describe("a mode switch shows one steady state", () => {
  // Measured 2026-10-09 (Desktop 5, Roon): playing, paused, stopped, paused in the new mode,
  // then playing, over ~12 s. The page holds "Switching" through all of it.
  it("holds through paused, stopped and paused-in-the-new-mode, and lets go once it plays in the new mode", () => {
    const steps = [snap(2, "SDM (DSD)"), snap(1, "SDM (DSD)"), snap(0, "SDM (DSD)"), snap(1, "PCM"), snap(0, "PCM")];
    expect(steps.map((s) => switchHold("PCM", s))).toEqual([true, true, true, true, true]);
    expect(switchHold("PCM", snap(2, "PCM"))).toBe(false);
  });
  it("holds nothing when no switch is running", () => {
    expect(switchHold(null, snap(0, "PCM"))).toBe(false);
  });
  it("holds before the first status arrives", () => {
    expect(switchHold("PCM", null)).toBe(true);
  });
});

describe("the footer during a switch", () => {
  it("says it's switching until the music is back, then that it's checking playback", () => {
    expect(switchFooter("PCM", snap(0, "PCM"), switching)).toBe(switching);
    expect(switchFooter("SDM (DSD)", snap(2, "SDM (DSD)"), switching)).toEqual({
      kind: "info",
      text: "Playing in DSD; checking playback…",
    });
  });
  it("leaves results alone, and every message when no switch is running", () => {
    const done = { kind: "ok" as const, text: "✓ Mode → PCM · playback OK" };
    expect(switchFooter("PCM", snap(2, "PCM"), done)).toBe(done);
    expect(switchFooter(null, snap(2, "PCM"), switching)).toBe(switching);
    expect(switchFooter("PCM", snap(2, "PCM"), null)).toBeNull();
  });
});
