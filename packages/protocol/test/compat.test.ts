import { describe, expect, it } from "vitest";
import { ditherHint, filterSlot, modulatorHint, predictedStop, ratioClass, ratioHint } from "../src/compat.ts";

describe("ratio rules (manual §4.6)", () => {
  it("knows classes, including -2s variants, and admits unknown names", () => {
    expect(ratioClass("sinc-M")).toBe("pow2-up"); // HQPlayer 6's own description
    expect(ratioClass("FFT")).toBe("pow2");
    expect(ratioClass("closed-form-M")).toBe("pow2-up");
    expect(ratioClass("poly-sinc-long-lp-2s")).toBe("any");
    expect(ratioClass("poly-sinc-ext2-xla")).toBe("any"); // from HQPlayer 6's descriptions
    expect(ratioClass("some-future-filter")).toBeUndefined();
  });

  it("explains the measured sinc-M stop: 44.1k → 192k isn't a power-of-two ratio", () => {
    expect(ratioHint("sinc-M", 44_100, 192_000)).toMatchObject({
      level: "hard",
      text: expect.stringMatching(/power-of-two.*4\.35×/),
    });
    expect(ratioHint("sinc-M", 44_100, 176_400)).toBeUndefined(); // 4×
    expect(ratioHint("sinc-M", 192_000, 96_000)?.level).toBe("hard"); // upsampling only (HQPlayer 6)
  });

  it("handles power-of-two and integer-up filters", () => {
    expect(ratioHint("closed-form", 44_100, 352_800)).toBeUndefined(); // 8×
    expect(ratioHint("closed-form", 44_100, 264_600)?.level).toBe("hard"); // 6×
    expect(ratioHint("polynomial-1", 96_000, 48_000)?.level).toBe("hard"); // down
    expect(ratioHint("poly-sinc-mqa/mp3-lp", 44_100, 22_579_200, true)).toBeUndefined(); // SDM: any
  });

  it("says nothing for 'any' filters or unknown names", () => {
    expect(ratioHint("poly-sinc-gauss-long", 44_100, 192_000)).toBeUndefined();
    expect(ratioHint("mystery-filter", 44_100, 192_000)).toBeUndefined();
  });

  it("puts sources below 50 kHz on the 1x filter", () => {
    expect(filterSlot(48_000)).toBe("1x");
    expect(filterSlot(88_200)).toBe("Nx");
  });
});

describe("modulator and dither hints (§4.5, §4.4)", () => {
  it("treats AHM below DSD1024 as hard (measured for AHM7EC8B)", () => {
    expect(modulatorHint("AHM7EC8B", 22_579_200)?.level).toBe("hard");
    expect(modulatorHint("AHM7EC8B", 45_158_400)).toBeUndefined();
    expect(modulatorHint("ASDM7EC-fast 512+fs", 11_289_600)?.level).toBe("soft");
    expect(modulatorHint("ASDM7EC", 2_822_400)).toBeUndefined();
  });

  it("gives soft dither guidance by rate", () => {
    expect(ditherHint("NS5", 96_000)?.level).toBe("soft");
    expect(ditherHint("NS5", 384_000)).toBeUndefined();
    expect(ditherHint("TPDF", 44_100)).toBeUndefined();
  });

  it("predicts stops only from hard rules", () => {
    expect(
      predictedStop({ mode: "PCM", filter: "sinc-M", shaper: "NS5", sourceRate: 44_100, outputRate: 192_000 }),
    ).toBeDefined();
    expect(
      predictedStop({ mode: "PCM", filter: "poly-sinc-gauss-long", shaper: "NS5", sourceRate: 44_100, outputRate: 96_000 }),
    ).toBeUndefined();
    expect(
      predictedStop({
        mode: "SDM (DSD)",
        filter: "poly-sinc-gauss-xla",
        shaper: "AHM7EC8B",
        sourceRate: 44_100,
        outputRate: 11_289_600,
      }),
    ).toBeDefined();
  });
});

describe("HQPlayer 6 descriptions", () => {
  it("parses filter descriptions as measured on engine 6.2.3", async () => {
    const { parseFilterDescription } = await import("../src/compat.ts");
    expect(parseFilterDescription("5/5 transients, timbre, space ⥮ Any")).toEqual({
      rating: 5,
      tags: ["transients", "timbre", "space"],
      ratio: "any",
      ratioText: "Any",
      arrow: "⥮",
    });
    expect(parseFilterDescription("4/5 space, ⥮ Any")?.tags).toEqual(["space"]); // trailing comma, measured
    expect(parseFilterDescription("2/5 ⥮ 2^x up")).toMatchObject({ rating: 2, tags: [], ratio: "pow2-up" });
    expect(parseFilterDescription("5/5 timbre ⥣ Any")?.arrow).toBe("⥣"); // -2s filters
    expect(parseFilterDescription("1/5 ⥮ 1:1")?.ratio).toBe("1:1");
    expect(parseFilterDescription(undefined)).toBeUndefined();
    expect(parseFilterDescription("something new")).toBeUndefined();
  });

  it("lets HQPlayer's own ratio rule override ours", async () => {
    const { ratioHint } = await import("../src/compat.ts");
    // Our table says any for poly-sinc-long-lp; a description saying "Int" wins.
    expect(ratioHint("poly-sinc-long-lp", 44_100, 192_000, false, "integer")?.level).toBe("hard");
    expect(ratioHint("poly-sinc-long-lp", 44_100, 192_000)).toBeUndefined();
  });

  it("reads modulator generations", async () => {
    const { modulatorGeneration } = await import("../src/compat.ts");
    expect(modulatorGeneration("Gen8")).toBe(8);
    expect(modulatorGeneration("")).toBeUndefined();
  });
});
