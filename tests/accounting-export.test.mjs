import test from "node:test";
import assert from "node:assert/strict";
import { accountingCsv, invoiceLines } from "../src/lib/accountingExport.js";

const clients = [{ id: "c1", company: "Mine Co", email: "ap@mine.co.za" }];
const quotes = [{ id: "q1", quote_number: "Q-7", line_items: [{ description: "Pump", qty: 2, unitPrice: 575 }], vat_inclusive: true }];
const inv = { id: "i1", client_id: "c1", quote_id: "q1", invoice_number: "INV-00003", issue_date: "2026-09-25", subtotal: 1000, vat: 150, total: 1150 };
const profile = { vat_no: "4123456789", payment_terms_days: 30 };

test("lines match the invoice: amounts exclusive of VAT, VAT per line", () => {
  const [l] = invoiceLines([inv], { clients, quotes, profile });
  assert.equal(l.customer, "Mine Co");
  assert.equal(l.qty, 2);
  assert.equal(l.unitEx, 500);
  assert.equal(l.lineEx, 1000);
  assert.equal(l.vat, 150);
  assert.equal(l.total, 1150);
  assert.equal(l.due, "2026-10-25");
});

test("Xero, Sage and QuickBooks CSVs carry the right columns and SA date format", () => {
  const xero = accountingCsv("xero", [inv], { clients, quotes, profile });
  assert.match(xero.split("\r\n")[0], /^\*ContactName,EmailAddress,\*InvoiceNumber/);
  assert.match(xero, /Mine Co,ap@mine\.co\.za,INV-00003,Quote Q-7,25\/09\/2026,25\/10\/2026,Pump,2,500,200,Standard Rate Sales,150,ZAR/);
  assert.match(accountingCsv("sage", [inv], { clients, quotes, profile }), /Standard Rate \(15%\),150,1150/);
  assert.match(accountingCsv("quickbooks", [inv], { clients, quotes, profile }), /INV-00003,Mine Co,25\/09\/2026,25\/10\/2026,Quote Q-7,Pump,2,500,1000,15\.0% S/);
});

test("a company that isn't VAT registered exports with no VAT", () => {
  const plain = { ...inv, subtotal: 1150, vat: 0, total: 1150, quote_id: null };
  const [l] = invoiceLines([plain], { clients, profile: { vat_registered: false } });
  assert.equal(l.vat, 0);
  assert.equal(l.total, 1150);
  assert.match(accountingCsv("xero", [plain], { clients, profile: { vat_registered: false } }), /No VAT/);
});
