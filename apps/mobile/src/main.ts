// The phone app's page: the web app (apps/web App.svelte) with the core running in-process
// instead of a server (packages/core localApi). HQPlayer is reached through the native Tcp
// plugin; what's kept lives on this device. The page hides what this host can't do (can).
import { mount } from "svelte";
import "../../web/src/theme.css";
import App from "../../web/src/App.svelte";
import { applyTheme } from "../../web/src/lib/prefs.svelte.ts";
import { useHost } from "../../web/src/lib/api.ts";
import type { HostApi, HostCan } from "@app/contract";
import {
  HistoryStore,
  LearnedStore,
  PresetStore,
  RoonLink,
  Service,
  loadConfig,
  localApi,
  localRoonApi,
  parseChange,
  roonTransportFor,
} from "@app/core";
import { DeviceDocs } from "./device-docs.ts";
import { tcpConnect } from "./tcp.ts";

/** What this app can't do yet: an always-on watch, the clap track, multicast discovery (HQPlayer's or Roon's). */
const CAN: HostCan = { restartCap: false, calibrate: false, roon: true, discover: false };
const unavailable = () => Promise.reject(new Error("not available in this app yet"));

applyTheme();
const target = document.getElementById("app")!;
/** What start-up is doing, on screen until the page mounts; and why, if it can't. */
const say = (text: string) => (target.textContent = text);

try {
  say("Opening what this phone keeps…");
  const docs = new DeviceDocs();
  const config = await loadConfig(docs, true);
  const [learned, history, presets, roon] = await Promise.all([
    LearnedStore.open(docs),
    HistoryStore.open(docs),
    PresetStore.open(docs, parseChange),
    RoonLink.open(docs, { version: __APP_VERSION__ }),
  ]);
  say("Starting…");
  const service = new Service(config, {
    net: { connect: tcpConnect, discover: async () => [] },
    docs,
    learned,
    history,
    presets,
    roonTransport: roonTransportFor(roon),
  });
  const host: HostApi = {
    health: async () => ({ ok: true, version: __APP_VERSION__ }),
    calibrate: unavailable,
    ...localRoonApi(roon, service),
  };
  useHost({ api: { ...localApi(service, { roon }), ...host }, can: CAN });
  // Writes wait a moment to batch (docs.ts); the phone may stop the app any time after it's
  // hidden, so finish them then. Roon's pairing token is among them.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void Promise.all([learned.flush(), history.flush(), roon.flush()]);
  });
  target.textContent = "";
  mount(App, { target });
} catch (e) {
  say(`hqpweb couldn't start: ${(e as Error).message}`);
  throw e;
}
