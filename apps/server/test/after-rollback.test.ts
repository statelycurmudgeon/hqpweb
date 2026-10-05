import type { Status } from "@app/protocol";
import { describe, expect, it } from "vitest";
import { afterRollback } from "../src/watch.ts";

const status = (state: Status["state"], song: string | null): Status =>
  ({ state, source: song === null ? null : { sampleRate: 44_100, bits: 24, channels: 2, song } }) as Status;
type V = { kind: "playing" } | { kind: "stopped"; detail: string };
const stopped: V = { kind: "stopped", detail: "stopped" };

/** Run afterRollback with watch results in order; report what happened. */
async function run(was: Status, ...verdicts: V[]) {
  const sent: string[] = [];
  const result = await afterRollback(was, async () => verdicts.shift()!, { send: async (b: string) => sent.push(b) });
  return { result, sent: sent.map((b) => /<(\w+)/.exec(b)![1]) };
}

describe("after a rollback", () => {
  it("sends Stop, then Play, when HQPlayer's own playlist was playing and it stayed stopped", async () => {
    expect(await run(status(2, "01 - Example.flac"), stopped, { kind: "playing" })).toEqual({
      result: { kind: "playing" },
      sent: ["Stop", "Play"],
    });
  });

  it("doesn't press Play when Roon was the source: Roon resumes, or the user does it in Roon", async () => {
    expect((await run(status(2, "Roon"), stopped)).sent).toEqual([]);
  });

  it("doesn't press Play when nothing was playing before the change", async () => {
    expect((await run(status(0, null), stopped)).sent).toEqual([]);
  });

  it("doesn't press Play when playback already recovered", async () => {
    expect((await run(status(2, "01 - Example.flac"), { kind: "playing" })).sent).toEqual([]);
  });

  it("reports the second check when Play doesn't bring it back", async () => {
    expect((await run(status(2, "01 - Example.flac"), stopped, stopped)).result).toEqual(stopped);
  });
});
