import { describe, expect, it } from "vitest";
import { CLAP_OPTIONS, calibrate, reactionMs } from "./meter-calibrate.ts";

describe("calibrating with the clap track", () => {
  // The track's claps, as they arrive in the meter: 1.5 s in, on the 50 ms update grid.
  const arrive = [2000, 4400, 6500, 9300, 11_500, 14_600].map((t) => Math.ceil((1500 + t) / 50) * 50);
  let seed = 3;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const wobble = (sd: number) => (rand() + rand() + rand() + rand() + rand() + rand() - 3) * sd * Math.SQRT2;

  it("measures reaction time from the phone's clicks, ignoring guesses and misses", () => {
    const clicks = [1000, 3000, 5000, 7000, 9000, 11_000];
    expect(reactionMs(clicks, [1210, 3190, 5230, 7205, 9220, 11_195])).toBe(208);
    expect(reactionMs(clicks, [1050, 3190, 5230, 8500, 9500, 11_950])).toBeNull(); // guesses and misses leave three
  });

  it("finds the delay from taps on the claps, less reaction time, within ~50 ms", () => {
    for (const delay of [600, 1300, 2400]) {
      const rt = 210;
      const taps = arrive.map((a) => a + delay + rt + wobble(35)).map((t) => t - rt);
      const r = calibrate(arrive, taps, { priorMs: 500, ...CLAP_OPTIONS });
      expect(r.ok ? Math.abs(r.delayMs - delay) : Infinity).toBeLessThanOrEqual(50);
    }
  });

  it("copes with a missed clap and a stray tap", () => {
    const taps = arrive.map((a) => a + 1300).filter((_, i) => i !== 2);
    taps.push(8000);
    const r = calibrate(
      arrive,
      taps.sort((a, b) => a - b),
      { priorMs: 500, ...CLAP_OPTIONS },
    );
    expect(r).toMatchObject({ ok: true, delayMs: 1300, matched: 5 });
  });

  it("doesn't calibrate random taps against the claps (200 tries)", () => {
    let accepted = 0;
    for (let n = 0; n < 200; n++) {
      const taps = Array.from({ length: 6 }, () => 2000 + rand() * 16_000).sort((a, b) => a - b);
      if (calibrate(arrive, taps, { priorMs: 500, ...CLAP_OPTIONS }).ok) accepted++;
    }
    expect(accepted).toBe(0);
  });

  it("refuses with too few taps, or when the meter saw no claps", () => {
    const taps = arrive.map((a) => a + 1300);
    expect(calibrate(arrive, taps.slice(0, 3), { priorMs: 500, ...CLAP_OPTIONS })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/more taps/),
    });
    expect(calibrate([], taps, { priorMs: 500, ...CLAP_OPTIONS })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/didn't pick up the claps/),
    });
  });

  it("finds a delay shorter than HQPlayer's buffer suggests (what's heard can run ahead of it)", () => {
    const taps = arrive.map((a) => a + 600);
    expect(calibrate(arrive, taps, { priorMs: 1005, ...CLAP_OPTIONS })).toMatchObject({ ok: true, delayMs: 600 });
  });
});
