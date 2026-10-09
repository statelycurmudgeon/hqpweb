import { describe, expect, it } from "vitest";
import { layoutOf } from "./prefs-migrate.ts";

describe("stored preferences from older builds", () => {
  it("moves everyone to the new layout except those who chose classic", () => {
    expect(layoutOf("current")).toBe("v2"); // the old default, saved with any setting
    expect(layoutOf("v2")).toBe("v2");
    expect(layoutOf(undefined)).toBe("v2");
    expect(layoutOf("classic")).toBe("classic");
  });
});
