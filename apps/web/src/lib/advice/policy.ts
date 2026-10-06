// The picker's advice, as data: Signalyst's rules (each with the post it comes from) and
// the numbers they use. modulator.ts and dither.ts only read this file, so a correction
// from Signalyst is an edit here, never a change to the logic. Every rule cites a post by
// Jussi Laako (Signalyst's developer) or the manual, paraphrased; 2025–26 posts preferred.
// Review: 5 Oct 2026, across his 2025–26 posts in five Roon threads.

export interface Rule {
  /** What the guide says, in one short sentence. */
  text: string;
  /** The post it comes from (Roon forum), or the manual section. */
  url?: string;
  source?: string;
  /** "YYYY-MM". */
  date: string;
}

const roon = (topicPost: string) => `https://community.roonlabs.com/t/${topicPost}`;

export const RULES = {
  // ---- Modulators ----
  default: { text: "HQPlayer's default is Signalyst's general-purpose choice.", url: roon("322881/64"), date: "2026-08" },
  olderEssFifth: { text: "Fifth order for older ESS chips; a guide, not absolute.", url: roon("261032/1422"), date: "2026-09" },
  ampFifth: { text: "Fifth order with a class-D or tube amplifier.", url: roon("132298/2953"), date: "2025-10" },
  p512Volume: { text: "512+fs, because HQPlayer sets your volume, at DSD512 and up.", url: roon("261032/1362"), date: "2026-06" },
  dsd1024Ahm: {
    text: "If you run DSD1024, use AHM; neither it nor the EC line at DSD256/512 is clearly better.",
    url: roon("132298/2731"),
    date: "2025-07",
  },
  ahm4b: { text: "On HQPlayer 6.1, start with the new 4B versions.", url: roon("325365/6"), date: "2026-09" },
  variantsEqual: {
    text: "The four EC variants are one quality tier; they differ in character.",
    url: roon("166213/2101"),
    date: "2026-01",
  },
  rateEss: { text: "DSD512 suits ESS chips best.", url: roon("304268/153"), date: "2026-06" },
  rateDirect: {
    text: "DSD256 is the sweet spot for direct-DSD DACs, or DSD1024 with AHM.",
    url: roon("304268/174"),
    date: "2026-08",
  },
  usePcm: { text: "This DAC converts or filters DSD, so PCM output suits it better.", url: roon("304268/29"), date: "2025-08" },
  // ---- Dither ----
  ladderShapers: {
    text: "For a ladder DAC: LNS15, NS9 or NS5; Signalyst lists them as equals.",
    url: roon("278907/31"),
    date: "2025-02",
  },
  ladderAt384: { text: "At 352.8 and 384 kHz, NS5 or NS9.", url: roon("244327/2505"), date: "2026-03" },
  ladderRate: { text: "Ladder DACs do best at 705.6 kHz or higher.", url: roon("278907/31"), date: "2025-02" },
  flatDither: { text: "TPDF or Gauss1, as equals.", url: roon("261032/1070"), date: "2025-08" },
  ladderBits: {
    text: "DAC Bits low for a ladder: 20 for Holo and Denafrips; 18 or less without a measurement. Round down.",
    url: roon("172052/19"),
    date: "2025-01",
  },
  neverNone: { text: 'Never "none": PCM output distorts without dither.', url: roon("289922/253"), date: "2026-02" },
  dsdBetter: {
    text: "On delta-sigma DACs that take DSD well, DSD output usually beats PCM.",
    url: roon("311401/28"),
    date: "2025-12",
  },
  // ---- Both ----
  headroom: { text: "Keep HQPlayer's volume at −3 dB or lower.", url: roon("289536/11"), date: "2025-01" },
  speed: {
    text: "Judge the machine by HQPlayer's processing speed: above 1×, though that's no guarantee.",
    url: roon("244327/2454"),
    date: "2026-03",
  },
} as const satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;

/** The numbers and mappings the rules use. */
export const POLICY = {
  /** Answers that move the order to fifth. Everything else gets seventh. */
  fifthOrderFor: { dsd: ["older-ess"], amp: ["class-d-or-tube"] },
  /** The DSD rate that suits each DSD answer (null: use PCM). */
  rateFor: { "older-ess": "DSD512", remodulates: "DSD512", direct: "DSD256", converts: null },
  /** 512+fs versions are suggested from this rate up (DSD512, 44.1k or 48k family). */
  p512FromHz: 22_579_200,
  /** AHM from this rate up (the manual's floor, 40.96 MHz: DSD1024 in either family). */
  ahmFromHz: 40_960_000,
  /** Which AHM to start with, in order of preference, by suffix. 6.1 lists 4B; 5.x lists 8B. */
  ahmPreference: ["EC4B", "EC8B"],
  /** The EC line's variants, lightest first. "fast" is HQPlayer's default. */
  variants: ["ul", "light", "fast", "super"],
  defaultVariant: "fast",
  /** Dither: noise shaping helps a ladder DAC from this rate up; LNS15 from the second. */
  ladderShapingFromHz: 352_800,
  lns15FromHz: 705_600,
  /** Processing speed: below `behind` it's falling behind; below `tight` it's only just keeping up. */
  speed: { behind: 1, tight: 1.5 },
} as const;
