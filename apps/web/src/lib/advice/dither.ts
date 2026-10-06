// Dither advice from the setup answers, the PCM rate, and the shapers this instance lists.
// Two answers (review, 5 Oct 2026): a ladder DAC at the shaping rate and up gets LNS15,
// NS9 or NS5 as equals; everything else gets TPDF or Gauss1 as equals. Never "none".
import type { Setup } from "../api.ts";
import { POLICY, RULES, type Rule } from "./policy.ts";

export interface DitherInput {
  setup: Setup;
  /** The PCM output rate the advice is for, in Hz. */
  rateHz: number;
  /** The dithers / noise shapers HQPlayer lists in PCM mode, by name. */
  shapers: string[];
}

export interface DitherAdvice {
  status: "needs-dac" | "ok";
  /** The group to choose from, as equals, in the order to try; `start` is the first listed. */
  group: string[];
  start: string | null;
  rules: Rule[];
  /** What to set DAC Bits to, in HQPlayer's own settings (hqpweb can't read or set it). */
  bits: { kind: "ladder" | "default" | "24"; rule: Rule | null } | null;
  /** The rate is too low for a ladder DAC: raise it if the DAC allows. */
  raiseRate: boolean;
  /** The DAC takes DSD well: DSD output usually beats PCM. */
  tryDsd: boolean;
}

export function ditherAdvice(input: DitherInput): DitherAdvice {
  const { setup, rateHz, shapers } = input;
  const listed = (names: string[]) => names.filter((n) => shapers.includes(n));
  const tryDsd =
    setup.pcm === "delta-sigma" && (setup.dsd === "older-ess" || setup.dsd === "remodulates" || setup.dsd === "direct");
  if (!setup.pcm) return { status: "needs-dac", group: [], start: null, rules: [], bits: null, raiseRate: false, tryDsd: false };

  const ladder = setup.pcm === "ladder";
  const bits24 = setup.link === "spdif" || setup.link === "i2s";
  const bits: DitherAdvice["bits"] = ladder
    ? { kind: "ladder", rule: RULES.ladderBits }
    : { kind: bits24 ? "24" : "default", rule: null };

  if (ladder && setup.link !== "spdif" && rateHz >= POLICY.ladderShapingFromHz) {
    const order = rateHz >= POLICY.lns15FromHz ? ["LNS15", "NS9", "NS5"] : ["NS5", "NS9", "LNS15"];
    const group = listed(order);
    const rules = [RULES.ladderShapers, ...(rateHz < POLICY.lns15FromHz ? [RULES.ladderAt384] : [])];
    return { status: "ok", group, start: group[0] ?? null, rules, bits, raiseRate: false, tryDsd };
  }
  const group = listed(["TPDF", "Gauss1"]);
  const raiseRate = ladder && rateHz < POLICY.ladderShapingFromHz;
  return {
    status: "ok",
    group,
    start: group[0] ?? null,
    rules: [raiseRate ? RULES.ladderRate : RULES.flatDither],
    bits,
    raiseRate,
    tryDsd,
  };
}

/** Shapers to show only on request: older or specialised, rarely suggested. */
export const MORE_SHAPERS = ["NS4", "shaped", "NS1", "RPDF"];
/** Never for listening. */
export const NEVER = "none";
