// How a failure reaches whoever asked: a status and words, the same whether they asked over
// HTTP (apps/server app.ts) or in-process (local-api.ts).
import { PeerError } from "@app/protocol";
import { HttpError } from "./errors.ts";

export interface WireError {
  status: number;
  error: string;
  /** Our own bug, not the request's or HQPlayer's: worth logging in full. */
  unexpected: boolean;
}

export function wireError(err: unknown): WireError {
  if (err instanceof HttpError) return { status: err.status, error: err.message, unexpected: false };
  // Failures talking to HQPlayer (network, timeouts, odd replies) are 502.
  if (err instanceof PeerError) return { status: 502, error: `instance error: ${err.message}`, unexpected: false };
  return { status: 500, error: "internal error", unexpected: true };
}
