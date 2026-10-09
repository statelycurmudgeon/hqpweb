// Hits in the meter: sharp rises in level (a drum, a pluck), for lining the meter up with
// what's heard (meter-delay.ts's nudge). A smoothed spectrum has no clear "now"; a flash on
// each hit gives the ear and eye the same event to match. Pure; fed the delayed frames.

export interface OnsetTiming {
  /** A hit is this much louder than the recent average… */
  riseDb: number;
  /** …over this window before it. */
  windowMs: number;
  /** No second hit within this long of the last. */
  refractoryMs: number;
  /** Quieter than this is never a hit. */
  floorDb: number;
}

/** Chosen by hand for ~20 frames a second of peak levels; not measured against listeners. */
export const ONSET: OnsetTiming = { riseDb: 6, windowMs: 250, refractoryMs: 200, floorDb: -70 };

export class OnsetDetector {
  private readonly o: OnsetTiming;
  private recent: { t: number; db: number }[] = [];
  private lastHit = -Infinity;

  constructor(o: OnsetTiming = ONSET) {
    this.o = o;
  }

  /** One frame's level (the louder side's peak, dB) at time `t` (ms): is it a hit? */
  feed(t: number, db: number): boolean {
    this.recent = this.recent.filter((r) => r.t >= t - this.o.windowMs);
    const before = this.recent.length ? this.recent.reduce((s, r) => s + r.db, 0) / this.recent.length : db;
    this.recent.push({ t, db });
    if (db < this.o.floorDb || t - this.lastHit < this.o.refractoryMs || db - before < this.o.riseDb) return false;
    this.lastHit = t;
    return true;
  }

  reset() {
    this.recent = [];
    this.lastHit = -Infinity;
  }
}
