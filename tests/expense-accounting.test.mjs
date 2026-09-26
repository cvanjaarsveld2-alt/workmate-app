import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_META, expenseCsv, expenseLines, glFor } from "../src/lib/expenseAccounting.js";

const fuel = { id: "11111111-2222-3333-4444-555555555555", expense_date: "2026-09-10", vendor: "Engen Rustenburg", vat_number: "4123456789", category: "Fuel", amount: 1150, vat_amount: 150, currency: "ZAR", gr_code: "", gl_code: "", notes: "Bakkie\nfill-up", payment_method: "Card" };
const lunch = { id: "a", expense_date: "2026-09-11", vendor: "Spur", category: "Entertainment", amount: 460, vat_amount: 60, currency: "ZAR" };
const usd = { id: "b", expense_date: "2026-09-12", vendor: "Parts Inc", category: "Parts & Materials", amount: 100, vat_amount: 0, currency: "USD", amount_zar: 1800 };

test("ledger codes: the expense's own, else the company's, else the default", () => {
  assert.equal(glFor("Fuel"), CATEGORY_META.Fuel.gl);
  assert.equal(glFor("Fuel", { Fuel: "4100/000" }), "4100/000");
  assert.equal(glFor("Unknown category"), CATEGORY_META.Other.gl);
  const [l] = expenseLines([{ ...fuel, gl_code: "9999" }], { glCodes: { Fuel: "4100/000" } });
  assert.equal(l.ledger, "9999");
  assert.equal(expenseLines([fuel], { glCodes: { Fuel: "4100/000" } })[0].ledger, "4100/000");
});

test("VAT: claimed only where SARS allows and the company is VAT registered", () => {
  const [f, e, u] = expenseLines([fuel, lunch, usd]);
  assert.deepEqual([f.net, f.vat, f.gross, f.claim], [1000, 150, 1150, true]);
  assert.deepEqual([e.net, e.vat, e.gross, e.claim], [460, 0, 460, false]); // entertainment
  assert.deepEqual([u.gross, u.net, u.originalCurrency], [1800, 1800, "USD 100.00"]); // foreign, in rand
  const [n] = expenseLines([fuel], { vatRegistered: false });
  assert.deepEqual([n.net, n.vat], [1150, 0]);
  assert.equal(f.reference, "EXP-11111111");
  assert.equal(f.details, "Fuel – Bakkie fill-up");
});

test("Sage file: one purchase invoice per expense, SA dates, 15% or no VAT", () => {
  const csv = expenseCsv("sage", [fuel, lunch], {});
  const [head, a, b] = csv.split("\r\n");
  assert.equal(head, "Type,Reference,Date,Supplier Name,Supplier VAT Number,Ledger Account,Details,Net Amount,Tax Rate,Tax Amount,Total Amount");
  assert.equal(a, "Purchase Invoice,EXP-11111111,10/09/2026,Engen Rustenburg,4123456789,5200,Fuel – Bakkie fill-up,1000.00,Standard Rate (15%),150.00,1150.00");
  assert.match(b, /,No VAT,0\.00,460\.00$/);
});

test("Xero and QuickBooks files", () => {
  assert.match(expenseCsv("xero", [fuel], {}), /^\*ContactName,\*InvoiceNumber,\*InvoiceDate[\s\S]*Standard Rate Purchases,150\.00,ZAR$/);
  assert.match(expenseCsv("quickbooks", [lunch], {}), /Exempt,0\.00$/);
});

test("formula-looking text can't run in a spreadsheet", () => {
  assert.match(expenseCsv("sage", [{ ...fuel, vendor: "=cmd()" }], {}), /,'=cmd\(\),/);
});
