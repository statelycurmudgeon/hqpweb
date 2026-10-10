// Switching mode while playing (switching.ts): one steady "Switching" state on the now card
// and a footer that keeps its height, instead of each step HQPlayer passes through.
// Same rules as smoke.spec.ts: one instance per test, outcomes and short phrases only.
import { expect, test } from "@playwright/test";
import { openV2, shot } from "./v2-helpers.ts";

test("v2: a mode switch holds one steady state, and the footer keeps its height", async ({ page }) => {
  await openV2(page, "v2switch");
  const now = page.locator(".card.now");
  const footer = page.locator("footer");
  await expect(now.locator(".state")).toHaveText("Playing");

  const card = page.locator(".signal");
  await card.getByRole("tab", { name: "PCM" }).click();
  await card.getByRole("button", { name: "Switch to PCM" }).click();
  await page.getByRole("dialog", { name: "Switch to PCM" }).getByRole("button", { name: "Switch", exact: true }).click();

  // While it runs: "Switching", the target mode, no transport; never Paused or Stopped.
  await expect(now.locator(".state")).toHaveText("Switching");
  await expect(now.locator(".mode")).toHaveText("PCM");
  await expect(now.getByRole("button", { name: /^(Play|Pause)$/ })).toBeDisabled();
  await expect(footer).toContainText("Switching to PCM");
  await expect(footer).not.toHaveClass(/fade/); // a long switch mustn't start receding at 15 s
  const during = await footer.evaluate((el) => el.getBoundingClientRect().height);
  const seen = await now.locator(".state").evaluate(
    (el) =>
      new Promise<string[]>((resolve) => {
        const texts = new Set<string>();
        const t0 = performance.now();
        const look = () => {
          texts.add(el.isConnected ? (el.textContent ?? "") : "");
          if (performance.now() - t0 < 1500) requestAnimationFrame(look);
          else resolve([...texts]);
        };
        look();
      }),
  );
  expect(seen.filter((t) => /Paused|Stopped/.test(t))).toEqual([]);
  await shot(page, "v2-switch-1-during");

  // Done: playing in PCM, the result with Undo, and the footer no taller than while switching.
  await expect(footer.locator(".msg")).toContainText("✓", { timeout: 15_000 });
  await expect(now.locator(".state")).toHaveText("Playing");
  await expect(footer.getByRole("button", { name: "Undo last change" })).toBeVisible();
  const after = await footer.evaluate((el) => el.getBoundingClientRect().height);
  expect(after).toBe(during);
  await shot(page, "v2-switch-2-done");
});
