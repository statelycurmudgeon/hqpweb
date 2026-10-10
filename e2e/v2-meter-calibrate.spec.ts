// Lining the meter up by ear (MeterCalibrate.svelte): its own screen from Settings → Listening
// (the meter links there); the phone clicks and you tap (reaction time), then the claps through HQPlayer.
// Real audio and people's timing can't be checked here: these check the steps and wiring.
import { expect, test, type Page } from "@playwright/test";
import { openV2, shot } from "./v2-helpers.ts";

async function openCalibration(page: Page, id: string) {
  await openV2(page, id);
  const meter = page.getByRole("region", { name: "Meter" });
  await meter.getByRole("button", { name: "Open the meter" }).click();
  await meter.getByRole("button", { name: "About this meter" }).click();
  await meter.getByRole("button", { name: "Settings ›" }).click(); // the meter links to its timing in Settings
  await page.getByRole("button", { name: "Line up by ear…" }).click();
  const sheet = page.getByRole("dialog", { name: "Line up the meter" });
  await expect(sheet).toContainText("Two short steps");
  return sheet;
}

test("v2: tapping after each of the phone's clicks moves on to the claps through HQPlayer", async ({ page }) => {
  const sheet = await openCalibration(page, "v2cal");
  await shot(page, "v2-cal-1-intro");
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet).toContainText("Step 1 of 2");
  // The clicks come 1.0, 2.7, 4.0, 6.1, 7.6 and 9.5 s after Start: tap ~0.25 s after each.
  const pad = sheet.getByRole("button", { name: /^Tap/ });
  let last = 0;
  for (const at of [1250, 2950, 4250, 6350, 7850, 9750]) {
    await page.waitForTimeout(at - last);
    last = at;
    await pad.dispatchEvent("pointerdown");
  }
  await expect(sheet).toContainText("6 tapped");
  await expect(sheet).toContainText("Step 2 of 2", { timeout: 5000 });
  await shot(page, "v2-cal-2-claps");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
});

test("v2: with no taps, it says it didn't catch the clicks and offers another go", async ({ page }) => {
  const sheet = await openCalibration(page, "v2calquiet");
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet).toContainText("didn't catch enough clicks", { timeout: 16_000 });
  await expect(sheet.getByRole("button", { name: "Try again" })).toBeVisible();
});
