// ─── Analytics Screen ─────────────────────────────────────────────────────────
// Business intelligence dashboard for Power Works (Pty) Ltd.
// Shows: quarterly new leads, win/loss ratio, best customers, follow-up
// effectiveness, pipeline velocity, and expense trends.
// All data is derived from what's already in the app — no extra syncing needed.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Award,
  ChevronRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { BRAND, STAGE_COLORS } from "../lib/constants";
import { smartDate, todayISO } from "../lib/helpers";
import { Card, PageHeader } from "../components/ui";

function money(n) {
  return "R\u00a0" + Math.round(n || 0).toLocaleString("en-ZA");
}

function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

// ─── Quarter helpers ──────────────────────────────────────────────────────────
function getQuarter(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + "T12:00:00");
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, year: y, quarter: q };
}

function lastNQuarters(n = 6) {
  const now = new Date();
  const quarters = [];
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    quarters.unshift({ key: `${year}-Q${q}`, label: `Q${q} '${String(year).slice(2)}` });
    q--;
    if (q < 1) { q = 4; year--; }
  }
  return quarters;
}

// ─── Inline bar chart ─────────────────────────────────────────────────────────
function BarChart({ data, color = BRAND.primary, height = 80, valueFormat = v => v }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <p className="text-[9px] font-bold text-slate-500 leading-none">
            {d.value > 0 ? valueFormat(d.value) : ""}
          </p>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((d.value / max) * (height - 24), d.value > 0 ? 4 : 0)}px` }}
            transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
            className="w-full rounded-t-lg"
            style={{ background: d.highlight ? color : color + "55", minWidth: 6 }}
          />
          <p className="text-[9px] text-slate-400 leading-none truncate w-full text-center">{d.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Donut / ratio ring ───────────────────────────────────────────────────────
function RatioRing({ value, max, color, size = 64, strokeWidth = 8 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const filled = max > 0 ? (value / max) * circ : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - filled }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, color, icon: Icon, trend }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-tight">{label}</p>
        {Icon && (
          <div className="rounded-xl p-2 shrink-0" style={{ background: BRAND.light }}>
            <Icon size={16} style={{ color: color || BRAND.primary }} />
          </div>
        )}
      </div>
      <p className="text-2xl font-black leading-none mt-1" style={{ color: color || BRAND.primary }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1 leading-snug">{sub}</p>}
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend > 0
            ? <TrendingUp size={12} className="text-green-500" />
            : trend < 0
              ? <TrendingDown size={12} className="text-red-500" />
              : <span className="w-3" />}
          <p className="text-xs font-bold" style={{ color: trend > 0 ? "#16A34A" : trend < 0 ? "#DC2626" : "#94A3B8" }}>
            {trend > 0 ? `+${trend}` : trend} vs prev quarter
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function AnalyticsScreen({ data, onNavigate }) {
  const [selectedQuarter, setSelectedQuarter] = useState(null);

  const clients   = data.clients   || [];
  const quotes    = data.quotes    || [];
  const followups = data.followups || [];
  const expenses  = data.expenses  || [];
  const notes     = data.notes     || [];

  const quarters = useMemo(() => lastNQuarters(6), []);
  const currentQKey = getQuarter(todayISO())?.key;
  const prevQKey    = quarters[quarters.length - 2]?.key;

  // ── Quarterly new clients (by created_at) ───────────────────────────────────────────────────
  const leadsByQuarter = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      const q = getQuarter(c.created_at?.slice(0, 10));
      if (!q) return;
      map[q.key] = (map[q.key] || 0) + 1;
    });
    return quarters.map(q => ({
      key: q.key, label: q.label,
      value: map[q.key] || 0,
      highlight: q.key === currentQKey,
    }));
  }, [clients, quarters]);

  const currentQLeads = leadsByQuarter.find(q => q.key === currentQKey)?.value || 0;
  const prevQLeads    = leadsByQuarter.find(q => q.key === prevQKey)?.value || 0;

  // ── Win rate ──────────────────────────────────────────────────────────────
  const wonClients    = clients.filter(c => c.stage === "Won").length;
  const lostClients   = clients.filter(c => c.stage === "Lost").length;
  const closedClients = wonClients + lostClients;
  const winRate       = pct(wonClients, closedClients);

  // Quarterly win rate for the bar chart
  const winRateByQ = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      if (c.stage !== "Won" && c.stage !== "Lost") return;
      const q = getQuarter(c.updated_at?.slice(0, 10) || c.created_at?.slice(0, 10));
      if (!q) return;
      if (!map[q.key]) map[q.key] = { won: 0, total: 0 };
      if (c.stage === "Won") map[q.key].won++;
      map[q.key].total++;
    });
    return quarters.map(q => ({
      key: q.key, label: q.label,
      value: map[q.key] ? pct(map[q.key].won, map[q.key].total) : 0,
      highlight: q.key === currentQKey,
    }));
  }, [clients, quarters]);

  // ── Quote conversion (Quoted -> Won) ─────────────────────────────────────
  const quotedCount   = quotes.filter(q => q.status === "Pending" || q.status === "Accepted" || q.status === "Rejected").length;
  const acceptedCount = quotes.filter(q => q.status === "Accepted").length;
  const quoteWinRate  = pct(acceptedCount, quotedCount);
  const wonRevenue    = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const pipelineValue = quotes.filter(q => q.status === "Pending").reduce((s, q) => s + parseFloat(q.value || 0), 0);

  // ── Best customers (by won quote value + activity) ────────────────────────
  const bestCustomers = useMemo(() => {
    const map = {};
    quotes.filter(q => q.status === "Accepted").forEach(q => {
      const key = q.client_name || q.client || "Unknown";
      if (!map[key]) map[key] = { name: key, revenue: 0, deals: 0 };
      map[key].revenue += parseFloat(q.value || 0);
      map[key].deals++;
    });
    // Boost customers with active notes or follow-ups
    clients.forEach(c => {
      const key = c.company;
      if (!map[key]) return;
      const fuCount = followups.filter(f => f.client === c.company).length;
      map[key].followups = fuCount;
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [quotes, clients, followups]);

  // ── Follow-up effectiveness ───────────────────────────────────────────────
  const totalFU       = followups.length;
  const completedFU   = followups.filter(f => f.completed).length;
  const overdueFU     = followups.filter(f => !f.completed && f.date < todayISO()).length;
  const fuRate        = pct(completedFU, totalFU);

  // Average follow-ups per Won client
  const avgFUPerWin = useMemo(() => {
    const wonC = clients.filter(c => c.stage === "Won");
    if (!wonC.length) return 0;
    const total = wonC.reduce((s, c) => {
      return s + followups.filter(f => f.client === c.company).length;
    }, 0);
    return (total / wonC.length).toFixed(1);
  }, [clients, followups]);

  // ── Pipeline velocity (how long in each stage on average) ─────────────────
  const pipelineStages = ["New Lead", "Quoted", "Active"];
  const pipelineCount  = pipelineStages.map(s => ({
    stage: s,
    count: clients.filter(c => (c.stage || "New Lead") === s).length,
    color: STAGE_COLORS[s]?.dot || BRAND.primary,
  }));
  const totalInPipeline = pipelineCount.reduce((s, p) => s + p.count, 0);

  // ── Expense trend by quarter ──────────────────────────────────────────────
  const expByQ = useMemo(() => {
    const map = {};
    expenses.forEach(e => {
      const q = getQuarter(e.expense_date);
      if (!q) return;
      map[q.key] = (map[q.key] || 0) + parseFloat(e.amount_zar || e.amount || 0);
    });
    return quarters.map(q => ({
      key: q.key, label: q.label,
      value: Math.round(map[q.key] || 0),
      highlight: q.key === currentQKey,
    }));
  }, [expenses, quarters]);

  // ── Current quarter filter ────────────────────────────────────────────────
  const activeQ = selectedQuarter || currentQKey;

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        title="Analytics"
        subtitle="Business performance · Power Works (Pty) Ltd"
      />

      {/* ── Section: Pipeline overview ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">Pipeline</p>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Win Rate"
            value={`${winRate}%`}
            sub={`${wonClients} won of ${closedClients} closed`}
            color={winRate >= 50 ? "#16A34A" : "#DC2626"}
            icon={Target}
            trend={winRate - pct(
              winRateByQ.find(q => q.key === prevQKey)?.value || 0,
              100
            )}
          />
          <Tile
            label="Quote Conversion"
            value={`${quoteWinRate}%`}
            sub={`${acceptedCount} of ${quotedCount} quoted`}
            color="#5B21B6"
            icon={CheckCircle2}
          />
          <Tile
            label="Won Revenue"
            value={money(wonRevenue)}
            sub={`${acceptedCount} accepted quote${acceptedCount !== 1 ? "s" : ""}`}
            color="#16A34A"
            icon={Award}
          />
          <Tile
            label="Pipeline Value"
            value={money(pipelineValue)}
            sub="pending quotes"
            color="#B45309"
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* ── Win rate ring ── */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
            <RatioRing value={wonClients} max={Math.max(closedClients, 1)} color="#16A34A" size={80} strokeWidth={10} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-lg font-black leading-none" style={{ color: "#16A34A" }}>{winRate}%</p>
              <p className="text-[9px] text-slate-400 font-bold leading-none mt-0.5">win rate</p>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {[
              { label: "Won",        count: wonClients,             color: "#16A34A" },
              { label: "Lost",       count: lostClients,            color: "#DC2626" },
              { label: "Active",     count: clients.filter(c => c.stage === "Active").length, color: "#0E7490" },
              { label: "Quoted",     count: clients.filter(c => c.stage === "Quoted").length, color: "#5B21B6" },
              { label: "New Lead",   count: clients.filter(c => (c.stage || "New Lead") === "New Lead").length, color: "#92400E" },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: row.color }} />
                <p className="text-xs font-bold text-slate-600 flex-1">{row.label}</p>
                <p className="text-xs font-black text-slate-800">{row.count}</p>
                <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div className="h-full rounded-full"
                    style={{ background: row.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct(row.count, Math.max(clients.length, 1))}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Section: Quarterly trends ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">Quarterly Trends</p>

        {/* Quarter selector */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
          {quarters.map(q => (
            <button key={q.key}
              onClick={() => setSelectedQuarter(q.key === activeQ ? null : q.key)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all min-h-[36px]"
              style={q.key === activeQ
                ? { background: BRAND.primary, color: "white" }
                : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
              {q.label}
            </button>
          ))}
        </div>

        {/* New leads bar chart */}
        <Card className="p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-black text-slate-800">New Leads per Quarter</p>
            <div className="text-right">
              <p className="text-lg font-black" style={{ color: BRAND.primary }}>{currentQLeads}</p>
              <p className="text-[10px] text-slate-400">this quarter</p>
            </div>
          </div>
          <BarChart data={leadsByQuarter} color={BRAND.primary} height={100} />
          {currentQLeads > 0 && prevQLeads > 0 && (
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-50">
              {currentQLeads >= prevQLeads
                ? <TrendingUp size={13} className="text-green-500" />
                : <TrendingDown size={13} className="text-red-500" />}
              <p className="text-xs font-bold" style={{ color: currentQLeads >= prevQLeads ? "#16A34A" : "#DC2626" }}>
                {currentQLeads >= prevQLeads ? "+" : ""}{currentQLeads - prevQLeads} vs previous quarter
              </p>
            </div>
          )}
        </Card>

        {/* Win rate by quarter */}
        <Card className="p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-black text-slate-800">Win Rate by Quarter (%)</p>
            <div className="text-right">
              <p className="text-lg font-black" style={{ color: "#16A34A" }}>{winRate}%</p>
              <p className="text-[10px] text-slate-400">overall</p>
            </div>
          </div>
          <BarChart data={winRateByQ} color="#16A34A" height={100} valueFormat={v => `${v}%`} />
        </Card>

        {/* Expense trend */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-black text-slate-800">Expenses by Quarter</p>
          </div>
          <BarChart data={expByQ} color="#7C2D12" height={100} valueFormat={v => `R${Math.round(v / 1000)}k`} />
        </Card>
      </div>

      {/* ── Section: Follow-up effectiveness ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">Follow-up Effectiveness</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Tile label="Completion Rate" value={`${fuRate}%`} sub={`${completedFU} of ${totalFU} done`} color="#0E7490" icon={CheckCircle2} />
          <Tile label="Overdue" value={overdueFU} sub="follow-ups outstanding" color={overdueFU > 0 ? "#DC2626" : "#16A34A"} icon={Clock} />
        </div>

        <Card className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-black text-slate-800">Avg. touches to close a Won deal</p>
              <p className="text-xs text-slate-400 mt-0.5">Follow-ups logged per won client</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-black" style={{ color: "#5B21B6" }}>{avgFUPerWin}</p>
              <p className="text-[10px] text-slate-400">avg follow-ups</p>
            </div>
          </div>
          {/* Follow-up completion ring */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
              <RatioRing value={completedFU} max={Math.max(totalFU, 1)} color="#0E7490" size={56} strokeWidth={7} />
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xs font-black" style={{ color: "#0E7490" }}>{fuRate}%</p>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                <p className="text-xs text-slate-600 flex-1">Completed</p>
                <p className="text-xs font-black text-slate-800">{completedFU}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                <p className="text-xs text-slate-600 flex-1">Overdue</p>
                <p className="text-xs font-black text-slate-800">{overdueFU}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />
                <p className="text-xs text-slate-600 flex-1">Upcoming</p>
                <p className="text-xs font-black text-slate-800">{totalFU - completedFU - overdueFU}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Section: Best customers ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">Top Customers by Revenue</p>
        {bestCustomers.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-slate-400">No won deals yet — mark quotes as Accepted to see customer rankings here.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden divide-y divide-slate-50">
            {bestCustomers.map((c, i) => {
              const maxRev = bestCustomers[0]?.revenue || 1;
              return (
                <div key={c.name} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-black"
                      style={{
                        background: i === 0 ? "#FEF9C3" : i === 1 ? "#F1F5F9" : "#FFF7ED",
                        color: i === 0 ? "#A16207" : i === 1 ? "#64748B" : "#C2410C",
                      }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-sm font-black text-slate-900 leading-tight truncate">{c.name}</p>
                        <p className="text-xs font-bold shrink-0" style={{ color: "#16A34A" }}>{money(c.revenue)}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <motion.div className="h-full rounded-full"
                            style={{ background: i === 0 ? "#A16207" : BRAND.primary }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct(c.revenue, maxRev)}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 shrink-0">
                          {c.deals} deal{c.deals !== 1 ? "s" : ""}
                          {c.followups ? ` · ${c.followups} follow-ups` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {/* ── Section: Current pipeline snapshot ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">Pipeline Snapshot</p>
        <Card className="p-4">
          <div className="space-y-3">
            {pipelineCount.concat([
              { stage: "Won",  count: wonClients,  color: "#16A34A" },
              { stage: "Lost", count: lostClients,  color: "#94A3B8" },
            ]).map(({ stage, count, color }) => (
              <div key={stage} className="flex items-center gap-3">
                <p className="w-20 text-sm font-bold shrink-0" style={{ color }}>{stage}</p>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct(count, Math.max(clients.length, 1))}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-400">Total tracked: <span className="font-black text-slate-700">{clients.length}</span></p>
            <button onClick={() => onNavigate?.("Clients")}
              className="flex items-center gap-1 text-xs font-bold min-h-[36px] px-2"
              style={{ color: BRAND.primary }}>
              View all <ChevronRight size={12} />
            </button>
          </div>
        </Card>
      </div>

      {/* ── Multi-user note ── */}
      <Card className="p-4 border-2" style={{ borderColor: "#EDE9FE", background: "#F5F3FF" }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#EDE9FE" }}>
            <Users size={18} style={{ color: "#5B21B6" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black" style={{ color: "#5B21B6" }}>Multi-user coming</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "#6D28D9" }}>
              These analytics currently reflect your data only. Multi-user team sharing (with roles: Admin, Sales, Field Tech) is being planned as a dedicated update. When live, this screen will aggregate across your whole team.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
