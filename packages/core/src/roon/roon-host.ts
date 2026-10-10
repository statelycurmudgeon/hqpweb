// Roon as a host offers it to the page: the checks on what's asked (moved from apps/server
// app.ts, so the server and the app refuse the same things), the transport the change engine
// pauses and plays through around a mode switch, and the zone updates the status stream carries.
// The app's Roon API is built on these (local-api.ts localRoonApi).
import type { RoonTransport } from "../change-engine.ts";
import { HttpError } from "../errors.ts";
import { ROON_ACTIONS, type RoonAction, type RoonLink, type RoonStatus, type ZoneView } from "./roon.ts";

/** Switching Roon on or off, and its core's address. */
export function parseRoonSettings(body: unknown): { enabled?: boolean; host?: string; port?: number } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, "body must be a JSON object");
  const { enabled, host, port, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) throw new HttpError(400, `unknown field "${Object.keys(rest)[0]}"`);
  if (enabled !== undefined && typeof enabled !== "boolean") throw new HttpError(400, "enabled must be a boolean");
  if (host !== undefined && typeof host !== "string") throw new HttpError(400, "host must be a string");
  if (port !== undefined && !Number.isInteger(port)) throw new HttpError(400, "port must be a whole number");
  return {
    ...(enabled !== undefined ? { enabled: enabled as boolean } : {}),
    ...(host !== undefined ? { host: (host as string).trim() } : {}),
    ...(port !== undefined ? { port: port as number } : {}),
  };
}

/** The Roon zone that plays through an instance, or null for none. */
export function parseRoonZone(body: unknown): string | null {
  const b = body as { zone?: unknown } | null;
  if (typeof b !== "object" || b === null || !(b.zone === null || (typeof b.zone === "string" && b.zone.length > 0)))
    throw new HttpError(400, "zone must be a Roon zone id or null");
  return b.zone as string | null;
}

/** One of Roon's transport actions. */
export function parseRoonAction(body: unknown): RoonAction {
  const b = body as { action?: unknown } | null;
  if (typeof b !== "object" || b === null || !ROON_ACTIONS.includes(b.action as RoonAction))
    throw new HttpError(400, `action must be one of ${ROON_ACTIONS.join(", ")}`);
  return b.action as RoonAction;
}

/** Pausing and playing an instance's Roon zone, for a mode switch (change-engine.ts); null without a zone. */
export const roonTransportFor =
  (roon: RoonLink) =>
  (id: string): RoonTransport | null =>
    roon.zoneFor(id)
      ? {
          pause: () => roon.control(id, "pause"),
          play: () => roon.control(id, "play"),
          playing: () => roon.zoneFor(id)?.state === "playing",
        }
      : null;

/**
 * An instance's Roon zone for the status stream: sent at once and on every change. Roon reports
 * the seek position every second; the page advances it itself, so a seek alone is sent only when
 * it jumps (a seek, a stall). Returns how to stop.
 */
export function watchRoonZone(
  roon: RoonLink,
  instanceId: string,
  send: (e: { status: RoonStatus; zone: ZoneView | null }) => void,
): () => void {
  let last = "";
  let sent: { seek: number; at: number; playing: boolean } | null = null;
  const update = () => {
    if (!roon.enabled && last === "") return;
    const status = roon.currentStatus;
    const zone = roon.zoneFor(instanceId);
    const seek = zone?.nowPlaying?.seek;
    // The key leaves the seek out (JSON drops undefined); a jump is checked on its own.
    const key = JSON.stringify({
      status,
      zone: zone && { ...zone, nowPlaying: zone.nowPlaying && { ...zone.nowPlaying, seek: undefined } },
    });
    const playing = zone?.state === "playing";
    const expected = sent ? sent.seek + (sent.playing ? (Date.now() - sent.at) / 1000 : 0) : null;
    const jumped = seek != null && (expected == null || Math.abs(seek - expected) > 2);
    if (key === last && !jumped) return;
    last = key;
    sent = seek != null ? { seek, at: Date.now(), playing } : null;
    send({ status, zone });
  };
  update();
  return roon.onChange(update);
}
