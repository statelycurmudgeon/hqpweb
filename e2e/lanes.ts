// The browser tests' lanes: each host (the server, "web"; the phone app's page, "app") in
// each engine (Chromium; WebKit, as Safari and every iPhone use). Each lane is a Playwright
// project with its own fakes and port (stack.ts), so lanes running at once can't disturb
// each other's HQPlayers.

export interface Lane {
  /** The Playwright project's name. */
  name: string;
  host: "web" | "app";
  browser: "chromium" | "webkit";
  port: number;
}

export const LANES: Lane[] = [
  { name: "web", host: "web", browser: "chromium", port: 4390 },
  { name: "app", host: "app", browser: "chromium", port: 4392 },
  { name: "web-webkit", host: "web", browser: "webkit", port: 4393 },
  { name: "app-webkit", host: "app", browser: "webkit", port: 4394 },
];

/** Where tests change a lane's fakes (stack.ts). */
export const CONTROL_PORT = 4391;

export const lane = (name: string): Lane => {
  const l = LANES.find((x) => x.name === name);
  if (!l) throw new Error(`no lane "${name}" (e2e/lanes.ts)`);
  return l;
};
