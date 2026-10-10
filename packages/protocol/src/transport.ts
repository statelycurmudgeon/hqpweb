// How the protocol reaches HQPlayer: a TCP byte stream to host:port, opened by whatever
// the platform has (Node's net on the server, node.ts; a native socket in a phone app).
// The client (client.ts) and the meter stream take a Connect and never open sockets
// themselves, so everything reachable from index.ts runs without Node
// (tsconfig.portable.json checks that).

/** What an open connection reports. */
export interface ConnectionEvents {
  /** Bytes as they arrive, in order. */
  data(bytes: Uint8Array): void;
  /**
   * Once, when the connection ends for any reason, close() included; with the error
   * that ended it, if one did. No data follows.
   */
  closed(error?: Error): void;
}

export interface Connection {
  write(bytes: Uint8Array): void;
  /** This end's address, when the platform knows it: HQPlayer can reach us there (unless NAT is between). */
  readonly localAddress?: string | undefined;
  /** End the connection. Safe to call more than once; `closed` follows. */
  close(): void;
}

export interface ConnectTarget {
  host: string;
  port: number;
  /** Give up on opening it after this long. */
  timeoutMs: number;
}

/**
 * Open a TCP connection. Resolves once it's open; rejects if it can't be opened within
 * the timeout. `events` start once it's open.
 */
export type Connect = (target: ConnectTarget, events: ConnectionEvents) => Promise<Connection>;
