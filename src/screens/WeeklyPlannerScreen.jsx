// ─── Weekly Planner ───────────────────────────────────────────────────────────
// An auto-prioritised Mon–Sun view built from PowerMate's own data:
//   • Follow-ups (by their date) — overdue ones surface as high priority
//   • Quotes going cold (Pending + sent a while ago) — chase before they die
//   • Neglected clients (no activity in N days) — reach out
//   • Meetings (follow-ups flagged as meetings)
//
// The planner SUGGESTS priorities (urgent/overdue float up) but you can adjust:
// tap an item to move it to another day, or mark it done. It writes changes
// through the app's normal hardened sync path — no new write logic.
//
// Phase 1 of the assistant: pure planning from data you already have, zero
// external integrations. Email/message drafting comes later.
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon, AlertTriangle, Clock, FileText,
  Users, CheckCircle2, ChevronRight, X, Flame, Sparkles,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { Card, PageHeader, Empty } from "../components/ui";
import { todayISO, genId } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { offlineSave } from "../offline/offlineDb";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Monday-start week containing `base`. Returns array of 7 ISO date strings.
function weekDates(base) {
  const d = new Date(base);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d); monday.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday); x.setDate(monday.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

function iso(d) { return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(a) - new Date(b)) / 86400000); }

export function WeeklyPlannerScreen({ data, setData, userId, teamId, onNavigate }) {
  const today = todayISO();
  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + weekOffset * 7); return d;
  }, [today, weekOffset]);
  const week = useMemo(() => weekDates(baseDate), [baseDate]);

  const clients   = data.clients   || [];
  const followups = data.followups || [];
  const quotes    = data.quotes    || [];
  const [moving, setMoving] = useState(null); // item being moved (declared before the handlers that use it)

  // ── Build the prioritised item list for this week ──────────────────────────
  const { byDay, backlog } = useMemo(() => {
    const items = [];

    // 1. Follow-ups whose date falls in this week (or overdue → land on today).
    for (const f of followups) {
      if (f.completed) continue;
      if (!f.date) continue;
      const overdue = f.date < today;
      const inWeek = f.date >= week[0] && f.date <= week[6];
      if (!inWeek && !overdue) continue;
      const isMeeting = /meeting/i.test(f.title || "") || /meeting/i.test(f.notes || "");
      items.push({
        id: f.id,
        kind: isMeeting ? "meeting" : "followup",
        title: f.title || (isMeeting ? "Meeting" : "Follow-up"),
        client: f.client || "",
        day: overdue ? today : f.date,          // overdue floats onto today
        priority: overdue ? 3 : (isMeeting ? 2 : 1),
        overdue,
        source: "followup",
        raw: f,
      });
    }

    // 2. Quotes going cold: Pending and sent 5+ days ago → chase this week (today).
    for (const q of quotes) {
      if (q.status !== "Pending") continue;
      const sent = q.sent_date || q.created_at;
      const age = sent ? daysBetween(today, sent.slice(0, 10)) : 0;
      if (age < 5) continue;
      items.push({
        id: `quote-${q.id}`,
        kind: "quote",
        title: `Chase quote${q.value ? ` (R${Number(q.value).toLocaleString()})` : ""}`,
        client: q.client_name || "",
        day: today,
        priority: age >= 10 ? 3 : 2,
        overdue: age >= 10,
        source: "quote",
        raw: q,
      });
    }

    // 3. Neglected clients: active pipeline, no update in 14+ days → reach out.
    for (const c of clients) {
      const stage = c.stage || "New Lead";
      if (["Won", "Lost"].includes(stage)) continue;
      const last = (c.updated_at || c.created_at || "").slice(0, 10);
      if (!last) continue;
      const age = daysBetween(today, last);
      if (age < 14) continue;
      items.push({
        id: `client-${c.id}`,
        kind: "reachout",
        title: `Reach out — quiet ${age}d`,
        client: c.company || "Client",
        day: today,
        priority: age >= 30 ? 3 : 1,
        overdue: age >= 30,
        source: "client",
        raw: c,
      });
    }

    // Group by day; anything not landing on a week day goes to backlog.
    const byDay = {}; week.forEach(d => (byDay[d] = []));
    const backlog = [];
    for (const it of items) {
      if (byDay[it.day]) byDay[it.day].push(it);
      else backlog.push(it);
    }
    // Sort each day by priority (high first).
    for (const d of week) byDay[d].sort((a, b) => b.priority - a.priority);
    return { byDay, backlog };
  }, [followups, quotes, clients, week, today]);

  // ── Move a real follow-up to a different day (adjust the plan) ──────────────
  function moveFollowupToDay(item, newDay) {
    if (item.source !== "followup") return; // only real follow-ups are movable
    const f = item.raw;
    const updated = withTeamId({ ...f, date: newDay, sync_status: "pending" }, teamId);
    setData(d => ({
      ...d,
      followups: (d.followups || []).map(x => x.id === f.id ? updated : x),
      syncQueue: [{ id: genId(), table: "followups", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    offlineSave("followups", updated).catch(() => {});
    triggerImmediateSync();
    setMoving(null);
  }

  function completeFollowup(item) {
    if (item.source !== "followup") return;
    const f = item.raw;
    const updated = withTeamId({ ...f, completed: true, sync_status: "pending" }, teamId);
    setData(d => ({
      ...d,
      followups: (d.followups || []).map(x => x.id === f.id ? updated : x),
      syncQueue: [{ id: genId(), table: "followups", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    offlineSave("followups", updated).catch(() => {});
    triggerImmediateSync();
  }

  const totalItems = week.reduce((s, d) => s + byDay[d].length, 0) + backlog.length;
  const weekLabel = weekOffset === 0 ? "This week"
    : weekOffset === 1 ? "Next week"
    : weekOffset === -1 ? "Last week"
    : `${week[0].slice(5)} – ${week[6].slice(5)}`;

  return (
    <div className="space-y-3">
      <PageHeader title="Weekly Planner" subtitle={`${totalItems} item${totalItems !== 1 ? "s" : ""} · auto-prioritised`} />

      {/* Week switcher */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekOffset(w => w - 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600">← Prev</button>
        <span className="text-sm font-black text-slate-800">{weekLabel}</span>
        <button onClick={() => setWeekOffset(w => w + 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600">Next →</button>
      </div>

      {/* Backlog — overdue/cold items that need a home */}
      {backlog.length > 0 && (
        <Card className="p-3.5" >
          <div className="flex items-center gap-2 mb-2">
            <Flame size={15} style={{ color: BRAND.primary }} />
            <span className="text-xs font-black uppercase tracking-wider" style={{ color: BRAND.primary }}>
              Needs attention ({backlog.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {backlog.map(it => <PlanItem key={it.id} item={it} onMove={() => setMoving(it)} onDone={() => completeFollowup(it)} onOpen={onNavigate} />)}
          </div>
        </Card>
      )}

      {/* The 7 days */}
      {week.map((d, i) => {
        const items = byDay[d];
        const isToday = d === today;
        return (
          <Card key={d} className="p-3.5" >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black" style={{ color: isToday ? BRAND.primary : "#0F172A" }}>
                  {DAYS[i]}
                </span>
                <span className="text-xs text-slate-400">{d.slice(8)}/{d.slice(5, 7)}</span>
                {isToday && <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full text-white" style={{ background: BRAND.primary }}>Today</span>}
              </div>
              <span className="text-xs font-bold text-slate-400">{items.length ? `${items.length}` : "—"}</span>
            </div>
            {items.length === 0
              ? <p className="text-xs text-slate-300 py-1">Nothing scheduled</p>
              : <div className="space-y-1.5">
                  {items.map(it => <PlanItem key={it.id} item={it} onMove={() => setMoving(it)} onDone={() => completeFollowup(it)} onOpen={onNavigate} />)}
                </div>}
          </Card>
        );
      })}

      {totalItems === 0 && (
        <Empty icon={Sparkles} title="Your week is clear" text="No overdue follow-ups, cold quotes, or neglected clients. Nicely done." />
      )}

      {/* Move-to-day picker */}
      <AnimatePresence>
        {moving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMoving(null)}
            className="fixed inset-0 z-[120] flex items-end justify-center"
            style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}>
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md m-3 rounded-3xl bg-white p-5"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Move to</p>
              <p className="text-base font-black text-slate-900 mb-1 truncate">{moving.title}</p>
              {moving.client && <p className="text-sm text-slate-500 mb-3">{moving.client}</p>}
              {moving.source !== "followup" ? (
                <p className="text-sm text-slate-500 py-2">
                  This is a suggested action (from a {moving.source}). Open it to act — only real follow-ups can be rescheduled here.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {week.map((d, i) => (
                    <button key={d} onClick={() => moveFollowupToDay(moving, d)}
                      className="flex items-center justify-between rounded-2xl px-4 min-h-[48px] border border-slate-200 bg-white text-left">
                      <span className="text-sm font-bold text-slate-700">{DAYS[i]}</span>
                      <span className="text-xs text-slate-400">{d.slice(8)}/{d.slice(5, 7)}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setMoving(null)}
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

// ── A single plan item row ────────────────────────────────────────────────────
function PlanItem({ item, onMove, onDone, onOpen }) {
  const meta = {
    followup: { icon: CalendarIcon, color: "#2563EB", label: "Follow-up" },
    meeting:  { icon: Users,        color: "#7C3AED", label: "Meeting" },
    quote:    { icon: FileText,     color: "#B45309", label: "Quote" },
    reachout: { icon: AlertTriangle,color: "#DC2626", label: "Reach out" },
  }[item.kind] || { icon: Clock, color: "#64748B", label: "" };
  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-slate-50">
      <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
        style={{ background: `${meta.color}18` }}>
        <Icon size={14} style={{ color: meta.color }} />
      </span>
      <button className="flex-1 min-w-0 text-left" onClick={onMove}>
        <div className="flex items-center gap-1.5">
          {item.overdue && <Flame size={11} className="shrink-0" style={{ color: "#DC2626" }} />}
          <span className="text-sm font-bold text-slate-800 truncate">{item.title}</span>
        </div>
        {item.client && <span className="text-xs text-slate-400 truncate block">{item.client}</span>}
      </button>
      {item.source === "followup" && (
        <button onClick={onDone} className="shrink-0 w-8 h-8 grid place-items-center rounded-full active:bg-slate-200">
          <CheckCircle2 size={17} className="text-slate-300" />
        </button>
      )}
    </div>
  );
}
