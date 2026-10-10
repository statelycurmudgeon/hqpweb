import { buildApp } from "./app.ts";
import { parseChange, RoonLink } from "@app/core";
import { accessSync, constants } from "node:fs";
import { loadConfig } from "@app/core";
import { FileDocs } from "./file-docs.ts";
import { VERSION } from "./version.ts";
import { LearnedStore } from "@app/core";
import { HistoryStore } from "@app/core";
import { PresetStore } from "@app/core";

// Loopback by default, because the app has no login (design §7). In a container,
// set HOST=0.0.0.0 and let network placement be the gate. An authenticating
// proxy in front is optional, not required.
const host = process.env.HOST ?? "127.0.0.1";
// 4380: unassigned in the IANA registry, and clear of common self-hosted defaults.
const port = Number(process.env.PORT ?? 4380);
// Names the app is reached by, besides loopback (e.g. its internal DNS name or
// tailnet name). Requests under any other Host are refused.
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const configDir = process.env.CONFIG_DIR ?? "config";
// Settings and what's been learned: files in CONFIG_DIR (file-docs.ts).
const docs = new FileDocs(configDir);
const config = await loadConfig(docs, process.env.NODE_ENV === "production");
try {
  accessSync(configDir, constants.W_OK);
} catch {
  console.error(`warning: ${configDir} is not writable; learned failures won't be saved (rollback still works)`);
}
const learned = await LearnedStore.open(docs);
const history = await HistoryStore.open(docs);
// Set in the container image; in development Vite serves the web app instead.
const staticDir = process.env.STATIC_DIR || undefined;
// Discovery is UDP multicast: in Docker it needs host networking to see the LAN.
// DISCOVERY=off disables it; DISCOVERY_TARGET=host:port probes one address (dev).
const target = process.env.DISCOVERY_TARGET?.match(/^(.+):(\d+)$/);
const discovery =
  process.env.DISCOVERY === "off" ? (false as const) : target ? { target: { address: target[1]!, port: Number(target[2]) } } : {};
const presets = await PresetStore.open(docs, parseChange);
// Roon is optional and off until switched on in Settings.
const roon = await RoonLink.open(docs, { version: VERSION });
const app = buildApp(config, {
  allowedHosts,
  learned,
  history,
  presets,
  docs,
  discovery,
  roon,
  ...(staticDir ? { staticDir } : {}),
});
const url = await app.listen(port, host);
console.error(`api on ${url} — instances: ${config.instances.map((i) => `${i.id}=${i.host}:${i.port}`).join(", ")}`);
if (allowedHosts.length) console.error(`also answering to: ${allowedHosts.join(", ")}`);

// `docker compose down` sends SIGTERM. Node as PID 1 ignores it by default, so
// without this the container waits 10 s and gets killed.
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    const force = setTimeout(() => process.exit(0), 3000);
    force.unref();
    // Saves run in the background now: let what's pending land before going.
    void app
      .close()
      .then(() => Promise.all([learned.flush(), history.flush(), roon.flush()]))
      .finally(() => process.exit(0));
  });
