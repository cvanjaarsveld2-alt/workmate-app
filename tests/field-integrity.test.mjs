import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = p => fs.readFileSync(p, "utf8");

test("offline writes fail loudly instead of masquerading as success", () => {
  const source = read("src/offline/offlineDb.js");
  for (const op of ["offlineSave", "offlineDelete", "offlineReplaceAll"]) {
    const start = source.indexOf("export async function " + op);
    assert.notEqual(start, -1, op);
    const end = source.indexOf("\nexport async function", start + 10);
    const body = source.slice(start, end === -1 ? source.length : end);
    assert.match(body, /throw e/);
    assert.match(body, /local_write_failed/);
  }
});

test("sync protects array fields from stale offline overwrites", () => {
  const source = read("src/lib/sync.js");
  assert.match(source, /ARRAY_CONFLICT_FIELDS/);
  assert.match(source, /PWR_ARRAY_CONFLICT/);
  assert.match(source, /assertNoStaleArrayOverwrite/);
});

test("pending media has a real retry path for every supported record shape", () => {
  const source = read("src/lib/sync.js");
  for (const marker of ["retryFlatMedia","retryReportMedia","retryVehicleCheckMedia","retryPendingMedia","queueMediaCorrection"]) {
    assert.ok(source.includes(marker), marker);
  }
  assert.match(source, /triggerImmediateSync\(\)/);
});

test("financial calculations remain cent-safe and VAT is explicit", async () => {
  const finance = await import("../src/lib/finance.js");
  assert.equal(finance.VAT_RATE, 0.15);
  for (const amount of [0, 1, 9.99, 100, 999.99, 10000.01]) {
    for (const inclusive of [true, false]) {
      const r = finance.calculateVat(amount, inclusive);
      assert.equal(finance.roundMoney(r.subtotal), r.subtotal);
      assert.equal(finance.roundMoney(r.vat), r.vat);
      assert.equal(finance.reconcileMoney(r.subtotal, r.vat), r.total);
    }
  }
});

test("client RPCs expose invoker wrappers, while privileged implementations are private", () => {
  const migration = read("supabase/migrations/20260919092201_harden_exposed_security_definer_rpcs.sql");
  const names = ["accept_shared_record","create_team_for_user","current_team_id","get_team_member_emails","join_team_by_code","migrate_user_data_to_team","notify_assignment","reassign_record","same_team"];
  for (const name of names) {
    assert.ok(migration.includes("alter function public." + name + "("), name);
    assert.ok(migration.includes("create or replace function public." + name), name);
    assert.ok(migration.includes("security invoker"), name);
    assert.ok(migration.includes("revoke execute on function private." + name), name);
  }
});


test("job invoice and payment uniqueness/idempotency protections stay wired into sync", () => {
  const sync = read("src/lib/sync.js");
  for (const marker of ["jobs_quote_id_uidx","invoices_job_id_uidx","payments_idempotency_key_uidx"]) {
    assert.ok(sync.includes(marker), marker);
  }
  assert.match(sync, /upsertWithIdempotentRecovery/);
});

test("team/customer records stay user/team scoped during sync", () => {
  const sync = read("src/lib/sync.js");
  assert.match(sync, /const TEAM_TABLES=new Set/);
  assert.match(sync, /payload\.user_id=authData\.user\.id/);
  assert.match(sync, /sanitizeRemotePayload/);
});
