// The core's API in-process (@app/contract CoreApi): what a phone app hands its page instead
// of HTTP. Same calls, same answers, same refusals as the server's HTTP API (the contract
// tests run one suite against both). Everything crosses as JSON, as it does over HTTP, so
// the page never holds a live reference into the core's state, nor the core into the page's.
import type { CoreApi } from "@app/contract";
import type { Service } from "./service.ts";
import { wireError } from "./wire-error.ts";

/** A copy as the wire would carry it: JSON in, JSON out. */
const wire = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

/** An error as the HTTP client would throw it: the server's words, with its status. */
function apiError(err: unknown): Error {
  const w = wireError(err);
  if (w.unexpected) console.error(err);
  return Object.assign(new Error(w.error), { status: w.status });
}

export function localApi(service: Service): CoreApi {
  async function run<T>(call: () => Promise<T>): Promise<T> {
    try {
      return wire(await call());
    } catch (e) {
      throw apiError(e);
    }
  }
  return {
    instances: () => run(() => service.instances()),
    discover: () => run(() => service.discover()),
    addInstance: (body) => run(() => service.addInstance(wire(body))),
    renameInstance: (id, name) => run(() => service.renameInstance(id, { name })),
    removeInstance: (id) => run(() => service.removeInstance(id)),
    setRestartCap: (id, maxDb) => run(() => service.setRestartCap(id, { maxDb })),
    saveSetup: (id, change) => run(() => service.saveSetup(id, wire(change))),
    addDac: (id, name, currentName) => run(() => service.addDac(id, { name, ...(currentName ? { currentName } : {}) })),
    renameDac: (id, dac, name) => run(() => service.renameDac(id, dac, { name })),
    removeDac: (id, dac) => run(() => service.removeDac(id, dac)),
    selectDac: (id, dac) => run(() => service.selectDac(id, { dac })),
    capabilities: (id) => run(() => service.capabilities(id)),
    change: (id, change) => run(() => service.change(id, wire(change))),
    undo: (id) => run(() => service.undo(id)),
    transport: (id, action) => run(() => service.transport(id, { action })),
    seek: (id, seconds) => run(() => service.seek(id, { seconds })),
    dismissVolumeJump: (id) => run(() => service.dismissVolumeJump(id)),
    presets: (id) => run(() => service.presetsFor(id)),
    savePreset: (body) => run(() => service.createPreset(wire(body))),
    renamePreset: (pid, name) => run(() => service.updatePreset(pid, { name })),
    updatePresetFromCurrent: (pid, fromInstance) => run(() => service.updatePreset(pid, { fromInstance })),
    deletePreset: (pid) => run(() => service.deletePreset(pid)),
    applyPreset: (id, pid) => run(() => service.applyPreset(id, pid)),
    learned: (id) => run(() => service.learned(id)),
    history: (id) => run(() => service.history(id)),
    forgetLearned: (id) => run(() => service.forget(id)),
    forgetCombo: (id, c) =>
      run(() =>
        service.forget(id, { mode: c.mode, rateHz: c.rateHz, filter1x: c.filter1x, filterNx: c.filterNx, shaper: c.shaper }),
      ),
    // A stream: the same events the server's /events sends (a snapshot with its health, or
    // why HQPlayer can't be reached). Nothing in-process can be "lost", and Roon is the host's.
    status: (id, on) =>
      service.subscribe(id, (e) => {
        if (e.snapshot) on.now(wire({ ...e.snapshot, health: e.health }) as Parameters<typeof on.now>[0]);
        else on.unreachable(e.error ?? "unreachable");
      }),
    meter: (id, on) => service.subscribeMeter(id, (e) => on(wire(e))),
  };
}
