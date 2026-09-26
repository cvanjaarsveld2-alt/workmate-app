// ─── Job profit ───────────────────────────────────────────────────────────────
// Which jobs, clients and technicians make money: each job's revenue (invoiced,
// else quoted) against labour and travel time, parts, purchase orders and
// expenses booked to it. Master account and admins only (the database checks).
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import { useCompanyProfile } from "../lib/companyProfile";
import { groupBy, jobFlags, jobProfit, periodRange, profitCsv, totals } from "../lib/jobProfit";
import { Btn, Card, PageHeader } from "../components/ui";

const rand = v => `R ${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const PERIODS = [
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["90_days", "Last 90 days"],
  ["this_year", "This year"],
];
const VIEWS = [
  ["jobs", "Jobs"],
  ["clients", "Clients"],
  ["people", "Technicians"],
];

function Tile({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3">
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      <p className="text-xs font-bold text-slate-500">{label}</p>
    </div>
  );
}

function Breakdown({ j }) {
  const row = (label, v) =>
    v ? (
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{rand(v)}</span>
      </div>
    ) : null;
  return (
    <div className="mt-2 pt-2 border-t border-slate-100 stack-y-1">
      <div className="flex justify-between text-xs font-bold text-slate-700">
        <span>Revenue ({j.source === "invoiced" ? "invoiced" : j.source === "quoted" ? "quoted, not invoiced yet" : "none yet"})</span>
        <span>{rand(j.revenue)}</span>
      </div>
      {row(`Labour (${Math.round((j.work_minutes || 0) / 6) / 10} h)`, j.labour)}
      {row(`Travel (${Math.round((j.travel_minutes || 0) / 6) / 10} h)`, j.travel)}
      {row("Parts used (at cost)", j.parts)}
      {row("Bought in for the job", j.bought)}
      {row("Expenses", j.expenses)}
    </div>
  );
}

export function JobProfitScreen({ teamId, clients = [], teamMembers = [], isManager = false, onOpenCompany }) {
  const profile = useCompanyProfile(teamId);
  const [period, setPeriod] = useState("this_month");
  const [view, setView] = useState("jobs");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  async function load() {
    setError("");
    setRows(null);
    const [from, to] = periodRange(period);
    const { data, error: e } = await supabase.rpc("job_costs", { p_team_id: teamId, p_from: from, p_to: to });
    if (e) {
      setRows([]);
      return setError(e.message);
    }
    setRows(data || []);
  }
  useEffect(() => {
    if (teamId && isManager) load();
  }, [teamId, isManager, period]);

  const labourCost = Number(profile.labour_cost) || 0;
  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.company || c.contact || "Client"])), [clients]);
  const personName = useMemo(() => new Map(teamMembers.map(t => [t.user_id, t.full_name || t.email || "Teammate"])), [teamMembers]);
  const jobs = useMemo(() => (rows || []).map(r => jobProfit(r, { labourCost })), [rows, labourCost]);
  const t = totals(jobs);
  const shown = onlyFlagged ? jobs.filter(j => jobFlags(j).length) : jobs;

  if (!isManager)
    return (
      <Card className="p-6 text-center text-slate-500">Only the master account and admins can see job profit.</Card>
    );

  function exportCsv() {
    const csv = profitCsv(jobs, { clients: clientName, people: personName });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `job_profit_${periodRange(period).join("_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <PageHeader title="Job profit" subtitle="What each job earned against what it cost (excl. VAT)" />
        <Btn size="sm" variant="secondary" onClick={load} aria-label="Refresh">
          <RefreshCw size={14} />
        </Btn>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {PERIODS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPeriod(k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold min-h-[36px] ${period === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!labourCost && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">
            Labour is counted at R 0 an hour. Set what an hour of a technician costs you in{" "}
            <button type="button" onClick={onOpenCompany} className="font-bold underline">
              Company Details → Labour cost
            </button>
            .
          </span>
        </div>
      )}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Revenue" value={rand(t.revenue)} />
        <Tile label="Costs" value={rand(t.cost)} />
        <Tile label="Profit" value={rand(t.profit)} tone={t.profit < 0 ? "text-red-700" : "text-green-700"} />
        <Tile label="Margin" value={t.margin === null ? "—" : `${t.margin}%`} tone={t.margin !== null && t.margin < 0 ? "text-red-700" : "text-slate-900"} />
      </div>
      <p className="text-xs text-slate-500 px-1">
        {t.jobs} job{t.jobs === 1 ? "" : "s"} · {t.hours} h on jobs · labour {rand(t.labour + t.travel)} · parts {rand(t.parts)} · bought in {rand(t.bought)} · expenses{" "}
        {rand(t.expenses)}
      </p>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {VIEWS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`rounded-lg py-2 text-xs font-bold min-h-[44px] ${view === k ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows === null && <Card className="p-6 text-center text-slate-500">Adding up…</Card>}
      {rows && jobs.length === 0 && !error && <Card className="p-6 text-center text-slate-500">No jobs in this period.</Card>}

      {view === "jobs" && jobs.length > 0 && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-700 min-h-[44px] px-1">
            <input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} className="h-5 w-5" />
            Only jobs that need a look (losses, not invoiced, no time)
          </label>
          {shown.map(j => {
            const flags = jobFlags(j);
            return (
              <Card key={j.id} className="p-4" onClick={() => setOpen(o => (o === j.id ? null : j.id))}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 truncate">
                      {j.job_number || "Job"} · {j.title}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {clientName.get(j.client_id) || "No client"} · {personName.get(j.assigned_to_user_id) || "Unassigned"} · {j.job_date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-black ${j.profit < 0 ? "text-red-700" : "text-green-700"}`}>{rand(j.profit)}</p>
                    <p className="text-xs text-slate-500">{j.margin === null ? "no revenue" : `${j.margin}%`}</p>
                  </div>
                </div>
                {flags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {flags.map(f => (
                      <span key={f} className="rounded-full bg-amber-50 text-amber-900 px-2 py-0.5 text-[11px] font-bold">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {open === j.id && <Breakdown j={j} />}
              </Card>
            );
          })}
        </>
      )}

      {view !== "jobs" &&
        groupBy(jobs, view === "clients" ? "client_id" : "assigned_to_user_id", id => (view === "clients" ? clientName : personName).get(id) || "Unknown").map(g => (
          <Card key={g.id} className="p-4 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900 truncate">{g.name}</p>
              <p className="text-xs text-slate-500">
                {g.jobs} job{g.jobs === 1 ? "" : "s"} · revenue {rand(g.revenue)} · {g.hours} h
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-black ${g.profit < 0 ? "text-red-700" : "text-green-700"}`}>{rand(g.profit)}</p>
              <p className="text-xs text-slate-500">{g.margin === null ? "—" : `${g.margin}%`}</p>
            </div>
          </Card>
        ))}

      {jobs.length > 0 && (
        <Btn variant="secondary" onClick={exportCsv}>
          <Download size={14} /> Export to Excel (CSV)
        </Btn>
      )}
    </div>
  );
}
