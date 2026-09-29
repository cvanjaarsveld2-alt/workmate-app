// ─── Aged debtors ─────────────────────────────────────────────────────────────
// What each customer owes, by how long it's been due, as in Sage and Xero:
// Current (not yet due), 1–30, 31–60, 61–90 and over 90 days past the due
// date. Only approved invoices with something still owed count (not drafts
// or voided invoices).
import { addDays, daysBetween, todayISO } from "./dates.js";
import { isOpen } from "./invoiceState.js";
import { round2 as r2 } from "./lineTotals.js";
import { toCsv } from "./companyExport.js";

export const AGE_BUCKETS = [
  { key: "current", label: "Current" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "older", label: "90+ days" },
];

export function bucketFor(daysPastDue) {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "d30";
  if (daysPastDue <= 60) return "d60";
  if (daysPastDue <= 90) return "d90";
  return "older";
}

export function agedDebtors(invoices = [], { asAt, paymentTermsDays = 30, customerName = () => "" } = {}) {
  const today = asAt || todayISO();
  const byCustomer = new Map();
  const empty = () => Object.fromEntries(AGE_BUCKETS.map(b => [b.key, 0]));
  const totals = { ...empty(), total: 0 };
  for (const inv of invoices) {
    if (!isOpen(inv)) continue;
    const owed = r2(inv.balance_due);
    const due = inv.due_date || addDays(inv.issue_date || today, paymentTermsDays);
    const b = bucketFor(daysBetween(due, today));
    const name = customerName(inv) || "Unknown customer";
    const key = inv.client_id || `name:${name}`;
    if (!byCustomer.has(key)) byCustomer.set(key, { key, clientId: inv.client_id || null, name, ...empty(), total: 0, invoices: [] });
    const row = byCustomer.get(key);
    row[b] = r2(row[b] + owed);
    row.total = r2(row.total + owed);
    row.invoices.push({ id: inv.id, number: inv.invoice_number, due, owed, bucket: b });
    totals[b] = r2(totals[b] + owed);
    totals.total = r2(totals.total + owed);
  }
  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { asAt: today, rows, totals };
}

// The report as a CSV (through toCsv, which guards against spreadsheet
// formulas in customer names).
export function agedDebtorsCsv(report) {
  const row = r => ({ Customer: r.name, ...Object.fromEntries(AGE_BUCKETS.map(b => [b.label, r[b.key].toFixed(2)])), Total: r.total.toFixed(2) });
  return `Aged debtors as at ${report.asAt}\r\n` + toCsv([...report.rows.map(row), row({ name: "Total", ...report.totals })]);
}
