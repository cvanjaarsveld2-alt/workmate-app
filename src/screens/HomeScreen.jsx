// ─── Dashboard (Home) ─────────────────────────────────────────────────────────
// The command-centre landing screen: action items, today's schedule, quick-add,
// key stats, expenses snapshot, and pipeline.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, ChevronRight, File as FileIcon,
  TrendingUp, CheckCircle2, ArrowRight,
  Receipt, BarChart2,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";

// Neglect threshold — user configurable in Settings (default 21 days)
const NEGLECT_KEY = "pm_neglect_days";
const NEGLECT_DAYS = parseInt(localStorage.getItem(NEGLECT_KEY) || "21", 10);

function daysSince(dateStr) {
  if (!dateStr) return 9999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function normName(s) { return (s || "").toLowerCase().trim().replace(/[^a-z0-9]/g, ""); }

function lastContactDate(clientId, clientName, activities, followups, notes, quotes) {
  const dates = [];
  const norm = normName(clientName);

  // Activities — match by ID first (reliable), then by name (fallback for old records)
  activities.forEach(a => {
    const match = (clientId && a.client_id === clientId) ||
                  (norm && normName(a.client_name) === norm);
    if (match) dates.push(a.created_at);
  });

  // Completed follow-ups
  followups.forEach(f => {
    const match = (clientId && f.client_id === clientId) ||
                  (norm && normName(f.client) === norm);
    if (match && f.completed && f.date) dates.push(f.date + "T12:00:00");
  });

  // Field notes
  notes.forEach(n => {
    const match = (clientId && n.client_id === clientId) ||
                  (norm && normName(n.client) === norm);
    if (match) dates.push(n.created_at);
  });

  // Quotes sent
  quotes.forEach(q => {
    const match = (clientId && q.client_id === clientId) ||
                  (norm && normName(q.client_name) === norm);
    if (match && q.sent_date) dates.push(q.sent_date + "T12:00:00");
  });

  if (!dates.length) return null;
  return dates.filter(Boolean).sort().reverse()[0];
}

// Stage-based contact: client manually marked as Contacted/Quoted/Active/Won
function lastStageContact(cl) {
  if (["Contacted","Quoted","Active","Won"].includes(cl.stage)) {
    return cl.updated_at || cl.created_at;
  }
  return null;
}
import { todayISO, niceDate, daysDiff, smartDate, genId } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { offlineSave } from "../offline/offlineDb";
import { Card, StatCard, Gauge } from "../components/ui";

function money(n) {
  return "R" + Math.round(n || 0).toLocaleString("en-ZA");
}

export function HomeScreen({ data, setData, userId, teamId, setScreen, user, onQuickAdd, onNavigate }) {
  const today     = todayISO();
  const [neglectSheet, setNeglectSheet] = React.useState(null);
  const [expandedStage, setExpandedStage] = React.useState(null); // which pipeline stage is expanded
  const [movingClient, setMovingClient]   = React.useState(null); // client whose stage picker is open

  // Move a client to a new stage — routed through the app's normal safe sync
  // path (full-row update, so no column gets nulled). setData may be absent in
  // some mount contexts, so guard for it.
  function moveClientStage(client, newStage) {
    if (!client || !newStage || client.stage === newStage) { setMovingClient(null); return; }
    if (!setData) { setMovingClient(null); return; }
    const updated = withTeamId({ ...client, stage: newStage, sync_status: "pending" }, teamId);
    setData(d => ({
      ...d,
      clients: (d.clients || []).map(c => c.id === client.id ? updated : c),
      syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    offlineSave("clients", updated).catch(() => {});
    triggerImmediateSync();
    setMovingClient(null);
  }
  const DISMISS_KEY = `pm_neglect_dismissed_${user?.id}`;
  const [dismissed, setDismissed] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`pm_neglect_dismissed_${user?.id}`) || "[]")); }
    catch { return new Set(); }
  });

  function dismissClient(id) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(`pm_neglect_dismissed_${user?.id}`, JSON.stringify([...next]));
      return next;
    });
  }
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
  // Excludes Won/Lost/Dormant, and cold-call records (source "Cold call") which
  // are prospects that belong in Opportunities, not real clients to chase here.
  const activeClients = clients.filter(c =>
    !["Lost","Won","Dormant"].includes(c.stage)
    && c.source !== "Cold call"
    && (c.user_id === uid || c.assigned_to_user_id === uid)
  );
  const neglected = activeClients
    .map(cl => {
      // Primary: actual logged contact (activity/note/followup/quote)
      const lastLogged  = lastContactDate(cl.id, cl.company,
        data.activities || [], data.followups || [],
        data.notes || [], data.quotes || []);
      // Secondary: stage-based (manually marked Contacted etc.)
      const lastStage   = lastStageContact(cl);
      // Use whichever is more recent
      const candidates  = [lastLogged, lastStage].filter(Boolean);
      const last        = candidates.length ? candidates.sort().reverse()[0] : null;
      const days        = daysSince(last);
      const contactType = lastLogged && (!lastStage || lastLogged >= lastStage)
        ? "logged" : lastStage ? "stage" : "never";
      return { ...cl, daysSince: days, lastContact: last, contactType };
    })
    .filter(cl => cl.daysSince >= NEGLECT_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince)
    .filter(cl => !dismissed.has(cl.id))
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

  // Last calendar month range, for month-over-month trend pills.
  const _pm = new Date(now.getFullYear(), now.getMonth(), 1); // first of this month
  const _pmStart = new Date(_pm.getFullYear(), _pm.getMonth() - 1, 1);
  const _pmEnd = new Date(_pm.getFullYear(), _pm.getMonth(), 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastMonthStart = iso(_pmStart);
  const lastMonthEnd = iso(_pmEnd);

  const expLastMonthTotal = expenses
    .filter(e => e.expense_date && e.expense_date >= lastMonthStart && e.expense_date <= lastMonthEnd)
    .reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);

  const wonRevLastMonth = quotes
    .filter(q => q.status === "Accepted" && q.sent_date && q.sent_date >= lastMonthStart && q.sent_date <= lastMonthEnd)
    .reduce((s, q) => s + parseFloat(q.value || 0), 0);

  // Build a trend pill { dir, text } from current vs previous. Returns null when
  // there's no meaningful comparison (no prior data), so the pill only appears
  // when it actually says something.
  function monthTrend(current, previous) {
    if (!previous || previous === 0) return null;
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return null;
    return { dir: pct >= 0 ? "up" : "down", text: `${Math.abs(pct)}% vs last month` };
  }
  // Use ZAR equivalent so mixed-currency periods sum sensibly.
  const expMonthTotal     = expThisMonth.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);
  const expTrend = monthTrend(expMonthTotal, expLastMonthTotal);
  const revTrend = monthTrend(wonRev, wonRevLastMonth);


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
          <StatCard label="Tasks today" value={todayFU.length} sub={todayFU.length === 0 ? "all clear" : "follow-ups due"} color={BRAND.primary} icon={Calendar} />
        </button>
        <button onClick={() => setScreen("Quotes")} className="text-left">
          <StatCard label="Quotes pending" value={pendingQ.length} sub={pendingQ.length === 0 ? "none awaiting" : "awaiting response"} color="#B45309" icon={FileIcon} />
        </button>
        <button onClick={() => setScreen("Quotes")} className="text-left">
          <StatCard label="Won revenue" value={money(wonRev).replace("R", "R ")} sub={`${acceptedQ} accepted quote${acceptedQ !== 1 ? "s" : ""}`} color="#16A34A" icon={TrendingUp} trend={revTrend} />
        </button>
        <button onClick={() => setScreen("Expenses")} className="text-left">
          <StatCard label="This month" value={money(expMonthTotal)} color="#7C2D12" icon={Receipt} trend={expTrend} invertTrend />
        </button>
      </div>

      {/* ── Neglected Clients Warning ── */}
      {neglected.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <p className="text-xs font-black text-red-700 uppercase tracking-wider">
                {neglected.length} client{neglected.length !== 1 ? "s" : ""} need attention
              </p>
            </div>
            <span className="text-[10px] text-slate-400">{NEGLECT_DAYS}+ days</span>
          </div>
          <div className="space-y-2">
            {neglected.map(cl => (
              <div key={cl.id} className="flex items-center gap-1">
                <button
                  onClick={() => setNeglectSheet(cl)}
                  className="flex-1 flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-red-50 active:bg-red-100 transition-colors text-left">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-[10px] bg-white/70 flex items-center justify-center shrink-0 text-[11px] font-black text-slate-500">
                      {(cl.company || "?").replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{cl.company}</p>
                      {cl.branch && <p className="text-xs text-slate-400 truncate">{cl.branch}</p>}
                      {cl.contactType === "stage" && (
                        <p className="text-[10px] text-amber-600 mt-0.5">Stage updated only</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-black text-red-600 bg-red-100 px-2.5 py-1 rounded-full">
                    {cl.daysSince >= 9999 ? "Never" : `${cl.daysSince}d`}
                  </span>
                </button>
                <button
                  onClick={() => dismissClient(cl.id)}
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center shrink-0 transition-colors"
                  title="Hide from list">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Neglected client action sheet ── */}
      <AnimatePresence>
        {neglectSheet && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={() => setNeglectSheet(null)}
              className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"/>
            <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
              transition={{type:"spring",damping:28,stiffness:300}}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white"
              style={{maxWidth:480,margin:"0 auto"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
              <div className="px-5 pb-8 pt-2 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-black text-slate-900">{neglectSheet.company}</p>
                    {neglectSheet.branch && <p className="text-sm text-slate-400">{neglectSheet.branch}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        {neglectSheet.daysSince >= 9999 ? "Never contacted" : `${neglectSheet.daysSince} days without contact`}
                      </span>
                      {neglectSheet.contactType === "stage" && (
                        <span className="text-xs text-amber-600">Stage only</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setNeglectSheet(null)}
                    className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    ✕
                  </button>
                </div>

                {/* Action options */}
                <div className="space-y-2">
                  {neglectSheet.phone && (
                    <a href={`tel:${neglectSheet.phone}`}
                      onClick={() => setNeglectSheet(null)}
                      className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl bg-blue-50 text-blue-700 font-bold text-sm">
                      📞 Call {neglectSheet.contact || neglectSheet.phone}
                    </a>
                  )}
                  {neglectSheet.phone && (
                    <a href={`https://wa.me/${(neglectSheet.phone||"").replace(/^0/,"27").replace(/[^0-9]/g,"")}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={() => setNeglectSheet(null)}
                      className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl bg-green-50 text-green-700 font-bold text-sm">
                      💬 WhatsApp {neglectSheet.contact || ""}
                    </a>
                  )}
                  {neglectSheet.email && (
                    <a href={`mailto:${neglectSheet.email}`}
                      onClick={() => setNeglectSheet(null)}
                      className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl bg-slate-50 text-slate-700 font-bold text-sm">
                      ✉️ Email {neglectSheet.contact || neglectSheet.email}
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setNeglectSheet(null);
                      onNavigate?.("Notes", { quickClient: neglectSheet });
                    }}
                    className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl bg-amber-50 text-amber-700 font-bold text-sm">
                    📝 Add field note
                  </button>
                  <button
                    onClick={() => {
                      setNeglectSheet(null);
                      onNavigate?.("Followups", { quickClient: neglectSheet });
                    }}
                    className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl bg-purple-50 text-purple-700 font-bold text-sm">
                    📅 Schedule follow-up
                  </button>
                  <button
                    onClick={() => {
                      setNeglectSheet(null);
                      onNavigate?.("Client360", { clientId: neglectSheet.id, returnTo: "Home" });
                    }}
                    className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl text-white font-bold text-sm"
                    style={{background:"#8B1A1A"}}>
                    👤 Open full client profile
                  </button>
                  <button
                    onClick={() => {
                      dismissClient(neglectSheet.id);
                      setNeglectSheet(null);
                    }}
                    className="w-full flex items-center gap-3 py-3 px-4 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm">
                    ✕ Hide from attention list
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
          <div className="min-w-0">
            <button onClick={() => setScreen("Clients")} className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Sales Pipeline
            </button>
            <p className="text-xs text-slate-400 mt-0.5">
              {inPipeline} in pipeline{lostC > 0 ? ` · ${lostC} lost` : ""}
            </p>
          </div>
          <Gauge value={quoteConversion} label="Conversion" size={78} />
        </div>
        <div className="flex items-center justify-end mb-3 -mt-1">
          <button onClick={() => setScreen("Analytics")}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 min-h-[40px] shrink-0"
            style={{ background: BRAND.light }}>
            <BarChart2 size={14} style={{ color: BRAND.primary }} />
            <span className="text-xs font-bold" style={{ color: BRAND.primary }}>Analytics</span>
            <ChevronRight size={12} style={{ color: BRAND.primary }} />
          </button>
        </div>
        <div className="space-y-2.5">
          {PIPELINE_STAGES.filter(s => s !== "Lost" && s !== "Dormant").map(stage => {
            const count = pCount[stage] || 0;
            const total = inPipeline || 1;
            const c     = STAGE_COLORS[stage];
            const isExpanded = expandedStage === stage;
            const stageClients = (clients || []).filter(cl => (cl.stage || "New Lead") === stage);
            return (
              <div key={stage}>
                <button
                  onClick={() => setExpandedStage(isExpanded ? null : (count > 0 ? stage : null))}
                  className="w-full flex items-center gap-3 rounded-lg -mx-1 px-1 py-0.5 active:bg-slate-50 transition-colors">
                  <span className="w-20 text-sm font-bold shrink-0 text-left flex items-center gap-1" style={{ color: c.text }}>
                    {count > 0 && (
                      <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
                        <ChevronRight size={12} style={{ color: c.text }} />
                      </motion.span>
                    )}
                    {stage}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: c.dot }} />
                  </div>
                  <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden">
                      <div className="pl-1 pr-1 pt-2 pb-1 space-y-1">
                        {stageClients.slice(0, 8).map(cl => (
                          <button
                            key={cl.id}
                            onClick={() => setMovingClient(cl)}
                            className="w-full flex items-center gap-2 rounded-xl px-3 min-h-[42px] bg-slate-50 active:bg-slate-100 text-left">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
                            <span className="flex-1 min-w-0 truncate text-sm font-bold text-slate-700">
                              {cl.company || "Unnamed"}{cl.branch ? ` — ${cl.branch}` : ""}
                            </span>
                            <span className="text-[11px] font-bold text-slate-400 shrink-0">Move</span>
                            <ChevronRight size={13} className="text-slate-300 shrink-0" />
                          </button>
                        ))}
                        {stageClients.length > 8 && (
                          <button onClick={() => setScreen("Clients")}
                            className="w-full text-center py-2 text-xs font-bold" style={{ color: BRAND.primary }}>
                            View all {stageClients.length} in {stage} →
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {lostC > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-50 mt-2">
              <span className="w-20 text-xs font-bold shrink-0 text-slate-400">Lost</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-slate-300" style={{ width: `${clients.length > 0 ? (lostC / clients.length) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-400 w-6 text-right">{lostC}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Stage-move picker — appears when a client is tapped in the expanded pipeline */}
      <AnimatePresence>
        {movingClient && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMovingClient(null)}
            className="fixed inset-0 z-[120] flex items-end justify-center"
            style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}>
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md m-3 rounded-3xl bg-white p-5"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Move to stage</p>
              <p className="text-lg font-black text-slate-900 mb-4 truncate">
                {movingClient.company || "Unnamed"}{movingClient.branch ? ` — ${movingClient.branch}` : ""}
              </p>
              <div className="space-y-1.5">
                {PIPELINE_STAGES.map(stage => {
                  const sc = STAGE_COLORS[stage] || {};
                  const current = (movingClient.stage || "New Lead") === stage;
                  return (
                    <button
                      key={stage}
                      onClick={() => moveClientStage(movingClient, stage)}
                      className="w-full flex items-center gap-3 rounded-2xl px-4 min-h-[52px] border text-left transition-colors"
                      style={current
                        ? { borderColor: sc.dot, background: sc.bg || "#F5EFEF" }
                        : { borderColor: "#E2E8F0", background: "#fff" }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sc.dot }} />
                      <span className="flex-1 text-[15px] font-bold" style={{ color: sc.text || "#334155" }}>{stage}</span>
                      {current && <span className="text-[11px] font-black uppercase" style={{ color: sc.text }}>Current</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setMovingClient(null)}
                className="w-full mt-3 min-h-[48px] rounded-2xl font-bold text-slate-500 bg-slate-100">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
