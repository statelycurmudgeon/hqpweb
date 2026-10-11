import { describe, expect, it } from "vitest";
import { lanVia, type UdpPlugin } from "./udp.ts";

describe("the app's UDP for finding things (native plugin → sweep)", () => {
  it("its own addresses: Wi-Fi and Ethernet only, not cellular or VPN tunnels", async () => {
    const plugin = {
      interfaces: async () => ({
        interfaces: [
          { name: "en0", address: "192.0.2.10", netmask: "255.255.255.0" },
          { name: "pdp_ip0", address: "198.51.100.7", netmask: "255.255.255.0" },
          { name: "utun3", address: "203.0.113.9", netmask: "255.255.255.255" },
          { name: "en2", address: "192.0.2.200", netmask: "255.255.255.128" },
        ],
      }),
    } as unknown as UdpPlugin;
    expect(await lanVia(plugin).own()).toEqual([
      { address: "192.0.2.10", netmask: "255.255.255.0" },
      { address: "192.0.2.200", netmask: "255.255.255.128" },
    ]);
  });

  it("asks with the bytes as base64, and hands the answers back as bytes", async () => {
    let sent: Parameters<UdpPlugin["udpAsk"]>[0] | null = null;
    const plugin = {
      udpAsk: async (o: Parameters<UdpPlugin["udpAsk"]>[0]) => (
        (sent = o),
        { replies: [{ host: "192.0.2.5", data: btoa("hi") }] }
      ),
    } as unknown as UdpPlugin;
    const replies = await lanVia(plugin).ask({
      hosts: ["192.0.2.5"],
      port: 4321,
      data: new TextEncoder().encode("probe"),
      waitMs: 900,
    });
    expect(sent).toEqual({ hosts: ["192.0.2.5"], port: 4321, data: btoa("probe"), waitMs: 900 });
    expect(replies.map((r) => [r.host, new TextDecoder().decode(r.data)])).toEqual([["192.0.2.5", "hi"]]);
  });
});
