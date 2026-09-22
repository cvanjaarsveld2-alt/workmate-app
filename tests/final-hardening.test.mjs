import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("service worker cache version is current hardening generation", () => {
  const sw = fs.readFileSync("public/service-worker.js", "utf8");
  assert.match(sw, /const CACHE_NAME = "powermate-v16";/);
});

test("daily vehicle prompt carries team ownership", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const prompt = fs.readFileSync("src/components/DailyVehiclePrompt.jsx", "utf8");
  assert.match(app, /<DailyVehiclePrompt[^>]*teamId=\{teamId\}/);
  assert.match(prompt, /team_id: teamId \|\| null/);
});

test("critical lazy screens expose the exports App expects", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  for (const [screen, exportName] of [
    ["FollowupsScreen", "FollowupsScreen"],
    ["VehicleCheckScreen", "VehicleCheckScreen"],
    ["JobsScreen", "JobsScreen"],
    ["InvoicesScreen", "InvoicesScreen"],
  ]) {
    if (screen === "FollowupsScreen") {
      assert.match(app, /import \{ FollowupsScreen \} from "\.\/screens\/FollowupsScreen"/);
    } else {
      assert.match(app, new RegExp(`import\\("\\\./screens/${screen}"\\)`));
    }
    const source = fs.readFileSync(`src/screens/${screen}.jsx`, "utf8");
    assert.match(source, new RegExp(`export function ${exportName}\\b`));
  }
});
