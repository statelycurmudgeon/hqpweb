// The phone app's page as the browser tests run it (e2e/app-host.ts serves it): the app's own
// start-up (apps/mobile start.ts) with stand-ins for the two native parts only. HQPlayer is
// reached through a WebSocket bridge to real TCP, driving the app's own TCP code (tcp.ts); what's
// kept lives in localStorage, so it survives a reload, as the phone's files do.
import { configText } from "@app/core";
import { startApp } from "../../apps/mobile/src/start.ts";
import { tcpConnectVia } from "../../apps/mobile/src/tcp.ts";
import { TUNING } from "../tuning.ts";
import { LocalDocs } from "./local-docs.ts";
import { bridgeTcp } from "./tcp-bridge.ts";

const docs = new LocalDocs();
// The test stack's fakes for this host, written as the app's instances on first open.
if ((await docs.read("instances.json")) === null) {
  const instances = (await (await fetch("/instances")).json()) as object[];
  await docs.write("instances.json", configText({ instances } as never));
}
await startApp(document.getElementById("app")!, {
  connect: tcpConnectVia(bridgeTcp(`ws://${location.host}/tcp`)),
  docs,
  tuning: TUNING,
});
