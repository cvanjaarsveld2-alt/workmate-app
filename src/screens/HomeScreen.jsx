// ─── Home Screen ──────────────────────────────────────────────────────────────
import React from "react";
import { motion } from "framer-motion";
import {
  Calendar, ChevronRight, File as FileIcon,
  TrendingUp, Wrench, AlertCircle, Clock, Clipboard,
  CheckCircle2, ArrowRight,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";
import { todayISO, niceDate, daysDiff, smartDate } from "../lib/helpers";
import { Card, StatCard } from "../components/ui";

export function HomeScreen({ data, setScreen, user }) {
  const today     = todayISO();
  const clients   = data.clients   || [];
  const quotes    = data.quotes    || [];
  const followups = data.followups || [];
  const equipment = data.equipment || [];
  const notes     = data.notes     || [];

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

      {/* ── Header: just date + logo ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{niceDate()}</p>
        <img src={BRAND.logo} alt="PW" className="h-8 object-contain opacity-80" onError={e => e.target.style.display = "none"} />
      </div>

      {/* ── Consolidated Action Required ──────────────────────────────────────── */}
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
                  onClick={() => setScreen(item.screen)}
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

      {/* ── Today's Schedule ───────────────────────────────────────────────────── */}
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

      {/* ── Stats Grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Today's Tasks"
          value={todayFU.length}
          sub={todayFU.length === 0 ? "all clear" : "follow-ups due"}
          color={BRAND.primary}
          icon={Calendar}
        />
        <StatCard
          label="Pending Quotes"
          value={pendingQ.length}
          sub={pendingQ.length === 0 ? "none awaiting" : "awaiting response"}
          color="#B45309"
          icon={FileIcon}
        />
        <StatCard
          label="Won Revenue"
          value={`R${Math.round(wonRev / 1000)}k`}
          sub={`${acceptedQ} accepted quote${acceptedQ !== 1 ? "s" : ""}`}
          color="#16A34A"
          icon={TrendingUp}
        />
        <StatCard
          label="Quote Conversion"
          value={`${quoteConversion}%`}
          sub={`${acceptedQ} of ${sentQuotes} sent`}
          color="#7C3AED"
          icon={TrendingUp}
        />
      </div>

      {/* ── Pipeline ──────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Sales Pipeline</p>
          <p className="text-xs text-slate-400">{inPipeline} in pipeline{lostC > 0 ? ` · ${lostC} lost` : ""}</p>
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
