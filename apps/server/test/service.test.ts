// The core's Service (packages/core service.ts), in-process, with no HTTP: what an app would
// call. It must refuse exactly what the HTTP API refuses, with the same status and words.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeHqp, loadProfile } from "@app/fake-hqp";
import { HttpError, Service, type WatchTiming } from "@app/core";
import { discover, nodeConnect } from "@app/protocol/node";
import { buildApp } from "../src/app.ts";
import { client } from "./http.ts";

const FAST: WatchTiming = { graceMs: 100, healthyMs: 300, maxMs: 1200, sampleMs: 40, minSpeed: 0.85 };
let fake: FakeHqp;
let service: Service;
let app: ReturnType<typeof buildApp>;
let req: ReturnType<typeof client>;

beforeEach(async () => {
  fake = new FakeHqp(loadProfile("desktop5-mac-sdm"), { timeScale: 0 });
  await fake.listen();
  const config = { instances: [{ id: "mac", name: "Mac", host: "127.0.0.1", port: fake.port }] };
  const timing = { timing: { quick: FAST, major: FAST }, playWaitMs: 400 };
  service = new Service(config, { net: { connect: nodeConnect, discover }, ...timing });
  app = buildApp(config, timing);
  req = client(await app.listen(0, "127.0.0.1"));
});
afterEach(async () => {
  service.close();
  await app.close();
  await fake.close();
});

/** What the service throws for a call: its status and words, as the HTTP API would send them. */
async function refusal(call: () => Promise<unknown>) {
  const e = await call().then(
    () => null,
    (err: unknown) => err,
  );
  if (!(e instanceof HttpError)) throw new Error(`expected a refusal, got ${String(e)}`);
  return { status: e.status, error: e.message };
}

describe("refuses what the HTTP API refuses, the same way", () => {
  const cases: [string, string, string, unknown, (s: Service) => Promise<unknown>][] = [
    ["a volume as text", "POST", "/api/instances/mac/change", { volume: "-20" }, (s) => s.change("mac", { volume: "-20" })],
    ["an unknown field", "POST", "/api/instances/mac/change", { loud: true }, (s) => s.change("mac", { loud: true })],
    ["an empty change", "POST", "/api/instances/mac/change", {}, (s) => s.change("mac", {})],
    ["a fractional rate", "POST", "/api/instances/mac/change", { rate: 1.5 }, (s) => s.change("mac", { rate: 1.5 })],
    ["an unknown instance", "POST", "/api/instances/nope/change", { volume: "x" }, (s) => s.change("nope", { volume: "x" })],
    [
      "a bad transport action",
      "POST",
      "/api/instances/mac/transport",
      { action: "eject" },
      (s) => s.transport("mac", { action: "eject" }),
    ],
    ["a negative seek", "POST", "/api/instances/mac/seek", { seconds: -1 }, (s) => s.seek("mac", { seconds: -1 })],
    [
      "forgetting with extra fields",
      "POST",
      "/api/instances/mac/forget",
      { mode: "PCM", extra: 1 },
      (s) => s.forget("mac", { mode: "PCM", extra: 1 }),
    ],
    [
      "a preset with no name",
      "POST",
      "/api/presets",
      { settings: { invert: true } },
      (s) => s.createPreset({ settings: { invert: true } }),
    ],
    ["a preset with no settings", "POST", "/api/presets", { name: "A" }, (s) => s.createPreset({ name: "A" })],
    ["an instance with no host", "POST", "/api/instances", { name: "A" }, (s) => s.addInstance({ name: "A" })],
    [
      "a restart cap as text",
      "PUT",
      "/api/instances/mac/restartcap",
      { maxDb: "-20" },
      (s) => s.setRestartCap("mac", { maxDb: "-20" }),
    ],
    [
      "a rename with extra fields",
      "PATCH",
      "/api/instances/mac",
      { name: "A", x: 1 },
      (s) => s.renameInstance("mac", { name: "A", x: 1 }),
    ],
  ];
  it.each(cases)("%s", async (_what, method, path, body, call) => {
    const http = await req(method, path, { body });
    expect(await refusal(() => call(service))).toEqual({ status: http.status, error: http.json().error });
    expect(http.status).toBeGreaterThanOrEqual(400);
  });
});

describe("works in-process", () => {
  it("applies a change and reads it back, as the API does", async () => {
    const r = await service.change("mac", { shaper: "ASDM7EC" });
    expect(r.results[0]).toMatchObject({ field: "shaper", actual: "ASDM7EC", applied: true });
    expect((await service.capabilities("mac")).shapers.find((x) => x.index === r.state.shaper)?.name).toBe("ASDM7EC");
  });

  it("saves a preset from the instance as it is, leaving the volume out unless asked", async () => {
    const p = await service.createPreset({ name: "Now", fromInstance: "mac" });
    expect(p.settings.volume).toBeUndefined();
    expect(p.settings.shaper).toBeTypeOf("string");
    const v = await service.createPreset({ name: "With volume", fromInstance: "mac", includeVolume: true });
    expect(v.settings.volume).toBeTypeOf("number");
  });

  it("streams status while subscribed, and stops when told", async () => {
    const seen: unknown[] = [];
    const off = service.subscribe("mac", (e) => seen.push(e), 20);
    await expect.poll(() => seen.length).toBeGreaterThan(1);
    off();
    const n = seen.length;
    await new Promise((r) => setImmediate(r));
    expect(seen.length).toBeLessThanOrEqual(n + 1);
  });
});
