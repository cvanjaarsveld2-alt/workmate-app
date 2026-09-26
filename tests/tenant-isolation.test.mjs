import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The real check runs in the database: select private.tenant_isolation_test();
// (see tests/sql/tenant_isolation.sql). These guard the migration itself.
const hardening = fs.readFileSync("supabase/migrations/20260926090000_tenant_isolation_hardening.sql", "utf8");
const testFn = fs.readFileSync("supabase/migrations/20260926085900_tenant_isolation_test_function.sql", "utf8");

test("no policy grants a global admin access to every company", () => {
  for (const t of ["conversations", "documents", "follow_ups", "plan_items", "sales_reports", "service_reports", "targets"])
    assert.match(hardening, new RegExp(`'${t}'`), t);
  assert.match(hardening, /private\.can_see_user\(user_id\)/);
  assert.doesNotMatch(hardening.split("-- 3 ─")[1].split("-- 4 ─")[0], /public\.users/);
});

test("sharing only works within the record's own company", () => {
  for (const type of ["client", "contact", "lead", "quote", "followup"])
    assert.match(hardening, new RegExp(`shared_with_me\\('${type}', id::text, team_id, user_id\\)`));
  assert.match(hardening, /drop function if exists private\.shared_with_me\(text, text\)/);
});

test("invite codes are long, server-made, and owners can only rename their company", () => {
  assert.match(hardening, /generate_series\(1, 12\)/);
  assert.match(hardening, /length\(invite_code\) >= 12/);
  assert.match(hardening, /revoke update on public\.teams from authenticated;\s*grant update \(name\) on public\.teams/);
  assert.match(fs.readFileSync("src/screens/TeamScreen.jsx", "utf8"), /rpc\("regenerate_invite_code"/);
});

test("the isolation test covers reads, writes, sharing, storage and team functions, and never keeps data", () => {
  for (const s of ["self-share", "can_see_member_files", "get_team_member_emails", "reassign_record", "remove_team_member", "set_member_access", "regenerate_invite_code", "join_team_by_code"])
    assert.ok(testFn.includes(s), s);
  assert.match(testFn, /raise exception 'ISOLATION %/);
  assert.match(testFn, /revoke execute on function private\.tenant_isolation_test\(\) from public, anon, authenticated/);
});
