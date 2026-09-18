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
