// ─── Payment reminders to customers ───────────────────────────────────────────
// The wording for an overdue-invoice reminder, used by "Remind customer" on
// the Invoices screen (and matched by the customer-reminders emails).

import { daysBetween, todayISO } from "./dates.js";
import { isOpen } from "./invoiceState.js";

const rand = n => `R ${(Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function daysOverdue(inv, today = todayISO()) {
  if (!inv?.due_date || inv.due_date >= today) return 0;
  return daysBetween(inv.due_date, today);
}

// Only an approved invoice with something still owed can be overdue (not a
// draft, a voided one, or one settled by payments or credit notes).
export function isOverdue(inv, today) {
  const owed = Number(inv?.balance_due ?? inv?.total) || 0;
  return owed > 0 && (!inv?.status || isOpen({ ...inv, balance_due: owed })) && daysOverdue(inv, today) > 0;
}

export function reminderMessage({ contact, company, invoice, url, today }) {
  const days = daysOverdue(invoice, today);
  const lines = [
    `Hi ${contact || "there"},`,
    "",
    `A friendly reminder that invoice ${invoice.invoice_number} for ${rand(invoice.balance_due ?? invoice.total)} was due on ${invoice.due_date}${days ? ` (${days} day${days === 1 ? "" : "s"} ago)` : ""}.`,
    url ? `You can see the invoice, your statement and how to pay here: ${url}` : "",
    "If you've already paid, please ignore this and thank you.",
    "",
    `Kind regards,`,
    company || "",
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n").trim();
}
