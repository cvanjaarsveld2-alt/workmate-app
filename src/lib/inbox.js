// ─── Receipts and bills emailed in (the Inbox on the Expenses screen) ────────
// Items arrive through the inbound-email Edge Function; see docs/EMAIL_INBOX.md.

// Slips emailed in can be PDFs; photos taken in the app are always images.
export const isPdfPath = path => /\.pdf(\?|$)/i.test(String(path || ""));

// The address shown to the company. VITE_INBOX_ADDRESS is the pattern for the
// platform's inbound mail, e.g. "{token}@in.example.co.za" or
// "abc123+{token}@inbound.postmarkapp.com". Empty when email-in isn't set up.
export function inboxAddress(token, pattern = import.meta.env?.VITE_INBOX_ADDRESS) {
  const p = String(pattern || "").trim();
  if (!token || !p.includes("{token}") || !p.includes("@")) return "";
  return p.replace("{token}", token);
}

// Still waiting to be dealt with.
export const OPEN_STATUSES = ["new", "ready", "failed"];

// An item the reader never finished (it's "new" for more than a few minutes)
// is typed in by hand like a failed one.
export function itemState(item, now = Date.now()) {
  if (item?.status !== "new") return item?.status || "failed";
  const age = now - new Date(item.received_at || item.created_at || now).getTime();
  return age > 5 * 60 * 1000 ? "failed" : "new";
}

export const DOCUMENT_LABELS = {
  receipt: "Receipt",
  invoice: "Supplier invoice",
  statement: "Statement",
  quote: "Quote",
  credit_note: "Credit note",
  other: "Document",
};

// The review form, filled from what was read.
export function reviewForm(item = {}) {
  const x = item.extracted || {};
  const receivedDate = String(item.received_at || "").slice(0, 10);
  return {
    vendor: x.vendor || item.from_name || "",
    vat_number: x.vat_number || "",
    amount: x.amount != null ? String(x.amount) : "",
    vat_amount: x.vat_amount != null && x.vat_amount !== 0 ? String(x.vat_amount) : "",
    currency: x.currency || "ZAR",
    expense_date: x.expense_date || receivedDate,
    category: x.category || "Other",
    payment_method: x.payment_method || (x.document_type === "invoice" ? "Account" : "Card"),
    notes: [x.document_number && `No. ${x.document_number}`, x.description, x.due_date && `Due ${x.due_date}`]
      .filter(Boolean)
      .join(" · "),
  };
}

const n2 = v => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

// Checks before sending to the server (which checks again).
export function reviewProblem(form) {
  const amount = n2(form.amount);
  if (!(amount > 0)) return "Enter the amount.";
  if (String(form.vat_amount || "").trim()) {
    const vat = n2(form.vat_amount);
    if (!(vat >= 0) || vat > amount) return "The VAT can't be more than the amount.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.expense_date || ""))) return "Enter the date on the slip.";
  return "";
}

// An expense already saved for the same amount within a day, from a similar
// name: probably the same slip twice (e.g. photographed and emailed).
export function possibleDuplicate(form, expenses = []) {
  const amount = n2(form.amount);
  const day = Date.parse(`${form.expense_date}T12:00:00Z`);
  if (!(amount > 0) || Number.isNaN(day)) return null;
  const name = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const v = name(form.vendor);
  return (
    (expenses || []).find(e => {
      if (Math.abs(n2(e.amount) - amount) >= 0.05) return false;
      const d = Date.parse(`${e.expense_date}T12:00:00Z`);
      if (Number.isNaN(d) || Math.abs(d - day) > 86400000) return false;
      const ev = name(e.vendor);
      return !v || !ev || ev.includes(v.slice(0, 5)) || v.includes(ev.slice(0, 5));
    }) || null
  );
}
