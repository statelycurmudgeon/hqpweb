// Finding HQPlayer by asking each address on a subnet directly (unicast) instead of the
// multicast group: a phone app may not send multicast without an entitlement Apple grants
// only to paid accounts, but may send plain UDP. Measured 2026-10-11 (design §2): Desktop 5
// on macOS and Linux answers the probe sent to its own address, across VLANs too, which
// multicast never does. Only ever on request (a Scan button), never in the background: a
// burst to one port across a subnet can look like a scan to an intrusion detector.
import { DISCOVERY_PORT, DISCOVERY_PROBE, parseDiscoveryReply, type Discover, type Discovered } from "./discover.ts";

/** Ask these hosts on this port, all at once; what answered within the wait. Native in the app. */
export type UdpAsk = (o: {
  hosts: string[];
  port: number;
  data: Uint8Array;
  waitMs: number;
}) => Promise<{ host: string; data: Uint8Array }[]>;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function toInt(address: string): number | null {
  const m = IPV4.exec(address);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts.reduce((n, p) => n * 256 + p, 0);
}
const toAddress = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

/**
 * The hosts of the subnet `address` is on: every address but the network's and the broadcast.
 * At most a /24, the one around `address`, whatever the mask says: a sweep is for a home
 * network, not a 65 000-address one. Nothing for an address that isn't IPv4.
 */
export function subnetHosts(address: string, netmask = "255.255.255.0"): string[] {
  const a = toInt(address);
  let m = toInt(netmask);
  if (a === null || m === null) return [];
  if (m < toInt("255.255.255.0")!) m = toInt("255.255.255.0")!;
  const network = (a & m) >>> 0;
  const size = (~m >>> 0) + 1;
  const hosts: string[] = [];
  for (let i = 1; i < size - 1; i++) hosts.push(toAddress(network + i));
  return hosts;
}

/**
 * Where to look: the subnet of each of this device's addresses, and of each HQPlayer already
 * known (so one added by hand on another VLAN brings its neighbours), without repeats.
 */
export function sweepHosts(own: { address: string; netmask: string }[], known: string[]): string[] {
  const all = [...own.map((o) => subnetHosts(o.address, o.netmask)), ...known.map((k) => subnetHosts(k))].flat();
  const mine = new Set(own.map((o) => o.address));
  return [...new Set(all)].filter((h) => !mine.has(h));
}

/** A Discover that sweeps the hosts `where` gives at the time of asking. */
export function sweepDiscover(ask: UdpAsk, where: () => Promise<string[]>): Discover {
  const probe = new TextEncoder().encode(DISCOVERY_PROBE);
  return async (opts) => {
    const hosts = await where();
    if (hosts.length === 0) return [];
    const replies = await ask({ hosts, port: DISCOVERY_PORT, data: probe, waitMs: opts?.timeoutMs ?? 1500 });
    const found = new Map<string, Discovered>();
    for (const r of replies) {
      const d = parseDiscoveryReply(new TextDecoder().decode(r.data), r.host);
      if (d) found.set(d.address, d);
    }
    return [...found.values()];
  };
}
