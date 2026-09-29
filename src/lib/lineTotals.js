// ─── Line and document totals ─────────────────────────────────────────────────
// How Sage and Xero work out a document: each line is qty × unit price, less
// its discount %, rounded to the cent; VAT is worked out per line at that
// line's rate (standard 15%, zero-rated or exempt 0%); the document's
// subtotal, VAT and total are the sums. Prices are entered including or
// excluding VAT for the whole document.
//
// The server does exactly the same (private.line_totals in
// supabase/migrations/20260929100000_financial_controls.sql) and is the
// authority for invoices and credit notes; this is for screens and PDFs.

// Line items as stored: an array, or JSON text (older quotes). Keeps every
// field (discounts, VAT codes, part numbers).
export function parseLines(raw) {
  let list = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  return Array.isArray(list) ? list.filter(l => l && typeof l === "object") : [];
}

export const VAT_CODES = {
  standard: { label: "15%", short: "S", rate: 0.15 },
  zero: { label: "Zero-rated (0%)", short: "Z", rate: 0 },
  exempt: { label: "Exempt", short: "E", rate: 0 },
};

const NUM = /^\s*-?\d+(\.\d+)?\s*$/;
// A number from a stored field, or the fallback for a blank or non-number
// (a blank quantity is 1, as on the server).
export const num = (v, fallback) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  return NUM.test(String(v ?? "")) ? Number(v) : fallback;
};

// Rounds half away from zero, like the database's round(x, 2).
export function round2(n) {
  const x = Number(n) || 0;
  return (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-7)) / 100;
}

export const vatCode = line => (line?.vat === "zero" || line?.vat === "exempt" ? line.vat : "standard");

export function lineAmounts(line, { vatInclusive = false, vatRegistered = true } = {}) {
  const qty = num(line?.qty ?? line?.quantity, 1);
  const price = num(line?.unitPrice ?? line?.unit_price ?? line?.price, 0);
  const discount = Math.min(Math.max(num(line?.discount, 0), 0), 100);
  const rate = vatRegistered ? VAT_CODES[vatCode(line)].rate : 0;
  const amount = round2(qty * price * (1 - discount / 100));
  const vat = vatInclusive ? round2((amount * rate) / (1 + rate)) : round2(amount * rate);
  const net = vatInclusive ? round2(amount - vat) : amount;
  return { qty, price, discount, rate, amount, net, vat, gross: round2(net + vat) };
}

export function lineTotals(lines = [], { vatInclusive = false, vatRegistered = true } = {}) {
  let subtotal = 0,
    vat = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const a = lineAmounts(line, { vatInclusive, vatRegistered });
    subtotal += a.net;
    vat += a.vat;
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  return { subtotal, vat, total: round2(subtotal + vat) };
}

// Lines that aren't all standard-rated, or carry a discount, need the extra
// columns on a PDF.
export const hasDiscounts = lines => (lines || []).some(l => num(l?.discount, 0) > 0);
export const hasMixedVat = lines => (lines || []).some(l => vatCode(l) !== "standard");
