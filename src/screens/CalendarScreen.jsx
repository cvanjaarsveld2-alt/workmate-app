// ─── Calendar / Agenda Screen ─────────────────────────────────────────────────
// Week strip + day agenda for follow-ups. Tap a day to see the schedule.
// "Plan my route" → opens Google Maps with the day's client locations.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Check, MapPin, Navigation,
  Calendar as CalendarIcon, Clock, CheckCircle2, Plus,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";
import { Card, Toast } from "../components/ui";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getWeekDays(refDate) {
  const d = new Date(refDate + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(mon); dd.setDate(mon.getDate() + i);
    days.push({ date: isoDate(dd), dayName: DAYS[dd.getDay()], dayNum: dd.getDate(), month: MONTHS[dd.getMonth()], year: dd.getFullYear() });
  }
  return days;
}

function routeUrl(locations) {
  if (locations.length === 0) return null;
  const waypoints = locations.map(l => encodeURIComponent(l)).join("|");
  if (locations.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locations[0])}`;
  const origin = encodeURIComponent(locations[0]);
  const dest = encodeURIComponent(locations[locations.length - 1]);
  const mid = locations.slice(1, -1).map(l => encodeURIComponent(l)).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${mid ? "&waypoints=" + mid : ""}`;
}

export function CalendarScreen({ data, setData, userId, onNavigate }) {
  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [toast, setToast] = useState("");

  const refDate = useMemo(() => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + weekOffset * 7);
    return isoDate(d);
  }, [today, weekOffset]);

  const weekDays = useMemo(() => getWeekDays(refDate), [refDate]);
  const monthLabel = weekDays.length > 0 ? `${weekDays[0].month} ${weekDays[0].year}` : "";

  const allFollowups = (data.followups || []).filter(f => f.user_id === userId);

  // Count per day for dots
  const countByDate = useMemo(() => {
    const map = {};
    allFollowups.forEach(f => { if (f.date) map[f.date] = (map[f.date] || 0) + 1; });
    return map;
  }, [allFollowups]);

  // Selected day's items
  const dayItems = useMemo(() =>
    allFollowups
      .filter(f => f.date === selectedDate)
      .sort((a, b) => (a.time || "").localeCompare(b.time || "")),
    [allFollowups, selectedDate]
  );

  const openItems = dayItems.filter(f => !f.completed);
  const completedItems = dayItems.filter(f => f.completed);

  // Collect unique locations for route planning
  const clients = data.clients || [];
  const dayLocations = useMemo(() => {
    const locs = [];
    const seen = new Set();
    openItems.forEach(f => {
      const client = clients.find(c => c.id === f.client_id);
      const loc = client?.location || f.location;
      if (loc && !seen.has(loc)) { seen.add(loc); locs.push(loc); }
    });
    return locs;
  }, [openItems, clients]);

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* Month + nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-2.5 rounded-xl bg-white border border-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ChevronLeft size={18} className="text-slate-500" />
        </button>
        <div className="text-center">
          <p className="text-base font-black text-slate-900">{monthLabel}</p>
          {weekOffset !== 0 && <button onClick={() => { setWeekOffset(0); setSelectedDate(today); }} className="text-xs font-bold mt-0.5" style={{ color: BRAND.primary }}>Back to today</button>}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-2.5 rounded-xl bg-white border border-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ChevronRight size={18} className="text-slate-500" />
        </button>
      </div>

      {/* Week strip */}
      <div className="flex gap-1">
        {weekDays.map(d => {
          const isToday = d.date === today;
          const isSelected = d.date === selectedDate;
          const count = countByDate[d.date] || 0;
          const hasOverdue = allFollowups.some(f => f.date === d.date && !f.completed && d.date < today);
          return (
            <button key={d.date} onClick={() => setSelectedDate(d.date)}
              className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl transition-all min-h-[72px] ${
                isSelected ? "text-white shadow-sm" : "bg-white border border-slate-100 text-slate-600"}`}
              style={isSelected ? { background: BRAND.primary } : {}}>
              <span className="text-[10px] font-bold uppercase">{d.dayName}</span>
              <span className={`text-lg font-black mt-0.5 ${isToday && !isSelected ? "underline" : ""}`}>{d.dayNum}</span>
              {count > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/60" : hasOverdue ? "bg-red-400" : "bg-blue-400"}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Route button */}
      {dayLocations.length > 0 && (
        <button onClick={() => { const url = routeUrl(dayLocations); if (url) window.open(url, "_blank"); }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 bg-green-50 border border-green-200 text-green-700 text-sm font-black min-h-[48px]">
          <Navigation size={16} /> Plan route — {dayLocations.length} stop{dayLocations.length !== 1 ? "s" : ""}
        </button>
      )}

      {/* Day header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-slate-700">
          {selectedDate === today ? "Today" : smartDate(selectedDate)} — {dayItems.length} item{dayItems.length !== 1 ? "s" : ""}
        </p>
        <button onClick={() => onNavigate?.("Followups")} className="text-xs font-bold" style={{ color: BRAND.primary }}>
          <Plus size={14} className="inline mr-0.5" /> Add
        </button>
      </div>

      {/* Day items */}
      {dayItems.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarIcon size={28} className="mx-auto text-slate-200" />
          <p className="text-sm font-bold text-slate-400 mt-2">Nothing scheduled</p>
          <p className="text-xs text-slate-400 mt-1">Tap + to add a follow-up</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {openItems.map(f => {
            const isOverdue = f.date < today;
            return (
              <Card key={f.id} className={`p-3.5 ${isOverdue ? "border-l-4 border-l-red-400" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isOverdue ? "bg-red-100" : "bg-blue-50"}`}>
                    <Clock size={16} className={isOverdue ? "text-red-500" : "text-blue-500"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {f.time && <p className="text-xs font-black text-slate-400">{f.time}</p>}
                    <p className="text-sm font-bold text-slate-900 break-words">{f.title}</p>
                    {f.client && <p className="text-xs text-slate-500 mt-0.5">{f.client}{f.branch ? ` — ${f.branch}` : ""}</p>}
                    {f.notes && <p className="text-xs text-slate-400 mt-1 break-words">{f.notes}</p>}
                  </div>
                  {isOverdue && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-600 shrink-0">Overdue</span>}
                </div>
              </Card>
            );
          })}
          {completedItems.length > 0 && (
            <>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider pt-2">Completed</p>
              {completedItems.map(f => (
                <Card key={f.id} className="p-3 opacity-60">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <p className="text-sm text-slate-400 line-through truncate">{f.title}</p>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
