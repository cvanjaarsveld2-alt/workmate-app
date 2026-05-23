// ─── Home Screen ──────────────────────────────────────────────────────────────
import React from "react";
import { motion } from "framer-motion";
import {
  Calendar, ChevronRight, File as FileIcon,
  Users, TrendingUp, Wrench, AlertCircle, Clock, Clipboard,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";
import { todayISO, niceDate, daysDiff } from "../lib/helpers";
import { Card, StatCard, PageHeader } from "../components/ui";

export function HomeScreen({ data, setScreen }) {
  const today     = todayISO();
  const clients   = data.clients   || [];
  const quotes    = data.quotes    || [];
  const followups = data.followups || [];
  const equipment = data.equipment || [];
  const notes     = data.notes     || [];

  const todayFU       = followups.filter(f => f.date === today && !f.completed);
  const overdueFU     = followups.filter(f => f.date < today && !f.completed);
  const pendingQ      = quotes.filter(q => q.status === "Pending");
  const wonRev        = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const overdueEquip  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) < 0);
  const dueSoonEquip  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) >= 0 && daysDiff(e.service_due) <= 7);
  const criticalNotes = notes.filter(n => !n.resolved && n.urgency === "Critical");
  const overdueNotes  = notes.filter(n => !n.resolved && n.resolve_by && n.resolve_by < today);

  const pCount   = PIPELINE_STAGES.reduce((a, s) => { a[s] = clients.filter(c => (c.stage || "New Lead") === s).length; return a; }, {});
  const wonC     = pCount["Won"] || 0;
  const convRate = clients.length > 0 ? Math.round((wonC / clients.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400">{niceDate()}</p>
        </div>
        <img src={BRAND.logo} alt="PW" className="h-8 object-contain opacity-80" onError={e => e.target.style.display = "none"} />
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {criticalNotes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-4 cursor-pointer min-h-[56px]"
            onClick={() => setScreen("Notes")}>
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <p className="text-sm font-bold text-red-700 flex-1">🚨 {criticalNotes.length} critical note{criticalNotes.length !== 1 ? "s" : ""} unresolved</p>
            <ChevronRight size={16} className="text-red-400 shrink-0" />
          </motion.div>
        )}
        {overdueNotes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl bg-orange-50 border border-orange-200 p-4 cursor-pointer min-h-[56px]"
            onClick={() => setScreen("Notes")}>
            <Clipboard size={18} className="text-orange-600 shrink-0" />
            <p className="text-sm font-bold text-orange-700 flex-1">⏰ {overdueNotes.length} overdue note{overdueNotes.length !== 1 ? "s" : ""} — resolve date passed</p>
            <ChevronRight size={16} className="text-orange-400 shrink-0" />
          </motion.div>
        )}
        {overdueFU.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-4 cursor-pointer min-h-[56px]"
            onClick={() => setScreen("Followups")}>
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <p className="text-sm font-bold text-red-700 flex-1">{overdueFU.length} overdue follow-up{overdueFU.length !== 1 ? "s" : ""}</p>
            <ChevronRight size={16} className="text-red-400 shrink-0" />
          </motion.div>
        )}
        {overdueEquip.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl bg-orange-50 border border-orange-200 p-4 cursor-pointer min-h-[56px]"
            onClick={() => setScreen("Equipment")}>
            <Wrench size={18} className="text-orange-600 shrink-0" />
            <p className="text-sm font-bold text-orange-700 flex-1">{overdueEquip.length} equipment service{overdueEquip.length !== 1 ? "s" : ""} overdue</p>
            <ChevronRight size={16} className="text-orange-400 shrink-0" />
          </motion.div>
        )}
        {dueSoonEquip.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 cursor-pointer min-h-[56px]"
            onClick={() => setScreen("Equipment")}>
            <Clock size={18} className="text-amber-600 shrink-0" />
            <p className="text-sm font-bold text-amber-700 flex-1">{dueSoonEquip.length} service{dueSoonEquip.length !== 1 ? "s" : ""} due within 7 days</p>
            <ChevronRight size={16} className="text-amber-400 shrink-0" />
          </motion.div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Tasks"  value={todayFU.length}                    sub="follow-ups due"       color={BRAND.primary} icon={Calendar} />
        <StatCard label="Pending Quotes" value={pendingQ.length}                   sub="awaiting response"    color="#B45309"       icon={FileIcon} />
        <StatCard label="Won Revenue"    value={`R${Math.round(wonRev / 1000)}k`}  sub="accepted quotes"      color="#16A34A"       icon={TrendingUp} />
        <StatCard label="Win Rate"       value={`${convRate}%`}                    sub={`${wonC} of ${clients.length} clients`} color="#7C3AED" icon={TrendingUp} />
      </div>

      {/* Pipeline */}
      <Card className="p-4">
        <p className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wider">Sales Pipeline</p>
        <div className="space-y-2.5">
          {PIPELINE_STAGES.filter(s => s !== "Lost").map(stage => {
            const count = pCount[stage] || 0;
            const total = clients.length || 1;
            const c     = STAGE_COLORS[stage];
            return (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-20 text-sm font-bold shrink-0" style={{ color: c.text }}>{stage}</span>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(count / total) * 100}%`, background: c.dot }} />
                </div>
                <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Users,    label: "Clients",    screen: "Clients",   count: clients.length },
          { icon: Calendar, label: "Follow-ups", screen: "Followups", count: followups.filter(f => !f.completed).length },
          { icon: FileIcon, label: "Quotes",     screen: "Quotes",    count: quotes.length },
          { icon: Wrench,   label: "Equipment",  screen: "Equipment", count: equipment.length },
        ].map(({ icon: Icon, label, screen, count }) => (
          <Card key={label} className="p-4" onClick={() => setScreen(screen)}>
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2.5" style={{ background: BRAND.light }}>
                <Icon size={18} style={{ color: BRAND.primary }} />
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </div>
            <p className="text-2xl font-black text-slate-900">{count}</p>
            <p className="text-sm text-slate-400">{label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
