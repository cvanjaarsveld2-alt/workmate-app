import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("offline media retries use durable storage paths",()=>{
 const s=fs.readFileSync("src/lib/sync.js","utf8");
 assert.match(s,/uploadPhotoToSupabaseWithPath/);
 assert.match(s,/storage_path:uploaded\.path/);
 assert.match(s,/retryVehicleCheckMedia/);
 assert.doesNotMatch(s,/uploadPhotoToSupabase\(/);
});
test("vehicle checks persist team ownership",()=>{
 const s=fs.readFileSync("src/screens/VehicleCheckScreen.jsx","utf8");
 assert.match(s,/team_id: teamId \|\| null/);
});

test("sync drain merges durable IndexedDB queue before processing",()=>{
 const sync=fs.readFileSync("src/lib/sync.js","utf8");
 assert.match(sync,/offlineGetAll\("syncQueue"\)/);
 assert.match(sync,/const merged=new Map\(\)/);
 assert.match(sync,/syncQueue=\[\.\.\.merged\.values\(\)\]/);
});
test("server pull protects dirty rows from durable queue, not only React state",()=>{
 const sync=fs.readFileSync("src/lib/sync.js","utf8");
 assert.match(sync,/const durableQueue=await offlineGetAll\("syncQueue"\)/);
 assert.match(sync,/const dirty=\(durableQueue\|\|\[\]\)\.filter/);
});
