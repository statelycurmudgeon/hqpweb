// Plain UDP for finding HQPlayer and Roon Cores by asking addresses directly (@app/protocol
// sweep.ts), through the native plugin's udpAsk and interfaces (packages/capacitor-tcp Udp.swift).
import type { UdpAsk } from "@app/protocol";
import { fromBase64, toBase64 } from "./tcp.ts";

export interface UdpPlugin {
  udpAsk(o: { hosts: string[]; port: number; data: string; waitMs: number }): Promise<{
    replies: { host: string; data: string }[];
  }>;
  interfaces(): Promise<{ interfaces: { name: string; address: string; netmask: string }[] }>;
}

/** What the app's sweep needs: asking addresses, and this device's own addresses on the LAN. */
export interface Lan {
  ask: UdpAsk;
  /** This device's IPv4 addresses on Wi-Fi or Ethernet (not cellular, not VPN tunnels). */
  own: () => Promise<{ address: string; netmask: string }[]>;
}

export function lanVia(plugin: UdpPlugin): Lan {
  return {
    ask: async ({ hosts, port, data, waitMs }) =>
      (await plugin.udpAsk({ hosts, port, data: toBase64(data), waitMs })).replies.map((r) => ({
        host: r.host,
        data: fromBase64(r.data),
      })),
    own: async () =>
      (await plugin.interfaces()).interfaces
        .filter((i) => /^en\d+$/.test(i.name))
        .map(({ address, netmask }) => ({ address, netmask })),
  };
}
