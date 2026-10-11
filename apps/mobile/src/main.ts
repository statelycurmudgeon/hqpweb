// The phone app: its page (start.ts) with the phone's own parts. HQPlayer is reached through
// the native Tcp plugin, and found by asking around the subnet (udp.ts); what's kept lives on this device.
import { DeviceDocs } from "./device-docs.ts";
import { startApp } from "./start.ts";
import { nativeSockets, tcpConnect } from "./tcp.ts";
import { lanVia } from "./udp.ts";

await startApp(document.getElementById("app")!, {
  connect: tcpConnect,
  lan: lanVia(nativeSockets),
  docs: new DeviceDocs(),
});
