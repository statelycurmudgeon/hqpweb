import { describe, expect, it } from "vitest";
import { modulatorAdvice, type ModulatorInput } from "./modulator.ts";
import { RULES } from "./policy.ts";

// As HQPlayer Desktop 5.35 lists them in SDM mode (recorded, packages/fake-hqp profile).
const V5 = [
  "DSD5",
  "DSD5v2",
  "DSD5v2 256+fs",
  "DSD5EC",
  "ASDM5",
  "ASDM5EC",
  "ASDM5ECv2",
  "ASDM5ECv3",
  "ASDM5EC-ul",
  "ASDM5EC-light",
  "ASDM5EC-fast",
  "ASDM5EC-super",
  "ASDM5EC-ul 512+fs",
  "ASDM5EC-light 512+fs",
  "ASDM5EC-fast 512+fs",
  "ASDM5EC-super 512+fs",
  "DSD7",
  "DSD7 256+fs",
  "ASDM7",
  "ASDM7EC",
  "ASDM7ECv2",
  "ASDM7ECv3",
  "ASDM7EC-ul",
  "ASDM7EC-light",
  "ASDM7EC-fast",
  "ASDM7EC-super",
  "ASDM7EC-ul 512+fs",
  "ASDM7EC-light 512+fs",
  "ASDM7EC-fast 512+fs",
  "ASDM7EC-super 512+fs",
  "AMSDM7 512+fs",
  "AMSDM7EC 512+fs",
  "AHM5EC5L",
  "AHM7EC5L",
  "AHM5EC8B",
  "AHM7EC8B",
];
// HQPlayer 6.1: the 5L AHM gone, the 4B AHM added (release notes, 2026-09). Not yet seen live.
const V61 = [...V5.filter((n) => !n.endsWith("5L")), "AHM5EC4B", "AHM7EC4B"];
const DSD256 = 11_289_600,
  DSD512 = 22_579_200,
  DSD1024 = 45_158_400;
const advise = (over: Partial<ModulatorInput> & { setup: ModulatorInput["setup"] }) =>
  modulatorAdvice({ rateHz: DSD256, modulators: V5, ...over });

describe("modulator advice: the DAC question", () => {
  it("gives no advice until the DSD question is answered", () => {
    expect(advise({ setup: {} }).status).toBe("needs-dac");
  });

  it("starts a direct-DSD DAC on HQPlayer's default, ASDM7EC-fast", () => {
    expect(advise({ setup: { dsd: "direct" } }).start).toEqual({ name: "ASDM7EC-fast", isDefault: true, rules: [] });
  });

  it("starts an older ESS DAC on fifth order, citing the rule", () => {
    expect(advise({ setup: { dsd: "older-ess" } }).start).toEqual({
      name: "ASDM5EC-fast",
      isDefault: false,
      rules: [RULES.olderEssFifth],
    });
  });

  it("suggests DSD512 for ESS chips, old and new", () => {
    const rates = (["older-ess", "remodulates"] as const).map((dsd) => advise({ setup: { dsd } }).suggestedRate?.label);
    expect(rates).toEqual(["DSD512", "DSD512"]);
  });

  it("suggests DSD256, or DSD1024 with AHM, for a direct-DSD DAC", () => {
    expect(advise({ setup: { dsd: "direct" } }).suggestedRate).toMatchObject({ label: "DSD256", orDsd1024: true });
  });

  it("sends a DAC that converts DSD to PCM, with no modulator to start on", () => {
    const a = advise({ setup: { dsd: "converts" } });
    expect([a.status, a.start]).toEqual(["use-pcm", null]);
  });
});

describe("modulator advice: amplifier and volume", () => {
  it("moves to fifth order with a class-D or tube amplifier, citing the rule", () => {
    expect(advise({ setup: { dsd: "direct", amp: "class-d-or-tube" } }).start).toMatchObject({
      name: "ASDM5EC-fast",
      rules: [RULES.ampFifth],
    });
  });

  it("leaves the order alone when the listener isn't sure about the amplifier", () => {
    expect(advise({ setup: { dsd: "direct", amp: "unsure" } }).order).toBe(7);
  });

  it("suggests 512+fs when HQPlayer sets the volume, at DSD512", () => {
    expect(advise({ setup: { dsd: "direct", volume: "hqplayer" }, rateHz: DSD512 }).start).toMatchObject({
      name: "ASDM7EC-fast 512+fs",
      rules: [RULES.p512Volume],
    });
  });

  it("doesn't suggest 512+fs at DSD256, even when HQPlayer sets the volume", () => {
    expect(advise({ setup: { dsd: "direct", volume: "hqplayer" } }).start?.name).toBe("ASDM7EC-fast");
  });

  it("doesn't suggest 512+fs when the volume is fixed", () => {
    expect(advise({ setup: { dsd: "direct", volume: "fixed" }, rateHz: DSD512 }).start?.name).toBe("ASDM7EC-fast");
  });
});

describe("modulator advice: DSD1024 and names", () => {
  it("starts on AHM7EC8B at DSD1024 on HQPlayer 5", () => {
    expect(advise({ setup: { dsd: "direct" }, rateHz: DSD1024 }).start).toMatchObject({
      name: "AHM7EC8B",
      rules: [RULES.dsd1024Ahm],
    });
  });

  it("prefers the 4B AHM when HQPlayer lists it (6.1), citing why", () => {
    expect(advise({ setup: { dsd: "direct" }, rateHz: DSD1024, modulators: V61 }).start).toMatchObject({
      name: "AHM7EC4B",
      rules: [RULES.dsd1024Ahm, RULES.ahm4b],
    });
  });

  it("uses fifth-order AHM with a class-D or tube amplifier", () => {
    expect(advise({ setup: { dsd: "direct", amp: "class-d-or-tube" }, rateHz: DSD1024, modulators: V61 }).start?.name).toBe(
      "AHM5EC4B",
    );
  });

  it("treats the 48k-family DSD1024 rate as DSD1024", () => {
    expect(advise({ setup: { dsd: "direct" }, rateHz: 49_152_000 }).start?.name).toBe("AHM7EC8B");
  });

  it("falls back to the EC line at DSD1024 if no AHM is listed", () => {
    const noAhm = V5.filter((n) => !n.startsWith("AHM"));
    expect(advise({ setup: { dsd: "direct" }, rateHz: DSD1024, modulators: noAhm }).start?.name).toBe("ASDM7EC-fast");
  });

  it("starts on nothing rather than a name HQPlayer doesn't list", () => {
    expect(advise({ setup: { dsd: "direct" }, modulators: ["DSD5", "DSD7"] }).start).toBeNull();
  });

  it("offers the rest of the family, lightest first, as alternatives", () => {
    expect(advise({ setup: { dsd: "direct" } }).alternatives.map((x) => x.name)).toEqual([
      "ASDM7EC-ul",
      "ASDM7EC-light",
      "ASDM7EC-super",
    ]);
  });

  it("names modulators the advice doesn't know: newer than our rules", () => {
    expect(advise({ setup: { dsd: "direct" }, modulators: [...V61, "AHM7EC9X"] }).unknown).toEqual(["AHM7EC9X"]);
  });

  it("knows every modulator HQPlayer 5 and 6.1 list", () => {
    expect([...advise({ setup: {}, modulators: V61 }).unknown, ...advise({ setup: {} }).unknown]).toEqual([]);
  });
});

describe("modulator advice: the machine", () => {
  it("reads 0.8× processing speed as falling behind", () => {
    expect(advise({ setup: { dsd: "direct" }, processSpeed: 0.8 }).machine?.state).toBe("behind");
  });

  it("reads 1.2× as only just keeping up", () => {
    expect(advise({ setup: { dsd: "direct" }, processSpeed: 1.2 }).machine?.state).toBe("tight");
  });

  it("says nothing about the machine when the speed isn't known", () => {
    expect(advise({ setup: { dsd: "direct" }, processSpeed: null }).machine).toBeNull();
  });
});
