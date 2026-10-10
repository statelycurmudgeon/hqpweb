// HQPlayer discovery: UDP multicast to 239.192.0.199:4321 with
// <discover>hqplayer</discover>; each instance answers from its own address with
// <discover name="…" result="OK" version="…">hqplayer</discover> (measured).
// Multicast does not cross VLANs or routed subnets. The probe and the reply are here;
// sending them is the platform's (node.ts, discover()).
import { PROLOG, parseDocument } from "./xml.ts";

export const DISCOVERY_GROUP = "239.192.0.199";
export const DISCOVERY_PORT = 4321;
/** What to send to the group. */
export const DISCOVERY_PROBE = PROLOG + "<discover>hqplayer</discover>";

export interface Discovered {
  /** Address the reply came from. */
  address: string;
  name: string;
  /** e.g. "Signalyst HQPlayer Desktop 5". */
  version: string;
}

export interface DiscoverOptions {
  timeoutMs?: number;
  /** Where to send the probe. Default: the multicast group. Tests use unicast. */
  target?: { address: string; port: number };
  /** How many probes to send, spread over the first part of the wait. Default 3. */
  probes?: number;
}

/** Look for HQPlayers on the local network; what answered within the wait. */
export type Discover = (opts?: DiscoverOptions) => Promise<Discovered[]>;

/** An HQPlayer's answer to the probe, from `address`; null for anything else. */
export function parseDiscoveryReply(text: string, address: string): Discovered | null {
  try {
    const el = parseDocument(text);
    if (el.name !== "discover" || el.attrs.result !== "OK") return null;
    return { address, name: el.attrs.name ?? "", version: el.attrs.version ?? "" };
  } catch {
    return null; // not an HQPlayer reply
  }
}
