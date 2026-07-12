import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, Plus, Navigation } from "lucide-react";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";
import { Card } from "../components/ui";

const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function monthCells(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset, 12);
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(start); d.setDate(start.getDate() + index);
    return { date: iso(d), day: d.getDate(), currentMonth: d.getMonth() === month };
  });
}

function routeUrl(locations) {
  if (!locations.length) return null;
  if (locations.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locations[0])}`;
  const origin = encodeURIComponent(locations[0]);
  const destination = encodeURIComponent(locations[locations.length - 1]);
  const middle = locations.slice(1, -1).map(encodeURIComponent).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${middle ? `&waypoints=${middle}` : ""}`;
}

export function CalendarScreen({ data, userId, onNavigate }) {
  const today = todayISO();
  const now = new Date(today + "T12:00:00");
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(today);
  const cells = useMemo(() => monthCells(view.year, view.month), [view]);
  const followups = (data.followups || []).filter(f => f.user_id === userId);
  const clients = data.clients || [];
  const byDate = useMemo(() => followups.reduce((map, item) => { if (item.date) (map[item.date] ||= []).push(item); return map; }, {}), [followups]);
  const dayItems = [...(byDate[selectedDate] || [])].sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const openItems = dayItems.filter(item => !item.completed);
  const completeItems = dayItems.filter(item => item.completed);
  const locations = [...new Set(openItems.map(item => clients.find(c => c.id === item.client_id)?.location || item.location).filter(Boolean))];

  function moveMonth(amount) {
    const d = new Date(view.year, view.month + amount, 1, 12);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(iso(d));
  }
  function goToday() { setView({ year: now.getFullYear(), month: now.getMonth() }); setSelectedDate(today); }

  return <div className="space-y-4">
    <Card className="p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={()=>moveMonth(-1)} className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center"><ChevronLeft size={18}/></button>
        <div className="text-center"><p className="text-base font-black text-slate-900">{MONTHS[view.month]} {view.year}</p>{(view.month !== now.getMonth() || view.year !== now.getFullYear()) && <button onClick={goToday} className="text-xs font-bold" style={{color:BRAND.primary}}>Today</button>}</div>
        <button onClick={()=>moveMonth(1)} className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center"><ChevronRight size={18}/></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">{DAY_NAMES.map(day=><div key={day} className="text-center text-[9px] sm:text-[10px] font-black uppercase text-slate-400 py-1">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{cells.map(cell => {
        const count = (byDate[cell.date] || []).length;
        const overdue = (byDate[cell.date] || []).some(item => !item.completed && cell.date < today);
        const selected = cell.date === selectedDate;
        const isToday = cell.date === today;
        return <button key={cell.date} onClick={()=>setSelectedDate(cell.date)} className={`relative min-h-[50px] sm:min-h-[64px] rounded-xl flex flex-col items-center justify-center border transition-all ${selected ? "text-white border-transparent shadow-sm" : isToday ? "border-red-300 bg-red-50" : "border-slate-100 bg-white"} ${!cell.currentMonth && !selected ? "opacity-35" : ""}`} style={selected ? {background:BRAND.primary} : {}}>
          <span className="text-xs sm:text-sm font-black">{cell.day}</span>
          {count > 0 && <span className={`mt-1 min-w-[16px] h-4 px-1 rounded-full text-[8px] font-black flex items-center justify-center ${selected ? "bg-white/25 text-white" : overdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{count}</span>}
        </button>;
      })}</div>
    </Card>

    {locations.length > 0 && <button onClick={()=>window.open(routeUrl(locations),"_blank")} className="w-full py-3 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm font-black flex items-center justify-center gap-2"><Navigation size={16}/> Plan route · {locations.length} stop{locations.length!==1?"s":""}</button>}
    <div className="flex items-center justify-between"><p className="text-sm font-black text-slate-700">{selectedDate===today?"Today":smartDate(selectedDate)} — {dayItems.length} item{dayItems.length!==1?"s":""}</p><button onClick={()=>onNavigate?.("Followups")} className="text-sm font-bold" style={{color:BRAND.primary}}><Plus size={14} className="inline"/> Add</button></div>
    {!dayItems.length ? <Card className="p-8 text-center"><CalendarIcon size={28} className="mx-auto text-slate-200"/><p className="text-sm font-bold text-slate-400 mt-2">Nothing scheduled</p></Card> : <div className="space-y-2">
      {openItems.map(item => <Card key={item.id} className={`p-3.5 ${item.date<today?"border-l-4 border-l-red-400":""}`}><div className="flex gap-3"><div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center"><Clock size={15} className="text-blue-500"/></div><div className="flex-1"><p className="text-xs font-black text-slate-400">{item.time||"09:00"}</p><p className="text-sm font-bold text-slate-900">{item.title}</p>{item.client&&<p className="text-xs text-slate-500">{item.client}</p>}{item.notes&&<p className="text-xs text-slate-400 mt-1">{item.notes}</p>}</div></div></Card>)}
      {!!completeItems.length && <p className="text-xs font-black uppercase text-slate-400 pt-2">Completed</p>}
      {completeItems.map(item => <Card key={item.id} className="p-3 opacity-60"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-500"/><p className="text-sm line-through text-slate-500">{item.title}</p></div></Card>)}
    </div>}
  </div>;
}
