// The clap track for lining the meter up by ear (the web app's tap calibration): six short
// claps at irregular gaps, so only one delay lines the listener's taps up with them (music
// repeats every bar, so tapping along to it can be a bar out). Generated, not a file: 16-bit
// stereo PCM at 44.1 kHz, served to HQPlayer over HTTP (it plays URLs: Roon feeds it one).

/**
 * The same track kept in the repository (calibration/claps-v1.wav; a test keeps it identical),
 * tried first: one address that works wherever HQPlayer has internet, whatever sits between it
 * and hqpweb (owner's choice). Measured 2026-10-09 (Embedded 6.2.5): HQPlayer takes and plays it
 * over HTTPS from here. A new pattern gets a new file name, so older versions keep theirs.
 */
export const GITHUB_CLAPS_URL = "https://raw.githubusercontent.com/statelycurmudgeon/hqpweb/main/calibration/claps-v1.wav";

/** When each clap starts, ms into the track. Gaps 2.4, 2.1, 2.8, 2.2, 3.1 s. */
export const CLAPS_MS = [2000, 4400, 6500, 9300, 11_500, 14_600];
export const TRACK_MS = 17_000;
const RATE = 44_100;
/** Peak level: clearly heard, well below full scale. */
const PEAK_DBFS = -12;

import type { IncomingMessage, ServerResponse } from "node:http";

let cached: Buffer | null = null;

/** The track as a WAV file. */
export function clapTrack(): Buffer {
  if (cached) return cached;
  const frames = Math.round((TRACK_MS / 1000) * RATE);
  const buf = Buffer.alloc(44 + frames * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(frames * 4, 40);
  // A clap: 40 ms of noise falling away fast (time constant 8 ms). The same noise every time.
  const peak = 32767 * 10 ** (PEAK_DBFS / 20);
  let seed = 1;
  const noise = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 30 - 1;
  const len = Math.round(0.04 * RATE);
  const clap = Array.from({ length: len }, (_, i) => Math.round(peak * noise() * Math.exp(-i / (0.008 * RATE))));
  for (const at of CLAPS_MS) {
    const start = Math.round((at / 1000) * RATE);
    for (let i = 0; i < len; i++) {
      buf.writeInt16LE(clap[i]!, 44 + (start + i) * 4);
      buf.writeInt16LE(clap[i]!, 44 + (start + i) * 4 + 2);
    }
  }
  cached = buf;
  return buf;
}

/**
 * Serve the track the way HQPlayer will take it (measured 2026-10-09, Embedded 6.2.5): it
 * sends HEAD, then GET, and drops the URL unless the reply says audio/wav and takes byte
 * ranges. A server without HEAD or ranges got an OK from PlaylistAdd and an empty playlist.
 */
export function serveClapTrack(req: IncomingMessage, res: ServerResponse, headers: Record<string, string>) {
  const wav = clapTrack();
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  let start = 0;
  let end = wav.length - 1;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : wav.length - Number(m[2]);
    end = m[1] && m[2] ? Math.min(Number(m[2]), wav.length - 1) : wav.length - 1;
    if (start > end || start >= wav.length) {
      res.writeHead(416, { ...headers, "content-range": `bytes */${wav.length}` });
      return void res.end();
    }
  }
  const partial = start !== 0 || end !== wav.length - 1;
  res.writeHead(partial ? 206 : 200, {
    ...headers,
    "content-type": "audio/wav",
    "accept-ranges": "bytes",
    "content-length": String(end - start + 1),
    ...(partial ? { "content-range": `bytes ${start}-${end}/${wav.length}` } : {}),
  });
  if (req.method === "HEAD") return void res.end();
  res.end(wav.subarray(start, end + 1));
}
