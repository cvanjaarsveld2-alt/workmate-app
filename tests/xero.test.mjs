import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { authorizeUrl, isDuplicateNumber, readResult, toXeroInvoice } from "../supabase/functions/xero/xero.js";

test("an invoice with lines goes to Xero excluding VAT, with part numbers in the description", () => {
  const x = toXeroInvoice(
    {
      invoice_number: "INV-00012", issue_date: "2026-09-01", due_date: null, terms: 30, client: "Mine Co", email: "ap@mine.example", vat_number: "4999999999", vat_registered: true,
      line_items: JSON.stringify([{ part_number: "HF-100", description: "Hydraulic filter", qty: 2, unitPrice: 200 }, { description: "Labour (3 h)", qty: 3, unitPrice: 650 }]),
    },
    { accountCode: "200" },
  );
  assert.equal(x.Type, "ACCREC");
  assert.equal(x.Status, "AUTHORISED");
  assert.equal(x.DueDate, "2026-10-01");
  assert.equal(x.LineAmountTypes, "Exclusive");
  assert.deepEqual(x.Contact, { Name: "Mine Co", EmailAddress: "ap@mine.example", TaxNumber: "4999999999" });
  assert.deepEqual(x.LineItems[0], { Description: "HF-100 Hydraulic filter", Quantity: 2, UnitAmount: 200, AccountCode: "200" });
});

test("an invoice without lines is one line for the amount before VAT; no VAT for unregistered companies", () => {
  const a = toXeroInvoice({ invoice_number: "INV-1", issue_date: "2026-09-01", due_date: "2026-09-15", total: 1150, subtotal: 1000, notes: "Pump service\nextra", client: "A" });
  assert.deepEqual(a.LineItems, [{ Description: "Pump service", Quantity: 1, UnitAmount: 1000, AccountCode: "200" }]);
  const b = toXeroInvoice({ invoice_number: "INV-2", issue_date: "2026-09-01", total: 500, vat_registered: false, client: "B" });
  assert.equal(b.LineAmountTypes, "NoTax");
  assert.equal(b.LineItems[0].UnitAmount, 500);
});

test("reading Xero's answers", () => {
  assert.deepEqual(readResult({ InvoiceID: "abc" }), { xero_id: "abc" });
  assert.deepEqual(readResult({ HasErrors: true, ValidationErrors: [{ Message: "Invoice # must be unique." }] }), { error: "Invoice # must be unique." });
  assert.equal(isDuplicateNumber("Invoice # must be unique."), true);
  assert.deepEqual(readResult(undefined), { error: "No answer from Xero" });
});

test("sign-in address", () => {
  const u = new URL(authorizeUrl({ clientId: "CID", redirectUri: "https://db.example.com/functions/v1/xero", state: "s1" }));
  assert.equal(u.hostname, "login.xero.com");
  assert.equal(u.searchParams.get("redirect_uri"), "https://db.example.com/functions/v1/xero");
  assert.match(u.searchParams.get("scope"), /offline_access/);
});

test("tokens stay on the server and a synced invoice can't be unlinked by an old copy", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927150000_xero_sync.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on private\.xero_connections from public, anon, authenticated/);
  assert.match(sql, /new\.xero_invoice_id := coalesce\(new\.xero_invoice_id, old\.xero_invoice_id\)/);
  const sync = fs.readFileSync(new URL("../src/lib/sync.js", import.meta.url), "utf8");
  assert.match(sync, /invoices: new Set\(\["xero_invoice_id", "xero_synced_at"\]\)/);
  const fn = fs.readFileSync(new URL("../supabase/functions/xero/index.ts", import.meta.url), "utf8");
  assert.match(fn, /xero_can_sync/);
  assert.match(fn, /cron_secret_matches/);
});
