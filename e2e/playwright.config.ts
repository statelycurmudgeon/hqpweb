import { defineConfig } from "@playwright/test";
import { LANES } from "./lanes.ts";

// Browser smoke tests: the built app, the real server, fake HQPlayers (e2e/stack.ts).
// Every spec runs in every lane (lanes.ts): against the server ("web") and against the phone
// app's page with its core in-process ("app", e2e/app-host.ts), each in Chromium and in
// WebKit (Safari's engine, every iPhone's), each lane with its own fakes. Just one engine:
//   npm run test:e2e -- --project web --project app
// Each run starts its own stack; flows change state, so a run (or --repeat-each) can't reuse one.
// Screenshots land in e2e/screenshots/ (other lanes' in screenshots/<lane>/) for a person to look at; they aren't compared.
export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "report" }]] : "list",
  use: {
    // A phone, as most listeners use it.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: LANES.map((l) => ({
    name: l.name,
    use: { browserName: l.browser, baseURL: `http://127.0.0.1:${l.port}` },
    // mobile-host checks the app's real build on its own server: once, in each engine.
    ...(l.host === "app" ? { testIgnore: "mobile-host.spec.ts" } : {}),
  })),
  webServer: {
    command:
      "npm run build -w apps/web && npm run build -w apps/mobile && vite build -c e2e/app-host/vite.config.ts && node e2e/stack.ts",
    cwd: "..",
    url: `http://127.0.0.1:${LANES[0]!.port}/api/health`,
    // Never reuse a running stack: flows assume fresh fakes and server state.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
