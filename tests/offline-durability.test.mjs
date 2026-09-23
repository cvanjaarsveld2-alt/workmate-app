import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Source checks: whitespace-tolerant (\s*) so a Prettier reformat can't break them.
const read = p => fs.readFileSync(p, "utf8");

test("offline media retries use durable storage paths", () => {
  const s = read("src/lib/sync.js");
  assert.match(s, /uploadPhotoToSupabaseWithPath/);
  assert.match(s, /storage_path:\s*uploaded\.path/);
  assert.match(s, /retryVehicleCheckMedia/);
  assert.doesNotMatch(s, /uploadPhotoToSupabase\(/);
});

test("vehicle checks persist team ownership", () => {
  const s = read("src/screens/VehicleCheckScreen.jsx");
  assert.match(s, /team_id:\s*teamId\s*\|\|\s*null/);
});

test("sync drain merges durable IndexedDB queue before processing", () => {
  const sync = read("src/lib/sync.js");
  assert.match(sync, /offlineGetAll\("syncQueue"\)/);
  assert.match(sync, /const merged\s*=\s*new Map\(\)/);
  assert.match(sync, /syncQueue\s*=\s*\[\.\.\.merged\.values\(\)\]/);
});

test("server pull protects dirty rows from durable queue, not only React state", () => {
  const sync = read("src/lib/sync.js");
  assert.match(sync, /const durableQueue\s*=\s*await offlineGetAll\("syncQueue"\)/);
  assert.match(sync, /const dirty\s*=\s*\(durableQueue\s*\|\|\s*\[\]\)\s*\.filter/);
});

test("Followups uses a stable module import", () => {
  const app = read("src/App.jsx");
  assert.match(app, /import \{ FollowupsScreen \} from "\.\/screens\/FollowupsScreen"/);
  assert.doesNotMatch(app, /lazy\(\(\) => import\("\.\/screens\/FollowupsScreen"\)/);
});

test("startup asks the browser not to evict the offline IndexedDB store", () => {
  assert.match(read("src/main.jsx"), /requestPersistentStorage\(\)/);
  assert.match(read("src/offline/offlineDb.js"), /navigator\.storage\.persist\(\)/);
});
