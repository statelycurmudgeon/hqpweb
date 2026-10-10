// SOOD: how Roon Cores are found on the LAN: UDP to port 9003, multicast 239.255.90.90 plus
// broadcast; cores answer the sender directly. Protocol as in Roon's Apache-2.0 node-roon-api
// (sood.js); no code copied. The packets are here; sending them is the host's (the server's
// is apps/server src/roon/sood.ts). Like HQPlayer discovery, it doesn't cross VLANs.

export const SOOD_PORT = 9003;
export const SOOD_MULTICAST = "239.255.90.90";
/** The service id Roon Cores answer to. */
export const ROON_CORE_SERVICE = "00720724-5143-4a9b-abac-0e50cba674bb";

export interface FoundCore {
  /** Address the reply came from. */
  host: string;
  /** The core's extension API port (its http_port). */
  port: number;
  name?: string;
  version?: string;
  uniqueId?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** "SOOD", version 2, type letter, then (1-byte name length, name, 2-byte value length, value)… */
export function encodeQuery(props: Record<string, string>): Uint8Array {
  const parts: number[] = [...enc.encode("SOOD"), 2, "Q".charCodeAt(0)];
  for (const [k, v] of Object.entries(props)) {
    const name = enc.encode(k);
    const value = enc.encode(v);
    parts.push(name.length, ...name, value.length >> 8, value.length & 0xff, ...value);
  }
  return Uint8Array.from(parts);
}

export function decodePacket(buf: Uint8Array): { type: string; props: Record<string, string | null> } | null {
  if (buf.length < 6 || dec.decode(buf.subarray(0, 4)) !== "SOOD" || buf[4] !== 2) return null;
  const type = String.fromCharCode(buf[5]!);
  const props: Record<string, string | null> = {};
  let pos = 6;
  while (pos < buf.length) {
    const nlen = buf[pos++]!;
    if (nlen === 0 || pos + nlen > buf.length) return null;
    const name = dec.decode(buf.subarray(pos, pos + nlen));
    pos += nlen;
    if (pos + 2 > buf.length) return null;
    const vlen = (buf[pos]! << 8) | buf[pos + 1]!;
    pos += 2;
    if (vlen === 0xffff) props[name] = null;
    else {
      if (pos + vlen > buf.length) return null;
      props[name] = dec.decode(buf.subarray(pos, pos + vlen));
      pos += vlen;
    }
  }
  return { type, props };
}

/** A core's answer, from `host` (where it really came from, not what it claims); null if it isn't one. */
export function coreFromReply(buf: Uint8Array, host: string): FoundCore | null {
  const p = decodePacket(buf);
  if (!p || p.type !== "R" || p.props.service_id !== ROON_CORE_SERVICE) return null;
  const port = Number(p.props.http_port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  const core: FoundCore = { host, port };
  if (p.props.name) core.name = p.props.name;
  if (p.props.display_version) core.version = p.props.display_version;
  if (p.props.unique_id) core.uniqueId = p.props.unique_id;
  return core;
}
