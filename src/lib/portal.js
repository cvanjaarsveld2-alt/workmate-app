// ─── Customer portal ──────────────────────────────────────────────────────────
// One private link per client (/?portal=TOKEN): quotes, invoices, statement,
// jobs and machines, no sign-in. See supabase/migrations/*_customer_portal.sql.
import { money } from "./documentPDF.js";

export function portalTokenFromUrl() {
  try {
    const t = new URLSearchParams(window.location.search).get("portal") || "";
    return /^[0-9a-f]{48}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

// Shares the client's link (or copies it). Returns a message for the screen.
export async function shareClientPortal(supabase, client, { renew = false } = {}) {
  const { data: token, error } = await supabase.rpc("client_portal_link", { p_client_id: client.id, p_new: renew });
  if (error || !token) return error?.message || "Couldn't make the link.";
  const url = `${window.location.origin}/?portal=${token}`;
  const text = `Your account with us: quotes, invoices, statements and service history.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: client.company || "Your account", text, url });
      return "Portal link shared.";
    }
  } catch (e) {
    if (e?.name === "AbortError") return "";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "Portal link copied. Paste it in an email or WhatsApp.";
  } catch {
    return url;
  }
}

// Statement: every invoice and payment in date order with a running balance.
export function statementRows(invoices = [], payments = []) {
  const rows = [
    ...invoices.map(i => ({ date: i.issue_date || "", what: `Invoice ${i.invoice_number}`, debit: Number(i.total) || 0, credit: 0 })),
    ...payments.map(p => ({
      date: p.payment_date || "",
      what: `Payment${p.invoice_number ? ` – ${p.invoice_number}` : ""}${p.reference ? ` (${p.reference})` : ""}`,
      debit: 0,
      credit: Number(p.amount) || 0,
    })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)) || b.debit - a.debit);
  let balance = 0;
  return rows.map(r => {
    balance = Math.round((balance + r.debit - r.credit) * 100) / 100;
    return { ...r, balance };
  });
}

// Amount owing and how much of it is past its due date.
export function owing(invoices = [], today = new Date().toISOString().slice(0, 10)) {
  let total = 0,
    overdue = 0;
  for (const i of invoices) {
    const b = Number(i.balance_due ?? (Number(i.total) || 0) - (Number(i.amount_paid) || 0)) || 0;
    if (b <= 0 || i.status === "paid") continue;
    total += b;
    if (i.due_date && i.due_date < today) overdue += b;
  }
  return { total: Math.round(total * 100) / 100, overdue: Math.round(overdue * 100) / 100 };
}

export const fmtMoney = money;
