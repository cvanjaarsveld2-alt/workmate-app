import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = p => fs.readFileSync(p, "utf8");

test("uncaught errors and rejections are reported from startup", () => {
  const main = read("src/main.jsx");
  assert.match(main, /installGlobalErrorReporting\(\)/);
  const helpers = read("src/lib/helpers.js");
  assert.match(helpers, /addEventListener\("error"/);
  assert.match(helpers, /addEventListener\("unhandledrejection"/);
  assert.match(helpers, /addEventListener\("online",\s*\(\)\s*=>\s*flushEventBuffer\(\)\)/);
});

test("both error boundaries report crashes, not just console.error", () => {
  assert.match(read("src/components/ErrorBoundary.jsx"), /reportError\("screen_crashed"/);
  assert.match(read("src/App.jsx"), /reportError\("app_crashed"/);
});

test("offline events are buffered, capped and kept under the server payload limit", () => {
  const helpers = read("src/lib/helpers.js");
  assert.doesNotMatch(helpers, /if \(!navigator\.onLine\) return;\n\s*try \{\n\s*const \{ data: \{ session \}/);
  assert.match(helpers, /EVENT_BUFFER_MAX = \d+/);
  const max = Number(helpers.match(/EVENT_DATA_MAX = (\d+)/)[1]);
  assert.ok(max < 20000, "events_set_owner_and_validate rejects data over 20000 chars");
  assert.match(helpers, /MAX_ERROR_REPORTS = \d+/);
});

test("sync failures report which tables and error codes failed", () => {
  const sync = read("src/lib/sync.js");
  assert.match(sync, /logEvent\("sync_failed",\s*\{\s*count: failed\.length,\s*items:/);
});

test("server-rejected events are not buffered, so one bad row can't block the queue", () => {
  const helpers = read("src/lib/helpers.js");
  assert.match(helpers, /function isRetryableEventError\(error\) \{\s*return !error\?\.code;/);
  assert.match(helpers, /if \(row && isRetryableEventError\(e\)\) writeEventBuffer/);
  assert.match(helpers, /if \(error && isRetryableEventError\(error\)\) return;/);
});
