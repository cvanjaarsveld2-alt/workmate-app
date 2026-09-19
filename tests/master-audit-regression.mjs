import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = p => fs.readFileSync(p, "utf8");

test("React state is not a second durable sync-queue writer", () => {
  const app = read("src/App.jsx");
  assert.doesNotMatch(app, /offlineReplaceAll\("syncQueue",\s*data\.syncQueue/);
});

test("delete path persists its durable queue before publishing state", () => {
  const s = read("src/lib/deleteHelpers.js");
  assert.match(s, /offlineGetAll\("syncQueue"\)/);
  assert.match(s, /offlineReplaceAll\("syncQueue", nextQueue\)/);
});

test("diagnostics failed-queue clearing persists to IndexedDB", () => {
  const s = read("src/screens/DiagnosticsScreen.jsx");
  assert.match(s, /offlineGetAll\("syncQueue"\)/);
  assert.match(s, /offlineReplaceAll\("syncQueue", nextQueue\)/);
});

test("telemetry is bound to the authenticated user", () => {
  const s = read("src/lib/helpers.js");
  assert.match(s, /const userId = session\?\.user\?\.id/);
  assert.match(s, /user_id: userId/);
});

test("email quote RLS is not exposed to the public role", () => {
  const migration = read("supabase/migrations/20260919052206_rls_initplan_and_public_role_hardening.sql");
  assert.match(migration, /to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(migration, /email_quotes_.*to public/);
});
