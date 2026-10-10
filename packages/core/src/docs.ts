// Where hqpweb keeps what it must remember: named JSON documents (instances.json,
// presets.json, learned.json, history.json). On the server they're files in CONFIG_DIR
// (file-docs.ts); a phone app would keep them in its own storage. Async, as device storage
// is. The stores load once at start and write the whole document on each change.
import { checkFormat } from "./format.ts";

export interface DocStore {
  /** The document's text; null if there isn't one yet. */
  read(name: string): Promise<string | null>;
  /** Replace the document whole: all or nothing where the platform allows. Private: owner-only (Roon's tokens). */
  write(name: string, text: string, opts?: { private?: boolean }): Promise<void>;
  /** Keep an unreadable document under another name, so the next write can't lose it. Where it went. */
  setAside(name: string): Promise<string>;
}

/**
 * Read a document: a JSON object, holding the list `required` if one is named. Missing: null,
 * which is normal. Unreadable (bad JSON, not an object, no such list, can't be read): set aside,
 * never overwritten by the next save; null.
 */
export async function loadDoc(docs: DocStore, name: string, required?: string): Promise<Record<string, unknown> | null> {
  let text: string | null;
  try {
    text = await docs.read(name);
    if (text === null) return null;
    const data = JSON.parse(text) as Record<string, unknown>;
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("not a JSON object");
    checkFormat(name, data);
    if (required !== undefined && !Array.isArray(data[required])) throw new Error(`no "${required}" array`);
    return data;
  } catch (e) {
    const aside = await docs.setAside(name).catch((err: Error) => `nowhere (${err.message})`);
    console.error(`could not read ${name} (${(e as Error).message}); moved it to ${aside} and started empty`);
    return null;
  }
}

/** A list from a loaded document. Lists added after a document first shipped are absent from older ones: empty. */
export const listOf = <T>(data: Record<string, unknown> | null, key: string): T[] =>
  Array.isArray(data?.[key]) ? (data[key] as T[]) : [];

/**
 * Saves one document: one write at a time, in order, so the latest text lands last. `flush`
 * waits for what's been asked so far (tests; shutdown).
 */
export class DocWriter {
  private chain: Promise<void> = Promise.resolve();
  private readonly docs: DocStore;
  private readonly name: string;
  private readonly opts: { private?: boolean };
  constructor(docs: DocStore, name: string, opts: { private?: boolean } = {}) {
    this.docs = docs;
    this.name = name;
    this.opts = opts;
  }

  /** Write `text`; rejects if it couldn't be written. */
  write(text: string): Promise<void> {
    const next = this.chain.then(() => this.docs.write(this.name, text, this.opts));
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Write in the background: a failure is logged, never thrown (bookkeeping mustn't break what asked). */
  writeQuietly(text: string) {
    this.write(text).catch((e: Error) => console.error(`could not save ${this.name}: ${e.message}`));
  }

  flush(): Promise<void> {
    return this.chain;
  }
}

/** Documents in memory: tests, and anything that shouldn't persist. */
export class MemoryDocs implements DocStore {
  readonly docs = new Map<string, string>();
  async read(name: string) {
    return this.docs.get(name) ?? null;
  }
  async write(name: string, text: string) {
    this.docs.set(name, text);
  }
  async setAside(name: string) {
    const aside = `${name}.corrupt`;
    const text = this.docs.get(name);
    if (text !== undefined) this.docs.set(aside, text);
    this.docs.delete(name);
    return aside;
  }
}
