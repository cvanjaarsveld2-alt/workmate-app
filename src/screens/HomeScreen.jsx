// ─── Dashboard (Home) ─────────────────────────────────────────────────────────
// The command-centre landing screen: action items, today's schedule, quick-add,
// key stats, expenses snapshot, and pipeline.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion } from "framer-motion";
import {
  Calendar, ChevronRight, File as FileIcon,
  TrendingUp, CheckCircle2, ArrowRight,
  Receipt, BarChart2,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";

const NEGLECT_DAYS = 14; // days without contact before showing warning

function daysSince(dateStr) {
  if (!dateStr) return 9999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function lastContactDate(clientId, clientName, activities, followups, notes) {
  const dates = [];
  activities.forEach(a => {
    if (a.client_id === clientId || a.client_name === clientName)
      dates.push(a.created_at);
  });
  followups.forEach(f => {
    if ((f.client_id === clientId || f.client === clientName) && f.completed)
      dates.push(f.date);
  });
  notes.forEach(n => {
    if (n.client_id === clientId || n.client === clientName)
      dates.push(n.created_at);
  });
  if (!dates.length) return null;
  return dates.sort().reverse()[0];
}
import { todayISO, niceDate, daysDiff, smartDate } from "../lib/helpers";
import { Card, StatCard } from "../components/ui";

function money(n) {
  return "R" + Math.round(n || 0).toLocaleString("en-ZA");
}

export function HomeScreen({ data, setScreen, user, onQuickAdd, onNavigate }) {
  const today     = todayISO();
  const uid = user?.id;
  const mine = r => r.user_id === uid || r.assigned_to_user_id === uid;

  // ── Data filtered by user ──
  const clients   = (data.clients   || []).filter(mine);
  const quotes    = (data.quotes    || []).filter(mine);
  const followups = (data.followups || []).filter(mine);
  const equipment = (data.equipment || []).filter(mine);
  const notes     = (data.notes     || []).filter(mine);
  const expenses  = (data.expenses  || []).filter(e => e.user_id === uid);
  const contacts  = (data.contacts  || []).filter(mine);

  // ── Neglected clients (no contact in 14+ days) ──
  const activeClients = clients.filter(c =>
    !["Lost","Won"].includes(c.stage) && (c.user_id === uid || c.assigned_to_user_id === uid)
  );
  const neglected = activeClients
    .map(cl => {
      const last = lastContactDate(cl.id, cl.company, data.activities || [], data.followups || [], data.notes || []);
      const days = daysSince(last);
      return { ...cl, daysSince: days, lastContact: last };
    })
    .filter(cl => cl.daysSince >= NEGLECT_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 5);

  const todayFU       = followups.filter(f => f.date === today && !f.completed)
                                  .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const overdueFU     = followups.filter(f => f.date < today && !f.completed);
  const pendingQ      = quotes.filter(q => q.status === "Pending");
  const sentQuotes    = quotes.filter(q => q.status === "Pending" || q.status === "Accepted" || q.status === "Rejected").length;
  const acceptedQ     = quotes.filter(q => q.status === "Accepted").length;
  const wonRev        = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const overdueEquip  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) < 0);
  const dueSoonEquip  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) >= 0 && daysDiff(e.service_due) <= 7);
  const criticalNotes = notes.filter(n => !n.resolved && n.urgency === "Critical");
  const overdueNotes  = notes.filter(n => !n.resolved && n.resolve_by && n.resolve_by < today);
  const leadContacts  = contacts.filter(c => (c.status || "lead") === "lead");

  // Expenses this calendar month (1st → last day)
  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const periodEnd = (() => {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  })();
  // ── Monthly target ──
  const TARGET_KEY = `pm_revenue_target_${uid}`;
  const monthlyTarget = parseFloat(localStorage.getItem(TARGET_KEY) || "0");
  const targetProgress = monthlyTarget > 0 ? Math.min(100, Math.round((wonRev / monthlyTarget) * 100)) : 0;

  const expThisMonth = expenses.filter(e =>
    e.expense_date && e.expense_date >= periodStart && e.expense_date <= periodEnd
  );
  // Use ZAR equivalent so mixed-currency periods sum sensibly.
  const expMonthTotal     = expThisMonth.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);


  const quoteConversion = sentQuotes > 0 ? Math.round((acceptedQ / sentQuotes) * 100) : 0;

  const pCount = PIPELINE_STAGES.reduce((a, s) => {
    a[s] = clients.filter(c => (c.stage || "New Lead") === s).length;
    return a;
  }, {});
  const lostC = pCount["Lost"] || 0;
  const inPipeline = clients.length - lostC;

  const actionItems = [];
  if (criticalNotes.length > 0)
    actionItems.push({ icon: "🚨", text: `${criticalNotes.length} critical note${criticalNotes.length !== 1 ? "s" : ""} unresolved`, screen: "Notes", color: "text-red-700" });
  if (overdueFU.length > 0)
    actionItems.push({ icon: "⏰", text: `${overdueFU.length} follow-up${overdueFU.length !== 1 ? "s" : ""} overdue`, screen: "Followups", color: "text-red-700" });
  if (overdueNotes.length > 0)
    actionItems.push({ icon: "📌", text: `${overdueNotes.length} note${overdueNotes.length !== 1 ? "s" : ""} past resolve date`, screen: "Notes", color: "text-orange-700" });
  if (overdueEquip.length > 0)
    actionItems.push({ icon: "🔧", text: `${overdueEquip.length} equipment service${overdueEquip.length !== 1 ? "s" : ""} overdue`, screen: "Equipment", color: "text-orange-700" });
  if (dueSoonEquip.length > 0)
    actionItems.push({ icon: "🛠️", text: `${dueSoonEquip.length} service${dueSoonEquip.length !== 1 ? "s" : ""} due within 7 days`, screen: "Equipment", color: "text-amber-700" });


  const actionCount = actionItems.length;
  const todayList = todayFU.slice(0, 5);
  const todayOverflow = Math.max(0, todayFU.length - 5);

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <p className="text-sm text-slate-400">{niceDate()}</p>
        <p className="text-xl font-black text-slate-900">Dashboard</p>
      </div>

      {/* ── Today's Schedule ── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
            📅 Today's Schedule {todayFU.length > 0 && `(${todayFU.length})`}
          </p>
          {todayFU.length > 0 && (
            <button onClick={() => setScreen("Followups")} className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1">
              All <ArrowRight size={12} />
            </button>
          )}
        </div>
        {todayList.length === 0 ? (
          <div className="px-4 py-5 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            <p className="text-sm text-slate-500">Nothing scheduled for today.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {todayList.map(f => (
              <button
                key={f.id}
                onClick={() => setScreen("Followups")}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors min-h-[60px]">
                <div className="shrink-0 w-12 text-center">
                  <p className="text-sm font-black text-slate-900">{f.time || "—"}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 break-words">{f.title}</p>
                  {(f.client || f.branch) && (
                    <p className="text-xs text-slate-500 mt-0.5">{f.client}{f.branch ? ` — ${f.branch}` : ""}</p>
                  )}
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0 mt-1" />
              </button>
            ))}
            {todayOverflow > 0 && (
              <button onClick={() => setScreen("Followups")} className="w-full px-4 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors text-center">
                + {todayOverflow} more
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ── Action Required ── */}
      {actionItems.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100" style={{ background: "#FEF2F2" }}>
              <p className="text-xs font-black text-red-700 uppercase tracking-wider">
                ⚡ Action Required ({actionCount})
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {actionItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (item.selectMode && onQuickAdd) {
                      onQuickAdd(item.screen + ":SelectMode");
                    } else {
                      setScreen(item.screen);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors min-h-[56px]">
                  <span className="text-lg shrink-0">{item.icon}</span>
                  <p className={`text-sm font-bold flex-1 ${item.color}`}>{item.text}</p>
                  <ChevronRight size={16} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Stats Grid (tappable) ── */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setScreen("Followups")} className="text-left">
          <StatCard label="Tasks Today" value={todayFU.length} sub={todayFU.length === 0 ? "all clear" : "follow-ups due"} color={BRAND.primary} icon={Calendar} />
        </button>
        <button onClick={() => setScreen("Quotes")} className="text-left">
          <StatCard label="Quotes Pending" value={pendingQ.length} sub={pendingQ.length === 0 ? "none awaiting" : "awaiting response"} color="#B45309" icon={FileIcon} />
        </button>
        <button onClick={() => setScreen("Quotes")} className="text-left">
          <StatCard label="Won Revenue" value={money(wonRev).replace("R", "R ")} sub={`${acceptedQ} accepted quote${acceptedQ !== 1 ? "s" : ""}`} color="#16A34A" icon={TrendingUp} />
        </button>
        <button onClick={() => setScreen("Expenses")} className="text-left">
          <StatCard label="This Month" value={money(expMonthTotal)} color="#7C2D12" icon={Receipt} />
        </button>
      </div>

      {/* ── Neglected Clients Warning ── */}
      {neglected.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚠️</span>
            <p className="text-xs font-black text-red-700 uppercase tracking-wider">
              {neglected.length} client{neglected.length !== 1 ? "s" : ""} need attention
            </p>
          </div>
          <div className="space-y-2">
            {neglected.map(cl => (
              <button key={cl.id}
                onClick={() => onNavigate ? onNavigate("Client360", { clientId: cl.id, returnTo: "Home" }) : setScreen?.("Clients")}
                className="w-full flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors text-left">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{cl.company}</p>
                  {cl.branch && <p className="text-xs text-slate-400 truncate">{cl.branch}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black text-red-600">
                    {cl.daysSince >= 9999 ? "Never contacted" : `${cl.daysSince}d ago`}
                  </p>
                  <p className="text-[10px] text-slate-400">no contact</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── Monthly Target ── */}
      {monthlyTarget > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Monthly Target</p>
            <p className="text-xs font-bold text-slate-400">{targetProgress}%</p>
          </div>
          <div className="flex items-end justify-between gap-2 mb-2">
            <p className="text-xl font-black" style={{ color: targetProgress >= 100 ? "#16A34A" : BRAND.primary }}>
              {money(wonRev).replace("R", "R ")}
            </p>
            <p className="text-sm text-slate-400 mb-0.5">of {money(monthlyTarget).replace("R", "R ")}</p>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${targetProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: targetProgress >= 100 ? "#16A34A" : targetProgress >= 70 ? "#D97706" : BRAND.primary }}
            />
          </div>
          {targetProgress >= 100 && (
            <p className="text-xs font-bold text-green-600 mt-1.5">🎉 Target reached!</p>
          )}
          {targetProgress > 0 && targetProgress < 100 && (
            <p className="text-xs text-slate-400 mt-1.5">
              {money(monthlyTarget - wonRev).replace("R", "R ")} to go
            </p>
          )}
        </Card>
      )}

      {/* ── Pipeline + Analytics ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <button onClick={() => setScreen("Clients")} className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Sales Pipeline
            </button>
            <p className="text-xs text-slate-400 mt-0.5">
              {inPipeline} in pipeline · {quoteConversion}% conversion
              {lostC > 0 ? ` · ${lostC} lost` : ""}
            </p>
          </div>
          <button onClick={() => setScreen("Analytics")}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 min-h-[40px] shrink-0"
            style={{ background: BRAND.light }}>
            <BarChart2 size={14} style={{ color: BRAND.primary }} />
            <span className="text-xs font-bold" style={{ color: BRAND.primary }}>Analytics</span>
            <ChevronRight size={12} style={{ color: BRAND.primary }} />
          </button>
        </div>
        <div className="space-y-2.5">
          {PIPELINE_STAGES.filter(s => s !== "Lost").map(stage => {
            const count = pCount[stage] || 0;
            const total = inPipeline || 1;
            const c     = STAGE_COLORS[stage];
            return (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-20 text-sm font-bold shrink-0" style={{ color: c.text }}>{stage}</span>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / total) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: c.dot }} />
                </div>
                <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
          {lostC > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-50 mt-2">
              <span className="w-20 text-xs font-bold shrink-0 text-slate-400">Lost</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-slate-300" style={{ width: `${(lostC / clients.length) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-400 w-6 text-right">{lostC}</span>
            </div>
          )}
        </div>
      </Card>

    </div>
  );
}
