import { describe, expect, it } from "vitest";
import { SHAPERS_V5 as SHAPERS } from "./recorded-lists.ts";
import { ditherAdvice, type DitherInput } from "./dither.ts";
import { RULES } from "./policy.ts";

const advise = (over: Partial<DitherInput> & { setup: DitherInput["setup"] }) =>
  ditherAdvice({ rateHz: 384_000, shapers: SHAPERS, ...over });

describe("dither advice", () => {
  it("gives no advice until the PCM question is answered", () => {
    expect(advise({ setup: {} }).status).toBe("needs-dac");
  });

  it("gives a delta-sigma DAC TPDF or Gauss1, as equals", () => {
    const a = advise({ setup: { pcm: "delta-sigma", link: "usb" } });
    expect([a.group, a.rules]).toEqual([["TPDF", "Gauss1"], [RULES.flatDither]]);
  });

  it("gives a ladder DAC at 384 kHz NS5, NS9 or LNS15, NS5 first", () => {
    const a = advise({ setup: { pcm: "ladder", link: "usb" } });
    expect([a.group, a.rules]).toEqual([
      ["NS5", "NS9", "LNS15"],
      [RULES.ladderShapers, RULES.ladderAt384],
    ]);
  });

  it("puts LNS15 first for a ladder DAC at 768 kHz", () => {
    expect(advise({ setup: { pcm: "ladder", link: "usb" }, rateHz: 768_000 }).start).toBe("LNS15");
  });

  it("tells a ladder DAC at 192 kHz to raise the rate, with flat dither meanwhile", () => {
    const a = advise({ setup: { pcm: "ladder", link: "usb" }, rateHz: 192_000 });
    expect([a.raiseRate, a.group, a.rules]).toEqual([true, ["TPDF", "Gauss1"], [RULES.ladderRate]]);
  });

  it("asks for the rate before advising a ladder DAC, when it isn't known (auto, stopped)", () => {
    const a = advise({ setup: { pcm: "ladder", link: "usb" }, rateHz: 0 });
    expect([a.status, a.group, a.raiseRate]).toEqual(["needs-rate", [], false]);
  });

  it("advises a delta-sigma DAC without knowing the rate", () => {
    expect(advise({ setup: { pcm: "delta-sigma", link: "usb" }, rateHz: 0 }).group).toEqual(["TPDF", "Gauss1"]);
  });

  it("doesn't tell a ladder DAC over S/PDIF to raise the rate, since S/PDIF tops out near 192k", () => {
    const a = advise({ setup: { pcm: "ladder", link: "spdif" }, rateHz: 192_000 });
    expect([a.raiseRate, a.rules]).toEqual([false, [RULES.flatDither]]);
  });

  it("keeps flat dither for a ladder DAC over S/PDIF", () => {
    expect(advise({ setup: { pcm: "ladder", link: "spdif" } }).group).toEqual(["TPDF", "Gauss1"]);
  });

  it("sets DAC Bits to Default over USB for a delta-sigma DAC", () => {
    expect(advise({ setup: { pcm: "delta-sigma", link: "usb" } }).bits?.kind).toBe("default");
  });

  it("sets DAC Bits to 24 over S/PDIF or I2S", () => {
    const kinds = (["spdif", "i2s"] as const).map((link) => advise({ setup: { pcm: "delta-sigma", link } }).bits?.kind);
    expect(kinds).toEqual(["24", "24"]);
  });

  it("keeps a ladder DAC's own low DAC Bits whatever the link, citing the rule", () => {
    expect(advise({ setup: { pcm: "ladder", link: "spdif" } }).bits).toEqual({ kind: "ladder", rule: RULES.ladderBits });
  });

  it("suggests trying DSD for a delta-sigma DAC that takes DSD well", () => {
    expect(advise({ setup: { pcm: "delta-sigma", dsd: "direct" } }).tryDsd).toBe(true);
  });

  it("doesn't suggest DSD for a DAC that converts DSD", () => {
    expect(advise({ setup: { pcm: "delta-sigma", dsd: "converts" } }).tryDsd).toBe(false);
  });

  it("never offers none, or a shaper HQPlayer doesn't list", () => {
    const a = advise({ setup: { pcm: "ladder", link: "usb" }, shapers: ["none", "TPDF", "NS9"] });
    expect(a.group).toEqual(["NS9"]);
  });
});
