// The phone app: the web app (apps/web) with the core in-process (packages/core), on Capacitor.
// The id is a placeholder for builds on the owner's own devices; it changes before any store release.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.hqpweb.app",
  appName: "hqpweb",
  webDir: "dist",
};

export default config;
