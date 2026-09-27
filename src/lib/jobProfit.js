// ─── Job profit ───────────────────────────────────────────────────────────────
// What each job earned against what it cost. The database adds up the raw
// numbers per job (job_costs(): invoices, quote, time, parts, purchase orders,
// expenses); this works out labour cost, profit and margin, and groups them.
// All amounts exclude VAT. Tests: tests/job-profit.test.mjs.
import { neutralizeFormula } from "./csv.js";

const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = v => Math.round(n(v) * 100) / 100;

// One job. labourCost = what an hour of a technician's time costs the company.
export function jobProfit(row, { labourCost = 0 } = {}) {
  const invoiced = n(row.invoiced);
  const quoted = n(row.quoted);
  const revenue = invoiced > 0 ? invoiced : quoted;
  const source = invoiced > 0 ? "invoiced" : quoted > 0 ? "quoted" : "none";
  const labour = r2((n(row.work_minutes) / 60) * n(labourCost));
  const travel = r2((n(row.travel_minutes) / 60) * n(labourCost));
  const parts = r2(row.parts_cost);
  const bought = r2(row.po_cost);
  const expenses = r2(row.expense_cost);
  const cost = r2(labour + travel + parts + bought + expenses);
  const profit = r2(revenue - cost);
  return {
    ...row,
    revenue: r2(revenue),
    source,
    labour,
    travel,
    parts,
    bought,
    expenses,
    cost,
    profit,
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    hours: Math.round(((n(row.work_minutes) + n(row.travel_minutes)) / 60) * 10) / 10,
  };
}

// Why a job needs a look.
export function jobFlags(j) {
  const flags = [];
  if (j.source !== "none" && j.profit < 0) flags.push("Loss");
  if (j.source === "none" && j.cost > 0) flags.push("Not quoted or invoiced");
  if (j.source === "quoted" && j.status === "completed") flags.push("Done, not invoiced");
  if (!n(j.work_minutes) && j.status === "completed") flags.push("No time recorded");
  return flags;
}

export function totals(jobs) {
  const t = { jobs: 0, revenue: 0, cost: 0, profit: 0, labour: 0, travel: 0, parts: 0, bought: 0, expenses: 0, hours: 0 };
  for (const j of jobs) {
    t.jobs += 1;
    for (const k of ["revenue", "cost", "profit", "labour", "travel", "parts", "bought", "expenses", "hours"]) t[k] += n(j[k]);
  }
  for (const k of Object.keys(t)) if (k !== "jobs") t[k] = r2(t[k]);
  t.margin = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 1000) / 10 : null;
  return t;
}

// Grouped by client or technician, most profitable first.
export function groupBy(jobs, key, nameOf = id => id) {
  const groups = new Map();
  for (const j of jobs) {
    const id = j[key] || "none";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(j);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({ id, name: id === "none" ? "Not set" : nameOf(id), ...totals(list) }))
    .sort((a, b) => b.profit - a.profit);
}

// Reporting periods, as [from, to] (YYYY-MM-DD, local dates).
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function periodRange(period, now = new Date()) {
  const y = now.getFullYear(),
    m = now.getMonth();
  switch (period) {
    case "last_month":
      return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
    case "90_days":
      return [ymd(new Date(y, m, now.getDate() - 89)), ymd(now)];
    case "this_year":
      return [ymd(new Date(y, 0, 1)), ymd(now)];
    case "this_month":
    default:
      return [ymd(new Date(y, m, 1)), ymd(now)];
  }
}

export function profitCsv(jobs, { clients = new Map(), people = new Map() } = {}) {
  const cell = v => {
    const s = neutralizeFormula(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Job", "Title", "Date", "Status", "Client", "Technician", "Revenue", "From", "Labour", "Travel", "Parts", "Bought in", "Expenses", "Cost", "Profit", "Margin %", "Hours"],
  ];
  for (const j of jobs)
    rows.push([
      j.job_number || "",
      j.title || "",
      j.job_date || "",
      j.status || "",
      clients.get(j.client_id) || "",
      people.get(j.assigned_to_user_id) || "",
      j.revenue,
      j.source,
      j.labour,
      j.travel,
      j.parts,
      j.bought,
      j.expenses,
      j.cost,
      j.profit,
      j.margin ?? "",
      j.hours,
    ]);
  return rows.map(r => r.map(cell).join(",")).join("\r\n");
}
