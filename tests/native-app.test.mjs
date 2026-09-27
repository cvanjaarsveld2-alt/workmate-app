import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the store apps are built from the website's build", () => {
  const cfg = JSON.parse(read("capacitor.config.json"));
  assert.equal(cfg.webDir, "dist");
  assert.match(cfg.appId, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/);
  assert.equal(cfg.server.androidScheme, "https");
  assert.match(JSON.parse(read("package.json")).scripts["build:native"], /check-native-env\.cjs && vite build && cap sync/);
});

test("links that leave the phone use the public website, not the phone's local address", () => {
  const offenders = [];
  const walk = dir => {
    for (const f of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${f.name}`;
      if (f.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(f.name) && p !== "src/lib/appUrl.js" && read(p).includes("window.location.origin")) offenders.push(p);
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});

test("the phone asks for camera, microphone and location with a reason", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  for (const p of ["CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION"]) assert.ok(manifest.includes(`android.permission.${p}`), p);
  const plist = read("ios/App/App/Info.plist");
  for (const k of ["NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSLocationWhenInUseUsageDescription", "NSPhotoLibraryUsageDescription"])
    assert.match(plist, new RegExp(`<key>${k}</key>\\s*<string>[^<]{10,}</string>`), k);
});

test("the Android test build runs on GitHub", () => {
  const wf = read(".github/workflows/android.yml");
  assert.match(wf, /\.\/gradlew assembleDebug/);
  assert.match(wf, /java-version: 21/);
});
