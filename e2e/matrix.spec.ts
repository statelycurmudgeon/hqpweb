// The matrix profile (Advanced). A profile can change how heavy processing is, so what's been
// learned here is kept per profile: a filter that fell behind under one profile is flagged only
// under it. Same rules as smoke.spec.ts: outcomes and short phrases only.
import { expect, test, type Page } from "@playwright/test";
import { shotPath } from "./hosts.ts";
import { openV2 } from "./v2-helpers.ts";

const footer = (page: Page) => page.locator("footer .msg");
const sheet = (page: Page) => page.getByRole("dialog", { name: "1x filter: choose" });
const open1x = async (page: Page) => {
  await page
    .locator(".signal")
    .getByRole("button", { name: /^1x filter/ })
    .click();
  await sheet(page).getByRole("searchbox").fill("sinc-Lh");
};
const sincLh = (page: Page) => sheet(page).locator("li.row", { has: page.getByRole("button", { name: /^sinc-Lh\b/ }) });
const advanced = (page: Page) => page.locator("details.advanced");
async function useProfile(page: Page, label: string) {
  await advanced(page)
    .getByRole("button", { name: /^Matrix profile/ })
    .click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
  await expect(footer(page)).toContainText("✓");
}

const profileRow = (page: Page) => advanced(page).getByRole("button", { name: /^Matrix profile/ });

test("matrix: what fell behind under one profile is flagged only under it; Default is a choice too", async ({ page }) => {
  await openV2(page, "matrix");
  await advanced(page).locator("summary").click();
  await expect(profileRow(page)).toContainText("Correction On");

  // sinc-Lh can't keep up here, under "Correction On": rolled back, and learned under that profile.
  await open1x(page);
  await sincLh(page)
    .getByRole("button", { name: /^sinc-Lh\b/ })
    .click();
  await expect(footer(page)).toContainText(/rolled back/i, { timeout: 10_000 });
  await open1x(page);
  await expect(sincLh(page)).toContainText(/failed here/i);
  await sheet(page).getByRole("button", { name: "Done" }).click();

  // Another profile: it isn't flagged there.
  await useProfile(page, "No Pipeline");
  await expect(profileRow(page)).toContainText("No Pipeline");
  await open1x(page);
  await expect(sincLh(page)).not.toContainText(/failed here/i);
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await page.screenshot({ path: shotPath("matrix-1-advanced"), fullPage: true });

  // Default (HQPlayer's default profile) is a choice too, and back under the first profile, it's flagged again.
  await useProfile(page, "Default");
  await expect(profileRow(page)).toContainText("Default");
  await useProfile(page, "Correction On");
  await open1x(page);
  await expect(sincLh(page)).toContainText(/failed here/i);
});
