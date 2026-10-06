// Modulator advice from the setup answers, the rate, and the modulators this instance
// actually lists. Reads its rules and numbers from policy.ts. Names are always resolved
// against the instance's own list (CLAUDE.md rule 5), never assumed.
import type { Setup } from "../api.ts";
import { POLICY, RULES, type Rule } from "./policy.ts";

export interface ModulatorInput {
  setup: Setup;
  /** The output rate the advice is for, in Hz (HQPlayer's, or one the listener is planning for). */
  rateHz: number;
  /** The modulators HQPlayer lists in SDM mode, by name. */
  modulators: string[];
  /** HQPlayer's processing speed now (Status), when playing; null when unknown. */
  processSpeed?: number | null;
}

export type Variant = (typeof POLICY.variants)[number];

export interface ModulatorAdvice {
  /** needs-dac: the DSD question isn't answered. use-pcm: the DAC converts DSD. */
  status: "needs-dac" | "use-pcm" | "ok";
  order: 5 | 7;
  /** The DSD rate that suits the DAC, if any; DSD1024 with AHM is also fine for direct DACs. */
  suggestedRate: { label: "DSD256" | "DSD512"; orDsd1024: boolean; rule: Rule } | null;
  /** Where to start, and the rules that moved it off HQPlayer's default. Null when nothing fits. */
  start: { name: string; isDefault: boolean; rules: Rule[] } | null;
  /** The rest of the EC family, lightest first, as character choices. */
  alternatives: { name: string; variant: Variant }[];
  /** Whether the 512+fs versions are on offer at this rate, and whether they're suggested. */
  p512: { offered: boolean; suggested: boolean };
  /** Modulators this instance lists that the advice doesn't know: newer than our rules. */
  unknown: string[];
  machine: { state: "keeps-up" | "tight" | "behind"; rule: Rule } | null;
}

const is = <T extends string>(list: readonly T[], v: string | undefined): boolean =>
  v !== undefined && (list as readonly string[]).includes(v);

/** Names the rules know: the EC line, AHM, AMSDM, and the older series. */
const KNOWN =
  /^(DSD[57](v2)?( 256\+fs)?|DSD5EC|ASDM[57](EC(v[23])?)?|ASDM[57]EC-(ul|light|fast|super)( 512\+fs)?|AMSDM7(EC)? 512\+fs|AHM[57]EC(5L|8B|4B))$/;

export function modulatorAdvice(input: ModulatorInput): ModulatorAdvice {
  const { setup, rateHz, modulators } = input;
  const has = (n: string) => modulators.includes(n);
  const order: 5 | 7 = is(POLICY.fifthOrderFor.dsd, setup.dsd) || is(POLICY.fifthOrderFor.amp, setup.amp) ? 5 : 7;
  const unknown = modulators.filter((n) => !KNOWN.test(n));
  const machine = machineState(input.processSpeed ?? null);
  const empty = {
    order,
    suggestedRate: null,
    start: null,
    alternatives: [],
    p512: { offered: false, suggested: false },
    unknown,
    machine,
  };
  if (!setup.dsd) return { status: "needs-dac", ...empty };

  const rate = POLICY.rateFor[setup.dsd];
  const suggestedRate = rate
    ? { label: rate, orDsd1024: setup.dsd === "direct", rule: setup.dsd === "direct" ? RULES.rateDirect : RULES.rateEss }
    : null;
  if (setup.dsd === "converts") return { status: "use-pcm", ...empty, suggestedRate };

  const rules: Rule[] = [];
  if (setup.dsd === "older-ess") rules.push(RULES.olderEssFifth);
  if (is(POLICY.fifthOrderFor.amp, setup.amp)) rules.push(RULES.ampFifth);

  const p512Offered = rateHz >= POLICY.p512FromHz;
  const p512Suggested = p512Offered && setup.volume === "hqplayer";
  const base = `ASDM${order}EC`;
  const ec = (v: Variant, p512: boolean) => `${base}-${v}${p512 ? " 512+fs" : ""}`;
  // The EC family at this rate: 512+fs when suggested and listed, else the regular versions.
  const use512 = p512Suggested && has(ec(POLICY.defaultVariant, true));
  const family = POLICY.variants.map((v) => ({ name: ec(v, use512), variant: v })).filter((x) => has(x.name));

  let start: ModulatorAdvice["start"] = null;
  if (rateHz >= POLICY.ahmFromHz) {
    const ahm = POLICY.ahmPreference.map((s) => `AHM${order}${s}`).find(has);
    if (ahm) {
      const r = [RULES.dsd1024Ahm, ...(ahm.endsWith("EC4B") ? [RULES.ahm4b] : []), ...rules];
      start = { name: ahm, isDefault: false, rules: r };
    }
  }
  if (!start) {
    const name = ec(POLICY.defaultVariant, use512);
    if (has(name)) {
      if (use512) rules.push(RULES.p512Volume);
      start = { name, isDefault: name === `ASDM7EC-${POLICY.defaultVariant}`, rules };
    }
  }
  const alternatives = family.filter((x) => x.name !== start?.name);
  return {
    status: "ok",
    order,
    suggestedRate,
    start,
    alternatives,
    p512: { offered: p512Offered, suggested: p512Suggested },
    unknown,
    machine,
  };
}

function machineState(speed: number | null): ModulatorAdvice["machine"] {
  if (speed === null || !Number.isFinite(speed) || speed <= 0) return null;
  const state = speed < POLICY.speed.behind ? "behind" : speed < POLICY.speed.tight ? "tight" : "keeps-up";
  return { state, rule: RULES.speed };
}
