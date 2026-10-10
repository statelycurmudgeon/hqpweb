import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileDocs } from "../src/file-docs.ts";
import { LearnedStore, type Failure } from "../src/learned.ts";

/** The store as saved in learned.json's directory, the server's way (file-docs.ts). */
const open = (path: string) => LearnedStore.open(new FileDocs(dirname(path)));

const f = (o: Partial<Failure> = {}): Failure => ({
  instance: "mac",
  engine: "5.35.10",
  mode: "SDM (DSD)",
  rateHz: 45_158_400,
  filterNx: "poly-sinc-gauss-hires-lp",
  filter1x: "poly-sinc-gauss-xla",
  shaper: "ASDM7EC",
  reason: "playing at 53% of real time",
  at: "2026-10-01T10:00:00.000Z",
  ...o,
});

describe("failure history, per instance, engine and combination", () => {
  it("counts repeat failures of the same combination, keeping the first and last dates", () => {
    const s = new LearnedStore(null);
    s.record(f());
    s.record(f({ at: "2026-10-03T10:00:00.000Z", reason: "playing at 60% of real time" }));
    expect(s.all("mac")).toEqual([
      expect.objectContaining({ count: 2, first: "2026-10-01T10:00:00.000Z", at: "2026-10-03T10:00:00.000Z" }),
    ]);
  });

  it("keeps different combinations, and other instances, apart", () => {
    const s = new LearnedStore(null);
    s.record(f());
    s.record(f({ shaper: "ASDM7EC-light" }));
    s.record(f({ instance: "lxc" }));
    expect([s.all("mac").length, s.all("lxc").length]).toEqual([2, 1]);
  });

  it("reads failures saved before counts existed as one each", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learned-")), "learned.json");
    writeFileSync(path, JSON.stringify({ format: 1, failures: [f()] }));
    expect((await open(path)).all("mac")[0]).toMatchObject({ count: 1, first: "2026-10-01T10:00:00.000Z" });
  });

  it("collects the source rates a combination failed with", () => {
    const s = new LearnedStore(null);
    s.record(f({ sourceRates: [44_100] }));
    s.record(f({ sourceRates: [192_000] }));
    s.record(f({ sourceRates: [44_100] }));
    expect(s.all("mac")[0]!.sourceRates).toEqual([44_100, 192_000]);
  });
});

describe("kept up here, per DAC, engine, combination and source rate", () => {
  const { instance, engine, mode, rateHz, filterNx, filter1x, shaper, at } = f();
  const combo = { instance, engine, mode, rateHz, filterNx, filter1x, shaper, at };
  const k = (o: object = {}) => ({ ...combo, sourceRate: 44_100, low: 2.1, typical: 2.3, ...o });

  it("refreshes during a session, counts it when it ends, and keeps the lowest ever", () => {
    const s = new LearnedStore(null);
    s.recordKept(k(), false);
    s.recordKept(k({ low: 1.9, typical: 2.2 }), true);
    s.recordKept(k({ low: 2.4, typical: 2.5, at: "2026-10-09T10:00:00.000Z" }), true);
    expect(s.keptFor("mac", "5.35.10", "SDM (DSD)")).toEqual([
      expect.objectContaining({ low: 1.9, typical: 2.5, sessions: 2, first: "2026-10-01T10:00:00.000Z" }),
    ]);
  });

  it("keeps source rates and DACs apart, and forgets them with the instance", () => {
    const s = new LearnedStore(null);
    s.recordKept(k(), true);
    s.recordKept(k({ sourceRate: 192_000 }), true);
    s.recordKept(k({ instance: "mac#desk" }), true);
    expect(s.keptFor("mac", "5.35.10", "SDM (DSD)")).toHaveLength(2);
    s.forget("mac");
    expect(s.keptFor("mac#desk", "5.35.10", "SDM (DSD)")).toEqual([]);
  });

  it("reads a file from before kept-up records without calling it corrupt, and saves both lists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "learned-"));
    const path = join(dir, "learned.json");
    writeFileSync(path, JSON.stringify({ format: 1, failures: [f()] }));
    const s = await open(path);
    expect(readdirSync(dir)).toEqual(["learned.json"]); // nothing moved aside
    s.recordKept(k(), true);
    await s.flush();
    const again = await open(path);
    expect([again.all("mac").length, again.keptFor("mac", "5.35.10", "SDM (DSD)").length]).toEqual([1, 1]);
  });
});

describe("forgetting one combination", () => {
  const combo = {
    mode: "SDM (DSD)",
    rateHz: 45_158_400,
    filterNx: "poly-sinc-gauss-hires-lp",
    filter1x: "poly-sinc-gauss-xla",
    shaper: "ASDM7EC",
  };
  const kept = (low: number) => ({
    ...combo,
    instance: "mac",
    engine: "5.35.10",
    sourceRate: 44_100,
    low,
    typical: low,
    at: "2026-10-02T10:00:00.000Z",
  });

  it("drops its failures (every DAC and engine) and its slow runs, and nothing else", () => {
    const s = new LearnedStore(null);
    s.record(f());
    s.record(f({ engine: "6.2.5" }));
    s.record(f({ instance: "mac#dac2" }));
    s.record(f({ shaper: "ASDM7EC-light" }));
    s.record(f({ instance: "lxc" }));
    s.recordKept(kept(0.8), true);
    s.recordKept({ ...kept(1.5), sourceRate: 96_000 }, true);
    expect(s.forgetCombo("mac", combo)).toBe(4);
    expect(s.all("mac").map((x) => x.shaper)).toEqual(["ASDM7EC-light"]);
    expect(s.all("lxc")).toHaveLength(1);
    expect(s.keptFor("mac", "5.35.10", "SDM (DSD)").map((k) => k.low)).toEqual([1.5]);
  });
});

describe("filters slow to switch to", () => {
  const slow = (o: object = {}) => ({
    instance: "mac",
    engine: "5.35.10",
    mode: "SDM (DSD)",
    rateHz: 11_289_600,
    filter: "sinc-L",
    sourceRate: 44_100,
    busyMs: 9400,
    at: "2026-10-09T18:37:47.000Z",
    ...o,
  });

  it("counts repeats of the same switch, keeping the latest time, and keeps others apart", () => {
    const s = new LearnedStore(null);
    s.recordSlow(slow());
    s.recordSlow(slow({ busyMs: 9300, at: "2026-10-09T18:40:00.000Z" }));
    s.recordSlow(slow({ rateHz: 22_579_200 }));
    s.recordSlow(slow({ instance: "lxc" }));
    const mine = s.slowFor("mac", "5.35.10", "SDM (DSD)");
    expect(mine).toEqual([
      expect.objectContaining({ rateHz: 11_289_600, busyMs: 9300, count: 2 }),
      expect.objectContaining({ rateHz: 22_579_200, count: 1 }),
    ]);
    s.forget("mac");
    expect(s.slowFor("mac", "5.35.10", "SDM (DSD)")).toEqual([]);
    expect(s.slowFor("lxc", "5.35.10", "SDM (DSD)")).toHaveLength(1);
  });

  it("keeps them across a restart", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learned-")), "learned.json");
    const s = await open(path);
    s.recordSlow(slow());
    await s.flush();
    expect((await open(path)).slowFor("mac", "5.35.10", "SDM (DSD)")).toHaveLength(1);
  });
});
