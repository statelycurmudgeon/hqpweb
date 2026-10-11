import { describe, expect, it } from "vitest";
import { DISCOVERY_PORT, DISCOVERY_PROBE, subnetHosts, sweepDiscover, sweepHosts, type UdpAsk } from "../src/index.ts";

describe("which addresses a sweep asks", () => {
  it("every host of a /24, not the network or broadcast address", () => {
    const hosts = subnetHosts("192.0.2.77", "255.255.255.0");
    expect(hosts).toHaveLength(254);
    expect([hosts[0], hosts.at(-1)]).toEqual(["192.0.2.1", "192.0.2.254"]);
  });

  it("a smaller subnet as it is; a wider one only the /24 around the address", () => {
    expect(subnetHosts("192.0.2.70", "255.255.255.192")).toEqual(Array.from({ length: 62 }, (_, i) => `192.0.2.${65 + i}`));
    const wide = subnetHosts("198.51.100.9", "255.255.0.0");
    expect([wide.length, wide[0], wide.at(-1)]).toEqual([254, "198.51.100.1", "198.51.100.254"]);
  });

  it("nothing for what isn't an IPv4 address", () => {
    expect(subnetHosts("2001:db8::1", "ffff:ffff:ffff:ffff::")).toEqual([]);
    expect(subnetHosts("hqp.example", "255.255.255.0")).toEqual([]);
    expect(subnetHosts("300.0.2.1", "255.255.255.0")).toEqual([]);
  });

  it("this device's subnets and known instances' subnets, once each, never itself", () => {
    const hosts = sweepHosts([{ address: "192.0.2.10", netmask: "255.255.255.0" }], ["192.0.2.20", "198.51.100.5"]);
    expect(hosts).toHaveLength(253 + 254);
    expect(hosts).not.toContain("192.0.2.10");
    expect(hosts).toContain("198.51.100.5");
  });
});

describe("a sweep as discovery", () => {
  const reply = (name: string) =>
    new TextEncoder().encode(
      `<?xml version="1.0"?><discover name="${name}" result="OK" version="Signalyst HQPlayer Desktop 5">hqplayer</discover>`,
    );

  it("sends HQPlayer's probe to its port and keeps the answers, by the address they came from", async () => {
    let asked: Parameters<UdpAsk>[0] | null = null;
    const ask: UdpAsk = async (o) => {
      asked = o;
      return [
        { host: "192.0.2.5", data: reply("Example Desk") },
        { host: "192.0.2.6", data: new TextEncoder().encode("not hqplayer") },
        { host: "192.0.2.5", data: reply("Example Desk") }, // answered twice
      ];
    };
    const found = await sweepDiscover(ask, async () => ["192.0.2.5", "192.0.2.6"])({ timeoutMs: 900 });
    expect(found).toEqual([{ address: "192.0.2.5", name: "Example Desk", version: "Signalyst HQPlayer Desktop 5" }]);
    expect(asked).toMatchObject({ hosts: ["192.0.2.5", "192.0.2.6"], port: DISCOVERY_PORT, waitMs: 900 });
    expect(new TextDecoder().decode(asked!.data)).toBe(DISCOVERY_PROBE);
  });

  it("asks nothing when there's nowhere to look", async () => {
    let calls = 0;
    const found = await sweepDiscover(
      async () => (calls++, []),
      async () => [],
    )();
    expect([found, calls]).toEqual([[], 0]);
  });
});
