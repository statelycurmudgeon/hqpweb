// The phone app: its page (start.ts) with the phone's own parts. HQPlayer is reached through
// the native Tcp plugin; what's kept lives on this device.
import { DeviceDocs } from "./device-docs.ts";
import { startApp } from "./start.ts";
import { tcpConnect } from "./tcp.ts";

await startApp(document.getElementById("app")!, { connect: tcpConnect, docs: new DeviceDocs() });
