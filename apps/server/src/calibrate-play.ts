// Playing the clap track (calibration.ts) through HQPlayer for the web app's tap calibration.
// Measured 2026-10-09 (Embedded 6.2.5, macOS): HQPlayer fetches a URL itself (HEAD, then GET)
// and keeps it only when the server says audio/wav and takes byte ranges (app.ts serves it so);
// while Roon streams, HQPlayer ignores its own playlist until stopped. So: stop, clear, add it
// to play at once, press Play, and read back that it's really playing (rule 4).
import { cmd, element, type HqpClient } from "@app/protocol";
import { CLAPS_MS, TRACK_MS } from "./calibration.ts";
import { HttpError } from "./errors.ts";

export interface ClapPlay {
  /** When HQPlayer was first seen playing the track (ms, server clock); for the record. */
  playingAt: number;
  /** When each clap starts in the track, and its length. The web app matches hits to these gaps. */
  clapsMs: number[];
  trackMs: number;
}

export async function playClapTrack(client: HqpClient, url: string, timeoutMs = 8000): Promise<ClapPlay> {
  await client.send(cmd.stop());
  await client.send(element("PlaylistClear"));
  await client.send(element("PlaylistAdd", { uri: url, queued: 0, clear: 1, start: 1 }));
  await client.send(cmd.play());
  const t0 = Date.now();
  for (;;) {
    const s = await client.status();
    if (s.state === 2 && s.source?.song !== "Roon") return { playingAt: Date.now(), clapsMs: CLAPS_MS, trackMs: TRACK_MS };
    if (Date.now() - t0 > timeoutMs)
      throw new HttpError(
        502,
        `HQPlayer didn't play the clap track. It fetches it from ${url}: check HQPlayer's machine can reach that address.`,
      );
    await new Promise((r) => setTimeout(r, 250));
  }
}
