// ─── Calendar Screen ──────────────────────────────────────────────────────────
// Full calendar: month grid, week strip, event list, add/edit form,
// detail sheet, multi-reminder notifications, optional client linking.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, ChevronLeft, ChevronRight,
  Bell, BellOff, MapPin, Users, Clock, Calendar, AlertCircle,
  CheckCircle2, ChevronDown,
} from "lucide-react";
import { todayISO, genId, smartDate } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import {
  scheduleEventReminders, cancelEventReminders,
  scheduleAllEventReminders, REMINDER_PRESETS,
  requestCalendarNotifPermission, notifPermissionState,
} from "../lib/calendarNotifications";
import {
  Card, Btn, Field, SelectField, Toast, Empty, PageHeader,
  useConfirm, ClientSelector,
} from "../components/ui";
import { DetailSheet, DetailRow } from "../components/DetailSheet";

// ─── Event types + colours ────────────────────────────────────────────────────
const EVENT_TYPES = [
  { label: "Site Visit",    color: "#1E40AF", bg: "#DBEAFE" },
  { label: "Service Call",  color: "#166534", bg: "#DCFCE7" },
  { label: "Meeting",       color: "#5B21B6", bg: "#EDE9FE" },
  { label: "Travel",        color: "#0E7490", bg: "#CFFAFE" },
  { label: "Deadline",      color: "#9F1239", bg: "#FFE4E6" },
  { label: "Other",         color: "#64748B", bg: "#F1F5F9" },
];

function typeStyle(label) {
  return EVENT_TYPES.find(t => t.label === label) || EVENT_TYPES[EVENT_TYPES.length - 1];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoToDate(iso) { return iso ? new Date(iso + "T12:00:00") : null; }
function dateToISO(d)   { return d ? d.toISOString().slice(0, 10) : ""; }

function monthGrid(year, month) {
  // Returns array of ISO date strings for the 6-week grid starting from
  // the Monday before the 1st of the month.
  const first = new Date(Date.UTC(year, month, 1));
  const dow = (first.getDay() + 6) % 7; // Mon=0
  const start = new Date(first);
  start.setDate(first.getDate() - dow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dateToISO(d);
  });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  const h12  = hour % 12 || 12;
  return `${h12}:${m}${ampm}`;
}

function fmtEventDate(ev) {
  const d = ev.start_date ? smartDate(ev.start_date) : "—";
  const t = ev.start_time ? ` at ${formatTime(ev.start_time)}` : ev.all_day ? " (all day)" : "";
  return d + t;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Reminder pill component ─────────────────────────────────────────────────
function ReminderPill({ reminder, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border"
      style={{ background: "#EDE9FE", color: "#5B21B6", borderColor: "#DDD6FE" }}>
      <Bell size={11} />
      {reminder.label}
      <button type="button" onClick={onRemove} className="ml-0.5 hover:text-red-500">
        <X size={11} />
      </button>
    </span>
  );
}

// ─── Event form (add + edit) ──────────────────────────────────────────────────
function EventForm({ initial, clients, onSave, onCancel }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    title:       initial?.title       || "",
    event_type:  initial?.event_type  || "Site Visit",
    start_date:  initial?.start_date  || todayISO(),
    start_time:  initial?.start_time  || "08:00",
    end_date:    initial?.end_date    || "",
    end_time:    initial?.end_time    || "",
    all_day:     initial?.all_day     || false,
    location:    initial?.location    || "",
    notes:       initial?.notes       || "",
    client_id:   initial?.client_id   || null,
    client_name: initial?.client_name || "",
    reminders:   initial?.reminders   || [{ id: genId(), minutes: 15, label: "15 minutes before" }],
    color:       initial?.color       || "",
  });
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [notifState, setNotifState] = useState(notifPermissionState());

  function f(key) { return v => setForm(s => ({ ...s, [key]: v })); }

  async function requestNotif() {
    const result = await requestCalendarNotifPermission();
    setNotifState(result);
  }

  function addReminder(preset) {
    if (form.reminders.some(r => r.minutes === preset.minutes)) return;
    setForm(s => ({
      ...s,
      reminders: [...s.reminders, { id: genId(), minutes: preset.minutes, label: preset.label }]
        .sort((a, b) => b.minutes - a.minutes),
    }));
    setShowReminderPicker(false);
  }

  function removeReminder(id) {
    setForm(s => ({ ...s, reminders: s.reminders.filter(r => r.id !== id) }));
  }

  function handleClientChange(clientId) {
    const client = clients?.find(c => c.id === clientId);
    setForm(s => ({
      ...s,
      client_id: clientId,
      client_name: client ? (client.company || client.branch || "") : "",
    }));
  }

  function submit() {
    if (!form.title.trim()) return;
    if (!form.start_date) return;
    onSave({ ...form, title: form.title.trim() });
  }

  const ts = typeStyle(form.event_type);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-black text-slate-900">{isEdit ? "Edit Event" : "New Event"}</p>
        <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center">
          <X size={16} />
        </button>
      </div>

      <Field label="Title" value={form.title} onChange={f("title")} placeholder="e.g. Site visit — Kathu" required />

      {/* Event type selector */}
      <div>
        <label className="mb-1.5 block text-sm font-bold text-slate-500">Type</label>
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPES.map(t => (
            <button key={t.label} type="button"
              onClick={() => setForm(s => ({ ...s, event_type: t.label }))}
              className="rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-all min-h-[36px]"
              style={form.event_type === t.label
                ? { background: t.bg, color: t.color, borderColor: t.color }
                : { background: "white", color: "#94A3B8", borderColor: "#E2E8F0" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* All day toggle */}
      <button type="button"
        onClick={() => setForm(s => ({ ...s, all_day: !s.all_day }))}
        className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.all_day ? "bg-red-700" : "bg-slate-200"}`}>
          <motion.div animate={{ x: form.all_day ? 20 : 0 }} className="w-4 h-4 rounded-full bg-white shadow" />
        </div>
        All day
      </button>

      {/* Date/time */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" type="date" value={form.start_date} onChange={f("start_date")} />
        {!form.all_day && <Field label="Start time" type="time" value={form.start_time} onChange={f("start_time")} />}
        <Field label="End date (optional)" type="date" value={form.end_date} onChange={f("end_date")} />
        {!form.all_day && <Field label="End time (optional)" type="time" value={form.end_time} onChange={f("end_time")} />}
      </div>

      <Field label="Location (optional)" value={form.location} onChange={f("location")} placeholder="Address or description" />

      <ClientSelector
        label="Client (optional)"
        value={form.client_id}
        onChange={handleClientChange}
        clients={clients || []}
      />

      <Field label="Notes (optional)" value={form.notes} onChange={f("notes")} placeholder="Any details..." multiline />

      {/* Reminders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-bold text-slate-500">Reminders</label>
          {notifState !== "granted" && (
            <button type="button" onClick={requestNotif}
              className="text-xs font-bold px-2.5 py-1 rounded-lg min-h-[32px] flex items-center gap-1"
              style={{ background: "#EDE9FE", color: "#5B21B6" }}>
              <Bell size={11} /> Enable notifications
            </button>
          )}
        </div>

        {notifState === "denied" && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 mb-2">
            <p className="text-xs font-bold text-amber-700">
              Notifications are blocked. Enable them in your browser/phone settings for reminders to fire.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-2">
          {form.reminders.map(r => (
            <ReminderPill key={r.id} reminder={r} onRemove={() => removeReminder(r.id)} />
          ))}
          {form.reminders.length === 0 && (
            <p className="text-xs text-slate-400">No reminders — tap Add to set one</p>
          )}
        </div>

        <div className="relative">
          <button type="button"
            onClick={() => setShowReminderPicker(p => !p)}
            className="flex items-center gap-1.5 text-xs font-bold py-1.5 px-3 rounded-lg min-h-[36px]"
            style={{ color: "#8B1A1A", background: "#F7F3F3" }}>
            <Plus size={13} /> Add reminder
            <ChevronDown size={12} className={showReminderPicker ? "rotate-180" : ""} />
          </button>
          <AnimatePresence>
            {showReminderPicker && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute left-0 mt-1 z-20 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
                style={{ minWidth: 220 }}>
                {REMINDER_PRESETS.map(p => {
                  const already = form.reminders.some(r => r.minutes === p.minutes);
                  return (
                    <button key={p.minutes} type="button"
                      onClick={() => addReminder(p)}
                      disabled={already}
                      className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-between min-h-[48px]">
                      {p.label}
                      {already && <CheckCircle2 size={14} className="text-green-500" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Btn className="flex-1" onClick={submit} disabled={!form.title.trim()}>
          <Save size={15} /> {isEdit ? "Update Event" : "Save Event"}
        </Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

// ─── Main CalendarScreen ──────────────────────────────────────────────────────
export function CalendarScreen({ data, setData, userId }) {
  const today      = todayISO();
  const todayDate  = isoToDate(today);

  const [viewYear,  setViewYear]  = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [selected,  setSelected]  = useState(today);
  const [showForm,  setShowForm]  = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [detailEv,  setDetailEv]  = useState(null);
  const [toast,     setToast]     = useState("");
  const { confirm, dialog }       = useConfirm();

  const events  = data.calendarEvents || [];
  const clients = data.clients || [];

  // Restore notification timers on mount
  useEffect(() => {
    if (events.length) scheduleAllEventReminders(events);
  }, []); // eslint-disable-line

  // Build event lookup by date
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      if (!ev.start_date) return;
      if (!map[ev.start_date]) map[ev.start_date] = [];
      map[ev.start_date].push(ev);
    });
    return map;
  }, [events]);

  const grid = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const selectedEvents = useMemo(() =>
    (eventsByDate[selected] || [])
      .sort((a, b) => (a.start_time || "00:00").localeCompare(b.start_time || "00:00")),
    [eventsByDate, selected]
  );

  // Navigation
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    setViewYear(todayDate.getFullYear());
    setViewMonth(todayDate.getMonth());
    setSelected(today);
  }

  // Save event
  function saveEvent(formData) {
    const now = new Date().toISOString();
    const id  = editEvent?.id || genId();
    const row = {
      id, user_id: userId,
      ...formData,
      sync_status: "pending",
      created_at: editEvent?.created_at || now,
      updated_at: now,
    };

    setData(d => ({
      ...d,
      calendarEvents: editEvent
        ? (d.calendarEvents || []).map(e => e.id === id ? row : e)
        : [row, ...(d.calendarEvents || [])],
      syncQueue: [{
        id: genId(), table: "calendar_events",
        action: editEvent ? "update" : "insert",
        data: row, status: "pending", created_at: now,
      }, ...(d.syncQueue || [])],
    }));

    offlineSave("calendar_events", row);
    scheduleEventReminders(row);
    triggerImmediateSync();
    setToast(editEvent ? "Event updated" : "Event saved");
    setShowForm(false);
    setEditEvent(null);
    setSelected(row.start_date);
  }

  // Delete event
  async function deleteEvent(id) {
    const ok = await confirm("Delete this event?", { confirmLabel: "Delete" });
    if (!ok) return;
    cancelEventReminders(id);
    setData(d => ({
      ...d,
      calendarEvents: (d.calendarEvents || []).filter(e => e.id !== id),
      syncQueue: [{
        id: genId(), table: "calendar_events", action: "delete",
        data: { id }, status: "pending", created_at: new Date().toISOString(),
      }, ...(d.syncQueue || [])],
    }));
    setDetailEv(null);
    setToast("Event deleted");
    triggerImmediateSync();
  }

  function startEdit(ev) {
    setDetailEv(null);
    setEditEvent(ev);
    setShowForm(true);
  }

  const currentMonthEvents = events.filter(e =>
    e.start_date && e.start_date.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`)
  ).length;

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Event detail sheet ── */}
      <DetailSheet
        open={!!detailEv}
        onClose={() => setDetailEv(null)}
        title={detailEv?.title || ""}
        subtitle={detailEv ? fmtEventDate(detailEv) : ""}
        primaryActions={detailEv && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => startEdit(detailEv)}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
              style={{ background: "#8B1A1A" }}>
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={() => deleteEvent(detailEv.id)}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-red-100 bg-white text-red-600 min-h-[48px]">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      >
        {detailEv && (() => {
          const ts = typeStyle(detailEv.event_type);
          return (
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ background: ts.bg, color: ts.color }}>
                {detailEv.event_type}
              </span>

              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Date" value={fmtEventDate(detailEv)} />
                {detailEv.end_date && (
                  <DetailRow label="End"
                    value={detailEv.end_date + (detailEv.end_time ? ` ${formatTime(detailEv.end_time)}` : "")} />
                )}
              </div>

              {detailEv.location && (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700 leading-snug">{detailEv.location}</p>
                </div>
              )}

              {detailEv.client_name && (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <Users size={14} className="text-slate-400 shrink-0" />
                  <p className="text-sm font-bold text-slate-700">{detailEv.client_name}</p>
                </div>
              )}

              {detailEv.notes && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 border border-slate-100">
                    {detailEv.notes}
                  </p>
                </div>
              )}

              {detailEv.reminders?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Reminders</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailEv.reminders.map(r => (
                      <span key={r.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ background: "#EDE9FE", color: "#5B21B6" }}>
                        <Bell size={10} /> {r.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </DetailSheet>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          title="Calendar"
          subtitle={`${MONTH_NAMES[viewMonth]} ${viewYear} · ${currentMonthEvents} event${currentMonthEvents !== 1 ? "s" : ""}`}
        />
        <div className="flex gap-2 shrink-0">
          {selected !== today && (
            <button onClick={goToday}
              className="text-xs font-bold px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 min-h-[40px]">
              Today
            </button>
          )}
          <button
            onClick={() => { setEditEvent(null); setShowForm(s => !s); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white min-h-[40px]"
            style={{ background: showForm ? "#64748B" : "#8B1A1A" }}>
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? "Cancel" : "Add"}
          </button>
        </div>
      </div>

      {/* ── Event form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <EventForm
              initial={editEvent ? editEvent : { start_date: selected }}
              clients={clients}
              onSave={saveEvent}
              onCancel={() => { setShowForm(false); setEditEvent(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Month navigator ── */}
      <Card className="overflow-hidden">
        {/* Month header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <p className="text-base font-black text-slate-900">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </p>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Day-of-week labels */}
        <div className="grid grid-cols-7 border-b border-slate-50">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-black text-slate-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {grid.map((iso, idx) => {
            const inMonth    = isoToDate(iso).getMonth() === viewMonth;
            const isToday_   = iso === today;
            const isSelected = iso === selected;
            const dayEvents  = eventsByDate[iso] || [];
            const hasEvents  = dayEvents.length > 0;
            const dayNum     = isoToDate(iso).getDate();

            return (
              <button key={iso}
                onClick={() => { setSelected(iso); setViewYear(isoToDate(iso).getFullYear()); setViewMonth(isoToDate(iso).getMonth()); }}
                className={`relative flex flex-col items-center py-2 min-h-[52px] transition-colors border-b border-r border-slate-50 ${isSelected ? "" : "hover:bg-slate-50"}`}
                style={{ background: isSelected ? "#8B1A1A" : "transparent" }}>
                <span className={`text-sm font-bold leading-none mb-1 ${
                  isSelected ? "text-white" :
                  isToday_   ? "text-red-700" :
                  inMonth    ? "text-slate-800" : "text-slate-300"
                }`}>
                  {dayNum}
                </span>
                {isToday_ && !isSelected && (
                  <div className="w-1 h-1 rounded-full mb-0.5" style={{ background: "#8B1A1A" }} />
                )}
                {/* Event dots — up to 3 */}
                {hasEvents && (
                  <div className="flex gap-0.5 flex-wrap justify-center px-1 max-w-full">
                    {dayEvents.slice(0, 3).map(ev => {
                      const ts = typeStyle(ev.event_type);
                      return (
                        <div key={ev.id} className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: isSelected ? "rgba(255,255,255,0.7)" : ts.color }} />
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className={`text-[9px] font-black leading-none ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Selected day event list ── */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm font-black text-slate-500 uppercase tracking-wider">
            {selected === today ? "Today" : smartDate(selected)}
          </p>
          <p className="text-xs text-slate-400">
            {selectedEvents.length === 0
              ? "No events"
              : `${selectedEvents.length} event${selectedEvents.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {selectedEvents.length === 0 ? (
          <Card className="p-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#F7F3F3" }}>
                <Calendar size={22} style={{ color: "#8B1A1A" }} />
              </div>
              <p className="text-sm font-bold text-slate-600">No events</p>
              <p className="text-xs text-slate-400">Tap Add to schedule something for this day</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map(ev => {
              const ts = typeStyle(ev.event_type);
              return (
                <Card key={ev.id}
                  className="overflow-hidden cursor-pointer active:scale-[0.985] transition-transform"
                  onClick={() => setDetailEv(ev)}>
                  <div className="flex">
                    {/* Colour bar on left */}
                    <div className="w-1 shrink-0 rounded-l-2xl" style={{ background: ts.color }} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-black text-slate-900 leading-tight">{ev.title}</p>
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0"
                              style={{ background: ts.bg, color: ts.color }}>
                              {ev.event_type}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {!ev.all_day && ev.start_time && (
                              <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <Clock size={11} /> {formatTime(ev.start_time)}
                                {ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}
                              </span>
                            )}
                            {ev.all_day && (
                              <span className="text-xs text-slate-500 font-medium">All day</span>
                            )}
                            {ev.location && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <MapPin size={10} /> {ev.location}
                              </span>
                            )}
                            {ev.client_name && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Users size={10} /> {ev.client_name}
                              </span>
                            )}
                          </div>

                          {ev.reminders?.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5">
                              <Bell size={10} className="text-purple-400" />
                              <span className="text-[10px] text-purple-500 font-bold">
                                {ev.reminders.length} reminder{ev.reminders.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={16} className="text-slate-300 shrink-0 mt-0.5" />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Upcoming events (next 14 days beyond selected) ── */}
      {(() => {
        const cutoff = new Date(selected + "T12:00:00");
        cutoff.setDate(cutoff.getDate() + 1);
        const limit  = new Date(cutoff);
        limit.setDate(limit.getDate() + 13);
        const upcoming = events
          .filter(e => {
            if (!e.start_date) return false;
            const d = isoToDate(e.start_date);
            return d >= cutoff && d <= limit;
          })
          .sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time || "").localeCompare(b.start_time || ""));
        if (upcoming.length === 0) return null;
        return (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">
              Coming up (14 days)
            </p>
            <div className="space-y-2">
              {upcoming.slice(0, 5).map(ev => {
                const ts = typeStyle(ev.event_type);
                return (
                  <Card key={ev.id} className="p-3 cursor-pointer active:scale-[0.985] transition-transform flex items-center gap-3"
                    onClick={() => { setSelected(ev.start_date); setDetailEv(ev); }}>
                    <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0"
                      style={{ background: ts.bg }}>
                      <span className="text-[10px] font-black leading-none" style={{ color: ts.color }}>
                        {isoToDate(ev.start_date).toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
                      </span>
                      <span className="text-base font-black leading-none" style={{ color: ts.color }}>
                        {isoToDate(ev.start_date).getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 leading-tight truncate">{ev.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ev.start_time ? formatTime(ev.start_time) : "All day"}
                        {ev.client_name ? ` · ${ev.client_name}` : ""}
                      </p>
                    </div>
                    {ev.reminders?.length > 0 && <Bell size={13} className="text-purple-300 shrink-0" />}
                  </Card>
                );
              })}
              {upcoming.length > 5 && (
                <p className="text-xs text-center text-slate-400 py-1">
                  +{upcoming.length - 5} more this fortnight
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
