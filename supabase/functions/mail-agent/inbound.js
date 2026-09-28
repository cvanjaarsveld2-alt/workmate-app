// ─── Inbound email: pure helpers (tested in tests/inbound-email.test.mjs) ─────
// Reads the JSON an inbound-mail service posts for each email (Postmark's
// format; Postmark, Mailgun routes via a small adapter, or any service that
// posts the same shape) and works out which company it's for, which files are
// receipts or bills, and what the AI read from them.

// Same categories as the Expenses screen (src/lib/expenseAccounting.js).
export const CATEGORIES = [
  "Fuel", "Accommodation", "Subsistence (meals)", "Entertainment", "Tools & Equipment",
  "Parts & Materials", "Travel", "Tolls", "Office", "Other",
];
export const DOCUMENT_TYPES = ["receipt", "invoice", "statement", "quote", "credit_note", "other"];

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Logos and signature images in an email aren't receipts.
const MIN_INLINE_BYTES = 30 * 1024;

const TOKEN = /^[a-z0-9]{12}$/;
const TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
};
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXT_TYPES = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heic",
  docx: DOCX, doc: "application/msword", xlsx: XLSX, xls: "application/vnd.ms-excel", csv: "text/csv",
};
const IMAGE_EXTS = ["jpg", "png", "webp", "heic"];

const lower = s => String(s || "").trim().toLowerCase();

// "Acme Accounts <acc+ab12cd34ef56@in.example.com>" → "acc+ab12cd34ef56@in.example.com"
export function bareAddress(s) {
  const m = String(s || "").match(/<([^>]+)>/);
  return lower(m ? m[1] : s);
}

// Possible company tokens, most likely first: Postmark's MailboxHash (the part
// after "+"), then the local part of each recipient, or the part after its
// "+". Several, because someone's own address can look like a token.
export function findTokens(p = {}) {
  const hashes = [p.MailboxHash];
  const addresses = [
    p.OriginalRecipient,
    ...[p.ToFull, p.CcFull, p.BccFull].flatMap(list => (Array.isArray(list) ? list.map(x => x?.Email) : [])),
    ...String(p.To || "").split(","),
    ...String(p.Cc || "").split(","),
  ];
  for (const a of addresses) {
    const local = bareAddress(a).split("@")[0] || "";
    hashes.push(local, local.split("+").slice(1).join("+"));
  }
  const found = [];
  for (const h of hashes) {
    const t = lower(h);
    if (TOKEN.test(t) && !found.includes(t)) found.push(t);
  }
  return found.slice(0, 10);
}
export const findToken = p => findTokens(p)[0] || null;

export function sender(p = {}) {
  const email = bareAddress(p.FromFull?.Email || p.From);
  const name = String(p.FromFull?.Name || "").trim() || (String(p.From || "").match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? "").trim();
  return { email: email.includes("@") ? email : "", name };
}

export function fileKind(att = {}) {
  const type = lower(att.ContentType).split(";")[0];
  const ext = lower(att.Name).split(".").pop();
  // Excel sometimes labels .xlsx as the old type; the name decides.
  if (type === "application/vnd.ms-excel" && ext === "xlsx") return { ext: "xlsx", contentType: XLSX };
  if (TYPES[type]) return { ext: TYPES[type], contentType: type === "image/jpg" ? "image/jpeg" : type === "image/heif" ? "image/heic" : type };
  if (EXT_TYPES[ext]) return { ext: ext === "jpeg" ? "jpg" : ext === "heif" ? "heic" : ext, contentType: EXT_TYPES[ext] };
  return null;
}

// Bytes in a base64 string, without decoding it.
export const base64Bytes = b64 => {
  const s = String(b64 || "").replace(/\s/g, "");
  return Math.floor((s.length * 3) / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
};

// The attachments worth keeping: PDFs, photos, Word, Excel and CSV files; not
// tiny inline images, not too big, at most MAX_FILES. Returns { files, skipped }.
export function usableAttachments(p = {}) {
  const files = [];
  const skipped = [];
  for (const att of Array.isArray(p.Attachments) ? p.Attachments : []) {
    const kind = fileKind(att);
    const size = Number(att.ContentLength) || base64Bytes(att.Content);
    const name = String(att.Name || "attachment").slice(0, 200);
    if (!kind) { skipped.push({ name, why: "not a document, spreadsheet or photo" }); continue; }
    if (!att.Content) { skipped.push({ name, why: "empty" }); continue; }
    if (att.ContentID && IMAGE_EXTS.includes(kind.ext) && size < MIN_INLINE_BYTES) continue; // logo or signature
    if (size > MAX_FILE_BYTES) { skipped.push({ name, why: "larger than 10 MB" }); continue; }
    if (files.length >= MAX_FILES) { skipped.push({ name, why: `more than ${MAX_FILES} files in one email` }); continue; }
    files.push({ name, size, content: att.Content, ...kind });
  }
  return { files, skipped };
}

// The email's text (for receipts sent in the body, e.g. online orders).
export function bodyText(p = {}, max = 20000) {
  let t = String(p.TextBody || "").trim();
  if (!t && p.HtmlBody) {
    t = String(p.HtmlBody)
      .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"');
  }
  return t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

// An email with no files is only worth reading if it looks like it has an amount.
export const looksLikeReceipt = text => /(R|ZAR|\$|USD|€|EUR|£|GBP)\s?\d|\d[\d ,]*\.\d{2}\b|total|amount due|tax invoice/i.test(String(text || ""));

// Auto-replies ("out of office", bounces) are never receipts.
export function isAutoReply(p = {}) {
  const headers = Array.isArray(p.Headers) ? p.Headers : [];
  const h = name => lower(headers.find(x => lower(x?.Name) === name)?.Value);
  const auto = h("auto-submitted");
  if (auto && auto !== "no") return true;
  if (h("x-autoreply") || h("x-autorespond")) return true;
  if (/^(mailer-daemon|postmaster)@/.test(sender(p).email)) return true;
  return /^(out of office|automatic reply|auto(matic)?[- ]?reply|undeliverable|delivery status notification)/i.test(String(p.Subject || "").trim());
}

const num = v => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  // "1 234,50" and "1,234.50" both → 1234.50
  const norm = s.includes(".") ? s.replace(/,/g, "") : s.replace(/,(?=\d{2}$)/, ".").replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const isoDate = v => {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T12:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
};
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);

// What the AI said, checked and tidied. Never trusted as-is.
export function parseExtraction(raw) {
  let o = raw;
  if (typeof raw === "string") {
    const s = raw.replace(/```json\s*|```/g, "").trim();
    try { o = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); } catch { o = {}; }
  }
  if (!o || typeof o !== "object") o = {};
  const amount = num(o.amount);
  let vat = num(o.vat_amount);
  if (vat != null && (vat < 0 || (amount != null && vat > amount))) vat = null;
  const currency = /^[A-Z]{3}$/.test(String(o.currency || "").toUpperCase()) ? String(o.currency).toUpperCase() : "ZAR";
  return {
    document_type: DOCUMENT_TYPES.includes(o.document_type) ? o.document_type : "other",
    vendor: text(o.vendor),
    vat_number: text(o.vat_number, 30).replace(/[^\dA-Za-z]/g, ""),
    document_number: text(o.document_number, 60),
    amount: amount != null && amount > 0 ? amount : null,
    vat_amount: vat,
    currency,
    expense_date: isoDate(o.expense_date),
    due_date: isoDate(o.due_date),
    category: CATEGORIES.includes(o.category) ? o.category : "Other",
    // The Expenses screen's choices; a bill to pay or an EFT is "Account".
    payment_method: ["Card", "Cash"].includes(o.payment_method) && o.document_type !== "invoice" ? o.payment_method : o.document_type === "invoice" || o.payment_method === "EFT" || o.payment_method === "Account" ? "Account" : "Card",
    description: text(o.description, 300),
  };
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com",
  "yahoo.com", "yahoo.co.za", "webmail.co.za", "mweb.co.za", "telkomsa.net", "vodamail.co.za", "iafrica.com",
]);
const domain = email => lower(email).split("@")[1] || "";
const squash = s => lower(s).replace(/\b(pty|ltd|limited|cc|inc|\(pty\))\b/g, "").replace(/[^a-z0-9]/g, "");

// The supplier this came from: same email, else same company email domain,
// else the same name as the AI read.
export function matchSupplier(suppliers = [], { fromEmail = "", vendor = "" } = {}) {
  const list = (suppliers || []).filter(s => s && s.active !== false);
  const from = lower(fromEmail);
  const d = domain(from);
  return (
    (from && list.find(s => lower(s.email) === from)) ||
    (d && !FREE_MAIL.has(d) && list.find(s => domain(s.email) === d)) ||
    (squash(vendor).length >= 3 && list.find(s => squash(s.name) === squash(vendor))) ||
    null
  );
}

export function extractionPrompt() {
  return `You read receipts, till slips, tax invoices and supplier bills for a South African business.
Return ONLY JSON, no markdown:
{
  "document_type": one of ${DOCUMENT_TYPES.map(t => `"${t}"`).join(", ")} ("invoice" = a supplier's bill to pay, "receipt" = already paid),
  "vendor": the business that issued it,
  "vat_number": the issuer's VAT number (10 digits in South Africa, starting with 4) or "",
  "document_number": the invoice or receipt number or "",
  "amount": the final total including VAT, a plain number,
  "vat_amount": the VAT in it, a plain number, or 0 if none shown,
  "currency": 3-letter code (R = ZAR),
  "expense_date": the document date as YYYY-MM-DD or "",
  "due_date": when payment is due as YYYY-MM-DD or "",
  "category": one of ${CATEGORIES.map(c => `"${c}"`).join(", ")},
  "payment_method": one of "Card", "Cash", "Account" (EFT or on account),
  "description": a few words on what was bought
}
Use the grand total, not a subtotal. If several documents are shown, use the main one. Leave a field empty rather than guess.`;
}
