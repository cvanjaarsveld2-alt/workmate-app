// ─── Mail agent: the decisions (tested in tests/mail-agent.test.mjs) ─────────
// Mailbox messages arrive here in one shape (see the provider files), whatever
// mailbox they came from:
//   { id, from: { email, name }, to: [email], cc: [email], subject, date,
//     text, html, headers: [{ name, value }], attachments: [{ Name,
//     ContentType, ContentLength, ContentID, Content (base64, when fetched) }] }
//
// 1. prefilter: cheap checks, no AI. Personal and marketing mail stops here and
//    is never sent anywhere.
// 2. triagePrompt / parseTriage: one AI call sorts what's left into a kind and
//    reads the details.
// 3. decide: keep it for review, file it by itself (only when the company has
//    auto-filing on and the agent is sure), or drop it.
import { bodyText, isAutoReply, matchSupplier, parseExtraction, usableAttachments } from "./inbound.js";

export const KINDS = ["expense", "quote_request", "customer_email", "supplier_doc"];

// How many new messages one mailbox check reads at most (the rest wait for
// the next check, 5 minutes later).
export const MAX_MESSAGES_PER_RUN = 25;
// A newly connected mailbox starts with the last week of mail.
export const FIRST_RUN_DAYS = 7;

const lower = s => String(s || "").trim().toLowerCase();
const domainOf = email => lower(email).split("@")[1] || "";
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.co.za", "webmail.co.za", "mweb.co.za", "telkomsa.net", "vodamail.co.za", "iafrica.com", "msn.com",
]);
export const isFreeMail = email => FREE_MAIL.has(domainOf(email));

// Words that mark business mail worth a closer look.
const FINANCE = /\b(tax invoice|invoice|receipt|statement|pro ?forma|credit note|payment (due|reminder)|amount due|order confirmation|sales order|purchase order|delivery note|quotation|quote|rfq|request for (a )?(quote|quotation|pricing|price)|pricing|price list|order)\b/i;

const headerValue = (msg, name) => {
  const h = (msg.headers || []).find(x => lower(x?.name) === name);
  return h ? String(h.value || "") : "";
};

// The customer, contact, supplier and purchase order an email is about,
// from the company's own records.
export function matchRecords(msg, dir = {}) {
  const from = lower(msg.from?.email);
  const d = domainOf(from);
  const text = `${msg.subject || ""}\n${messageText(msg).slice(0, 5000)}`;
  const contact = (dir.contacts || []).find(c => from && lower(c.email) === from) || null;
  const client =
    (dir.clients || []).find(c => from && lower(c.email) === from) ||
    (contact?.client_id && (dir.clients || []).find(c => c.id === contact.client_id)) ||
    (d && !FREE_MAIL.has(d) && (dir.clients || []).find(c => domainOf(c.email) === d)) ||
    null;
  const supplier = matchSupplier(dir.suppliers || [], { fromEmail: from }) || null;
  const po =
    (dir.purchaseOrders || []).find(p => {
      const n = String(p.po_number || "").trim();
      return n.length >= 3 && new RegExp(`(^|[^A-Za-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(text);
    }) || null;
  return { client, contact, supplier, po };
}

export function messageText(msg) {
  return bodyText({ TextBody: msg.text, HtmlBody: msg.html });
}

// Step 1. Returns { relevant, reason, matches }.
export function prefilter(msg, dir = {}) {
  const from = lower(msg.from?.email);
  const own = (dir.ownEmails || []).map(lower);
  const matches = matchRecords(msg, dir);
  const no = reason => ({ relevant: false, reason, matches });
  if (!from) return no("no sender");
  if (isAutoReply({ From: from, Subject: msg.subject, Headers: msg.headers })) return no("automatic reply");
  if (/^(no-?reply|notifications?|calendar|mailer)@/.test(from) && !matches.supplier && !FINANCE.test(msg.subject || "")) return no("system notification");
  if (/text\/calendar/i.test(headerValue(msg, "content-type")) || /^(invitation|accepted|declined|updated invitation):/i.test(msg.subject || "")) return no("calendar invite");
  const known = !!(matches.client || matches.contact || matches.supplier);
  const subject = msg.subject || "";
  const text = messageText(msg).slice(0, 3000);
  const docs = (msg.attachments || []).filter(a => /pdf|image\/|word|excel|spreadsheet|csv/i.test(a.ContentType || "") || /\.(pdf|jpe?g|png|webp|heic|docx?|xlsx?|csv)$/i.test(a.Name || ""));
  const financeWords = FINANCE.test(subject) || FINANCE.test(text) || docs.some(a => FINANCE.test(a.Name || ""));
  // Newsletters and marketing: only if it's plainly a receipt or bill.
  if (headerValue(msg, "list-unsubscribe") && !known && !FINANCE.test(subject)) return no("newsletter");
  // Mail the person sent to themselves or among the company, without business words.
  if (own.includes(from) && !financeWords) return no("own mail");
  if (known) return { relevant: true, reason: "known sender", matches };
  if (matches.po) return { relevant: true, reason: "purchase order number", matches };
  if (financeWords) return { relevant: true, reason: "business words", matches };
  return no("not business mail");
}

// Step 2: the question for the AI.
export function triagePrompt({ companyName = "", matches = {}, kinds = KINDS } = {}) {
  const known = [
    matches.client && `The sender is a customer: ${matches.client.company}.`,
    matches.contact && !matches.client && `The sender is a known contact: ${matches.contact.name}.`,
    matches.supplier && `The sender is a supplier: ${matches.supplier.name}.`,
    matches.po && `It mentions purchase order ${matches.po.po_number}.`,
  ].filter(Boolean).join(" ");
  return `You sort a South African business's email. The business is "${companyName || "the company"}". ${known}
Decide what this email is and return ONLY JSON:
{
  "kind": one of ${[...kinds, "ignore"].map(k => `"${k}"`).join(", ")},
  "confidence": 0 to 1, how sure you are of the kind,
  "summary": one short line saying what it is,
  "expense": when kind is "expense": { "document_type": "receipt" or "invoice", "vendor", "vat_number", "document_number", "amount" (total incl. VAT), "vat_amount", "currency", "expense_date" (YYYY-MM-DD), "due_date", "category" (Fuel, Accommodation, Subsistence (meals), Entertainment, Tools & Equipment, Parts & Materials, Travel, Tolls, Office, Other), "payment_method" ("Card", "Cash" or "Account"), "description" },
  "quote_request": when kind is "quote_request": { "company", "contact_name", "phone", "what" (what they want, with quantities), "location", "needed_by" },
  "supplier_doc": when kind is "supplier_doc": { "doc_type": "quote", "order_confirmation" or "delivery_note", "po_number", "supplier_ref", "expected_date" (YYYY-MM-DD), "total" }
}
Kinds:
- "expense": a receipt or a bill that ${companyName || "the business"} paid or must pay (from a shop or supplier to the business).
- "quote_request": someone asking the business for a price or quotation for goods or work.
- "customer_email": other mail from a customer about their work, jobs, sites or orders.
- "supplier_doc": a supplier's quotation, order confirmation or delivery note for something the business is buying.
- "ignore": anything else: newsletters, marketing, personal mail, invoices the business itself sent to customers, notifications.
Use the grand total, not a subtotal. Leave a field empty rather than guess.`;
}

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
const text = (v, max = 300) => String(v ?? "").trim().slice(0, max);
// A real calendar date (30 February is refused, not rolled over into March).
const isoDate = v => {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : "";
};

// What the AI said, checked. Never trusted as-is.
export function parseTriage(raw, kinds = KINDS) {
  let o = raw;
  if (typeof raw === "string") {
    const s = raw.replace(/```json\s*|```/g, "").trim();
    try { o = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); } catch { o = {}; }
  }
  if (!o || typeof o !== "object") o = {};
  const kind = kinds.includes(o.kind) ? o.kind : "ignore";
  const out = { kind, confidence: clamp01(o.confidence), summary: text(o.summary, 200) };
  if (kind === "expense") out.expense = parseExtraction({ ...(o.expense || {}), document_type: o.expense?.document_type || "receipt" });
  if (kind === "quote_request") {
    const q = o.quote_request || {};
    out.quote_request = {
      company: text(q.company, 200), contact_name: text(q.contact_name, 200), phone: text(q.phone, 40),
      what: text(q.what, 1000), location: text(q.location, 200), needed_by: text(q.needed_by, 60),
    };
  }
  if (kind === "supplier_doc") {
    const s = o.supplier_doc || {};
    const total = Number(String(s.total ?? "").replace(/[^\d.-]/g, ""));
    out.supplier_doc = {
      doc_type: ["quote", "order_confirmation", "delivery_note"].includes(s.doc_type) ? s.doc_type : "other",
      po_number: text(s.po_number, 60), supplier_ref: text(s.supplier_ref, 60),
      expected_date: isoDate(s.expected_date), total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null,
    };
  }
  return out;
}

// Step 3. What to do with it: { keep, kind, auto: null | { action, fields } }.
// Filing by itself needs the company's say-so and a sure, matched item:
//   expense         from a known supplier, with a total, 90%+ sure
//   customer_email  from a known customer, 85%+ sure (a note on their timeline)
//   quote_request   95%+ sure (becomes a new lead)
//   supplier_doc    for a purchase order found in the email, 85%+ sure
export function decide(triage, matches = {}, { autoFile = false, kinds = KINDS } = {}) {
  const kind = triage?.kind;
  if (!kind || kind === "ignore" || !kinds.includes(kind)) return { keep: false, kind: "ignore", auto: null };
  const c = triage.confidence || 0;
  let auto = null;
  if (autoFile) {
    if (kind === "expense" && matches.supplier && triage.expense?.amount && c >= 0.9) {
      const x = triage.expense;
      auto = {
        action: "expense",
        fields: {
          vendor: x.vendor || matches.supplier.name, vat_number: x.vat_number, amount: x.amount,
          vat_amount: x.vat_amount ?? "", currency: x.currency, expense_date: x.expense_date,
          category: x.category, payment_method: x.payment_method,
          notes: [x.document_number && `No. ${x.document_number}`, x.description, x.due_date && `Due ${x.due_date}`].filter(Boolean).join(" · "),
        },
      };
      // Foreign-currency bills need a rand value a person checks.
      if (x.currency && x.currency !== "ZAR") auto = null;
    } else if (kind === "customer_email" && matches.client && c >= 0.85) {
      auto = { action: "customer_note", fields: { client_id: matches.client.id, summary: triage.summary } };
    } else if (kind === "quote_request" && c >= 0.95) {
      const q = triage.quote_request || {};
      auto = {
        action: "lead",
        fields: {
          title: q.what ? `Quote: ${q.what}`.slice(0, 200) : "",
          description: [q.what, q.location && `Site: ${q.location}`, q.needed_by && `Needed by ${q.needed_by}`, q.phone && `Phone ${q.phone}`]
            .filter(Boolean).join("\n"),
          company: q.company, contact_name: q.contact_name,
          client_id: matches.client?.id || "", contact_id: matches.contact?.id || "",
        },
      };
    } else if (kind === "supplier_doc" && matches.po && c >= 0.85) {
      const s = triage.supplier_doc || {};
      auto = {
        action: "purchase_order",
        fields: { purchase_order_id: matches.po.id, summary: triage.summary, supplier_ref: s.supplier_ref, expected_date: s.expected_date },
      };
    }
  }
  return { keep: true, kind, auto };
}

// When the AI can't be reached: a best guess from who sent it, so the email
// still reaches a person (null when that kind is switched off).
export function fallbackKind(matches = {}, kinds = KINDS) {
  const k = matches.po ? "supplier_doc" : matches.supplier ? "expense" : matches.client || matches.contact ? "customer_email" : "expense";
  return kinds.includes(k) ? k : null;
}

// The file worth keeping with the item (the bill, the quotation), if any: a
// PDF first, then a photo, then a Word, Excel or CSV file, then an old
// .doc/.xls (kept, but not read).
const FILE_PREFERENCE = ["pdf", "jpg", "png", "webp", "heic", "xlsx", "docx", "csv", "xls", "doc"];
export function mainAttachment(msg) {
  const { files } = usableAttachments({ Attachments: msg.attachments || [] });
  return [...files].sort((a, b) => FILE_PREFERENCE.indexOf(a.ext) - FILE_PREFERENCE.indexOf(b.ext))[0] || null;
}

// The row for the review inbox.
export function inboxRow({ msg, triage, matches, connection, file }) {
  const txt = messageText(msg);
  return {
    team_id: connection.team_id,
    message_id: String(msg.id).slice(0, 300),
    part: 0,
    kind: triage.kind,
    source: "mailbox",
    owner_user_id: connection.user_id,
    connection_id: connection.id,
    confidence: triage.confidence,
    from_email: lower(msg.from?.email) || null,
    from_name: text(msg.from?.name, 200) || null,
    subject: text(msg.subject, 300),
    body_excerpt: txt.slice(0, 4000) || null,
    received_at: msg.date && !Number.isNaN(Date.parse(msg.date)) ? new Date(msg.date).toISOString() : new Date().toISOString(),
    file_name: file?.name || null,
    content_type: file?.contentType || null,
    file_size: file?.size || null,
    status: triage.kind === "expense" && !triage.expense?.amount ? "failed" : "ready",
    error: triage.kind === "expense" && !triage.expense?.amount ? "No amount was found. Enter it from the email or file." : null,
    extracted: {
      ...(triage.expense || {}),
      summary: triage.summary,
      ...(triage.quote_request ? { quote_request: triage.quote_request } : {}),
      ...(triage.supplier_doc ? { supplier_doc: triage.supplier_doc } : {}),
    },
    supplier_id: matches.supplier?.id || null,
    client_id: matches.client?.id || null,
    contact_id: matches.contact?.id || null,
    purchase_order_id: matches.po?.id || null,
  };
}
