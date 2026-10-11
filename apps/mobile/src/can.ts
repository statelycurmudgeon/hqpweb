// What the phone app's page can offer (apps/web api.ts can), apart for the browser tests to read.
import type { HostCan } from "@app/contract";

/**
 * What this app can't do yet: an always-on watch, the clap track. It finds HQPlayer and Roon
 * by asking each address on the subnet (udp.ts), not by multicast.
 */
export const APP_CAN: HostCan = { restartCap: false, calibrate: false, roon: true, discover: "subnets" };
