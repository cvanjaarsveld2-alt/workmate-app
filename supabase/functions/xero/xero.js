// Invoice → Xero sales invoice, shared by the edge function (index.ts) and the
// unit tests (tests/xero.test.mjs). Line prices go as the invoice has them
// ("Exclusive" or "Inclusive" of VAT); standard-rated lines use the sales
// account's VAT rate, zero-rated and exempt lines say so, and each line's
// discount goes as Xero's DiscountRate. A company that isn't VAT registered
// sends "NoTax".

// Xero's South African tax types for sales that aren't standard-rated.
const TAX_TYPES = { zero: "ZERORATEDOUTPUT", exempt: "EXEMPTOUTPUT" };

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

function lines(raw) {
  let list = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  return (Array.isArray(list) ? list : [])
    .map(i => ({
      description: [String(i?.part_number ?? i?.code ?? "").trim(), String(i?.description ?? "").trim()].filter(Boolean).join(" "),
      // A blank quantity counts as 1, as in the app and on the server.
      qty: /^\s*-?\d+(\.\d+)?\s*$/.test(String(i?.qty ?? i?.quantity ?? "")) ? Number(i?.qty ?? i?.quantity) : 1,
      price: Number(i?.unitPrice ?? i?.unit_price ?? i?.price ?? 0) || 0,
      discount: Math.min(Math.max(Number(i?.discount) || 0, 0), 100),
      vat: i?.vat === "zero" || i?.vat === "exempt" ? i.vat : "standard",
    }))
    .filter(l => l.description || l.price);
}

const addDays = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
};

// Line amounts as the document has them; the VAT type for lines that aren't
// standard-rated.
const lineAmountTypes = doc => (doc.vat_registered === false ? "NoTax" : doc.vat_inclusive === true ? "Inclusive" : "Exclusive");
const xeroLines = (items, doc, accountCode) =>
  items.map(l => ({
    Description: l.description.slice(0, 4000) || "Services",
    Quantity: l.qty,
    UnitAmount: r2(l.price),
    AccountCode: accountCode,
    ...(l.discount > 0 ? { DiscountRate: l.discount } : {}),
    ...(doc.vat_registered !== false && TAX_TYPES[l.vat] ? { TaxType: TAX_TYPES[l.vat] } : {}),
  }));
const contact = doc => ({
  Name: String(doc.client || "Customer").slice(0, 255),
  ...(doc.email ? { EmailAddress: doc.email } : {}),
  ...(doc.vat_number ? { TaxNumber: doc.vat_number } : {}),
});

export function toXeroInvoice(inv, { accountCode = "200" } = {}) {
  let items = lines(inv.line_items);
  if (!items.length)
    items = [{ description: String(inv.notes || "").split("\n")[0].slice(0, 200) || "Services", qty: 1, price: Number(inv.subtotal) || (inv.vat_registered === false ? Number(inv.total) : r2(Number(inv.total) / 1.15)) }];
  const date = String(inv.issue_date || new Date().toISOString()).slice(0, 10);
  return {
    Type: "ACCREC",
    Status: "AUTHORISED",
    InvoiceNumber: inv.invoice_number,
    Date: date,
    DueDate: inv.due_date || addDays(date, inv.terms ?? 30),
    LineAmountTypes: lineAmountTypes(inv),
    Contact: contact(inv),
    LineItems: xeroLines(items, inv, accountCode),
  };
}

// A credit note made in the app → Xero sales credit note (allocated to its
// invoice by the edge function once created).
export function toXeroCreditNote(cn, { accountCode = "200" } = {}) {
  const items = lines(cn.line_items);
  return {
    Type: "ACCRECCREDIT",
    Status: "AUTHORISED",
    CreditNoteNumber: cn.credit_number,
    Reference: [cn.invoice_number, cn.reason].filter(Boolean).join(" · ").slice(0, 255),
    Date: String(cn.issue_date || new Date().toISOString()).slice(0, 10),
    LineAmountTypes: lineAmountTypes(cn),
    Contact: contact(cn),
    LineItems: xeroLines(items.length ? items : [{ description: cn.reason || "Credit", qty: 1, price: Number(cn.total) || 0, discount: 0, vat: "standard" }], cn, accountCode),
  };
}

// Xero's answer for one invoice (or credit note) → { xero_id } or { error }.
export function readResult(x, idKey = "InvoiceID") {
  if (!x) return { error: "No answer from Xero" };
  if (x.HasErrors || (x.ValidationErrors && x.ValidationErrors.length))
    return { error: (x.ValidationErrors || []).map(e => e.Message).join("; ") || "Rejected by Xero" };
  return x[idKey] ? { xero_id: x[idKey] } : { error: "No ID from Xero" };
}

export const isDuplicateNumber = msg => /must be unique/i.test(String(msg || ""));

// Newer Xero apps may use finer-grained scopes; XERO_SCOPES overrides these.
export const DEFAULT_SCOPES = "openid profile email offline_access accounting.transactions accounting.contacts";

export function authorizeUrl({ clientId, redirectUri, state, scopes = DEFAULT_SCOPES }) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });
  return `https://login.xero.com/identity/connect/authorize?${q}`;
}
