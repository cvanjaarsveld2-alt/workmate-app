import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { toCsv } from "../src/lib/companyExport.js";

const sql = fs.readFileSync("supabase/migrations/20260926160000_company_export_and_deletion.sql", "utf8");

test("company export CSVs are formula-safe and keep every column", () => {
  const csv = toCsv([
    { id: 1, company: "=HYPERLINK(1)", notes: 'Said "hi", then left' },
    { id: 2, company: "Acme", extra: { a: 1 } },
  ]);
  const [head, r1, r2] = csv.split("\r\n");
  assert.equal(head, "id,company,notes,extra");
  assert.match(r1, /'=HYPERLINK\(1\)/);
  assert.match(r1, /"Said ""hi"", then left"/);
  assert.match(r2, /"\{""a"":1\}"/);
  assert.equal(toCsv([]), "");
});

test("only the master account exports or asks for deletion; only platform admins delete, and only on request", () => {
  assert.match(sql, /export_company_data[\s\S]*?is_team_owner\(p_team_id\)/);
  assert.match(sql, /request_company_deletion[\s\S]*?is_team_owner\(p_team_id\)/);
  assert.match(sql, /admin_delete_company[\s\S]*?is_platform_admin\(\)[\s\S]*?p_confirm_name is distinct from v_name[\s\S]*?deletion_requested_at is not null/);
  // Children before parents so a delete never trips a reference.
  const order = sql.match(/select array\[([^\]]+)\]/)[1].replace(/\s+/g, "");
  assert.ok(order.indexOf("'payments'") < order.indexOf("'invoices'"));
  assert.ok(order.indexOf("'invoices'") < order.indexOf("'jobs'"));
  assert.ok(order.indexOf("'quotes'") < order.indexOf("'clients'"));
});

test("sign-up records terms acceptance and the legal pages exist", () => {
  const signup = fs.readFileSync("supabase/migrations/20260926110000_platform_admin_signup_terms.sql", "utf8");
  assert.match(signup, /terms_accepted_at/);
  for (const doc of ["terms", "privacy", "dpa"]) {
    const md = fs.readFileSync(`src/legal/${doc}.md`, "utf8");
    assert.match(md, /DRAFT — for review by a South African attorney/);
    assert.match(md, /Version 2026-09/);
  }
  assert.match(fs.readFileSync("src/legal/privacy.md", "utf8"), /Information Regulator/);
});
