// The fake HQPlayers for v2-switch.spec.ts, keyed by instance id (e2e/stack.ts loads every *.flows.ts).
import { type Flows } from "./flows-kit.ts";

export const flows: Flows = {
  // Playing its own playlist; quiet for 2.5 s after a mode switch (measured ~2 s, own playlist).
  v2switch: {
    name: "V2 switch",
    profile: "desktop5-mac-sdm",
    setup: (f) => {
      f.feeder = "playlist";
      f.playlist = ["/music/Example Artist/Example Album/01 - Example.flac"];
      f.position = 30;
      f.playback = 2;
    },
    busyAfterModeSwitch: 2500,
  },
};
