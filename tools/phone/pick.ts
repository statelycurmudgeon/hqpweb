// Which iPhone or iPad to put the app on, from `xcrun devicectl list devices --json-output`:
// real devices only (not simulators), chosen by name or id when there's more than one.

/** The parts of devicectl's device list this reads. */
export interface DevicectlDevice {
  identifier: string;
  deviceProperties?: { name?: string; developerModeStatus?: string };
  hardwareProperties?: { platform?: string; udid?: string; deviceType?: string };
  connectionProperties?: { transportType?: string | null; tunnelState?: string };
}

export interface Phone {
  /** devicectl's id, for installing and launching. */
  id: string;
  /** The hardware id, for xcodebuild's destination. */
  udid: string;
  name: string;
}

export type Pick = { phone: Phone } | { problem: string };

export function pickPhone(devices: DevicectlDevice[], wanted?: string): Pick {
  const real = devices.filter(
    (d) => d.hardwareProperties?.platform === "iOS" && d.connectionProperties?.transportType !== "sameMachine",
  );
  const phones = real.map((d) => ({
    id: d.identifier,
    udid: d.hardwareProperties?.udid ?? "",
    name: d.deviceProperties?.name ?? d.identifier,
    reachable: d.connectionProperties?.tunnelState !== "unavailable",
    devMode: d.deviceProperties?.developerModeStatus === "enabled",
  }));
  const chosen = wanted
    ? phones.filter((p) => p.name === wanted || p.id === wanted || p.udid === wanted)
    : phones.filter((p) => p.reachable);
  if (wanted && chosen.length === 0)
    return { problem: `No iPhone or iPad called "${wanted}". Paired: ${phones.map((p) => p.name).join(", ") || "none"}.` };
  if (phones.length === 0)
    return { problem: "No iPhone or iPad is paired with this Mac. Connect it by cable once, unlock it, and trust this Mac." };
  if (chosen.length === 0)
    return {
      problem: `Can't reach ${phones.map((p) => p.name).join(" or ")} now. Unlock it, and connect it by cable or put it on this Mac's network.`,
    };
  if (chosen.length > 1)
    return { problem: `More than one to choose from: ${chosen.map((p) => p.name).join(", ")}. Name one: HQPWEB_DEVICE="…"` };
  const p = chosen[0]!;
  if (!p.reachable)
    return { problem: `Can't reach ${p.name} now. Unlock it, and connect it by cable or put it on this Mac's network.` };
  if (!p.devMode)
    return { problem: `${p.name} needs Developer Mode: Settings → Privacy & Security → Developer Mode, then restart it.` };
  if (!p.udid) return { problem: `devicectl didn't give ${p.name}'s hardware id.` };
  return { phone: { id: p.id, udid: p.udid, name: p.name } };
}
