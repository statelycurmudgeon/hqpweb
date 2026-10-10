// The phone app's page (apps/mobile), in a browser: the core in-process, and the page hiding
// what this host can't do (apps/web api.ts can). The native TCP plugin isn't here, so there's
// no HQPlayer: this checks the host's shape, not playback (that's checked on the simulator).
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../apps/mobile/dist/", import.meta.url));
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
let server: Server;
let base: string;

test.beforeAll(async () => {
  server = createServer((q, r) => {
    const file = join(ROOT, q.url === "/" ? "index.html" : (q.url ?? "/").split("?")[0]!);
    readFile(file).then(
      (body) => {
        r.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        r.end(body);
      },
      () => {
        r.writeHead(404);
        r.end();
      },
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});
test.afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

test("the app hides what it can't do: Roon, the restart cap, lining up by ear, scanning", async ({ page }) => {
  await page.goto(base);
  await expect(page.locator(".banner")).toContainText("add one by address");
  await expect(page.locator(".banner")).not.toContainText("scan");

  await page.getByRole("button", { name: /settings/i }).click();
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: "HQPlayer" })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Roon" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Scan now" })).toHaveCount(0);

  await tabs.getByRole("tab", { name: "Listening" }).click();
  await expect(page.getByText("Volume buttons")).toBeVisible();
  await expect(page.getByText(/after HQPlayer restarts/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Line up by ear…" })).toHaveCount(0);
});
