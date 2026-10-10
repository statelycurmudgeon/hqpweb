// App-owned presets (design §4.3): named bundles of settings, stored by NAME so
// they work across instances and modes. Global; resolved per instance at apply time.
import { DocWriter, listOf, loadDoc, type DocStore } from "./docs.ts";
import { SETTINGS_FORMAT } from "./format.ts";
import { HttpError, type Change } from "./instance.ts";

const DOC = "presets.json";

export interface Preset {
  id: string;
  name: string;
  settings: Change;
  createdAt: string;
  updatedAt: string;
  /** Kept for one DAC only: its scope (`id` or `id#dac`, dac-scope.ts). Absent: shared by all. */
  scope?: string;
}

export class PresetStore {
  private presets: Preset[] = [];
  private readonly writer: DocWriter | null;

  /**
   * Saved in `docs` (docs.ts), as loaded from there; null: in memory only (tests). `validate`
   * checks each stored entry's settings (the same rules as a change); invalid entries are
   * dropped and logged.
   */
  constructor(saved: { docs: DocStore; data: Record<string, unknown> | null } | null, validate?: (settings: unknown) => Change) {
    this.writer = saved && new DocWriter(saved.docs, DOC);
    for (const p of listOf<Preset>(saved?.data ?? null, "presets")) {
      try {
        if (typeof p.id !== "string" || typeof p.name !== "string") throw new Error("missing id or name");
        this.presets.push(validate ? { ...p, settings: validate(p.settings) } : p);
      } catch (e) {
        console.error(`ignoring invalid preset ${JSON.stringify(p?.name ?? p)} in ${DOC}: ${(e as Error).message}`);
      }
    }
  }

  static async open(docs: DocStore, validate?: (settings: unknown) => Change): Promise<PresetStore> {
    return new PresetStore({ docs, data: await loadDoc(docs, DOC, "presets") }, validate);
  }

  list(): Preset[] {
    return this.presets;
  }

  get(id: string): Preset {
    const p = this.presets.find((x) => x.id === id);
    if (!p) throw new HttpError(404, "unknown preset");
    return p;
  }

  // Changes wait for the save, so one that couldn't be saved fails where it was asked for.
  async create(name: string, settings: Change, scope?: string): Promise<Preset> {
    const now = new Date().toISOString();
    const p: Preset = {
      id: crypto.randomUUID().slice(0, 8),
      name: this.checkName(name, undefined, scope),
      settings,
      createdAt: now,
      updatedAt: now,
      ...(scope ? { scope } : {}),
    };
    this.presets.push(p);
    await this.save();
    return p;
  }

  async update(id: string, patch: { name?: string; settings?: Change; scope?: string | null }): Promise<Preset> {
    const p = this.get(id);
    const scope = patch.scope !== undefined ? patch.scope || undefined : p.scope;
    if (patch.name !== undefined || patch.scope !== undefined) p.name = this.checkName(patch.name ?? p.name, id, scope);
    if (patch.scope !== undefined) {
      if (scope) p.scope = scope;
      else delete p.scope;
    }
    if (patch.settings !== undefined) p.settings = patch.settings;
    p.updatedAt = new Date().toISOString();
    await this.save();
    return p;
  }

  async remove(id: string) {
    this.get(id);
    this.presets = this.presets.filter((x) => x.id !== id);
    await this.save();
  }

  /** A removed DAC's presets become shared ones. */
  async unscope(scope: string) {
    let n = 0;
    for (const p of this.presets)
      if (p.scope === scope) {
        delete p.scope;
        n++;
      }
    if (n) await this.save();
  }

  /** Unique among the presets that show together: the shared ones, and one DAC's own (dac-scope.ts). */
  private checkName(name: string, exceptId?: string, scope?: string): string {
    const n = name.trim();
    if (!n || n.length > 64) throw new HttpError(400, "name must be 1–64 characters");
    const together = (x: Preset) => !scope || !x.scope || x.scope === scope;
    if (this.presets.some((x) => x.id !== exceptId && together(x) && x.name.toLowerCase() === n.toLowerCase()))
      throw new HttpError(409, `a preset named "${n}" already exists`);
    return n;
  }

  private async save() {
    await this.writer?.write(JSON.stringify({ format: SETTINGS_FORMAT, presets: this.presets }, null, 1) + "\n");
  }
}
