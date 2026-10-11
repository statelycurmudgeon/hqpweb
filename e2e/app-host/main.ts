// The phone app's page as the browser tests run it (e2e/app-host.ts serves it): the app's own
// start-up (apps/mobile start.ts) with stand-ins for the two native parts only. HQPlayer is
// reached through a WebSocket bridge to real TCP and found on a test LAN, driving the app's own
// TCP and UDP code (tcp.ts, udp.ts); what's kept lives in localStorage, so it survives a reload,
// as the phone's files do.
import { configText } from "@app/core";
import { startApp } from "../../apps/mobile/src/start.ts";
import { tcpConnectVia } from "../../apps/mobile/src/tcp.ts";
import { lanVia } from "../../apps/mobile/src/udp.ts";
import { TUNING } from "../tuning.ts";
import { LocalDocs } from "./local-docs.ts";
import { bridge } from "./tcp-bridge.ts";

const docs = new LocalDocs();
// The test stack's fakes for this host, written as the app's instances on first open.
if ((await docs.read("instances.json")) === null) {
  const instances = (await (await fetch("/instances")).json()) as object[];
  await docs.write("instances.json", configText({ instances } as never));
}
const native = bridge(`ws://${location.host}/tcp`);
await startApp(document.getElementById("app")!, {
  connect: tcpConnectVia(native.tcp),
  lan: lanVia(native.udp),
  docs,
  tuning: TUNING,
});
