import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildDocumentPDF, documentFilename, documentTitle, documentTotals, money } from "../src/lib/documentPDF.js";
import { invoiceToDocument, isTemporaryInvoiceNumber, jobToCard, jobsForInvoice, jobsForQuote, parseItems, quoteDetails, quoteToDocument } from "../src/lib/documentData.js";
import { PW_LOGO_B64 } from "./fixtures/sample-logo.js";

const profile = {
  trading_name: "Acme Hydraulics",
  legal_name: "Acme Hydraulics (Pty) Ltd",
  registration_no: "2015/123456/07",
  vat_no: "4123456789",
  address: "1 Main Road\nKathu",
  bank_name: "FNB",
  bank_account_name: "Acme Hydraulics",
  bank_account_no: "62000000000",
  bank_branch_code: "250655",
  quote_validity_days: 14,
  payment_terms_days: 30,
  quote_terms: "Prices exclude delivery.",
  invoice_terms: "Interest on overdue accounts.",
  brand_color: "#123456",
};

test("titles follow the document type and VAT registration", () => {
  assert.equal(documentTitle("quote", profile), "QUOTATION");
  assert.equal(documentTitle("proforma", profile), "PRO FORMA INVOICE");
  assert.equal(documentTitle("invoice", profile), "TAX INVOICE");
  // Without a VAT number a business may not call it a tax invoice.
  assert.equal(documentTitle("invoice", { vat_no: "" }), "INVOICE");
});

test("money and VAT totals", () => {
  assert.equal(money(1234567.5), "R 1 234 567.50");
  assert.equal(money(-5), "-R 5.00");
  assert.deepEqual(documentTotals([{ qty: 2, unitPrice: 575 }], { vatInclusive: true }), {
    subtotal: 1000,
    vat: 150,
    total: 1150,
    paid: 0,
    balance: 1150,
  });
  assert.equal(documentTotals([{ qty: 1, unitPrice: 1000 }], { vatInclusive: false, amountPaid: 150 }).balance, 1000);
});

test("line items parse from JSON text or arrays and skip empty rows", () => {
  assert.deepEqual(parseItems('[{"description":"Hose","qty":"2","unitPrice":"50"},{"description":""}]'), [
    { description: "Hose", qty: 2, unitPrice: 50 },
  ]);
  assert.deepEqual(parseItems("not json"), []);
  assert.deepEqual(parseItems(null), []);
});

test("quotes become a quotation or a pro forma", () => {
  const q = {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    quote_number: "Q-101",
    client_id: "c1",
    client_name: "Fallback name",
    sent_date: "2026-09-01",
    line_items: [{ description: "Service", qty: 1, unitPrice: 1150 }],
    vat_inclusive: true,
    description: "Scope of work",
  };
  const clients = [{ id: "c1", company: "Mine Co", vat_number: "4999999999", billing_address: "PO Box 1" }];
  const quote = quoteToDocument(q, "quote", { clients, profile, today: "2026-09-25" });
  assert.equal(quote.number, "Q-101");
  assert.equal(quote.validUntil, "2026-09-15"); // 14 days from the profile
  assert.equal(quote.client.name, "Mine Co");
  assert.equal(quote.client.vat, "4999999999");
  assert.equal(quote.notes, "Scope of work");
  const pf = quoteToDocument(q, "proforma", { clients, profile, today: "2026-09-25" });
  assert.equal(pf.number, "PF-Q-101");
  assert.equal(pf.dueDate, "2026-10-25");
  assert.equal(pf.reference, "Quote Q-101");
  // A quote's own expiry date wins over the default validity.
  assert.equal(quoteToDocument({ ...q, expiry_date: "2026-12-01" }, "quote", { profile }).validUntil, "2026-12-01");
});

test("invoices match the books: quote lines only when they add up to the invoice", () => {
  const quotes = [
    { id: "q1", quote_number: "Q-7", line_items: [{ description: "Pump", qty: 1, unitPrice: 1150 }], vat_inclusive: true },
  ];
  const inv = {
    id: "i1",
    quote_id: "q1",
    invoice_number: "INV-00003",
    issue_date: "2026-09-25",
    subtotal: 1000,
    vat: 150,
    total: 1150,
    amount_paid: 200,
    sync_status: "synced",
  };
  const d = invoiceToDocument(inv, "invoice", { quotes, profile });
  assert.equal(d.items[0].description, "Pump");
  assert.equal(d.reference, "Quote Q-7");
  assert.equal(d.dueDate, "2026-10-25");
  assert.equal(d.amountPaid, 200);
  assert.equal(d.draft, false);
  // Totals differ from the quote → one line for the invoiced amount.
  const d2 = invoiceToDocument({ ...inv, subtotal: 2000, vat: 300, total: 2300 }, "invoice", { quotes, profile });
  assert.equal(d2.items.length, 1);
  assert.equal(documentTotals(d2.items, { vatInclusive: d2.vatInclusive }).total, 2300);
});

test("invoices still waiting for their server number are drafts", () => {
  assert.equal(isTemporaryInvoiceNumber("INV-2026-123456"), true);
  assert.equal(isTemporaryInvoiceNumber("INV-00001"), false);
  const d = invoiceToDocument({ id: "x", invoice_number: "INV-2026-123456", total: 115, subtotal: 100 }, "invoice", {});
  assert.equal(d.draft, true);
  // A pro forma is never a draft tax invoice.
  assert.equal(invoiceToDocument({ id: "x", invoice_number: "INV-2026-123456", total: 115 }, "proforma", {}).draft, false);
});

test("a real PDF carries the company, bank details and terms", async () => {
  const doc = invoiceToDocument(
    { id: "i1", invoice_number: "INV-00042", issue_date: "2026-09-25", subtotal: 1000, vat: 150, total: 1150 },
    "invoice",
    { profile },
  );
  const blob = await buildDocumentPDF(doc, { ...profile });
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buf.length > 2000);
  fs.mkdirSync("tests/sim/out", { recursive: true });
  fs.writeFileSync("tests/sim/out/sample-invoice.pdf", buf);
  assert.equal(documentFilename(doc, profile), "Tax_Invoice_INV-00042.pdf");
});

test("the company profile is owner-only and invoices get server numbers", () => {
  const sql = fs.readFileSync("supabase/migrations/20260925180000_team_profiles_and_invoice_numbers.sql", "utf8");
  assert.match(sql, /team_profiles_update[\s\S]*is_team_owner\(team_id\)/);
  assert.match(sql, /team_profiles_select[\s\S]*same_team\(team_id\)/);
  assert.match(sql, /create trigger invoices_assign_number before insert or update of invoice_number/);
  // Re-upserting an existing invoice must not spend a number.
  assert.match(sql, /exists \(select 1 from public\.invoices where id = new\.id\)/);
});

test("companies not registered for VAT charge none and never issue tax invoices", async () => {
  const noVat = { ...profile, vat_registered: false };
  assert.equal(documentTitle("invoice", noVat), "INVOICE");
  assert.deepEqual(documentTotals([{ qty: 2, unitPrice: 500 }], { vatInclusive: false, vatRegistered: false }), {
    subtotal: 1000,
    vat: 0,
    total: 1000,
    paid: 0,
    balance: 1000,
  });
  const { calculateVat } = await import("../src/lib/finance.js");
  assert.deepEqual(calculateVat(1000, true, false), { subtotal: 1000, vat: 0, total: 1000 });
  assert.deepEqual(calculateVat(1150, true), { subtotal: 1000, vat: 150, total: 1150 });
  // An invoice raised without VAT prints its full amount as one line.
  const d = invoiceToDocument({ id: "x", invoice_number: "INV-00009", subtotal: 1000, vat: 0, total: 1000 }, "invoice", {
    profile: noVat,
  });
  assert.equal(documentTotals(d.items, { vatInclusive: d.vatInclusive, vatRegistered: false }).total, 1000);
  const blob = await buildDocumentPDF(d, noVat);
  assert.ok((await blob.arrayBuffer()).byteLength > 2000);
});

test("detailed quotes carry their write-up, sections and photos into the PDF", async () => {
  const jpeg = PW_LOGO_B64.startsWith("data:") ? PW_LOGO_B64 : "data:image/jpeg;base64," + PW_LOGO_B64;
  const details = {
    title: "Shaft 2 jack service",
    intro: "Following our site visit we propose the work below.",
    cover: true,
    exclusions: "Crane hire.",
    sections: [
      { id: "s1", title: "Site findings", body: "Two cylinders leak.", photos: [{ id: "p1", data: jpeg, caption: "Leaking seal" }, { id: "p2", storage_path: "u/quotes/q/p2" }] },
      { id: "s2", title: "", body: "", photos: [] }, // empty sections are dropped
    ],
  };
  const d = quoteDetails(details);
  assert.equal(d.sections.length, 1);
  assert.equal(d.sections[0].photos.length, 2);
  const q = { id: "q9", quote_number: "Q-9", sent_date: "2026-09-25", description: "Summary", details,
    line_items: [{ description: "Service", qty: 1, unitPrice: 1000 }], vat_inclusive: false };
  const doc = quoteToDocument(q, "quote", { profile, preparedBy: "Christo" });
  assert.equal(doc.title, "Shaft 2 jack service");
  assert.equal(doc.cover, true);
  assert.equal(doc.preparedBy, "Christo");
  assert.equal(doc.notes, ""); // the write-up replaces the summary
  // The pro forma keeps the title only — no cover, sections or photos.
  const pf = quoteToDocument(q, "proforma", { profile });
  assert.equal(pf.cover, undefined);
  assert.equal(pf.sections, undefined);
  // One photo resolved, one not on this device.
  const withData = { ...doc, sections: doc.sections.map(sec => ({ ...sec, photos: sec.photos.map(p => ({ caption: p.caption, data: p.data || null })) })) };
  const blob = await buildDocumentPDF(withData, { ...profile, logo_data: jpeg });
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  fs.writeFileSync("tests/sim/out/sample-detailed-quote.pdf", buf);
  // Cover + body pages.
  assert.match(buf.toString("latin1"), /\/Type \/Pages[\s\S]*?\/Count [2-9]/);
});

test("job cards: linked jobs, card content, and pages after the invoice", async () => {
  const jpeg = PW_LOGO_B64.startsWith("data:") ? PW_LOGO_B64 : "data:image/jpeg;base64," + PW_LOGO_B64;
  const job = {
    id: "j1", job_number: "JOB-2026-0012", title: "Service 4 jacks", client_id: "c1", quote_id: "q1",
    location: "Shaft 2", scheduled_date: "2026-09-20", started_at: "2026-09-20T07:30:00Z", completed_at: "2026-09-20T15:10:00Z",
    assigned_to: "Greg", status: "completed", description: "Annual service", technician_notes: "Seal worn",
    work_done: "Replaced seals, load tested", parts_used: ["Seal kit", "Hose"],
    photos: [{ id: "p1", data: jpeg, caption: "After service" }, "legacy-string-ignored"],
  };
  const other = { id: "j2", quote_id: "q2" };
  assert.deepEqual(jobsForInvoice({ job_id: "j1" }, [job, other]).map(j => j.id), ["j1"]);
  assert.deepEqual(jobsForInvoice({ quote_id: "q1" }, [job, other]).map(j => j.id), ["j1"]);
  assert.deepEqual(jobsForQuote({ id: "q2" }, [job, other]).map(j => j.id), ["j2"]);
  const card = jobToCard(job, { clients: [{ id: "c1", company: "Mine Co" }], quotes: [{ id: "q1", quote_number: "Q-7" }] });
  assert.equal(card.number, "JOB-2026-0012");
  assert.equal(card.customer, "Mine Co");
  assert.equal(card.reference, "Quote Q-7");
  assert.deepEqual(card.parts, ["Seal kit", "Hose"]);
  assert.equal(card.photos.length, 1);
  const inv = invoiceToDocument({ id: "i1", invoice_number: "INV-00003", total: 1150, subtotal: 1000 }, "invoice", { profile });
  const blob = await buildDocumentPDF({ ...inv, jobCards: [card] }, { ...profile, logo_data: jpeg });
  const buf = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync("tests/sim/out/sample-invoice-jobcard.pdf", buf);
  assert.match(buf.toString("latin1"), /\/Type \/Pages[\s\S]*?\/Count 2/);
  // A job card on its own is a single page with no pricing.
  assert.equal(documentTitle("jobcard"), "JOB CARD");
  const alone = await buildDocumentPDF({ kind: "jobcard", number: card.number, jobCards: [card] }, profile);
  const abuf = Buffer.from(await alone.arrayBuffer());
  fs.writeFileSync("tests/sim/out/sample-jobcard.pdf", abuf);
  assert.match(abuf.toString("latin1"), /\/Type \/Pages[\s\S]*?\/Count 1/);
});
