// One suite, two ways to reach the core: over HTTP (the web app's httpApi against the server)
// and in-process (core localApi over a Service, as a phone app would). Every test runs on
// both, with the same expectations: the page can't tell which one it's talking to. The
// last test checks that every CoreApi call was made both ways, so a new one can't skip this.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeHqp, FakeMeter, loadProfile } from "@app/fake-hqp";
import type { CoreApi, Snapshot } from "@app/contract";
import { Service, localApi, type WatchTiming } from "@app/core";
import { discover, nodeConnect } from "@app/protocol/node";
import { buildApp } from "../apps/server/src/app.ts";
import { httpApi } from "../apps/web/src/lib/api.ts";
import { NodeEventSource } from "./sse.ts";

const FAST: WatchTiming = { graceMs: 100, healthyMs: 300, maxMs: 1200, sampleMs: 40, minSpeed: 0.85 };
const timing = { timing: { quick: FAST, major: FAST }, playWaitMs: 400 };

let fake: FakeHqp;
let meter: FakeMeter;
let done: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of done.splice(0)) await d();
  await meter.close();
  await fake.close();
});

/** A fake HQPlayer (with its meter) and the API to it, one way or the other. */
const ways: [string, (config: { instances: object[] }) => Promise<CoreApi>][] = [
  [
    "over HTTP",
    async (config) => {
      const app = buildApp(config as never, { ...timing, pollMs: 50 });
      const base = await app.listen(0, "127.0.0.1");
      done.push(() => app.close());
      return httpApi({ base, EventSource: NodeEventSource as unknown as typeof EventSource });
    },
  ],
  [
    "in-process",
    async (config) => {
      const service = new Service(config as never, { net: { connect: nodeConnect, discover }, ...timing });
      done.push(async () => service.close());
      return localApi(service);
    },
  ],
];

/** Every call the core offers: the in-process API's own keys (its object literal is typed as CoreApi). */
function everyCall(): string[] {
  const service = new Service({ instances: [] }, { net: { connect: nodeConnect, discover } });
  const calls = Object.keys(localApi(service)).sort();
  service.close();
  return calls;
}

/** The API, noting each call made through it. */
function noting(api: CoreApi, made: Set<string>): CoreApi {
  return new Proxy(api, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver) as unknown;
      if (typeof key !== "string" || typeof v !== "function") return v;
      return (...args: unknown[]) => {
        made.add(key);
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

describe.each(ways)("the API %s", (_way, start) => {
  let api: CoreApi;
  const made = new Set<string>();
  let calls: string[];
  beforeAll(() => {
    calls = everyCall();
  });
  beforeEach(async () => {
    fake = new FakeHqp(loadProfile("desktop5-mac-sdm"), { timeScale: 0 });
    await fake.listen();
    meter = new FakeMeter(fake);
    const meterPort = await meter.listen();
    api = noting(await start({ instances: [{ id: "mac", name: "Mac", host: "127.0.0.1", port: fake.port, meterPort }] }), made);
  });

  /** The words a refusal carries. */
  const refused = (p: Promise<unknown>) =>
    p.then(
      () => "accepted",
      (e: Error) => e.message,
    );

  it("lists the instance and what it offers", async () => {
    expect((await api.instances()).map((i) => [i.id, i.reachable])).toEqual([["mac", true]]);
    const caps = await api.capabilities("mac");
    expect(caps.mode.name).toBe("SDM (DSD)");
    expect(caps.shapers.some((s) => s.name === "ASDM7EC")).toBe(true);
  });

  it("applies a change, reads it back, and undoes it", async () => {
    const before = (await api.capabilities("mac")).shapers;
    const r = await api.change("mac", { shaper: "ASDM7EC" });
    expect(r.results[0]).toMatchObject({ field: "shaper", actual: "ASDM7EC", applied: true });
    expect(r.undoAvailable).toBe(true);
    const back = await api.undo("mac");
    expect(back.results[0]?.field).toBe("shaper");
    expect(before.find((s) => s.index === back.state.shaper)?.name).not.toBe("ASDM7EC");
    const history = await api.history("mac");
    expect(history.map((h) => h.source)).toEqual(["undo", "hqpweb"]);
  });

  it("refuses the same things, in the same words", async () => {
    expect(await refused(api.change("mac", { volume: "-20" as unknown as number }))).toBe('"volume" must be a number');
    expect(await refused(api.change("nope", { volume: -30 }))).toBe("unknown instance");
    expect(await refused(api.seek("mac", -1))).toBe("seconds must be a number ≥ 0");
    expect(await refused(api.transport("mac", "eject" as never))).toMatch(/^action must be one of/);
    expect(await refused(api.renameInstance("nope", "A"))).toBe("not a configured instance");
  });

  it("keeps presets: save, list with a preview, rename, apply, delete", async () => {
    const p = await api.savePreset({ name: "Night", settings: { invert: true } });
    const listed = await api.presets("mac");
    expect(listed.map((x) => [x.name, x.preview.differs])).toEqual([["Night", ["invert"]]]);
    expect((await api.renamePreset(p.id, "Late")).name).toBe("Late");
    expect((await api.applyPreset("mac", p.id)).results[0]).toMatchObject({ field: "invert", actual: true });
    const fromNow = await api.updatePresetFromCurrent(p.id, "mac");
    expect(fromNow.settings.invert).toBe(true);
    expect(await api.deletePreset(p.id)).toEqual({ ok: true });
    expect(await api.presets("mac")).toEqual([]);
  });

  it("names DACs, picks one, and removes it", async () => {
    const { dac } = await api.addDac("mac", "Desk", "Holo");
    expect(dac).toEqual({ id: "desk", name: "Desk" });
    expect(await api.selectDac("mac", "desk")).toEqual({ ok: true });
    expect((await api.instances())[0]?.dac).toBe("desk");
    expect(await api.removeDac("mac", "desk")).toEqual({ ok: true });
    expect((await api.instances())[0]?.dacs.map((d) => d.id)).toEqual(["main"]);
  });

  it("streams status, and stops when told", async () => {
    const seen: Snapshot[] = [];
    const stop = api.status("mac", { now: (s) => seen.push(s), unreachable: () => undefined });
    await expect.poll(() => seen.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(seen[0]).toMatchObject({ state: { mode: expect.any(Number) }, status: { state: expect.any(Number) } });
    expect(seen[0]?.health).toMatchObject({ latencyMs: expect.any(Number) });
    stop();
  });

  it("says when HQPlayer can't be reached", async () => {
    const errors: string[] = [];
    const stop = api.status("mac", { now: () => undefined, unreachable: (e) => errors.push(e) });
    await fake.close();
    await expect.poll(() => errors.length, { timeout: 8000 }).toBeGreaterThan(0);
    stop();
  });

  it("streams the meter", async () => {
    const frames: boolean[] = [];
    const stop = api.meter("mac", (m) => frames.push(m.connected));
    await expect.poll(() => frames.includes(true), { timeout: 5000 }).toBe(true);
    stop();
  });

  it("fails a call to an HQPlayer that's gone as HQPlayer's problem, in the same words", async () => {
    await fake.close();
    expect(await refused(api.capabilities("mac"))).toMatch(/^instance error: /);
  });

  it("forgets: one combination, or everything learned here", async () => {
    const combo = { mode: "SDM (DSD)", rateHz: 22579200, filterNx: "a", filter1x: "b", shaper: "c" };
    expect(await api.forgetCombo("mac", combo)).toEqual({ forgotten: 0 });
    expect(await api.forgetLearned("mac")).toEqual({ forgotten: 0 });
    expect(await api.learned("mac")).toEqual([]);
  });

  it("hands back copies: changing an answer changes nothing in the core", async () => {
    const p = await api.savePreset({ name: "A", settings: { invert: true } });
    p.name = "changed here only";
    p.settings.invert = false;
    const again = (await api.presets("mac"))[0];
    expect([again?.name, again?.settings.invert]).toEqual(["A", true]);
  });
  it("adds an instance and removes it", async () => {
    expect(await refused(api.addInstance({ name: "No host" } as never))).toBe("name and host are required strings");
    const { id } = await api.addInstance({ name: "Extra", host: "127.0.0.1", port: 1 });
    expect((await api.instances()).map((i) => i.name)).toContain("Extra");
    expect(await api.removeInstance(id)).toEqual({ ok: true });
    expect((await api.instances()).map((i) => i.id)).toEqual(["mac"]);
  });

  it("finds instances (discovery off here: the configured one)", async () => {
    expect((await api.discover()).map((i) => [i.id, i.discovered])).toEqual([["mac", false]]);
  });

  it("sets and clears the restart cap", async () => {
    expect((await api.setRestartCap("mac", -20)).restartVolumeCap).toBe(-20);
    expect((await api.setRestartCap("mac", null)).restartVolumeCap).toBeUndefined();
    expect(await refused(api.setRestartCap("mac", "-20" as never))).toBe("maxDb must be a number or null");
  });

  it("saves and clears setup answers", async () => {
    expect(await api.saveSetup("mac", { dsd: "direct" })).toMatchObject({
      instance: { setup: { dsd: "direct" } },
      savedNow: false,
    });
    expect((await api.saveSetup("mac", { dsd: null })).instance.setup).toBeUndefined();
    expect(await refused(api.saveSetup("mac", { dsd: "loud" } as never))).toMatch(/^dsd must be one of/);
  });

  it("renames a DAC", async () => {
    const { dac } = await api.addDac("mac", "Desk");
    expect(await api.renameDac("mac", dac.id, "Den")).toEqual({ ok: true });
    expect((await api.instances())[0]?.dacs.find((d) => d.id === dac.id)?.name).toBe("Den");
  });

  it("dismisses a volume jump", async () => {
    expect(await api.dismissVolumeJump("mac")).toEqual({ ok: true });
  });

  // Last: the calls above, made both ways. A new CoreApi call needs a test here too.
  it("has made every call the core offers", () => {
    expect(calls.filter((c) => !made.has(c))).toEqual([]);
  });
});
