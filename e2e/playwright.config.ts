import { defineConfig } from "@playwright/test";
import { APP_HOST_PORT, APP_PORT } from "./stack.ts";

// Browser smoke tests: the built app, the real server, fake HQPlayers (e2e/stack.ts).
// Every spec runs twice: against the server ("web") and against the phone app's page with
// its core in-process ("app", e2e/app-host.ts), each with its own fakes.
// Each run starts its own stack; flows change state, so a run (or --repeat-each) can't reuse one.
// Screenshots land in e2e/screenshots/ (the app run's in screenshots/app/) for a person to look at; they aren't compared.
export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "report" }]] : "list",
  use: {
    browserName: "chromium",
    // A phone, as most listeners use it.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "web", use: { baseURL: `http://127.0.0.1:${APP_PORT}` } },
    // mobile-host checks the app's real build on its own server, once.
    { name: "app", use: { baseURL: `http://127.0.0.1:${APP_HOST_PORT}` }, testIgnore: "mobile-host.spec.ts" },
  ],
  webServer: {
    command:
      "npm run build -w apps/web && npm run build -w apps/mobile && vite build -c e2e/app-host/vite.config.ts && node e2e/stack.ts",
    cwd: "..",
    url: `http://127.0.0.1:${APP_PORT}/api/health`,
    // Never reuse a running stack: flows assume fresh fakes and server state.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
