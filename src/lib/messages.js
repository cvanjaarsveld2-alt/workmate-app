// ─── WhatsApp & SMS to customers ──────────────────────────────────────────────
// The wording (the database's private.message_default() has the same
// defaults), filling it in, phone numbers, and sending:
//   WhatsApp — opens WhatsApp on this phone with the message ready (free);
//   SMS      — queued in customer_messages and sent by the platform
//              (supabase/functions/send-messages), within a monthly limit.
// Tests: tests/messages.test.mjs.
import { money } from "./documentPDF.js";

export const MESSAGE_KINDS = {
  booking: { label: "Booking confirmed", auto: true },
  on_my_way: { label: "On my way" },
  done: { label: "Job done", auto: true },
  invoice: { label: "Invoice / payment link" },
  quote: { label: "Quote" },
  service_due: { label: "Service due" },
};

export const DEFAULT_TEMPLATES = {
  booking: 'Hi {client}, {company} has booked your job "{job}" for {date}{time}. Reply to this message if that doesn\'t suit you.',
  on_my_way: "Hi {client}, {technician} from {company} is on the way to you now.",
  done: 'Hi {client}, {company} has finished the job "{job}". Thank you for your business.{link}',
  invoice: "Hi {client}, here is invoice {invoice} from {company} for {amount}. You can view and pay it here: {link}",
  quote: "Hi {client}, here is our quote {quote} for {amount}. You can view and accept it here: {link}",
  service_due: "Hi {client}, your {equipment} is due for its service. Reply to book a time with {company}.",
};

export function template(kind, profile = {}) {
  const custom = profile?.message_templates?.[kind];
  return (typeof custom === "string" && custom.trim()) || DEFAULT_TEMPLATES[kind] || "";
}

// Fills in {placeholders}; unknown or empty ones are dropped.
export function render(text, vars = {}) {
  return String(text || "")
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])))
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 1000);
}

const first = s => String(s || "").trim().split(/\s+/)[0] || "";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function niceDate(iso) {
  if (!iso) return "soon";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}
// Same as on invoices: "R 1 250.00".
const rand = money;

// The placeholders for a job / invoice / quote.
export function messageVars({ client = {}, profile = {}, job = null, invoice = null, quote = null, equipment = null, technician = "", link = "" } = {}) {
  return {
    client: first(client.contact) || client.company || "there",
    company: profile.trading_name || profile.legal_name || "",
    job: job ? job.title || job.job_number || "your job" : "",
    date: job ? niceDate(job.scheduled_date) : "",
    time: job?.scheduled_time ? ` at ${String(job.scheduled_time).slice(0, 5)}` : "",
    technician: first(technician || job?.assigned_to) || "our technician",
    invoice: invoice?.invoice_number || "",
    quote: quote?.quote_number || "",
    amount: invoice ? rand(invoice.balance_due ?? invoice.total) : quote ? rand(quote.value) : "",
    equipment: equipment ? [equipment.make, equipment.model || equipment.name].filter(Boolean).join(" ") || "machine" : "machine",
    link: link ? (invoice || quote ? link : ` ${link}`) : "",
  };
}

// South African numbers to international: 082 123 4567 → +27821234567.
export function internationalPhone(raw) {
  let p = String(raw || "").replace(/[^\d+]/g, "");
  if (/^00\d+$/.test(p)) p = "+" + p.slice(2);
  if (/^0\d{9}$/.test(p)) p = "+27" + p.slice(1);
  if (/^27\d{9}$/.test(p)) p = "+" + p;
  return /^\+\d{9,15}$/.test(p) ? p : null;
}

export const whatsappUrl = (phone, text) => `https://wa.me/${String(phone).replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;

// Opens WhatsApp and logs it. Returns an error message, or "".
export async function sendWhatsApp(supabase, { teamId, userId, phone, text, kind = "custom", clientId = null, jobId = null, invoiceId = null }) {
  const to = internationalPhone(phone);
  if (!to) return "No valid cellphone number for this customer.";
  window.open(whatsappUrl(to, text), "_blank", "noopener");
  if (teamId)
    await supabase
      .from("customer_messages")
      .insert({ team_id: teamId, user_id: userId, client_id: clientId, job_id: jobId, invoice_id: invoiceId, channel: "whatsapp", kind, to_phone: to, body: text, status: "opened" })
      .then(
        () => {},
        () => {},
      );
  return "";
}

// Queues an SMS; the platform sends it within a couple of minutes.
export async function sendSms(supabase, { teamId, userId, phone, text, kind = "custom", clientId = null, jobId = null, invoiceId = null }) {
  const to = internationalPhone(phone);
  if (!to) return { error: "No valid cellphone number for this customer." };
  const { data, error } = await supabase
    .from("customer_messages")
    .insert({ team_id: teamId, user_id: userId, client_id: clientId, job_id: jobId, invoice_id: invoiceId, channel: "sms", kind, to_phone: to, body: text, status: "queued" })
    .select("status, error")
    .single();
  if (error) return { error: error.message };
  if (data?.status === "skipped") return { error: data.error || "SMS couldn't be sent." };
  return { ok: true };
}
