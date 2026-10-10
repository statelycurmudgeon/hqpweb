// The Node side of the protocol (@app/protocol/node): TCP through node:net and discovery
// through node:dgram. Everything else in the package is portable (tsconfig.portable.json),
// so a phone app supplies its own Connect and Discover instead of these.
import { createSocket } from "node:dgram";
import { connect } from "node:net";
import { MAX_REPLY } from "./client.ts";
import {
  DISCOVERY_GROUP,
  DISCOVERY_PORT,
  DISCOVERY_PROBE,
  parseDiscoveryReply,
  type Discover,
  type Discovered,
} from "./discover.ts";
import type { Connect } from "./transport.ts";
import { PROLOG } from "./xml.ts";

/** TCP through node:net. */
export const nodeConnect: Connect = ({ host, port, timeoutMs }, events) =>
  new Promise((resolve, reject) => {
    const sock = connect({ host, port });
    sock.setNoDelay(true);
    const fail = (e: Error) => {
      sock.destroy();
      reject(e);
    };
    sock.once("error", fail);
    sock.setTimeout(timeoutMs, () => fail(new Error(`timeout connecting to ${host}:${port}`)));
    sock.once("connect", () => {
      sock.off("error", fail);
      sock.setTimeout(0);
      // Node reports an error, then the close: hand both over as one `closed`.
      let error: Error | undefined;
      sock.on("error", (e) => (error = e));
      sock.on("close", () => events.closed(error));
      sock.on("data", (d: Buffer) => events.data(d));
      resolve({
        write: (bytes) => void sock.write(bytes),
        get localAddress() {
          return sock.localAddress;
        },
        close: () => void sock.destroy(),
      });
    });
  });

/** Discovery through node:dgram: a few probes to the group, the answers within the wait. */
export const discover: Discover = (opts = {}) => {
  const { address, port } = opts.target ?? { address: DISCOVERY_GROUP, port: DISCOVERY_PORT };
  const found = new Map<string, Discovered>();
  return new Promise((resolve) => {
    const sock = createSocket({ type: "udp4" });
    let closed = false;
    const done = () => {
      if (closed) return;
      closed = true;
      try {
        sock.close();
      } catch {}
      resolve([...found.values()]);
    };
    sock.on("error", done);
    sock.on("message", (msg, rinfo) => {
      const d = parseDiscoveryReply(msg.toString("utf8"), rinfo.address);
      if (d) found.set(rinfo.address, d);
    });
    sock.bind(0, () => {
      try {
        sock.setMulticastTTL(2);
      } catch {}
      // UDP can drop a probe or a reply (a tester's scans failed several times before
      // one worked), so send a few, spread over the first half of the wait. Replies
      // are keyed by address, so repeats don't duplicate.
      const timeoutMs = opts.timeoutMs ?? 2000;
      const probes = Math.max(1, opts.probes ?? 3);
      for (let i = 0; i < probes; i++)
        setTimeout(
          () =>
            closed ||
            sock.send(DISCOVERY_PROBE, port, address, (err) => {
              if (err && i === 0) done();
            }),
          (i * timeoutMs) / (2 * probes),
        );
      setTimeout(done, timeoutMs);
    });
  });
};

/** Send one request document on a fresh connection and return the raw reply line (tests, probes). */
export function rawRequest(host: string, port: number, body: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port });
    let buf = "";
    let done = false;
    const finish = (err: Error | null, line?: string) => {
      if (done) return;
      done = true;
      sock.destroy();
      if (err) reject(err);
      else resolve(line!);
    };
    sock.setEncoding("utf8");
    sock.setTimeout(timeoutMs, () => finish(new Error(`timeout after ${timeoutMs} ms waiting for ${host}:${port}`)));
    sock.on("connect", () => sock.write(PROLOG + body + "\n"));
    sock.on("data", (d: string) => {
      const nl = d.indexOf("\n");
      if (nl >= 0) return finish(null, buf + d.slice(0, nl));
      buf += d;
      if (buf.length > MAX_REPLY) finish(new Error(`reply from ${host}:${port} too long`));
    });
    sock.on("error", (e) => finish(e));
    sock.on("close", () => finish(new Error(`connection closed before a complete reply from ${host}:${port}`)));
  });
}
