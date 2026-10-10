// Documents as files in one directory (docs.ts): the server's storage, in CONFIG_DIR.
// Written to a temporary file and renamed into place, so a crash leaves the old or the new
// document, never half of one.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocStore } from "@app/core";

export class FileDocs implements DocStore {
  readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  async read(name: string): Promise<string | null> {
    try {
      return await readFile(join(this.dir, name), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async write(name: string, text: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, name);
    const tmp = `${path}.tmp`;
    await rm(tmp, { force: true }); // a leftover from a crash may have other permissions
    await writeFile(tmp, text);
    await rename(tmp, path);
  }

  async setAside(name: string): Promise<string> {
    const path = join(this.dir, name);
    const aside = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await rename(path, aside);
    return aside;
  }
}
