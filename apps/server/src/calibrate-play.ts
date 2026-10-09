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

/**
 * Play the track from the first address HQPlayer takes. Candidates, in order (app.ts): the copy
 * on GitHub, the address the page was opened at, then this server's address on its connection
 * to HQPlayer (an HTTPS proxy or a tailnet name can give a page address HQPlayer can't fetch). Each is checked
 * in the playlist before Play: HQPlayer answers OK either way and keeps only what it could fetch.
 */
export async function playClapTrack(client: HqpClient, urls: string[], timeoutMs = 8000): Promise<ClapPlay> {
  await client.send(cmd.stop());
  const url = await firstTaken(client, [...new Set(urls)]);
  if (!url)
    throw new HttpError(
      502,
      `HQPlayer couldn't fetch the clap track from ${[...new Set(urls)].join(" or ")}: check its machine can reach hqpweb there.`,
    );
  await client.send(cmd.play());
  const t0 = Date.now();
  for (;;) {
    const s = await client.status();
    if (s.state === 2 && s.source?.song !== "Roon") return { playingAt: Date.now(), clapsMs: CLAPS_MS, trackMs: TRACK_MS };
    if (Date.now() - t0 > timeoutMs) throw new HttpError(502, `HQPlayer took the clap track from ${url} but didn't play it.`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** The first URL HQPlayer keeps in its playlist (it fetches it on PlaylistAdd), waiting up to 3 s for each. */
async function firstTaken(client: HqpClient, urls: string[]): Promise<string | null> {
  for (const url of urls) {
    await client.send(element("PlaylistClear"));
    await client.send(element("PlaylistAdd", { uri: url, queued: 0, clear: 1, start: 1 }));
    for (const t0 = Date.now(); Date.now() - t0 < 3000; await new Promise((r) => setTimeout(r, 200))) {
      const list = await client.request(cmd.playlistGet());
      if (list.children.some((c) => c.name === "PlaylistItem")) return url;
    }
  }
  return null;
}
