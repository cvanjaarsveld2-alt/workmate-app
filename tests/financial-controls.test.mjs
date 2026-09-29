import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lineAmounts, lineTotals, round2 } from "../src/lib/lineTotals.js";
import { agedDebtors, agedDebtorsCsv, bucketFor } from "../src/lib/agedDebtors.js";
import { creditNoteToDocument, invoiceToDocument } from "../src/lib/documentData.js";
import { documentTitle } from "../src/lib/documentPDF.js";

const sql = fs.readFileSync("supabase/migrations/20260929100000_financial_controls.sql", "utf8");
const quoteSql = fs.readFileSync("supabase/migrations/20260929110000_quote_controls.sql", "utf8");

test("per-line discount and VAT, like the server's private.line_totals", () => {
  const lines = [
    { description: "Pump", qty: "2", unitPrice: "1000", discount: "10" },
    { description: "Export freight", qty: 1, unitPrice: 500, vat: "zero" },
    { description: "Labour", qty: 3, unitPrice: 450 },
  ];
  // Same figures the database gave in its test run: 1800+500+1350 excl., VAT 270+0+202.50.
  assert.deepEqual(
    (({ subtotal, vat, total }) => ({ subtotal, vat, total }))(lineTotals(lines, { vatInclusive: false })),
    { subtotal: 3650, vat: 472.5, total: 4122.5 },
  );
  const incl = lineAmounts({ qty: 1, unitPrice: 1150 }, { vatInclusive: true });
  assert.equal(incl.vat, 150);
  assert.equal(incl.net, 1000);
  assert.equal(lineTotals(lines, { vatInclusive: false, vatRegistered: false }).vat, 0);
  // Rounds half away from zero, like Postgres round(x, 2).
  assert.equal(round2(0.125), 0.13);
  assert.equal(round2(-0.125), -0.13);
});

test("the server locks approved invoices and payments, and works out balances", () => {
  assert.match(sql, /Invoice % is approved, so it can''t be changed\. Issue a credit note, or void it and make a new one\./);
  assert.match(sql, /Invoice % is approved, so it can''t be deleted\. Void it or issue a credit note instead\./);
  assert.match(sql, /A payment can''t be deleted\. Reverse it instead\./);
  assert.match(sql, /A payment can''t be changed\. Reverse it and record the right one\./);
  assert.match(sql, /is more than the R % still owed on invoice/);
  // PayFast money already received is always recorded.
  assert.match(sql, /not like 'payfast:%'/);
  // Balance and status come from payments and credit notes, not from the phone.
  assert.match(sql, /new\.amount_paid := v_paid;\s+new\.amount_credited := v_credited;/);
  // Approving needs a customer and gets a due date from the payment terms.
  assert.match(sql, /Choose the customer before approving the invoice\./);
  assert.match(sql, /new\.due_date := coalesce\(new\.due_date, new\.issue_date \+ coalesce\(/);
  // Only master account/admins void, reverse and credit; deleting a company bypasses the locks.
  assert.match(sql, /private\.require_finance_manager\(i\.team_id\)/);
  assert.match(sql, /set_config\(''pm\.finance_bypass'', ''on'', true\)/);
  assert.match(sql, /credit_prefix text not null default 'CN-'/);
  assert.match(sql, /array\['credit_notes',/);
  // A one-person account (no company) gets a clear refusal, not a NOT NULL error.
  const solo = fs.readFileSync("supabase/migrations/20260929170000_credit_note_needs_company.sql", "utf8");
  assert.match(solo, /if i\.team_id is null then/);
  assert.match(solo, /Credit notes are numbered per company\./);
});

test("accepted quotes are locked; revisions and expiry", () => {
  assert.match(quoteSql, /has been accepted, so it can''t be changed\. Use Revise to make a new version\./);
  assert.match(quoteSql, /v_number := v_base \|\| '-R' \|\| v_rev;/);
  assert.match(quoteSql, /update public\.jobs set quote_id = v_id where quote_id = q\.id;/);
  assert.match(quoteSql, /cron\.schedule\('powermate-quote-expiry'/);
  assert.match(quoteSql, /update public\.quotes set invoiced_at = coalesce\(invoiced_at, now\(\)\)/);
});

test("aged debtors buckets by days past the due date", () => {
  assert.equal(bucketFor(0), "current");
  assert.equal(bucketFor(1), "d30");
  assert.equal(bucketFor(31), "d60");
  assert.equal(bucketFor(61), "d90");
  assert.equal(bucketFor(91), "older");
  const invoices = [
    { id: "a", client_id: "c1", status: "sent", balance_due: 1000, due_date: "2026-09-30", invoice_number: "INV-1" },
    { id: "b", client_id: "c1", status: "part_paid", balance_due: 500, due_date: "2026-08-15", invoice_number: "INV-2" },
    { id: "c", client_id: "c2", status: "sent", balance_due: 200, due_date: "2026-05-01", invoice_number: "INV-3" },
    { id: "d", client_id: "c2", status: "draft", balance_due: 999, due_date: "2026-01-01" },
    { id: "e", client_id: "c2", status: "cancelled", balance_due: 0, due_date: "2026-01-01" },
    { id: "f", client_id: "c3", status: "paid", balance_due: 0 },
  ];
  const r = agedDebtors(invoices, { asAt: "2026-09-29", customerName: i => ({ c1: "Mine Co", c2: "Quarry" })[i.client_id] });
  assert.equal(r.rows.length, 2);
  assert.deepEqual(
    (({ current, d30, d60, d90, older, total }) => ({ current, d30, d60, d90, older, total }))(r.totals),
    { current: 1000, d30: 0, d60: 500, d90: 0, older: 200, total: 1700 },
  );
  assert.equal(r.rows[0].name, "Mine Co");
  const csv = agedDebtorsCsv(r);
  assert.match(csv, /Mine Co,1000\.00,0\.00,500\.00,0\.00,0\.00,1500\.00/);
  assert.match(csv, /^Aged debtors as at 2026-09-29\r\nCustomer,Current,1–30 days/);
  // Customer names can't smuggle spreadsheet formulas into the CSV.
  const evil = agedDebtorsCsv(agedDebtors([{ ...invoices[0], client_id: "x" }], { asAt: "2026-09-29", customerName: () => "=HYPERLINK(1)" }));
  assert.match(evil, /'=HYPERLINK\(1\)/);
});

test("documents: draft and void marks, credited amounts, credit notes", () => {
  const inv = { id: "i1", invoice_number: "INV-00001", status: "draft", issue_date: "2026-09-29", total: 1150, line_items: [{ description: "X", qty: 1, unitPrice: 1000 }] };
  const d = invoiceToDocument(inv, "invoice", { profile: {} });
  assert.equal(d.draft, true);
  assert.equal(d.draftNote, "DRAFT · not yet approved");
  const v = invoiceToDocument({ ...inv, status: "cancelled" }, "invoice", { profile: {} });
  assert.equal(v.void, true);
  const c = invoiceToDocument({ ...inv, status: "part_paid", amount_paid: 500, amount_credited: 100 }, "invoice", { profile: {} });
  assert.equal(c.amountCredited, 100);
  const cn = creditNoteToDocument(
    { id: "n1", credit_number: "CN-00001", issue_date: "2026-09-29", reason: "Seal returned", line_items: [{ description: "Credit", qty: 1, unitPrice: 115 }], vat_inclusive: true },
    { invoice: inv },
  );
  assert.equal(cn.kind, "credit_note");
  assert.equal(cn.reference, "Invoice INV-00001");
  assert.equal(documentTitle("credit_note", { vat_no: "4123", vat_registered: true }), "TAX CREDIT NOTE");
});
