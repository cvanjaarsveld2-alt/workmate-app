// Invoice → Xero sales invoice, shared by the edge function (index.ts) and the
// unit tests (tests/xero.test.mjs). Invoice lines in the app are kept
// excluding VAT, so Xero gets them as "Exclusive" and applies the sales
// account's VAT rate; a company that isn't VAT registered sends "NoTax".

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
      qty: Number(i?.qty ?? i?.quantity ?? 1) || 0,
      price: Number(i?.unitPrice ?? i?.unit_price ?? i?.price ?? 0) || 0,
    }))
    .filter(l => l.description || l.price);
}

const addDays = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
};

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
    LineAmountTypes: inv.vat_registered === false ? "NoTax" : "Exclusive",
    Contact: {
      Name: String(inv.client || "Customer").slice(0, 255),
      ...(inv.email ? { EmailAddress: inv.email } : {}),
      ...(inv.vat_number ? { TaxNumber: inv.vat_number } : {}),
    },
    LineItems: items.map(l => ({
      Description: l.description.slice(0, 4000) || "Services",
      Quantity: l.qty,
      UnitAmount: r2(l.price),
      AccountCode: accountCode,
    })),
  };
}

// Xero's answer for one invoice → { xero_id } or { error }.
export function readResult(x) {
  if (!x) return { error: "No answer from Xero" };
  if (x.HasErrors || (x.ValidationErrors && x.ValidationErrors.length))
    return { error: (x.ValidationErrors || []).map(e => e.Message).join("; ") || "Rejected by Xero" };
  return x.InvoiceID ? { xero_id: x.InvoiceID } : { error: "No invoice ID from Xero" };
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
