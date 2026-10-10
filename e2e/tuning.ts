// The timings the browser tests run the core with, on the server and in the app's test build
// alike: short playback checks, as in the server's own tests, so flows finish in seconds.
import type { ServiceOptions, WatchTiming } from "@app/core";

const FAST: WatchTiming = { graceMs: 100, healthyMs: 300, maxMs: 1200, sampleMs: 40, minSpeed: 0.85 };

export const TUNING = {
  timing: { quick: FAST, major: { ...FAST, maxMs: 1500 } },
  playWaitMs: 400,
  queueEveryMs: 300,
  pollMs: 250,
} satisfies Pick<ServiceOptions, "timing" | "playWaitMs" | "queueEveryMs" | "pollMs">;
