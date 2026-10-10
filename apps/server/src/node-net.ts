// How the server reaches and finds HQPlayer: Node's TCP and UDP (@app/protocol/node), and
// DNS to tell a configured host from the same HQPlayer discovered by address. A phone app
// passes its own (packages/core takes them in; it never imports Node).
import { lookup } from "node:dns/promises";
import type { Connect, Discover } from "@app/protocol";
import { discover, nodeConnect } from "@app/protocol/node";

export interface Net {
  connect: Connect;
  discover: Discover;
  resolve?: (host: string) => Promise<string>;
}

export const nodeNet: Net = {
  connect: nodeConnect,
  discover,
  resolve: async (host) => (await lookup(host, { family: 4 })).address,
};
