import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { owing, statementRows } from "../src/lib/portal.js";

const invoices = [
  { invoice_number: "INV-00001", issue_date: "2026-08-01", due_date: "2026-08-31", total: 1150, balance_due: 0, status: "paid" },
  { invoice_number: "INV-00002", issue_date: "2026-09-01", due_date: "2026-09-15", total: 2300, balance_due: 1300 },
  { invoice_number: "INV-00003", issue_date: "2026-09-20", due_date: "2026-10-20", total: 500, balance_due: 500 },
];
const payments = [
  { invoice_number: "INV-00001", amount: 1150, payment_date: "2026-08-20", reference: "EFT 1" },
  { invoice_number: "INV-00002", amount: 1000, payment_date: "2026-09-10" },
];

test("amount owing and past due", () => {
  assert.deepEqual(owing(invoices, "2026-09-28"), { total: 1800, overdue: 1300 });
  assert.deepEqual(owing([], "2026-09-28"), { total: 0, overdue: 0 });
});

test("statement runs in date order with a running balance", () => {
  const rows = statementRows(invoices, payments);
  assert.deepEqual(rows.map(r => r.balance), [1150, 0, 2300, 1300, 1800]);
  assert.equal(rows[1].what, "Payment – INV-00001 (EFT 1)");
});

test("the portal only shows the customer's own, finished records", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927120000_customer_portal.sql", import.meta.url), "utf8");
  assert.match(sql, /grant execute on function public\.get_client_portal\(text\) to anon, authenticated/);
  assert.match(sql, /revoke all on public\.client_portal_links from anon, authenticated/);
  assert.match(sql, /not in \('draft', 'cancelled', 'void'\)/);
  assert.match(sql, /q\.client_id = l\.client_id|client_id = l\.client_id and team_id = l\.team_id/);
  assert.doesNotMatch(sql.match(/get_client_portal[\s\S]*?end \$\$;/)[0], /cost_price|notes', c\./);
});
