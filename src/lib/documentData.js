// ─── Records → customer documents ─────────────────────────────────────────────
// Turns a saved quote or invoice (plus its client and the company profile)
// into the input for buildDocumentPDF. Pure functions, so they're unit-tested
// in tests/documentData.test.mjs.
import { addDays, chargesVat, documentTotals } from "./documentPDF.js";

export function parseItems(raw) {
  let list = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map(i => ({
      description: String(i?.description ?? i?.desc ?? "").trim(),
      qty: Number(i?.qty ?? i?.quantity ?? 1) || 0,
      unitPrice: Number(i?.unitPrice ?? i?.unit_price ?? i?.price ?? 0) || 0,
    }))
    .filter(i => i.description || i.unitPrice);
}

export function clientDetails(client, fallbackName = "") {
  const c = client || {};
  return {
    name: c.company || fallbackName || "",
    contact: c.contact || "",
    email: c.email || "",
    phone: c.phone || "",
    address: c.billing_address || [c.branch, c.location].filter(Boolean).join("\n"),
    vat: c.vat_number || "",
  };
}

const shortId = id => String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();

// Numbers phones give invoices before the server assigns the real one.
export const isTemporaryInvoiceNumber = n => !n || /^INV-\d{4}-\d{6,7}$/.test(String(n));

export function quoteToDocument(q, kind, { clients = [], profile = {}, today } = {}) {
  const date = (q.sent_date || q.created_at || today || new Date().toISOString()).slice(0, 10);
  let items = parseItems(q.line_items);
  if (!items.length) items = [{ description: q.description || "Quotation", qty: 1, unitPrice: Number(q.value) || 0 }];
  const number = q.quote_number || shortId(q.id);
  const client = clients.find(c => c.id === q.client_id);
  const validUntil = q.expiry_date || addDays(date, profile.quote_validity_days || 30);
  return {
    kind,
    number: kind === "proforma" ? `PF-${number}` : number,
    date: kind === "proforma" ? today || new Date().toISOString().slice(0, 10) : date,
    validUntil: kind === "quote" ? validUntil : undefined,
    dueDate: kind === "proforma" ? addDays(today, profile.payment_terms_days ?? 30) : undefined,
    reference: kind === "proforma" ? `Quote ${number}` : q.job_card_number ? `Job card ${q.job_card_number}` : "",
    client: clientDetails(client, q.client_name),
    items,
    vatInclusive: q.vat_inclusive !== false,
    // Line items already carry the detail; the description is the write-up.
    notes: parseItems(q.line_items).length ? q.description || "" : "",
  };
}

export function invoiceToDocument(inv, kind, { clients = [], quotes = [], profile = {}, today } = {}) {
  const quote = quotes.find(q => q.id === inv.quote_id);
  const total = Number(inv.total) || 0;
  // Use the invoice's own lines, else the quote's if they add up to the same
  // total, else one line for the invoiced amount — the PDF must match the books.
  let items = parseItems(inv.line_items),
    vatInclusive = false;
  if (!items.length && quote) {
    const qItems = parseItems(quote.line_items);
    const qIncl = quote.vat_inclusive !== false;
    const qTotal = documentTotals(qItems, { vatInclusive: qIncl, vatRegistered: chargesVat(profile) }).total;
    if (qItems.length && Math.abs(qTotal - total) < 0.02) {
      items = qItems;
      vatInclusive = qIncl;
    }
  }
  if (!items.length) {
    items = [
      {
        description: (inv.notes || quote?.description || "Services rendered").split("\n")[0].slice(0, 200),
        qty: 1,
        unitPrice: Number(inv.subtotal) || (chargesVat(profile) ? total / 1.15 : total),
      },
    ];
    vatInclusive = false;
  }
  const number = inv.invoice_number || shortId(inv.id);
  const issue = inv.issue_date || today || new Date().toISOString().slice(0, 10);
  return {
    kind,
    number: kind === "proforma" ? `PF-${number}` : number,
    date: issue,
    dueDate: inv.due_date || addDays(issue, profile.payment_terms_days ?? 30),
    reference: quote?.quote_number ? `Quote ${quote.quote_number}` : "",
    client: clientDetails(clients.find(c => c.id === inv.client_id), quote?.client_name),
    items,
    vatInclusive,
    amountPaid: kind === "invoice" ? Number(inv.amount_paid) || 0 : 0,
    notes: items.length > 1 || parseItems(inv.line_items).length ? inv.notes || "" : "",
    draft: kind === "invoice" && (inv.sync_status === "pending" || isTemporaryInvoiceNumber(inv.invoice_number)),
  };
}
