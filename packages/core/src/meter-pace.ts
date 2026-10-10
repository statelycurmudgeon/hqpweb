// Pacing HQPlayer's meter frames for display (docs/design-v2-layout.md rule 9). They come
// in bursts (~12 frames at once, ~4 times a second, measured 2026-10-08), so showing the
// newest at each tick would jerk 4 times a second. Each burst's frames are spread over the
// time since the burst before (their place in the music), and each is shown a fixed time
// after that place. Holding a fixed time, not a fixed number of frames, keeps the lag the
// same at PCM's ~43 frames a second and DSD's ~180: a meter lined up by ear in one mode
// stays lined up in the other (with 14 frames kept, the two differed by ~0.4 s).

/** How long each frame is held after its place in the music: a burst's spacing plus margin. */
const HOLD_MS = 300;
/** Frames older than this past due are dropped unshown (a stalled page, a long gap). */
const STALE_MS = 1000;
/** A gap this long between bursts is a restart, not a burst to spread over. */
const MAX_SPREAD_MS = 1000;
/** No frame for this long: the meter isn't live (it's quiet 2.6–5 s at track and rate changes). */
const QUIET_MS = 3000;

interface Queued<T> {
  frame: T;
  /** When it arrived, ms. */
  at: number;
  /** Its place in the music, ms: set when its burst is spread. */
  t?: number;
}

export class MeterPacer<T> {
  private queue: Queued<T>[] = [];
  private shown: T | null = null;
  private last = -Infinity;
  /** When the burst before the one arriving now came. */
  private prevBurst = -Infinity;
  private lastBurst = -Infinity;
  private moved: T[] = [];
  /** Dropped as stale, never shown: they still count as passed at the next take. */
  private dropped: T[] = [];

  push(frame: T, now: number) {
    if (now !== this.lastBurst) {
      this.prevBurst = this.lastBurst;
      this.lastBurst = now;
    }
    this.queue.push({ frame, at: now });
    this.last = now;
  }

  /** Spread the newest burst's frames evenly over the time since the burst before. */
  private spread() {
    const burst = this.queue.filter((q) => q.t === undefined);
    if (!burst.length) return;
    const at = burst[0]!.at;
    const from = at - this.prevBurst <= MAX_SPREAD_MS ? this.prevBurst : at - HOLD_MS / 2;
    burst.forEach((q, i) => (q.t = from + ((i + 1) * (at - from)) / burst.length));
  }

  /** The frame to show at this tick (call every ~50 ms). */
  take(now: number): T | null {
    this.spread();
    this.moved = this.dropped;
    this.dropped = [];
    while (this.queue.length && this.queue[0]!.t! <= now - HOLD_MS) {
      const q = this.queue.shift()!;
      this.moved.push(q.frame);
      if (q.t! > now - HOLD_MS - STALE_MS) this.shown = q.frame;
    }
    return this.shown;
  }

  /** The frames the last take moved past (any dropped since, then the shown one), oldest first. */
  passed(): T[] {
    return this.moved;
  }

  /** Frames are still coming. */
  live(now: number): boolean {
    return now - this.last < QUIET_MS;
  }
}
