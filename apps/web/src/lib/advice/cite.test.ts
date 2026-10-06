import { expect, it } from "vitest";
import { monthLabel } from "./cite.ts";

it("writes a rule's date as month and year", () => {
  expect([monthLabel("2026-09"), monthLabel("2025-01")]).toEqual(["Sep 2026", "Jan 2025"]);
});

it("leaves a date it can't read as it is", () => {
  expect([monthLabel("2026-13"), monthLabel("2026")]).toEqual(["2026-13", "2026"]);
});
