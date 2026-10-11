// The fake HQPlayers for scan.spec.ts, keyed by instance id (e2e/stack.ts loads every *.flows.ts).
import { type Flows } from "./flows-kit.ts";

export const flows: Flows = {
  scanhome: { name: "Scan home", profile: "desktop5-linux-pcm" },
  // Not configured: on the test LAN only, for the app's Scan to find. Its own HQPlayer name, or
  // it would be taken for a configured fake of the same profile.
  scanfound: {
    name: "unused",
    profile: "desktop5-linux-pcm",
    foundAt: "192.0.2.50",
    setup: (fake) => (fake.profile.info.name = "Found by scan"),
  },
};
