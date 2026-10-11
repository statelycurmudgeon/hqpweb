// The fake HQPlayers for matrix.spec.ts, keyed by instance id (e2e/stack.ts loads every *.flows.ts).
import { setRate, setShaper, type Flows } from "./flows-kit.ts";

export const flows: Flows = {
  // Two matrix profiles, DAC correction in the base setup and in one of them (as measured on the
  // Mac, 2026-10-11); sinc-Lh can't keep up at DSD256, so picking it is rolled back and learned.
  matrix: {
    name: "Matrix",
    profile: "desktop5-mac-sdm",
    setup: (f) => {
      setRate(f, 11_289_600);
      setShaper(f, "ASDM7EC-super");
      f.playback = 2;
      f.matrixProfile = "Correction On";
    },
    speed: ({ filterName, rateHz }) => (filterName === "sinc-Lh" && rateHz >= 11_289_600 ? 0.5 : 1),
    options: { matrixProfiles: ["Correction On", "No Pipeline"], correctingProfiles: ["", "Correction On"] },
  },
};
