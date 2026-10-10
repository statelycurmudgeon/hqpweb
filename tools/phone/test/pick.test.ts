import { describe, expect, it } from "vitest";
import { pickPhone, type DevicectlDevice } from "../pick.ts";

/** A device as devicectl lists it (invented names and ids). */
function device(name: string, o: { sim?: boolean; reachable?: boolean; devMode?: boolean; platform?: string } = {}) {
  return {
    identifier: `id-${name}`,
    deviceProperties: { name, developerModeStatus: o.devMode === false ? "disabled" : "enabled" },
    hardwareProperties: { platform: o.platform ?? "iOS", udid: `udid-${name}`, deviceType: "iPhone" },
    connectionProperties: {
      transportType: o.sim ? "sameMachine" : "wired",
      tunnelState: o.reachable === false ? "unavailable" : "connected",
    },
  } satisfies DevicectlDevice;
}

const problem = (p: ReturnType<typeof pickPhone>) => ("problem" in p ? p.problem : `picked ${p.phone.name}`);

describe("picking the phone to put the app on", () => {
  it("takes the one reachable real device, not a simulator", () => {
    expect(pickPhone([device("Sim", { sim: true }), device("Example Phone")])).toEqual({
      phone: { id: "id-Example Phone", udid: "udid-Example Phone", name: "Example Phone" },
    });
  });

  it("says when nothing is paired, or nothing paired can be reached now", () => {
    expect(problem(pickPhone([device("Sim", { sim: true })]))).toMatch(/^No iPhone or iPad is paired/);
    expect(problem(pickPhone([device("Example Phone", { reachable: false })]))).toMatch(/^Can't reach Example Phone now/);
  });

  it("takes the reachable one when another is paired but away", () => {
    expect(problem(pickPhone([device("Away", { reachable: false }), device("Here")]))).toBe("picked Here");
  });

  it("asks which, when there's more than one, and takes the one named", () => {
    const two = [device("Phone A"), device("Tablet B")];
    expect(problem(pickPhone(two))).toMatch(/^More than one.*Phone A, Tablet B.*HQPWEB_DEVICE/);
    expect(problem(pickPhone(two, "Tablet B"))).toBe("picked Tablet B");
    expect(problem(pickPhone(two, "udid-Phone A"))).toBe("picked Phone A");
    expect(problem(pickPhone(two, "Nope"))).toMatch(/^No iPhone or iPad called "Nope"\. Paired: Phone A, Tablet B/);
  });

  it("says what's missing on a named phone: reachable, Developer Mode", () => {
    expect(problem(pickPhone([device("Away", { reachable: false })], "Away"))).toMatch(/^Can't reach Away now/);
    expect(problem(pickPhone([device("New", { devMode: false })]))).toMatch(/^New needs Developer Mode/);
  });

  it("ignores devices that aren't iOS", () => {
    expect(problem(pickPhone([device("Watch", { platform: "watchOS" })]))).toMatch(/^No iPhone or iPad is paired/);
  });
});
