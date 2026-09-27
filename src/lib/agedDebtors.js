// ─── Aged debtors ─────────────────────────────────────────────────────────────
// What each customer owes, by how long it's been due, as in Sage and Xero:
// Current (not yet due), 1–30, 31–60, 61–90 and over 90 days past the due
// date. Only approved invoices with something still owed count (not drafts
// or voided invoices).
import { addDays } from "./documentPDF.js";

export const AGE_BUCKETS = [
  { key: "current", label: "Current" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "older", label: "90+ days" },
];

const daysBetween = (fromIso, toIso) =>
  Math.round((new Date(toIso + "T12:00:00") - new Date(String(fromIso).slice(0, 10) + "T12:00:00")) / 86400000);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export function bucketFor(daysPastDue) {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "d30";
  if (daysPastDue <= 60) return "d60";
  if (daysPastDue <= 90) return "d90";
  return "older";
}

export function agedDebtors(invoices = [], { asAt, paymentTermsDays = 30, customerName = () => "" } = {}) {
  const today = asAt || new Date().toISOString().slice(0, 10);
  const byCustomer = new Map();
  const empty = () => Object.fromEntries(AGE_BUCKETS.map(b => [b.key, 0]));
  const totals = { ...empty(), total: 0 };
  for (const inv of invoices) {
    if (!inv || ["draft", "cancelled"].includes(inv.status)) continue;
    const owed = r2(inv.balance_due);
    if (owed <= 0) continue;
    const due = inv.due_date || addDays(inv.issue_date || today, paymentTermsDays);
    const b = bucketFor(daysBetween(due, today));
    const key = inv.client_id || `name:${customerName(inv) || "Unknown customer"}`;
    if (!byCustomer.has(key))
      byCustomer.set(key, { key, clientId: inv.client_id || null, name: customerName(inv) || "Unknown customer", ...empty(), total: 0, invoices: [] });
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

export function agedDebtorsCsv(report) {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Customer", ...AGE_BUCKETS.map(b => b.label), "Total"];
  const line = r => [q(r.name), ...AGE_BUCKETS.map(b => r[b.key].toFixed(2)), r.total.toFixed(2)].join(",");
  return [
    `${q("Aged debtors as at " + report.asAt)}`,
    head.map(q).join(","),
    ...report.rows.map(line),
    line({ name: "Total", ...report.totals }),
  ].join("\r\n");
}
