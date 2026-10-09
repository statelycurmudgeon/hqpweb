// The clap track over HTTP (HQPlayer fetches it: HEAD, then GET, wanting audio/wav and byte
// ranges, measured 2026-10-09) and the action that plays it through HQPlayer.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeHqp, loadProfile } from "@app/fake-hqp";
import { buildApp } from "../src/app.ts";
import { CLAPS_MS, clapTrack } from "../src/calibration.ts";
import { client } from "./http.ts";

const fake = new FakeHqp(loadProfile("desktop5-mac-sdm"), { timeScale: 0 });
let app: ReturnType<typeof buildApp>;
let req: ReturnType<typeof client>;
let base: string;

beforeAll(async () => {
  await fake.listen();
  app = buildApp({ instances: [{ id: "mac", name: "Mac", host: "127.0.0.1", port: fake.port }] }, {});
  base = await app.listen(0, "127.0.0.1");
  req = client(base);
});
afterAll(async () => {
  await app.close();
  await fake.close();
});

describe("the clap track over HTTP", () => {
  const size = clapTrack().length;

  it("answers HEAD with the type, the length and byte ranges, and no body", async () => {
    const r = await req("HEAD", "/api/calibration.wav");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("audio/wav");
    expect(r.headers["accept-ranges"]).toBe("bytes");
    expect(Number(r.headers["content-length"])).toBe(size);
    expect(r.text()).toBe("");
  });

  it("serves a byte range, an open-ended one, and refuses one past the end", async () => {
    const head = await req("GET", "/api/calibration.wav", { headers: { range: "bytes=0-43" } });
    expect([head.status, head.headers["content-range"], head.headers["content-length"]]).toEqual([
      206,
      `bytes 0-43/${size}`,
      "44",
    ]);
    expect(head.text().startsWith("RIFF")).toBe(true);
    const tail = await req("GET", "/api/calibration.wav", { headers: { range: `bytes=${size - 10}-` } });
    expect([tail.status, tail.headers["content-length"]]).toEqual([206, "10"]);
    expect((await req("GET", "/api/calibration.wav", { headers: { range: `bytes=${size}-` } })).status).toBe(416);
  });
});

describe("playing it through HQPlayer", () => {
  it("stops Roon, plays the track from this address, reads back that it plays, and says when the claps come", async () => {
    expect(fake.feeder).toBe("Roon");
    const r = await req("POST", "/api/instances/mac/calibrate", { body: {}, headers: { origin: base } });
    expect(r.status).toBe(200);
    expect(r.json()).toMatchObject({ clapsMs: CLAPS_MS, trackMs: 17_000 });
    expect(fake.feeder).toBe("playlist");
    expect(fake.playback).toBe(2);
    expect(fake.playlist).toEqual([`${base}/api/calibration.wav`]);
  });
});
