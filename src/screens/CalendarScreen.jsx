import React, { useMemo, useRef, useState } from "react";
import {
  Bell, Calendar as CalendarIcon, Check, CheckCircle2, ChevronLeft,
  ChevronRight, Clock, Grid3X3, List, MapPin, Navigation, Pencil,
  Plus, Save, Trash2, Users, X,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { genId, smartDate, todayISO } from "../lib/helpers";
import { Card } from "../components/ui";
import { offlineSave } from "../offline/offlineDb";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { deleteRecord } from "../lib/deleteHelpers";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const REMINDERS = [
  ["none", "None"],
  ["on_time", "At time of event"],
  ["15_before", "15 minutes before"],
  ["30_before", "30 minutes before"],
  ["1h_before", "1 hour before"],
  ["morning", "Morning of event"],
  ["1d_before", "1 day before"],
];
const EMPTY_FORM = {
  type: "Meeting", title: "", client_id: "", related_to: "", location: "",
  date: "", time: "09:00", allDay: false, reminder: "15_before", notes: "",
};

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localDate = value => new Date(`${value}T12:00:00`);

function monthCells(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset, 12);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: iso(date),
      day: date.getDate(),
      month: date.getMonth(),
      year: date.getFullYear(),
      currentMonth: date.getMonth() === month,
    };
  });
}

function itemType(item) {
  if (item._kind) return item._kind;
  return (item.title || "").startsWith("Meeting:") ? "Meeting" : "Follow-up";
}

function cleanTitle(item) {
  return itemType(item) === "Meeting" ? (item.title || "").replace(/^Meeting:\s*/, "") : (item.title || "");
}

function readCalendarNotes(item) {
  const lines = (item.notes || "").split("\n");
  let related_to = "";
  let location = "";
  const notes = [];
  lines.forEach(line => {
    if (line === "Calendar meeting" || line === "Calendar follow-up") return;
    if (line.startsWith("Related to: ")) related_to = line.slice(12);
    else if (line.startsWith("Location: ")) location = line.slice(10);
    else notes.push(line);
  });
  return { related_to, location, notes: notes.join("\n").trim() };
}

function itemLocation(item, clients) {
  return item.location || readCalendarNotes(item).location || clients.find(client => client.id === item.client_id)?.location || "";
}

function routeUrl(locations) {
  if (!locations.length) return null;
  if (locations.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locations[0])}`;
  const origin = encodeURIComponent(locations[0]);
  const destination = encodeURIComponent(locations[locations.length - 1]);
  const middle = locations.slice(1, -1).map(encodeURIComponent).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${middle ? `&waypoints=${middle}` : ""}`;
}

function eventColor(item) {
  if (item.completed) return "#16A34A";
  return {
    Meeting: "#AF52DE",
    "Follow-up": "#0A84FF",
    Note: "#F59E0B",
    Service: "#22C55E",
    Quote: "#EC4899",
  }[itemType(item)] || "#0A84FF";
}

function friendlyHeading(date, today) {
  if (date === today) return "Today";
  const tomorrow = new Date(localDate(today));
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === iso(tomorrow)) return "Tomorrow";
  return localDate(date).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

export function CalendarScreen({ data, setData, userId, teamId, onNavigate }) {
  const today = todayISO();
  const now = localDate(today);
  const touchStart = useRef(null);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [displayMode, setDisplayMode] = useState("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [showEditor, setShowEditor] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, date: today });
  const [message, setMessage] = useState("");

  const cells = useMemo(() => monthCells(view.year, view.month), [view]);
  const followups = (data.followups || []).filter(item => item.user_id === userId || item.assigned_to_user_id === userId);
  const clients = (data.clients || []).filter(client => !client.user_id || client.user_id === userId || client.assigned_to_user_id === userId);
  const calendarItems = useMemo(() => {
    const items = followups.map(item => ({ ...item, _source: "followup", _kind: itemType(item) }));

    (data.notes || []).filter(note => (note.user_id === userId || note.assigned_to_user_id === userId) && note.resolve_by && !note.resolved).forEach(note => {
      items.push({
        id: note.id, date: note.resolve_by, time: "", title: (note.note || "Note").slice(0, 100),
        client: note.client || "", completed: !!note.resolved,
        _source: "note", _kind: "Note", _screen: "Notes",
      });
    });

    (data.equipment || []).filter(item => (item.user_id === userId || item.assigned_to_user_id === userId) && item.service_due).forEach(item => {
      const client = clients.find(clientItem => clientItem.id === item.client_id);
      items.push({
        id: item.id, date: item.service_due, time: "", title: `Service: ${item.name || "Equipment"}`,
        client: item.client || client?.company || "", completed: false,
        location: client?.location || "", _source: "equipment", _kind: "Service", _screen: "Equipment",
      });
    });

    (data.quotes || []).filter(quote => (quote.user_id === userId || quote.assigned_to_user_id === userId) && quote.sent_date).forEach(quote => {
      items.push({
        id: quote.id, date: quote.sent_date, time: "", title: `Quote: ${quote.description || quote.client_name || "Quote"}`,
        client: quote.client_name || "", completed: quote.status === "Accepted",
        _source: "quote", _kind: "Quote", _screen: "Quotes",
      });
    });
    return items;
  }, [followups, data.notes, data.equipment, data.quotes, clients, userId]);

  const byDate = useMemo(() => calendarItems.reduce((map, item) => {
    if (item.date) (map[item.date] ||= []).push(item);
    return map;
  }, {}), [calendarItems]);
  const dayItems = useMemo(() => [...(byDate[selectedDate] || [])].sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    return (a.time || "00:00").localeCompare(b.time || "00:00");
  }), [byDate, selectedDate]);
  const monthItems = useMemo(() => calendarItems
    .filter(item => {
      if (!item.date) return false;
      const date = localDate(item.date);
      return date.getFullYear() === view.year && date.getMonth() === view.month;
    })
    .sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`)),
  [calendarItems, view]);
  const scheduleGroups = useMemo(() => monthItems.reduce((groups, item) => {
    (groups[item.date] ||= []).push(item);
    return groups;
  }, {}), [monthItems]);
  const locations = [...new Set(dayItems.filter(item => !item.completed).map(item => itemLocation(item, clients)).filter(Boolean))];

  function moveMonth(amount) {
    const next = new Date(view.year, view.month + amount, 1, 12);
    setView({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedDate(iso(next));
  }

  function goToday() {
    setView({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(today);
  }

  function selectDate(cell) {
    setSelectedDate(cell.date);
    if (!cell.currentMonth) setView({ year: cell.year, month: cell.month });
  }

  function openNew() {
    setEditId(null);
    setMessage("");
    setForm({ ...EMPTY_FORM, date: selectedDate });
    setShowEditor(true);
  }

  function openEdit(item) {
    const parsed = readCalendarNotes(item);
    setEditId(item.id);
    setMessage("");
    setForm({
      ...EMPTY_FORM,
      ...parsed,
      type: itemType(item),
      title: cleanTitle(item),
      client_id: item.client_id || "",
      date: item.date || selectedDate,
      time: item.time || "09:00",
      allDay: !item.time,
      reminder: item.reminder || "none",
    });
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditId(null);
    setMessage("");
  }

  function encodedNotes(values) {
    return [
      values.type === "Meeting" ? "Calendar meeting" : "Calendar follow-up",
      values.related_to.trim() ? `Related to: ${values.related_to.trim()}` : "",
      values.location.trim() ? `Location: ${values.location.trim()}` : "",
      values.notes.trim(),
    ].filter(Boolean).join("\n");
  }

  async function saveCalendarItem() {
    if (!form.title.trim()) { setMessage("Please enter a title."); return; }
    if (!form.date) { setMessage("Please select a date."); return; }
    const selectedClient = clients.find(client => client.id === form.client_id);
    const existing = editId ? followups.find(item => item.id === editId) : null;
    const values = {
      client_id: form.client_id || null,
      client: selectedClient?.company || "",
      branch: selectedClient?.branch || "",
      title: form.type === "Meeting" ? `Meeting: ${form.title.trim()}` : form.title.trim(),
      date: form.date,
      time: form.allDay ? "" : (form.time || "09:00"),
      reminder: form.reminder,
      notes: encodedNotes(form),
      completed: existing?.completed || false,
      sync_status: "pending",
    };

    if (existing) {
      const updated = { ...existing, ...values };
      const syncPayload = { id: existing.id, ...values };
      setData(current => ({
        ...current,
        followups: (current.followups || []).map(item => item.id === existing.id ? updated : item),
        syncQueue: [{ id: genId(), table: "followups", action: "update", data: syncPayload, status: "pending", created_at: new Date().toISOString() }, ...(current.syncQueue || [])],
      }));
      await offlineSave("followups", updated);
    } else {
      const item = withTeamId({
        id: genId(), user_id: userId, ...values,
        created_at: new Date().toISOString(),
      }, teamId);
      setData(current => ({
        ...current,
        followups: [item, ...(current.followups || [])],
        syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(current.syncQueue || [])],
      }));
      await offlineSave("followups", item);
    }
    setSelectedDate(form.date);
    const savedDate = localDate(form.date);
    setView({ year: savedDate.getFullYear(), month: savedDate.getMonth() });
    triggerImmediateSync();
    closeEditor();
  }

  async function toggleComplete(item) {
    const updated = { ...item, completed: !item.completed, sync_status: "pending" };
    const syncPayload = { id: item.id, completed: updated.completed, sync_status: "pending" };
    setData(current => ({
      ...current,
      followups: (current.followups || []).map(entry => entry.id === item.id ? updated : entry),
      syncQueue: [{ id: genId(), table: "followups", action: "update", data: syncPayload, status: "pending", created_at: new Date().toISOString() }, ...(current.syncQueue || [])],
    }));
    await offlineSave("followups", updated);
    triggerImmediateSync();
  }

  async function removeItem(item) {
    if (!item || item._source !== "followup") return;
    if (!window.confirm(`Delete “${cleanTitle(item)}”?`)) return;
    if (editId === item.id) closeEditor();
    await deleteRecord("followups", item.id, userId, setData);
  }

  function handleTouchEnd(event) {
    if (touchStart.current == null) return;
    const distance = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) < 55) return;
    moveMonth(distance < 0 ? 1 : -1);
  }

  function renderEvent(item, compact = false) {
    const editable = item._source === "followup";
    const location = itemLocation(item, clients);
    const parsed = readCalendarNotes(item);
    const openItem = () => editable ? openEdit(item) : onNavigate?.(item._screen);
    return (
      <Card key={item.id} className={`overflow-hidden ${item.completed ? "opacity-60" : ""}`}>
        <button type="button" onClick={openItem} className="w-full text-left p-3.5 flex gap-3 active:bg-slate-50">
          <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: eventColor(item) }} />
          <div className="w-12 shrink-0 pt-0.5">
            <p className="text-xs font-black text-slate-700">{item.time || "All-day"}</p>
            {!compact && <p className="text-[10px] text-slate-400 mt-0.5">{itemType(item)}</p>}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold text-slate-900 break-words ${item.completed ? "line-through" : ""}`}>{cleanTitle(item)}</p>
            {(item.client || location) && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
              {item.client && <span>{item.client}{item.branch ? ` — ${item.branch}` : ""}</span>}
              {item.client && location && <span>·</span>}
              {location && <span className="inline-flex items-center gap-1"><MapPin size={10} />{location}</span>}
            </p>}
            {!compact && parsed.related_to && <p className="text-xs text-slate-400 mt-1">Related to: {parsed.related_to}</p>}
          </div>
          <ChevronRight size={16} className="text-slate-300 shrink-0 mt-1" />
        </button>
        {!compact && editable && <div className="border-t border-slate-100 flex divide-x divide-slate-100">
          <button onClick={() => toggleComplete(item)} className="flex-1 min-h-[44px] text-xs font-bold text-slate-500 flex items-center justify-center gap-1.5 active:bg-slate-50">
            {item.completed ? <CheckCircle2 size={14} className="text-green-600" /> : <Check size={14} />} {item.completed ? "Completed" : "Complete"}
          </button>
          <button onClick={() => openEdit(item)} className="flex-1 min-h-[44px] text-xs font-bold text-blue-600 flex items-center justify-center gap-1.5 active:bg-blue-50"><Pencil size={13} /> Edit</button>
          <button onClick={() => removeItem(item)} className="w-14 min-h-[44px] text-red-500 flex items-center justify-center active:bg-red-50" aria-label="Delete"><Trash2 size={14} /></button>
        </div>}
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-end justify-between px-1">
        <div>
          <button onClick={goToday} className="text-sm font-bold mb-1" style={{ color: BRAND.primary }}>Today</button>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-950">{MONTHS[view.month]}</h1>
          <p className="text-sm font-bold text-slate-400">{view.year}</p>
        </div>
        <button onClick={openNew} className="w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform" style={{ background: BRAND.primary }} aria-label="Add event"><Plus size={24} /></button>
      </div>

      <div className="mx-auto flex w-full max-w-[260px] rounded-xl bg-slate-200/70 p-1">
        <button onClick={() => setDisplayMode("month")} className={`flex-1 min-h-[36px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${displayMode === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><Grid3X3 size={13} /> Month</button>
        <button onClick={() => setDisplayMode("schedule")} className={`flex-1 min-h-[36px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${displayMode === "schedule" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><List size={14} /> Schedule</button>
      </div>

      <Card className="overflow-hidden">
        <div className="px-3 pt-3 flex items-center justify-between">
          <button onClick={() => moveMonth(-1)} className="w-11 h-11 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-100" aria-label="Previous month"><ChevronLeft size={22} /></button>
          <p className="text-base font-black text-slate-900">{MONTHS[view.month]} {view.year}</p>
          <button onClick={() => moveMonth(1)} className="w-11 h-11 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-100" aria-label="Next month"><ChevronRight size={22} /></button>
        </div>

        {displayMode === "month" ? <div onTouchStart={event => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={handleTouchEnd}>
          <div className="grid grid-cols-7 px-2 border-b border-slate-100">
            {DAY_NAMES.map((day, index) => <div key={day} className={`text-center text-[10px] font-black uppercase py-2 ${index > 4 ? "text-red-400" : "text-slate-400"}`}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 px-1 sm:px-2 pb-2">
            {cells.map(cell => {
              const items = [...(byDate[cell.date] || [])].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
              const selected = cell.date === selectedDate;
              const isToday = cell.date === today;
              return <button key={cell.date} onClick={() => selectDate(cell)} className={`relative min-h-[58px] sm:min-h-[76px] py-1 rounded-xl flex flex-col items-center active:bg-slate-100 ${!cell.currentMonth ? "opacity-30" : ""}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${selected ? "text-white" : isToday ? "ring-2" : "text-slate-800"}`} style={selected ? { background: BRAND.primary } : isToday ? { color: BRAND.primary, ringColor: BRAND.primary } : {}}>{cell.day}</span>
                <div className="flex gap-0.5 mt-1 sm:hidden">
                  {items.slice(0, 3).map(item => <span key={item.id} className="w-1.5 h-1.5 rounded-full" style={{ background: eventColor(item) }} />)}
                </div>
                <div className="hidden sm:block w-full px-1 mt-1 space-y-0.5">
                  {items.slice(0, 2).map(item => <div key={item.id} className="text-[9px] font-bold truncate text-left px-1 py-0.5 rounded" style={{ color: eventColor(item), background: `${eventColor(item)}14` }}>{item.time ? `${item.time} ` : ""}{cleanTitle(item)}</div>)}
                  {items.length > 2 && <p className="text-[9px] text-slate-400 text-left px-1">+{items.length - 2} more</p>}
                </div>
              </button>;
            })}
          </div>
        </div> : <div className="border-t border-slate-100 p-3 max-h-[520px] overflow-y-auto">
          {Object.keys(scheduleGroups).length === 0 ? <div className="py-12 text-center"><CalendarIcon size={28} className="mx-auto text-slate-200" /><p className="text-sm font-bold text-slate-400 mt-2">No events this month</p></div> :
            Object.entries(scheduleGroups).map(([date, items]) => <div key={date} className="mb-5 last:mb-0">
              <button onClick={() => { setSelectedDate(date); setDisplayMode("month"); }} className="mb-2 text-left">
                <p className="text-sm font-black text-slate-800">{friendlyHeading(date, today)}</p>
              </button>
              <div className="space-y-2">{items.map(item => renderEvent(item, true))}</div>
            </div>)}
        </div>}
      </Card>

      {displayMode === "month" && <>
        {locations.length > 0 && <button onClick={() => window.open(routeUrl(locations), "_blank", "noopener,noreferrer")} className="w-full py-3 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm font-black flex items-center justify-center gap-2"><Navigation size={16} /> Plan route · {locations.length} stop{locations.length !== 1 ? "s" : ""}</button>}
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-lg font-black text-slate-900">{friendlyHeading(selectedDate, today)}</p>
            <p className="text-xs font-bold text-slate-400">{dayItems.length} event{dayItems.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={openNew} className="text-sm font-bold flex items-center gap-1 min-h-[44px] px-2" style={{ color: BRAND.primary }}><Plus size={16} /> Add</button>
        </div>
        {!dayItems.length ? <Card className="p-8 text-center">
          <CalendarIcon size={28} className="mx-auto text-slate-200" />
          <p className="text-sm font-bold text-slate-400 mt-2">No events</p>
          <button onClick={openNew} className="mt-3 text-sm font-bold" style={{ color: BRAND.primary }}>Add an event</button>
        </Card> : <div className="space-y-2">{dayItems.map(item => renderEvent(item))}</div>}
      </>}

      {showEditor && <div className="fixed inset-0 z-[90] bg-black/35 flex items-end sm:items-center justify-center" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
        <div className="bg-[#F7F7FA] w-full sm:max-w-xl sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <button onClick={closeEditor} className="min-h-[44px] px-1 text-sm font-bold" style={{ color: BRAND.primary }}>Cancel</button>
            <p className="font-black text-slate-900">{editId ? "Edit Event" : "New Event"}</p>
            <button onClick={saveCalendarItem} className="min-h-[44px] px-1 text-sm font-black" style={{ color: BRAND.primary }}>Done</button>
          </div>
          <div className="p-4 space-y-4">
            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200">
              <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Title" autoFocus className="w-full px-4 py-4 text-lg font-semibold outline-none border-b border-slate-100" />
              <input value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} placeholder="Location" className="w-full px-4 py-4 text-base outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-200/70 rounded-xl p-1">
              {["Meeting", "Follow-up"].map(type => <button key={type} onClick={() => setForm(current => ({ ...current, type }))} className={`min-h-[40px] rounded-lg text-sm font-bold ${form.type === type ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{type}</button>)}
            </div>

            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 divide-y divide-slate-100">
              <label className="min-h-[56px] px-4 flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-800">All-day</span>
                <button type="button" role="switch" aria-checked={form.allDay} onClick={() => setForm(current => ({ ...current, allDay: !current.allDay }))} className={`w-12 h-7 rounded-full p-0.5 transition-colors ${form.allDay ? "bg-green-500" : "bg-slate-300"}`}><span className={`block w-6 h-6 bg-white rounded-full shadow transition-transform ${form.allDay ? "translate-x-5" : ""}`} /></button>
              </label>
              <label className="min-h-[56px] px-4 flex items-center justify-between gap-3"><span className="font-semibold text-slate-800">Date</span><input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} className="text-right text-slate-600 bg-transparent outline-none" /></label>
              {!form.allDay && <label className="min-h-[56px] px-4 flex items-center justify-between gap-3"><span className="font-semibold text-slate-800">Time</span><input type="time" value={form.time} onChange={event => setForm(current => ({ ...current, time: event.target.value }))} className="text-right text-slate-600 bg-transparent outline-none" /></label>}
            </div>

            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 divide-y divide-slate-100">
              <label className="min-h-[56px] px-4 flex items-center gap-3"><Users size={17} className="text-slate-400" /><span className="font-semibold text-slate-800 shrink-0">Client</span><select value={form.client_id} onChange={event => setForm(current => ({ ...current, client_id: event.target.value }))} className="ml-auto min-w-0 max-w-[60%] text-right text-slate-600 bg-transparent outline-none"><option value="">No client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.company}{client.branch ? ` — ${client.branch}` : ""}</option>)}</select></label>
              <label className="min-h-[56px] px-4 flex items-center gap-3"><Bell size={17} className="text-slate-400" /><span className="font-semibold text-slate-800 shrink-0">Alert</span><select value={form.reminder} onChange={event => setForm(current => ({ ...current, reminder: event.target.value }))} className="ml-auto min-w-0 max-w-[60%] text-right text-slate-600 bg-transparent outline-none">{REMINDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="min-h-[56px] px-4 flex items-center gap-3"><Navigation size={17} className="text-slate-400" /><input value={form.related_to} onChange={event => setForm(current => ({ ...current, related_to: event.target.value }))} placeholder="Related to (optional)" className="flex-1 min-w-0 text-slate-700 outline-none" /></label>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} rows="4" placeholder="Notes" className="w-full text-base outline-none resize-none" />
            </div>
            {message && <p className="text-sm font-bold text-red-600 px-1">{message}</p>}
            <button onClick={saveCalendarItem} className="w-full min-h-[54px] rounded-2xl text-white font-black flex items-center justify-center gap-2" style={{ background: BRAND.primary }}><Save size={17} /> {editId ? "Save Changes" : "Add Event"}</button>
            {editId && <button onClick={() => removeItem(followups.find(item => item.id === editId))} className="w-full min-h-[54px] rounded-2xl bg-white border border-red-200 text-red-600 font-black flex items-center justify-center gap-2"><Trash2 size={17} /> Delete Event</button>}
          </div>
        </div>
      </div>}
    </div>
  );
}
