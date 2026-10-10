// A mode switch in progress. HQPlayer passes through paused, stopped and paused again
// (in the new mode) before it plays, over ~12 s (measured 2026-10-09, Desktop 5 with
// Roon). Shown as they come, each step flipped the status, the play buttons and the rate.
// So the page holds one steady "Switching" state until HQPlayer plays in the new mode, or
// the change returns. Pure; App, NowCard and MiniBar show it.
import { modeLabel, type Snapshot } from "./api.ts";
import type { ResultMessage } from "./result.ts";

/** Hold the steady state: a switch to `to` is running and HQPlayer isn't playing in it yet. */
export function switchHold(to: string | null, snap: Snapshot | null): boolean {
  return to !== null && !(snap?.status.state === 2 && snap.status.activeMode === to);
}

/**
 * The footer while a switch runs: "Switching…" until the music is back, then that it's
 * checking playback (hqpweb watches it for a few seconds more before the result).
 */
export function switchFooter(to: string | null, snap: Snapshot | null, message: ResultMessage | null): ResultMessage | null {
  if (to === null || message?.kind !== "info" || switchHold(to, snap)) return message;
  return { kind: "info", text: `Playing in ${modeLabel(to)}; checking playback…` };
}
