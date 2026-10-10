// Finding Roon Cores on the LAN from the server: UDP through node:dgram. The packets and
// what a reply means are the core's (packages/core src/roon/sood.ts).
import { createSocket } from "node:dgram";
import { ROON_CORE_SERVICE, SOOD_MULTICAST, SOOD_PORT, coreFromReply, encodeQuery, type FoundCore } from "@app/core";

/** Asks the LAN for Roon Cores and collects answers for `timeoutMs`. */
export function discoverCores({
  timeoutMs = 1500,
  target,
}: { timeoutMs?: number; target?: { address: string; port: number } } = {}): Promise<FoundCore[]> {
  return new Promise((resolve) => {
    const found = new Map<string, FoundCore>();
    const sock = createSocket({ type: "udp4" });
    const done = () => {
      try {
        sock.close();
      } catch {}
      resolve([...found.values()]);
    };
    sock.on("error", done);
    sock.on("message", (msg, rinfo) => {
      // The address the reply actually came from, not the one it claims: a spoofed
      // `_replyaddr` could otherwise point the app at any host.
      const core = coreFromReply(msg, rinfo.address);
      if (core) found.set(core.uniqueId ?? `${core.host}:${core.port}`, core);
    });
    sock.bind(0, () => {
      const query = encodeQuery({ query_service_id: ROON_CORE_SERVICE, _tid: crypto.randomUUID() });
      if (target) sock.send(query, target.port, target.address);
      else {
        sock.setBroadcast(true);
        sock.setMulticastTTL(1);
        sock.send(query, SOOD_PORT, SOOD_MULTICAST);
        sock.send(query, SOOD_PORT, "255.255.255.255");
      }
      setTimeout(done, timeoutMs);
    });
  });
}
