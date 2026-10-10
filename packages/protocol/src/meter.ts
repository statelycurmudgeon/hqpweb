// HQPlayer's meter stream: binary frames on the control port + 1 (4322), sent while
// playing, no command or auth (measured 2026-10-08 on Desktop 5.35.10 Linux and Desktop 5
// macOS; on Embedded 6.2.5 macOS, 2026-10-09; matches the MIT SDK's clMeterInterface). Little-endian:
//   u32 version, u32 channels, u32 length (bins), u32 bits, f32 bandwidth (Hz),
//   f32 xformTime (s), f32 gain, 4 reserved bytes; then per channel:
//   f32 peakMax, peak, rms, rmsMax (dB; -386 until there is a reading),
//   f32 re[length], f32 im[length] (the spectrum: real and imaginary parts. Measured
//   2026-10-09 on Desktop 5.32.5 with music: im is exactly 0 at DC and Nyquist, as for a
//   real signal's FFT; it averages 0 and holds about half the energy; re and im together
//   track HQPlayer's RMS more steadily than re alone).
// Measured: 2 channels, 1025 bins, 22050 Hz, 23.2 ms, gain 2; 16464-byte frames, sent
// in bursts (~12 at a time, ~4 times a second) at ~43 a second in PCM, ~180 in DSD.

export interface MeterChannel {
  /** peakMax, peak, rms, rmsMax, in dB. */
  levels: [number, number, number, number];
  re: Float32Array;
  im: Float32Array;
}

export interface MeterFrame {
  version: number;
  channels: number;
  length: number;
  bits: number;
  bandwidth: number;
  xformTime: number;
  gain: number;
  chans: MeterChannel[];
}

/** A level HQPlayer hasn't measured yet (it sends -386). */
export const NO_LEVEL = -120;
const HEADER = 32;

export const frameSize = (channels: number, length: number) => HEADER + channels * (16 + 8 * length);

// Little-endian throughout. Plain bytes and DataView, not Node's Buffer, so it runs anywhere.
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** A whole frame's size, from its first 32 bytes (the header). */
export function meterFrameSize(header: Uint8Array): number {
  const v = view(header);
  return frameSize(v.getUint32(4, true), v.getUint32(8, true));
}

export function parseMeterFrame(buf: Uint8Array): MeterFrame {
  const v = view(buf);
  const f32 = (at: number) => v.getFloat32(at, true);
  const channels = v.getUint32(4, true);
  const length = v.getUint32(8, true);
  if (buf.length < frameSize(channels, length)) throw new Error(`meter frame too short: ${buf.length} bytes`);
  const chans: MeterChannel[] = [];
  let off = HEADER;
  for (let c = 0; c < channels; c++) {
    const levels = [0, 1, 2, 3].map((i) => f32(off + 4 * i)) as MeterChannel["levels"];
    off += 16;
    const re = new Float32Array(length);
    const im = new Float32Array(length);
    for (let i = 0; i < length; i++) re[i] = f32(off + 4 * i);
    off += 4 * length;
    for (let i = 0; i < length; i++) im[i] = f32(off + 4 * i);
    off += 4 * length;
    chans.push({ levels, re, im });
  }
  return {
    version: v.getUint32(0, true),
    channels,
    length,
    bits: v.getUint32(12, true),
    bandwidth: f32(16),
    xformTime: f32(20),
    gain: f32(24),
    chans,
  };
}

/** The same layout, for the fake HQPlayer. */
export function encodeMeterFrame(f: MeterFrame): Uint8Array {
  const buf = new Uint8Array(frameSize(f.channels, f.length));
  const v = view(buf);
  const f32 = (x: number, at: number) => v.setFloat32(at, x, true);
  v.setUint32(0, f.version, true);
  v.setUint32(4, f.channels, true);
  v.setUint32(8, f.length, true);
  v.setUint32(12, f.bits, true);
  f32(f.bandwidth, 16);
  f32(f.xformTime, 20);
  f32(f.gain, 24);
  let off = HEADER;
  for (const c of f.chans) {
    c.levels.forEach((x, i) => f32(x, off + 4 * i));
    off += 16;
    for (let i = 0; i < f.length; i++) f32(c.re[i] ?? 0, off + 4 * i);
    off += 4 * f.length;
    for (let i = 0; i < f.length; i++) f32(c.im[i] ?? 0, off + 4 * i);
    off += 4 * f.length;
  }
  return buf;
}

/**
 * Bin indices bounding log-spaced bands from 20 Hz to the bandwidth: aiming for `count`,
 * but each band gets bins of its own. A bin is ~21.5 Hz wide (1025 bins over 22050 Hz), so
 * below a few hundred Hz log bands are narrower than a bin; those merge (48 aimed → 40 real).
 * Before, they shared a bin and moved together in groups (seen on the owner's test build, 2026-10-08).
 */
export function bandEdges(length: number, bandwidth: number, count = 48, low = 20): number[] {
  const binHz = bandwidth / (length - 1);
  const edges = Array.from({ length: count + 1 }, (_, i) =>
    Math.min(length - 1, Math.max(1, Math.round((low * (bandwidth / low) ** (i / count)) / binHz))),
  );
  return edges.filter((e, i) => i === 0 || e > edges[i - 1]!);
}

/** Each edge's frequency (Hz), so the low bands can be drawn as wide as they really are. */
export const edgeHz = (edges: number[], length: number, bandwidth: number) => edges.map((e) => (e * bandwidth) / (length - 1));

const db = (x: number) => (x > 0 ? Math.max(NO_LEVEL, 20 * Math.log10(x)) : NO_LEVEL);
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * How alike left and right are in each band, from the bins' real and imaginary parts:
 * Re(Σ L·R*) / √(Σ|L|²·Σ|R|²). 1: the same (mono); 0: unrelated (wide); −1: opposite
 * (out of phase). 0 for a silent band. Two decimals.
 */
export function bandCorrelation(l: { re: ArrayLike<number>; im: ArrayLike<number> }, r: typeof l, edges: number[]): number[] {
  const out: number[] = [];
  for (let b = 0; b + 1 < edges.length; b++) {
    let cross = 0;
    let ll = 0;
    let rr = 0;
    for (let i = edges[b]!; i < edges[b + 1]!; i++) {
      cross += l.re[i]! * r.re[i]! + l.im[i]! * r.im[i]!;
      ll += l.re[i]! ** 2 + l.im[i]! ** 2;
      rr += r.re[i]! ** 2 + r.im[i]! ** 2;
    }
    out.push(ll > 0 && rr > 0 ? Math.round((cross / Math.sqrt(ll * rr)) * 100) / 100 : 0);
  }
  return out;
}

/**
 * Condensed levels (condense) with each side's peak raised to the loudest among `frames`, the
 * frames passed since the last update. Only one of them is shown, so without this a one-frame
 * peak (a drum hit) is dropped more often than not (two frames a tick in PCM, more in DSD).
 */
export function peakAcross(levels: number[][], frames: { chans: { levels: ArrayLike<number> }[] }[]): number[][] {
  if (frames.length < 2) return levels;
  return levels.map((l, c) => {
    const p = Math.max(...frames.map((f) => f.chans[c]?.levels[1] ?? -386));
    return p > -300 && r1(p) > l[1]! ? [l[0]!, r1(p), l[2]!, l[3]!] : l;
  });
}

/**
 * Per channel: the four levels and the loudest bin in each band (bands from bandEdges), in
 * dB; with two or more channels, the first two's correlation per band (bandCorrelation).
 */
export function condense(f: MeterFrame, edges: number[]): { levels: number[][]; bands: number[][]; corr?: number[] } {
  return {
    ...(f.chans.length >= 2 ? { corr: bandCorrelation(f.chans[0]!, f.chans[1]!, edges) } : {}),
    levels: f.chans.map((c) => c.levels.map((v) => (v < -300 ? NO_LEVEL : r1(v)))),
    bands: f.chans.map((c) => {
      const out: number[] = [];
      for (let b = 0; b + 1 < edges.length; b++) {
        let m = 0;
        for (let i = edges[b]!; i < edges[b + 1]!; i++) m = Math.max(m, Math.hypot(c.re[i]!, c.im[i]!));
        out.push(r1(db(m * f.gain)));
      }
      return out;
    }),
  };
}
