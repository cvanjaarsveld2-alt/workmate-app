// ─── Calendar Screen — iPhone-style Monthly View ──────────────────────────────
// Full month grid with coloured dots for all event types.
// Tap a day → see the day's schedule. Tap an event → navigate to its screen.
//
// Event types pulled:
//   🔵 Follow-ups    (date field)
//   🟠 Notes         (resolve_by field)
//   🟢 Equipment     (service_due field)
//   🟣 Quotes        (sent_date field)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon,
  Clock, CheckCircle2, Plus, Navigation,
  MessageSquare, Wrench, FileText,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate, formatCurrency } from "../lib/helpers";
import { Card } from "../components/ui";

// ── Constants ─────────────────────────────────────────────────────────────────
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── Event type config ─────────────────────────────────────────────────────────
const EVENT_TYPES = {
  followup:  { dot: "#3B82F6", bg: "#DBEAFE", color: "#1E40AF", icon: Clock,          label: "Follow-up",  screen: "Followups" },
  note:      { dot: "#F59E0B", bg: "#FEF3C7", color: "#92400E", icon: MessageSquare,  label: "Note",       screen: "Notes" },
  equipment: { dot: "#22C55E", bg: "#DCFCE7", color: "#166534", icon: Wrench,          label: "Service",    screen: "Equipment" },
  quote:     { dot: "#A855F7", bg: "#EDE9FE", color: "#5B21B6", icon: FileText,        label: "Quote",      screen: "Quotes" },
};

// ── Build 6-week month grid ───────────────────────────────────────────────────
function monthCells(year, month) {
  const first  = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7; // Mon=0
  const start  = new Date(year, month, 1 - offset, 12);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: iso(d), day: d.getDate(), currentMonth: d.getMonth() === month };
  });
}

// ── Route planner URL ─────────────────────────────────────────────────────────
function routeUrl(locs) {
  if (!locs.length) return null;
  if (locs.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locs[0])}`;
  const o = encodeURIComponent(locs[0]), d = encodeURIComponent(locs[locs.length-1]);
  const w = locs.slice(1,-1).map(encodeURIComponent).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}${w?"&waypoints="+w:""}`;
}

// ── Single event card ─────────────────────────────────────────────────────────
function EventCard({ event, isOverdue, onTap }) {
  const cfg  = EVENT_TYPES[event.type] || EVENT_TYPES.followup;
  const Icon = cfg.icon;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onTap}
      className={`w-full text-left rounded-2xl border bg-white overflow-hidden transition-all active:scale-[0.98] ${
        isOverdue ? "border-l-4 border-l-red-400 border-r border-t border-b border-slate-100" : "border-slate-100"
      }`}>
      <div className="flex items-start gap-3 p-3.5">
        {/* Type indicator */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: cfg.bg }}>
          <Icon size={15} style={{ color: cfg.color }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {event.time && (
            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: cfg.color }}>
              {event.time}
            </p>
          )}
          <p className={`text-sm font-bold break-words ${event.completed ? "line-through text-slate-400" : "text-slate-900"}`}>
            {event.title}
          </p>
          {event.subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{event.subtitle}</p>
          )}
        </div>

        {/* Status badge */}
        <div className="shrink-0 mt-1">
          {event.completed ? (
            <CheckCircle2 size={16} className="text-green-500" />
          ) : isOverdue ? (
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700">Overdue</span>
          ) : (
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ─── Main Calendar Screen ─────────────────────────────────────────────────────
export function CalendarScreen({ data, userId, onNavigate }) {
  const today = todayISO();
  const now   = new Date(today + "T12:00:00");

  const [view, setView]             = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(today);

  const cells = useMemo(() => monthCells(view.year, view.month), [view]);

  // ── Gather ALL events from all data types ───────────────────────────────────
  const allEvents = useMemo(() => {
    const events = [];
    const clients = data.clients || [];

    // Follow-ups
    (data.followups || []).filter(f => f.user_id === userId).forEach(f => {
      if (!f.date) return;
      const client = clients.find(c => c.id === f.client_id);
      events.push({
        id: f.id,
        type: "followup",
        date: f.date,
        time: f.time || null,
        title: f.title,
        subtitle: f.client || client?.company || "",
        completed: !!f.completed,
        location: client?.location || null,
        screen: "Followups",
      });
    });

    // Notes with resolve_by dates
    (data.notes || []).filter(n => n.user_id === userId && n.resolve_by && !n.resolved).forEach(n => {
      events.push({
        id: n.id,
        type: "note",
        date: n.resolve_by,
        time: null,
        title: (n.note || "").slice(0, 80),
        subtitle: n.client || "",
        completed: !!n.resolved,
        urgency: n.urgency,
        screen: "Notes",
      });
    });

    // Equipment service due
    (data.equipment || []).filter(e => e.user_id === userId && e.service_due).forEach(e => {
      events.push({
        id: e.id,
        type: "equipment",
        date: e.service_due,
        time: null,
        title: `Service: ${e.name}`,
        subtitle: [e.make, e.model].filter(Boolean).join(" ") || e.client || "",
        completed: false,
        screen: "Equipment",
      });
    });

    // Quotes sent date
    (data.quotes || []).filter(q => q.user_id === userId && q.sent_date).forEach(q => {
      events.push({
        id: q.id,
        type: "quote",
        date: q.sent_date,
        time: null,
        title: `Quote: ${q.description || q.client_name || ""}`,
        subtitle: q.client_name ? `${q.client_name} — ${formatCurrency(q.value)}` : formatCurrency(q.value),
        completed: q.status === "Accepted",
        screen: "Quotes",
      });
    });

    return events;
  }, [data.followups, data.notes, data.equipment, data.quotes, data.clients, userId]);

  // ── Events grouped by date (for dot rendering) ─────────────────────────────
  const byDate = useMemo(() => {
    const map = {};
    allEvents.forEach(e => {
      if (!e.date) return;
      (map[e.date] ||= []).push(e);
    });
    return map;
  }, [allEvents]);

  // ── Selected day's events ──────────────────────────────────────────────────
  const dayEvents = useMemo(() =>
    (byDate[selectedDate] || []).sort((a, b) => {
      // Sort by time (if present), then by type priority
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      const order = { followup: 0, note: 1, equipment: 2, quote: 3 };
      return (order[a.type] || 9) - (order[b.type] || 9);
    }),
    [byDate, selectedDate]
  );

  const openEvents      = dayEvents.filter(e => !e.completed);
  const completedEvents = dayEvents.filter(e => e.completed);

  // ── Locations for route planning ───────────────────────────────────────────
  const locations = useMemo(() => {
    const locs = [];
    const seen = new Set();
    openEvents.forEach(e => {
      if (e.location && !seen.has(e.location)) { seen.add(e.location); locs.push(e.location); }
    });
    return locs;
  }, [openEvents]);

  // ── Unique dot types for a given date (for the calendar grid) ──────────────
  function dotTypes(date) {
    const events = byDate[date] || [];
    const types = new Set(events.map(e => e.type));
    return Array.from(types).slice(0, 4); // max 4 dots
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function moveMonth(amt) {
    const d = new Date(view.year, view.month + amt, 1, 12);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }
  function goToday() {
    setView({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(today);
  }

  // ── Count total events this month ──────────────────────────────────────────
  const monthEventCount = cells
    .filter(c => c.currentMonth)
    .reduce((sum, c) => sum + (byDate[c.date]?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* ── Month header ── */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => moveMonth(-1)}
            className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center active:bg-slate-100">
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <div className="text-center">
            <p className="text-base font-black text-slate-900">{MONTHS[view.month]} {view.year}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {monthEventCount} event{monthEventCount !== 1 ? "s" : ""}
            </p>
            {(view.month !== now.getMonth() || view.year !== now.getFullYear()) && (
              <button onClick={goToday} className="text-xs font-bold mt-1" style={{ color: BRAND.primary }}>
                Back to today
              </button>
            )}
          </div>
          <button onClick={() => moveMonth(1)}
            className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center active:bg-slate-100">
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Day name headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-[9px] sm:text-[10px] font-black uppercase text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map(cell => {
            const dots     = dotTypes(cell.date);
            const count    = (byDate[cell.date] || []).length;
            const hasOverdue = (byDate[cell.date] || []).some(e => !e.completed && cell.date < today);
            const selected = cell.date === selectedDate;
            const isToday  = cell.date === today;

            return (
              <button
                key={cell.date}
                onClick={() => setSelectedDate(cell.date)}
                className={`relative flex flex-col items-center justify-center rounded-xl border transition-all
                  ${selected
                    ? "text-white border-transparent shadow-sm"
                    : isToday
                      ? "border-red-200 bg-red-50/60"
                      : "border-transparent bg-white hover:bg-slate-50"
                  }
                  ${!cell.currentMonth && !selected ? "opacity-30" : ""}
                `}
                style={{
                  minHeight: 48,
                  ...(selected ? { background: BRAND.primary } : {}),
                }}>
                <span className={`text-xs sm:text-sm font-bold ${isToday && !selected ? "font-black" : ""}`}>
                  {cell.day}
                </span>

                {/* Coloured dots — iPhone style */}
                {dots.length > 0 && (
                  <div className="flex gap-[3px] mt-1">
                    {dots.map(type => (
                      <div
                        key={type}
                        className="w-[5px] h-[5px] rounded-full"
                        style={{ background: selected ? "rgba(255,255,255,0.7)" : EVENT_TYPES[type]?.dot || "#94A3B8" }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-100">
          {Object.entries(EVENT_TYPES).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
              <span className="text-[10px] font-bold text-slate-400">{cfg.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Route planner ── */}
      {locations.length > 0 && (
        <button
          onClick={() => window.open(routeUrl(locations), "_blank")}
          className="w-full py-3.5 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm font-black flex items-center justify-center gap-2 min-h-[48px]">
          <Navigation size={16} />
          Plan route — {locations.length} stop{locations.length !== 1 ? "s" : ""}
        </button>
      )}

      {/* ── Day header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-700">
            {selectedDate === today ? "Today" : smartDate(selectedDate)}
          </p>
          <p className="text-xs text-slate-400">
            {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => onNavigate?.("Followups")}
          className="flex items-center gap-1 text-sm font-bold min-h-[36px] px-3 rounded-xl"
          style={{ color: BRAND.primary }}>
          <Plus size={14} /> Add
        </button>
      </div>

      {/* ── Day events list ── */}
      {dayEvents.length === 0 ? (
        <Card className="p-10 text-center">
          <CalIcon size={28} className="mx-auto text-slate-200" />
          <p className="text-sm font-bold text-slate-400 mt-2">Nothing scheduled</p>
          <p className="text-xs text-slate-400 mt-1">Tap + to add a follow-up for this day</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Open events */}
          <AnimatePresence>
            {openEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                isOverdue={!event.completed && event.date < today}
                onTap={() => onNavigate?.(event.screen)}
              />
            ))}
          </AnimatePresence>

          {/* Completed events */}
          {completedEvents.length > 0 && (
            <>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider pt-2">
                Completed
              </p>
              {completedEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  isOverdue={false}
                  onTap={() => onNavigate?.(event.screen)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
