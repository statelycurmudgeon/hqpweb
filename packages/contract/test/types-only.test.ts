// The contract is types only: with its types stripped (Node's own stripper), nothing may be
// left, so importing it can never pull code into the web app's bundle (or anywhere else).
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { expect, it } from "vitest";

it("leaves no code once its types are stripped", () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const code = stripTypeScriptTypes(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();
  expect(code).toBe("");
});
