// Scan in the phone app: asking every address on its subnet (@app/protocol sweep.ts), through
// the app's own UDP code to the test LAN (app-host.ts), where one fake HQPlayer answers. The
// server's multicast scan isn't faked here. That it scans only when asked is the registry's
// unit test (registry.test.ts): this page lists instances as of its load, so a scan nobody asked
// for wouldn't show here. Same rules as smoke.spec.ts: outcomes, short phrases.
import { expect, test } from "@playwright/test";
import { can, shotPath } from "./hosts.ts";
import { openV2 } from "./v2-helpers.ts";

test("Scan: the app asks around its subnet, finds an HQPlayer there, keeps it, and opens it", async ({ page }) => {
  test.skip(can().discover !== "subnets", "the server's multicast scan isn't faked in this stack");
  await openV2(page, "scanhome");
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.locator("dialog[open]");
  await expect(settings).toContainText("only scans when you ask");
  const found = settings.locator("ul.instances li").filter({ hasText: "Found by scan" });
  await settings.getByRole("button", { name: "Scan now" }).click();
  await expect(found).toContainText("192.0.2.50");
  await page.screenshot({ path: shotPath("scan-1-found"), fullPage: true });
  await found.getByRole("button", { name: "Save" }).click();
  await expect(found.getByRole("button", { name: "Rename" })).toBeVisible();
  await settings.getByRole("button", { name: "Close" }).click();

  // Open it: reached at the address it was found at.
  await page.getByRole("combobox", { name: "Instance" }).selectOption({ label: "Found by scan" });
  await expect(page.locator(".signal")).toContainText("PCM");
});
