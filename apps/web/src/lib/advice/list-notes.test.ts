import { describe, expect, it } from "vitest";
import { withGuideNotes } from "./list-notes.ts";

describe("list notes", () => {
  const rows = [
    { name: "NS9", note: "NS9 is designed for 176.4/192k" },
    { name: "LNS15", note: "LNS15 isn't recommended below 352.8k" },
    { name: "NS5", warn: "failed here before", note: "x" },
    { name: "TPDF" },
  ];

  it("replaces a soft note the guide contradicts on a row it recommends", () => {
    expect(withGuideNotes(rows, new Set(["NS9"]))[0]?.note).toBe("Suits your answers: see Guide");
  });

  it("keeps notes on rows the guide doesn't recommend", () => {
    expect(withGuideNotes(rows, new Set(["NS9"]))[1]?.note).toBe("LNS15 isn't recommended below 352.8k");
  });

  it("never touches a warning", () => {
    expect(withGuideNotes(rows, new Set(["NS5"]))[2]).toEqual(rows[2]);
  });

  it("leaves a recommended row without a note alone", () => {
    expect(withGuideNotes(rows, new Set(["TPDF"]))[3]).toEqual({ name: "TPDF" });
  });
});
