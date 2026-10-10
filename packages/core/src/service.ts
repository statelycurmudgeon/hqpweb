// Everything hqpweb offers, one method per thing its API does: the server's HTTP layer
// (apps/server app.ts) is a thin front over this, and an app can call it in-process. Each
// method takes what was asked for unchecked and checks it itself (requests.ts), so both
// refuse the same things. Roon, the clap track and serving pages stay with the host.
import type { Connect, Discover, DiscoverOptions } from "@app/protocol";
import type { AppConfig } from "./config.ts";
import type { RoonTransport } from "./change-engine.ts";
import type { DocStore } from "./docs.ts";
import { HttpError } from "./errors.ts";
import { HistoryStore } from "./history.ts";
import { Instance } from "./instance.ts";
import type { Change } from "./instance-types.ts";
import type { KeptTiming } from "./kept-up.ts";
import { LearnedStore } from "./learned.ts";
import type { MeterEvent, MeterTiming } from "./meter-stream.ts";
import type { StatusEvent } from "./poller.ts";
import { PresetStore } from "./presets.ts";
import { Registry } from "./registry.ts";
import {
  parseChange,
  parseCombo,
  parseDacChoice,
  parseNewInstance,
  parsePresetBody,
  parseRename,
  parseRestartCap,
  parseSeek,
  parseTransport,
} from "./requests.ts";
import { scopeOf } from "./dac-scope.ts";
import { parseSetupChange } from "./setup.ts";
import type { WatchTiming } from "./watch.ts";

export interface ServiceOptions {
  /** How HQPlayer is reached and found; `resolve` tells a configured host from the same one discovered. */
  net: { connect: Connect; discover: Discover; resolve?: (host: string) => Promise<string> };
  /** Where the instances are saved (docs.ts); null = in memory only. */
  docs?: DocStore | null;
  presets?: PresetStore;
  learned?: LearnedStore;
  history?: HistoryStore;
  /** Discovery settings; false disables it. */
  discovery?: DiscoverOptions | false;
  /** Control port assumed for discovered instances (default 4321). */
  discoveredPort?: number;
  /** Roon's transport for an instance's zone, when the host links one (change-engine.ts). */
  roonTransport?: (instanceId: string) => RoonTransport | null;
  /** Timings; tests shorten them. */
  timing?: { quick: WatchTiming; major: WatchTiming };
  speedWindowMs?: number;
  /** How often a status subscription polls HQPlayer, in ms, unless it says (default 1000). */
  pollMs?: number;
  keptTiming?: KeptTiming;
  meterTiming?: Partial<MeterTiming>;
  queueEveryMs?: number;
  playWaitMs?: number;
}

/**
 * Every method that answers a request is async, so a refusal (a bad body, an unknown
 * instance) always comes back as a rejected promise, never as a throw before one exists.
 * `instance()`, the subscriptions and `close()` are the synchronous exceptions.
 */
export class Service {
  readonly registry: Registry;
  readonly presets: PresetStore;
  private readonly pollMs: number | undefined;

  constructor(config: AppConfig, opts: ServiceOptions) {
    const learned = opts.learned ?? new LearnedStore(null);
    const history = opts.history ?? new HistoryStore(null);
    this.presets = opts.presets ?? new PresetStore(null);
    const roonTransport = opts.roonTransport ?? (() => null);
    this.pollMs = opts.pollMs;
    this.registry = new Registry(config, {
      ...opts.net,
      docs: opts.docs ?? null,
      discovery: opts.discovery ?? false,
      ...(opts.discoveredPort ? { discoveredPort: opts.discoveredPort } : {}),
      makeInstance: (cfg) =>
        new Instance(cfg, {
          connect: opts.net.connect,
          learned,
          history,
          ...(opts.timing ? { timing: opts.timing } : {}),
          ...(opts.speedWindowMs ? { speedWindowMs: opts.speedWindowMs } : {}),
          ...(opts.keptTiming ? { keptTiming: opts.keptTiming } : {}),
          ...(opts.meterTiming ? { meterTiming: opts.meterTiming } : {}),
          ...(opts.queueEveryMs ? { queueEveryMs: opts.queueEveryMs } : {}),
          ...(opts.playWaitMs ? { playWaitMs: opts.playWaitMs } : {}),
          roon: () => roonTransport(cfg.id),
        }),
    });
  }

  /** One instance, or 404. */
  instance(id: string): Instance {
    const inst = this.registry.get(id);
    if (!inst) throw new HttpError(404, "unknown instance");
    return inst;
  }

  // ---- instances ------------------------------------------------------------------

  async instances() {
    return this.registry.list();
  }
  async discover() {
    await this.registry.scan();
    return this.registry.list();
  }
  async addInstance(body: unknown) {
    return this.registry.add(parseNewInstance(body));
  }
  async renameInstance(id: string, body: unknown) {
    return this.registry.rename(id, parseRename(body));
  }
  async removeInstance(id: string) {
    await this.registry.remove(id);
    return { ok: true as const };
  }
  async setRestartCap(id: string, body: unknown) {
    return this.registry.setRestartCap(id, parseRestartCap(body));
  }
  async saveSetup(id: string, body: unknown) {
    return this.registry.saveSetup(id, parseSetupChange(body));
  }

  // ---- named DACs (dac-scope.ts) ----------------------------------------------------

  async addDac(id: string, body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    return this.registry.addDac(id, { name: b.name, currentName: b.currentName });
  }
  async renameDac(id: string, dacId: string, body: unknown) {
    await this.registry.renameDac(id, dacId, ((body ?? {}) as Record<string, unknown>).name);
    return { ok: true as const };
  }
  /** A removed DAC's presets become shared ones. */
  async removeDac(id: string, dacId: string) {
    await this.registry.removeDac(id, dacId);
    await this.presets.unscope(scopeOf(id, dacId));
    return { ok: true as const };
  }
  async selectDac(id: string, body: unknown) {
    await this.registry.selectDac(id, parseDacChoice(body));
    return { ok: true as const };
  }

  // ---- one instance ---------------------------------------------------------------

  async now(id: string) {
    return this.instance(id).now();
  }
  async capabilities(id: string) {
    return this.instance(id).capabilities();
  }
  async change(id: string, body: unknown) {
    return this.instance(id).applyChange(parseChange(body));
  }
  async undo(id: string) {
    return this.instance(id).undo();
  }
  async dismissVolumeJump(id: string) {
    return this.instance(id).dismissVolumeJump();
  }
  async transport(id: string, body: unknown) {
    return this.instance(id).transport(parseTransport(body));
  }
  async seek(id: string, body: unknown) {
    return this.instance(id).seek(parseSeek(body));
  }
  async learned(id: string) {
    return this.instance(id).learnedFailures();
  }
  async history(id: string) {
    return this.instance(id).changeHistory();
  }
  /** Everything learned here, or (with a body) one combination. */
  async forget(id: string, body?: unknown) {
    return this.instance(id).forgetFailures(body === undefined ? undefined : parseCombo(body));
  }
  /** Live status: snapshots, or that HQPlayer can't be reached. Returns how to stop. */
  subscribe(id: string, fn: (e: StatusEvent) => void, intervalMs?: number): () => void {
    return this.instance(id).subscribe(fn, intervalMs ?? this.pollMs);
  }
  /** HQPlayer's meter, while subscribed. Returns how to stop. */
  subscribeMeter(id: string, fn: (e: MeterEvent) => void): () => void {
    return this.instance(id).subscribeMeter(fn);
  }

  // ---- presets ----------------------------------------------------------------------

  async listPresets() {
    return this.presets.list();
  }
  /** The shared presets and the in-use DAC's own (dac-scope.ts), each with what it would change here. */
  async presetsFor(id: string) {
    const inst = this.instance(id);
    const list = this.presets.list().filter((p) => !p.scope || p.scope === inst.scope());
    const previews = await inst.previewPresets(list.map((p) => p.settings));
    return list.map((p, i) => ({ ...p, preview: previews[i]! })); // one preview per preset
  }
  async applyPreset(id: string, presetId: string) {
    const inst = this.instance(id);
    return inst.applyPreset(this.presets.get(presetId).settings);
  }
  async createPreset(body: unknown) {
    const b = parsePresetBody(body);
    const settings = b.fromInstance ? await this.captureFrom(b.fromInstance, b.includeVolume ?? false) : b.settings;
    if (!settings || Object.keys(settings).length === 0) throw new HttpError(400, "a preset needs settings or fromInstance");
    return this.presets.create(b.name ?? "", settings, b.scope ?? undefined);
  }
  async updatePreset(presetId: string, body: unknown) {
    const b = parsePresetBody(body, true);
    // "Update from current": replace the settings with the instance's current ones.
    const settings = b.fromInstance
      ? await this.captureFrom(b.fromInstance, b.includeVolume ?? this.presets.get(presetId).settings.volume !== undefined)
      : b.settings;
    return this.presets.update(presetId, {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(settings ? { settings } : {}),
      ...(b.scope !== undefined ? { scope: b.scope } : {}),
    });
  }
  async deletePreset(presetId: string) {
    await this.presets.remove(presetId);
    return { ok: true as const };
  }

  /** An instance's current settings, by name, as preset settings. */
  private async captureFrom(instanceId: string, includeVolume: boolean): Promise<Change> {
    const settings: Change = { ...(await this.instance(instanceId).currentSettings()) };
    if (!includeVolume) delete settings.volume;
    // "" means no matrix profile is active: nothing to restore, so leave it out.
    if (!settings.matrixProfile) delete settings.matrixProfile;
    return settings;
  }

  close() {
    this.registry.close();
  }
}
