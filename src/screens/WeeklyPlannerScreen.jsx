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
import { buildDraft, draftToText } from "../lib/draftMessages";
import { Mail, MessageCircle, Copy, Check as CheckIcon, Pencil, ChevronDown } from "lucide-react";

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
  const [drafting, setDrafting] = useState(null); // { item, client } for the draft composer
  const [reachoutsOpen, setReachoutsOpen] = useState(false); // collapsed by default
  const [snoozeDays, setSnoozeDays] = useState(() => {
    const v = parseInt(localStorage.getItem("pm_reachout_snooze") || "10", 10);
    return Number.isFinite(v) && v > 0 ? v : 10;
  });
  function changeSnooze(days) {
    setSnoozeDays(days);
    try { localStorage.setItem("pm_reachout_snooze", String(days)); } catch {}
  }

  // Mark a client as contacted today → stamps last_contacted so the planner
  // snoozes their reach-out for snoozeDays. Called on draft-copy and on the
  // manual "Contacted" button. Writes through the hardened sync path.
  function markContacted(client) {
    if (!client?.id || !setData) return;
    const updated = withTeamId({ ...client, last_contacted: new Date().toISOString(), sync_status: "pending" }, teamId);
    setData(d => ({
      ...d,
      clients: (d.clients || []).map(c => c.id === client.id ? updated : c),
      syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    offlineSave("clients", updated).catch(() => {});
    triggerImmediateSync();
  }

  // Resolve the client record behind an item, so drafts can be personalised.
  function clientForItem(item) {
    if (item.source === "client") return item.raw;
    const id = item.raw?.client_id;
    if (id) return (data.clients || []).find(c => c.id === id) || null;
    // fall back to matching by company name
    const name = item.client;
    return (data.clients || []).find(c => c.company === name) || null;
  }

  // ── Build the prioritised item list for this week ──────────────────────────
  const { byDay, backlog, reachouts } = useMemo(() => {
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
    // Skipped if you've contacted them within the snooze window (last_contacted).
    for (const c of clients) {
      const stage = c.stage || "New Lead";
      if (["Won", "Lost"].includes(stage)) continue;
      const last = (c.updated_at || c.created_at || "").slice(0, 10);
      if (!last) continue;
      const age = daysBetween(today, last);
      if (age < 14) continue;
      // Snooze: if contacted recently (via draft or "Contacted"), hide for snoozeDays.
      const contacted = (c.last_contacted || "").slice(0, 10);
      if (contacted && daysBetween(today, contacted) < snoozeDays) continue;
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

    // Split reach-outs from the rest — they get their own collapsible group.
    const reachouts = items.filter(it => it.kind === "reachout");
    const actionItems = items.filter(it => it.kind !== "reachout");

    // Group by day; anything not landing on a week day goes to backlog.
    const byDay = {}; week.forEach(d => (byDay[d] = []));
    const backlog = [];
    for (const it of actionItems) {
      if (byDay[it.day]) byDay[it.day].push(it);
      else backlog.push(it);
    }
    // Sort each day by priority (high first).
    for (const d of week) byDay[d].sort((a, b) => b.priority - a.priority);
    reachouts.sort((a, b) => b.priority - a.priority);
    return { byDay, backlog, reachouts };
  }, [followups, quotes, clients, week, today, snoozeDays]);

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

  const totalItems = week.reduce((s, d) => s + byDay[d].length, 0) + backlog.length + reachouts.length;
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
            {backlog.map(it => <PlanItem key={it.id} item={it} onMove={() => setMoving(it)} onDone={() => completeFollowup(it)} onOpen={onNavigate} onDraft={() => setDrafting({ item: it, client: clientForItem(it) })} />)}
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
                  {items.map(it => <PlanItem key={it.id} item={it} onMove={() => setMoving(it)} onDone={() => completeFollowup(it)} onOpen={onNavigate} onDraft={() => setDrafting({ item: it, client: clientForItem(it) })} />)}
                </div>}
          </Card>
        );
      })}

      {/* Reach-outs — collapsed by default, snooze-aware */}
      {reachouts.length > 0 && (
        <Card className="p-3.5">
          <button onClick={() => setReachoutsOpen(o => !o)} className="w-full flex items-center gap-2 text-left">
            {reachoutsOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
            <AlertTriangle size={15} style={{ color: "#DC2626" }} />
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex-1">
              Reach out ({reachouts.length})
            </span>
          </button>
          <AnimatePresence initial={false}>
            {reachoutsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="pt-2.5 space-y-1.5">
                  {reachouts.map(it => (
                    <div key={it.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-slate-50">
                      <span className="w-7 h-7 rounded-lg shrink-0 grid place-items-center" style={{ background: "#DC262618" }}>
                        <AlertTriangle size={14} style={{ color: "#DC2626" }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-slate-800 truncate block">{it.client}</span>
                        <span className="text-xs text-slate-400 truncate block">{it.title}</span>
                      </div>
                      <button onClick={() => setDrafting({ item: it, client: clientForItem(it) })}
                        className="shrink-0 w-8 h-8 grid place-items-center rounded-full active:bg-slate-200" aria-label="Draft message">
                        <Mail size={15} style={{ color: BRAND.primary }} />
                      </button>
                      <button onClick={() => markContacted(it.raw)}
                        className="shrink-0 px-2.5 h-8 rounded-full text-[11px] font-bold active:bg-slate-200 flex items-center gap-1"
                        style={{ color: "#16A34A" }} aria-label="Mark contacted">
                        <CheckIcon size={13} /> Done
                      </button>
                    </div>
                  ))}
                </div>
                {/* Snooze setting */}
                <div className="mt-3 pt-2.5 border-t border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 mb-1.5">Hide after contacting for:</p>
                  <div className="flex gap-1.5">
                    {[7, 10, 14, 21].map(d => (
                      <button key={d} onClick={() => changeSnooze(d)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
                        style={snoozeDays === d
                          ? { borderColor: BRAND.primary, background: BRAND.light, color: BRAND.primary }
                          : { borderColor: "#E2E8F0", background: "#fff", color: "#64748B" }}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {totalItems === 0 && (
        <Empty icon={Sparkles} title="Your week is clear" text="No overdue follow-ups, cold quotes, or neglected clients. Nicely done." />
      )}

      {/* Draft composer */}
      <AnimatePresence>
        {drafting && <DraftComposer draft={drafting} onClose={() => setDrafting(null)}
          onContacted={() => { if (drafting.client) markContacted(drafting.client); }} />}
      </AnimatePresence>

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
function PlanItem({ item, onMove, onDone, onOpen, onDraft }) {
  const meta = {
    followup: { icon: CalendarIcon, color: "#2563EB", label: "Follow-up" },
    meeting:  { icon: Users,        color: "#7C3AED", label: "Meeting" },
    quote:    { icon: FileText,     color: "#B45309", label: "Quote" },
    reachout: { icon: AlertTriangle,color: "#DC2626", label: "Reach out" },
  }[item.kind] || { icon: Clock, color: "#64748B", label: "" };
  const Icon = meta.icon;
  // Which items are worth drafting a message for.
  const canDraft = ["quote", "reachout", "meeting"].includes(item.kind);

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
      {canDraft && (
        <button onClick={onDraft} className="shrink-0 w-8 h-8 grid place-items-center rounded-full active:bg-slate-200" aria-label="Draft message">
          <Mail size={15} style={{ color: BRAND.primary }} />
        </button>
      )}
      {item.source === "followup" && (
        <button onClick={onDone} className="shrink-0 w-8 h-8 grid place-items-center rounded-full active:bg-slate-200">
          <CheckCircle2 size={17} className="text-slate-300" />
        </button>
      )}
    </div>
  );
}

// ── Draft composer — email/WhatsApp toggle, editable text, copy to clipboard ──
function DraftComposer({ draft, onClose, onContacted }) {
  const { item, client } = draft;
  const [channel, setChannel] = useState("email");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  // Regenerate the draft whenever the channel changes.
  React.useEffect(() => {
    const d = buildDraft(item, channel, client);
    setText(draftToText(d, channel));
    setCopied(false);
  }, [channel, item, client]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onContacted?.(); // stamp last_contacted so this client's reach-out snoozes
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can fail on some browsers; leave text selectable as fallback
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}>
      <motion.div
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md m-3 rounded-3xl bg-white p-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 mb-1">
          <Pencil size={15} style={{ color: BRAND.primary }} />
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Draft message</p>
        </div>
        <p className="text-base font-black text-slate-900 truncate">{item.client || "Message"}</p>

        {/* Channel toggle */}
        <div className="grid grid-cols-2 gap-2 my-3">
          {[
            { key: "email", label: "Email", icon: Mail },
            { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
          ].map(c => {
            const active = channel === c.key;
            const Icon = c.icon;
            return (
              <button key={c.key} onClick={() => setChannel(c.key)}
                className="flex items-center justify-center gap-2 rounded-2xl py-2.5 border text-sm font-bold transition-colors"
                style={active
                  ? { borderColor: BRAND.primary, background: BRAND.light, color: BRAND.primary }
                  : { borderColor: "#E2E8F0", background: "#fff", color: "#64748B" }}>
                <Icon size={16} /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Editable draft */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={channel === "email" ? 10 : 5}
          className="w-full rounded-2xl border border-slate-200 p-3 text-[15px] outline-none focus:border-slate-400 resize-none"
          style={{ fontSize: 16 }} />

        <button onClick={copy}
          className="w-full mt-3 min-h-[52px] rounded-2xl font-bold text-white flex items-center justify-center gap-2"
          style={{ background: copied ? "#16A34A" : BRAND.primary }}>
          {copied ? <><CheckIcon size={18} /> Copied — paste into {channel === "email" ? "Outlook" : "WhatsApp"}</> : <><Copy size={18} /> Copy message</>}
        </button>
        <button onClick={onClose}
          className="w-full mt-2 min-h-[44px] rounded-2xl font-bold text-slate-500 bg-slate-100">
          Close
        </button>
      </motion.div>
    </motion.div>
  );
}
