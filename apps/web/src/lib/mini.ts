// The v2 mini bar (docs/design-v2-layout.md): what it shows when the now card has
// scrolled away. Pure; MiniBar.svelte shows it.
import { formatRate, modeLabel, type RoonZone, type Snapshot } from "./api.ts";
import { control } from "./control.ts";

/**
 * The track from Roon when hqpweb has the zone, else what HQPlayer is playing at; while a
 * mode switch runs (`switching`, the mode it's going to), only that.
 */
export function miniTitle(snap: Snapshot, zone: RoonZone | null, switching: string | null = null): string {
  if (switching) return `Switching to ${modeLabel(switching)}…`;
  const np = control(snap, zone).viaRoon?.nowPlaying;
  if (np?.track) return np.track;
  if (snap.status.state === 2 && snap.status.activeRate)
    return `Playing · ${formatRate(snap.status.activeRate, snap.status.activeMode)}`;
  return snap.status.state === 1 ? "Paused" : "Stopped";
}

/**
 * Play/pause, if it's ours to offer: with Roon feeding and no Roon link, HQPlayer's Play
 * doesn't resume Roon (measured 2026-10-08), so the bar says to use Roon instead. None
 * while a mode switch runs.
 */
export function miniPlay(
  snap: Snapshot,
  zone: RoonZone | null,
  switching: string | null = null,
): { action: "play" | "pause"; label: string } | null {
  const ctl = control(snap, zone);
  if (ctl.stopOnly || switching) return null;
  const action = ctl.playing ? "pause" : "play";
  return ctl.allowed(action) ? { action, label: action === "pause" ? "Pause" : "Play" } : null;
}
