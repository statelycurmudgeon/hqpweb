// The app's storage for the browser tests: each document in localStorage, which Playwright
// gives each test fresh. On the phone they're files (apps/mobile device-docs.ts).
import type { DocStore } from "@app/core";

const KEY = (name: string) => `docs:${name}`;

export class LocalDocs implements DocStore {
  async read(name: string) {
    return localStorage.getItem(KEY(name));
  }
  async write(name: string, text: string) {
    localStorage.setItem(KEY(name), text);
  }
  async setAside(name: string) {
    const aside = `${name}.corrupt`;
    const text = localStorage.getItem(KEY(name));
    if (text !== null) localStorage.setItem(KEY(aside), text);
    localStorage.removeItem(KEY(name));
    return aside;
  }
}
