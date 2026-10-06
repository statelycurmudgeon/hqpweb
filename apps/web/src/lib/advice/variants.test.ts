import { describe, expect, it } from "vitest";
import { RULES } from "./policy.ts";
import { variantNote } from "./variants.ts";

describe("what each modulator variant is like", () => {
  it("ranks the EC variants by CPU load, lightest first", () => {
    const loads = ["ASDM7EC-ul", "ASDM7EC-light", "ASDM7EC-fast", "ASDM7EC-super"].map((n) => variantNote(n)?.load);
    expect(loads).toEqual(["lightest", "light", "a bit more than -light", "heaviest"]);
  });

  it("gives each its documented character, cited", () => {
    expect(variantNote("ASDM7EC-ul")?.rules).toEqual([RULES.ulPi, RULES.ulEss]);
    expect(variantNote("ASDM7EC-light")?.rules).toEqual([RULES.lightDesign]);
    expect(variantNote("ASDM7EC-fast")?.rules).toEqual([RULES.fastTransients]);
    expect(variantNote("ASDM7EC-super")?.rules).toEqual([RULES.superDesign, RULES.superFit]);
  });

  it("treats fifth order and 512+fs versions like their family", () => {
    expect([variantNote("ASDM5EC-light 512+fs")?.load, variantNote("ASDM5EC-super")?.load]).toEqual(["light", "heaviest"]);
  });

  it("describes AHM 4B and 8B, claiming light load only where Signalyst said so (8B)", () => {
    expect(variantNote("AHM5EC4B")).toEqual({ load: null, rules: [RULES.ahm4bNew] });
    expect(variantNote("AHM7EC8B")).toEqual({ load: "light", rules: [RULES.ahm8bLight] });
  });

  it("says nothing about a modulator it has no documented notes for", () => {
    expect([variantNote("ASDM7ECv3"), variantNote("DSD7")]).toEqual([null, null]);
  });
});
