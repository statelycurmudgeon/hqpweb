// The two hosts every spec runs against (playwright.config.ts projects): the server ("web")
// and the phone app's page ("app"). A spec asks what the running host can offer, as the page
// does (apps/web api.ts can), rather than which one it is; and changes its own host's fakes.
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import type { HostCan } from "@app/contract";
import { APP_CAN } from "../apps/mobile/src/can.ts";
import { SERVER_CAN } from "../apps/web/src/lib/api.ts";
import { CONTROL_PORT } from "./stack.ts";

const onApp = () => test.info().project.name === "app";

/** What the running host offers. */
export const can = (): HostCan => (onApp() ? APP_CAN : SERVER_CAN);

/** Where to change one of this host's fakes, as HQPlayer or its owner would (stack.ts). */
export const fakeUrl = (id: string) => `http://127.0.0.1:${CONTROL_PORT}/fake/${id}${onApp() ? "?host=app" : ""}`;

/** Where a screenshot goes, for a person to look at: the app's beside the web's, in screenshots/app/. */
export const shotPath = (name: string) =>
  fileURLToPath(new URL(`screenshots/${onApp() ? "app/" : ""}${name}.png`, import.meta.url));
