// The core against the wire (@app/contract): what each Service call returns must fit what
// the web app expects, and a change must mean the same on both sides. Checked when the
// tests are type-checked (npm run typecheck): a field renamed on one side fails the build.
import { describe, expect, it } from "vitest";
import type * as Wire from "@app/contract";
import type { Change, MeterEvent, Service, StatusEvent } from "../src/index.ts";

/** Compiles only if A fits B (A's values can be used where B's are expected). */
const fits =
  <B>() =>
  <A extends B>(_value?: A): true =>
    true;
type Result<K extends keyof Service> = Service[K] extends (...a: never[]) => infer R ? Awaited<R> : never;
/** What the server sends on the status stream for a snapshot event (app.ts: snapshot plus health). */
type SnapshotEvent = NonNullable<StatusEvent["snapshot"]> & { health: StatusEvent["health"] };

describe("the core's answers fit the API's contract", () => {
  it("type-checks", () => {
    const checks = [
      fits<Wire.Inst[]>()<Result<"instances">>(),
      fits<Wire.Inst[]>()<Result<"discover">>(),
      fits<{ id: string }>()<Result<"addInstance">>(),
      fits<{ id: string; name: string }>()<Result<"renameInstance">>(),
      fits<{ ok: true }>()<Result<"removeInstance">>(),
      fits<{ id: string; name: string; host: string; port: number; restartVolumeCap?: number }>()<Result<"setRestartCap">>(),
      fits<{ instance: { id: string; setup?: Wire.Setup }; savedNow: boolean }>()<Result<"saveSetup">>(),
      fits<{ dac: { id: string; name: string } }>()<Result<"addDac">>(),
      fits<{ ok: true }>()<Result<"renameDac">>(),
      fits<{ ok: true }>()<Result<"removeDac">>(),
      fits<{ ok: true }>()<Result<"selectDac">>(),
      fits<Wire.Capabilities>()<Result<"capabilities">>(),
      fits<Wire.ApplyResult>()<Result<"change">>(),
      fits<Wire.ApplyResult>()<Result<"undo">>(),
      fits<Wire.ApplyResult>()<Result<"applyPreset">>(),
      fits<{ reply: unknown; status: Wire.Status; notStarted?: { explained?: string } }>()<Result<"transport">>(),
      fits<{ status: Wire.Status }>()<Result<"seek">>(),
      fits<Wire.PresetView[]>()<Result<"presetsFor">>(),
      fits<Wire.Preset>()<Result<"createPreset">>(),
      fits<Wire.Preset>()<Result<"updatePreset">>(),
      fits<{ ok: true }>()<Result<"deletePreset">>(),
      fits<(Wire.Failure & { engine: string })[]>()<Result<"learned">>(),
      fits<Wire.HistoryEntry[]>()<Result<"history">>(),
      fits<{ forgotten: number }>()<Result<"forget">>(),
      fits<Wire.Snapshot>()<SnapshotEvent>(),
      fits<Wire.MeterEvent>()<MeterEvent>(),
      // A change goes both ways: what the web sends is what the core takes, and back.
      fits<Change>()<Wire.Change>(),
      fits<Wire.Change>()<Change>(),
    ];
    expect(checks.every(Boolean)).toBe(true);
  });
});
