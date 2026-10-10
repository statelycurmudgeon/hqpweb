// Put the phone app on your own iPhone or iPad in one step: build the page, sync it into the
// iOS project, build and sign with your team (apps/mobile/ios/local-team.xcconfig), install
// and open it. A free Apple account's builds run for 7 days; run this again to renew.
//   npm run phone                        the one connected device
//   HQPWEB_DEVICE="Name" npm run phone   one of several
//   npm run phone -- --dry-run           say what it would do, and do nothing
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pickPhone, type DevicectlDevice } from "./pick.ts";

const MOBILE = fileURLToPath(new URL("../../apps/mobile/", import.meta.url));
const IOS = join(MOBILE, "ios");
const APP_ID = "dev.hqpweb.app";
const dry = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function run(what: string, cmd: string, args: string[], cwd = MOBILE) {
  console.log(`\n→ ${what}\n  ${cmd} ${args.join(" ")}`);
  if (dry) return;
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) fail(`${what} failed (exit ${r.status ?? r.signal}).`);
}

if (!existsSync(join(IOS, "local-team.xcconfig")))
  fail(
    "No team to sign with. Copy apps/mobile/ios/local-team.xcconfig.example to local-team.xcconfig\n" +
      "(beside it; git ignores it) and put your team ID in it.",
  );

const listing = join(mkdtempSync(join(tmpdir(), "hqpweb-phone-")), "devices.json");
const list = spawnSync("xcrun", ["devicectl", "list", "devices", "--json-output", listing], { stdio: "ignore" });
if (list.status !== 0) fail("Couldn't list devices (xcrun devicectl). Is Xcode installed?");
const devices = (JSON.parse(readFileSync(listing, "utf8")) as { result: { devices: DevicectlDevice[] } }).result.devices;
const picked = pickPhone(devices, process.env.HQPWEB_DEVICE || undefined);
if ("problem" in picked) fail(picked.problem);
const { phone } = picked;
console.log(`Putting hqpweb on ${phone.name}${dry ? " (dry run: nothing is done)" : ""}.`);

run("Build the page and copy it into the iOS project", "npm", ["run", "sync"]);
run(
  "Build and sign the app (the first time, macOS may ask to let codesign use your key: Always Allow)",
  "xcodebuild",
  [
    "-project",
    "App/App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Debug",
    "-destination",
    `id=${phone.udid}`,
    "-derivedDataPath",
    "DerivedData",
    "-allowProvisioningUpdates",
    "build",
  ],
  IOS,
);
run("Install it", "xcrun", [
  "devicectl",
  "device",
  "install",
  "app",
  "--device",
  phone.id,
  join(IOS, "DerivedData/Build/Products/Debug-iphoneos/App.app"),
]);
run("Open it (the phone must be unlocked)", "xcrun", ["devicectl", "device", "process", "launch", "--device", phone.id, APP_ID]);
console.log(`\nDone${dry ? " (dry run)" : `: hqpweb is on ${phone.name}`}.`);
