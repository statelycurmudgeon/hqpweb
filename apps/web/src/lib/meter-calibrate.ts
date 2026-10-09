// Calibrating the meter's timing (meter-delay.ts) by ear: hqpweb plays a clap track through
// HQPlayer (server calibration.ts) and the listener taps each clap; the delay is how long
// after a clap arrives in the meter stream they tapped, less their reaction time (measured
// first on the phone). The claps are irregular, so only one delay fits; tapping along to
// music was dropped: music repeats every bar, and simulated taps landed a bar out.
// Pure; MeterCalibrate.svelte collects the hits (meter-onset.ts, undelayed) and the taps.

export interface CalibrateOptions {
  /** The wait HQPlayer's own buffer suggests (meterDelayMs with no nudge), ms. */
  priorMs: number;
  /** The longest delay considered, ms. */
  maxMs?: number;
  /** A tap within this of hit + delay counts as matching it, ms. */
  tolMs?: number;
  /** Fewest matching taps for an answer. */
  minTaps?: number;
  /** And at least this share of all taps: a busy groove can match a few random taps by chance. */
  minShare?: number;
  /** The delay may be this much under the prior (hqpweb's own lag is an estimate), ms. */
  belowPriorMs?: number;
}

export type Calibration = { ok: true; delayMs: number; matched: number; spreadMs: number } | { ok: false; reason: string };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * The delay that lines the most taps up with hits. Music repeats, so a delay one beat or one
 * bar longer can fit as well: the NAA and DAC only ever add to HQPlayer's buffer, so the
 * delay is looked for from just under that, and the smallest of equally good ones wins.
 */
export function calibrate(onsets: number[], taps: number[], o: CalibrateOptions): Calibration {
  const maxMs = o.maxMs ?? 5000;
  const tolMs = o.tolMs ?? 60;
  const minTaps = o.minTaps ?? 6;
  const minShare = o.minShare ?? 0.75;
  const floor = Math.max(0, o.priorMs - (o.belowPriorMs ?? 150));
  if (taps.length < minTaps) return { ok: false, reason: `Keep going: ${minTaps} or more taps are needed.` };
  if (!onsets.length) return { ok: false, reason: "The meter didn't pick up the claps. Is HQPlayer playing them?" };

  const nearest = (t: number, d: number) => {
    let best: number | null = null;
    for (const on of onsets) {
      const off = t - on - d;
      if (Math.abs(off) <= tolMs && (best === null || Math.abs(off) < Math.abs(best))) best = off;
    }
    return best;
  };
  let best: { d: number; score: number } | null = null;
  for (const t of taps)
    for (const on of onsets) {
      const d = t - on;
      if (d < floor || d > maxMs) continue;
      const score = taps.filter((x) => nearest(x, d) !== null).length;
      if (!best || score > best.score || (score === best.score && d < best.d)) best = { d, score };
    }
  if (!best || best.score < minTaps || best.score < minShare * taps.length)
    return {
      ok: false,
      reason: "Your taps didn't line up with the claps. Try again, tapping as each one sounds.",
    };

  const offsets = taps.map((t) => nearest(t, best.d)).filter((x): x is number => x !== null);
  const delayMs = Math.round(best.d + median(offsets));
  const spreadMs = Math.round(median(offsets.map((x) => Math.abs(x - median(offsets)))));
  return { ok: true, delayMs, matched: offsets.length, spreadMs };
}

/**
 * Reaction time from the phone's own clicks: for each click, the first tap 100-900 ms after
 * it (sooner is a guess, later a miss). The median of at least three; null otherwise.
 */
export function reactionMs(clicks: number[], taps: number[]): number | null {
  const rts = clicks
    .map((c) => taps.find((t) => t - c >= 100 && t - c <= 900))
    .map((t, i) => (t === undefined ? null : t - clicks[i]!))
    .filter((x): x is number => x !== null);
  return rts.length >= 3 ? Math.round(median(rts)) : null;
}

/**
 * For the clap track's six claps: 100 ms of slack for reaction-time wobble, five matched and
 * 80% of taps. Simulated (500 runs each): no random tapping accepted; ~91% of realistic
 * tappers (reaction wobble SD 45 ms, tap SD 30 ms, an 8% miss rate) within 150 ms. Not
 * measured with people yet.
 */
export const CLAP_OPTIONS = { tolMs: 100, minTaps: 5, minShare: 0.8 } as const;
