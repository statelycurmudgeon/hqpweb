// The fake HQPlayers for v2-meter-calibrate.spec.ts, keyed by instance id (e2e/stack.ts loads every *.flows.ts).
import { type Flows } from "./flows-kit.ts";

export const flows: Flows = {
  // Playing from Roon, with a meter: the calibration stops it and plays the clap track.
  v2cal: { name: "V2 calibrate", profile: "desktop5-mac-sdm", meter: true },
  v2calquiet: { name: "V2 calibrate, no taps", profile: "desktop5-mac-sdm", meter: true },
};
