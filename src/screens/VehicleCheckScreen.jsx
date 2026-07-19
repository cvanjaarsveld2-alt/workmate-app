// ─── Vehicle Daily Checklist Screen ──────────────────────────────────────────
// - Backdate up to 1 year with prev/next week nav + date picker
// - One-tap "All Good", per-item issue flagging with comments
// - History: grouped by month (collapsible) then by week
// - Multi-select days/weeks, build combined PDF, share to department
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp,
  Settings, Save, AlertTriangle, Car, X, FileText,
  ChevronRight, ChevronLeft, RotateCcw, FileDown, Send,
  Calendar, History, Check,
} from "lucide-react";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
// vehicleCheckPDF loaded lazily
import {
  Card, Btn, Field, Toast, PageHeader, useConfirm,
} from "../components/ui";

// ─── Checklist ────────────────────────────────────────────────────────────────
const CHECKLIST = [
  { section: "Exterior", items: ["Body / Frame","Cab / Load Bin","Tonneau Cover / Cargo Net","Bumpers","Tow Bar (if applicable)","License Disk & Plates","Windshield","Wipers & Washers","Locks","Mirrors","Tyres / Wheels (incl. Spare)","Underneath","Suspension"] },
  { section: "Engine",   items: ["Hoses","Fluids — Engine Oil","Fluids — Brake","Fluids — Transmission","Fluids — Radiator","Fluids — Washer","Fluids — Power Steering","Clutch (if applicable)","Belts","Fuel","Battery","Exhaust"] },
  { section: "Electrical", items: ["Daytime Running Lights (if fitted)","Headlight — Low Beam","Headlight — High Beam","Indicators & Hazard Lights","Reverse Lights"] },
  { section: "Interior", items: ["Clean & Free of Clutter","Foot Wells Clean & Free of Clutter","Windows Clean","Instrument Panel / Warning Lights","Hooter","Driver Controls","Steering","Seats","Seat Belts","Accessories, Radio, BT etc.","Fan, Heater / Demister / Air Con","Fire Extinguisher","First Aid Kit","Warning Triangles","Star Bar","Reverse Hooter","Buggy Whips","Wheel Chocks"] },
  { section: "Operation", items: ["Sounds (unusual)","Vibrations (unusual)","Indicator or Warning Lights"] },
];

const VEHICLE_SETTINGS_KEY = "pm_vehicle_settings";
const DEFAULT_SETTINGS = { vehicle: "Toyota Hilux", driver: "", registration: "" };
const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Settings helpers ─────────────────────────────────────────────────────────
function loadVehicleSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(VEHICLE_SETTINGS_KEY) || "{}") }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveVehicleSettings(s) { localStorage.setItem(VEHICLE_SETTINGS_KEY, JSON.stringify(s)); }

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getMondayOfWeek(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function weekDates(mondayISO) {
  const mon = new Date(mondayISO + "T12:00:00");
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function addWeeks(mondayISO, n) {
  const d = new Date(mondayISO + "T12:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function weekLabel(mondayISO) {
  const days = weekDates(mondayISO);
  const start = new Date(days[0] + "T12:00:00");
  const end   = new Date(days[4] + "T12:00:00");
  const sm = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const em = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${sm} – ${em}`;
}

// Build last 52 weeks grouped by month
function buildHistory(checksMap) {
  const today = new Date(todayISO() + "T12:00:00");
  const weeks = [];
  let mon = getMondayOfWeek(todayISO());

  for (let w = 0; w < 52; w++) {
    const days = weekDates(mon);
    const hasAny = days.some(d => checksMap[d] && Object.keys(checksMap[d]?.items || {}).length > 0);
    const hasIssue = days.some(d => {
      const items = checksMap[d]?.items || {};
      return Object.values(items).some(v => v.status === "issue");
    });
    weeks.push({ mondayISO: mon, days, hasAny, hasIssue });
    mon = addWeeks(mon, -1);
  }

  // Group by month
  const monthMap = {};
  const monthOrder = [];
  weeks.forEach(week => {
    const d = new Date(week.mondayISO + "T12:00:00");
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    if (!monthMap[key]) { monthMap[key] = { key, label, weeks: [] }; monthOrder.push(key); }
    monthMap[key].weeks.push(week);
  });

  return monthOrder.map(k => monthMap[k]);
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function statusStyle(s) {
  if (s === "ok")    return { bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" };
  if (s === "issue") return { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" };
  if (s === "na")    return { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" };
  return { bg: "#F8FAFC", color: "#94A3B8", border: "#E2E8F0" };
}

// ─── Issue sheet ──────────────────────────────────────────────────────────────
function IssueSheet({ item, date, currentComment, onSave, onClose }) {
  const [text, setText] = useState(currentComment || "");
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
        <div className="px-5 pt-2 pb-2 flex items-start justify-between">
          <div>
            <p className="text-base font-black text-slate-900">{item}</p>
            <p className="text-xs text-slate-400 mt-0.5">{smartDate(date)} · Issue flagged</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="px-5 pb-2">
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 mb-3">
            <p className="text-xs font-bold text-red-700">⚠️ Report concerns immediately. Do not operate until safe.</p>
          </div>
          <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
            placeholder="e.g. Left rear tyre is flat, oil below minimum…" rows={4}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 resize-none" />
        </div>
        <div className="px-5 pb-8 flex gap-3">
          <Btn className="flex-1" onClick={() => onSave(text)} disabled={!text.trim()}><Save size={15} /> Save Issue</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </motion.div>
    </>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState({ ...settings });
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
        <div className="px-5 pt-2 pb-4 flex items-center justify-between">
          <p className="text-base font-black text-slate-900">Vehicle Settings</p>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="px-5 pb-2 space-y-3">
          <Field label="Vehicle (Make & Model)" value={form.vehicle} onChange={v => setForm(f => ({ ...f, vehicle: v }))} placeholder="e.g. Toyota Hilux" />
          <Field label="Registration Number" value={form.registration} onChange={v => setForm(f => ({ ...f, registration: v.toUpperCase() }))} placeholder="e.g. MN31MJGP" />
          <Field label="Driver / Inspected By" value={form.driver} onChange={v => setForm(f => ({ ...f, driver: v }))} placeholder="Your name" />
        </div>
        <div className="px-5 pb-10 pt-2">
          <Btn className="w-full" onClick={() => { onSave(form); onClose(); }}><Save size={15} /> Save Settings</Btn>
        </div>
      </motion.div>
    </>
  );
}

// ─── Week history row ─────────────────────────────────────────────────────────
function WeekRow({ week, checksMap, selected, onSelect, onDayClick, selectMode }) {
  const { mondayISO, days, hasAny, hasIssue } = week;
  const isSelected = selected.has(mondayISO);
  const label = weekLabel(mondayISO);

  return (
    <div className="border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        {selectMode && (
          <button onClick={() => onSelect(mondayISO)}
            className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
            style={isSelected ? { background: "#8B1A1A", borderColor: "#8B1A1A" } : { borderColor: "#CBD5E1" }}>
            {isSelected && <Check size={12} className="text-white" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700 leading-tight">{label}</p>
          {!hasAny && <p className="text-xs text-slate-400 mt-0.5">No checks recorded</p>}
        </div>
        {hasAny && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={hasIssue
              ? { background: "#FEE2E2", color: "#991B1B" }
              : { background: "#DCFCE7", color: "#166534" }}>
            {hasIssue ? "Issues" : "All clear"}
          </span>
        )}
      </div>
      {/* Day dots row */}
      <div className="flex gap-1.5 px-4 pb-3">
        {days.map((date, i) => {
          const dayData = checksMap[date] || {};
          const items = dayData.items || {};
          const hasItems = Object.keys(items).length > 0;
          const dayIssue = Object.values(items).some(v => v.status === "issue");
          const isFuture = date > todayISO();
          return (
            <button key={date} onClick={() => onDayClick(date)}
              disabled={isFuture}
              className="flex flex-col items-center gap-1 flex-1 rounded-xl py-2 transition-all border"
              style={{
                opacity: isFuture ? 0.35 : 1,
                background: hasItems ? (dayIssue ? "#FEF2F2" : "#F0FDF4") : "#F8FAFC",
                borderColor: hasItems ? (dayIssue ? "#FECACA" : "#BBF7D0") : "#E2E8F0",
              }}>
              <span className="text-[10px] font-bold text-slate-400 leading-none">{DAY_LABELS[i]}</span>
              <span className="text-xs font-black leading-none" style={{ color: hasItems ? (dayIssue ? "#991B1B" : "#166534") : "#94A3B8" }}>
                {new Date(date + "T12:00:00").getDate()}
              </span>
              {hasItems && (
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: dayIssue ? "#EF4444" : "#22C55E" }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function VehicleCheckScreen({ data, setData, userId }) {
  const today = todayISO();
  const [tab, setTab]                   = useState("daily");   // "daily" | "history"
  const [selectedDate, setSelectedDate] = useState(today);
  const [currentMonday, setCurrentMonday] = useState(getMondayOfWeek(today));
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings]         = useState(loadVehicleSettings);
  const [toast, setToast]               = useState("");
  const [issueSheet, setIssueSheet]     = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [collapsedMonths, setCollapsedMonths]     = useState({});
  const [pdfPack, setPdfPack]           = useState(null);
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedWeeks, setSelectedWeeks] = useState(new Set());
  const [buildingPDF, setBuildingPDF]   = useState(false);
  const { confirm, dialog }             = useConfirm();

  const checks = data.vehicleChecks || {};
  const weekDays = useMemo(() => weekDates(currentMonday), [currentMonday]);

  // Min date = 1 year ago
  const minDate = useMemo(() => {
    const d = new Date(today + "T12:00:00");
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // ── Week navigation ─────────────────────────────────────────────────────────
  function goToPrevWeek() {
    const prev = addWeeks(currentMonday, -1);
    if (prev >= minDate.slice(0, 10)) {
      setCurrentMonday(prev);
      setSelectedDate(prev);
    }
  }

  function goToNextWeek() {
    const next = addWeeks(currentMonday, 1);
    if (next <= getMondayOfWeek(today)) {
      setCurrentMonday(next);
      setSelectedDate(next);
    }
  }

  function goToToday() {
    setCurrentMonday(getMondayOfWeek(today));
    setSelectedDate(today);
  }

  function handleDatePick(e) {
    const picked = e.target.value;
    if (!picked || picked > today || picked < minDate) return;
    setCurrentMonday(getMondayOfWeek(picked));
    setSelectedDate(picked);
  }

  // ── Day data helpers ────────────────────────────────────────────────────────
  function getDayData(date) { return checks[date] || { items: {}, generalComment: "" }; }
  function getItemStatus(date, item) { return getDayData(date).items[item]?.status || null; }
  function getItemComment(date, item) { return getDayData(date).items[item]?.comment || ""; }

  function persistDay(date, dayData) {
    const row = {
      id: `vehicle_check_${userId}_${date}`,
      user_id: userId,
      check_date: date,
      vehicle: settings.vehicle,
      registration: settings.registration,
      driver: settings.driver,
      data: JSON.stringify(dayData),
      sync_status: "pending",
      updated_at: new Date().toISOString(),
    };
    setData(d => ({
      ...d,
      vehicleChecks: { ...(d.vehicleChecks || {}), [date]: dayData },
      syncQueue: [{ id: genId(), table: "vehicle_checks", action: "upsert", data: row, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    triggerImmediateSync();
  }

  function saveItemStatus(date, item, status, comment = "") {
    const dayData = getDayData(date);
    persistDay(date, { ...dayData, items: { ...dayData.items, [item]: { status, comment: comment || dayData.items[item]?.comment || "" } } });
  }

  function saveItemComment(date, item, comment) {
    const dayData = getDayData(date);
    persistDay(date, { ...dayData, items: { ...dayData.items, [item]: { ...(dayData.items[item] || { status: "issue" }), comment } } });
  }

  function markAllGood(date) {
    const allItems = CHECKLIST.flatMap(s => s.items);
    const dayData = getDayData(date);
    const updatedItems = {};
    allItems.forEach(item => {
      const existing = dayData.items[item];
      updatedItems[item] = existing?.status === "issue" || existing?.status === "na" ? existing : { status: "ok", comment: "" };
    });
    persistDay(date, { ...dayData, items: updatedItems });
    setToast("All items marked OK ✓");
  }

  async function resetDay(date) {
    const ok = await confirm(`Clear all checks for ${smartDate(date)}?`, { confirmLabel: "Clear" });
    if (!ok) return;
    persistDay(date, { items: {}, generalComment: "" });
    setToast("Day cleared");
  }

  function cycleStatus(date, item) {
    const current = getItemStatus(date, item);
    if (!current) { saveItemStatus(date, item, "ok"); }
    else if (current === "ok") { setIssueSheet({ item, date }); }
    else if (current === "issue") { saveItemStatus(date, item, "na"); }
    else { saveItemStatus(date, item, null); }
  }

  function handleIssueSave(comment) {
    if (!issueSheet) return;
    saveItemComment(issueSheet.date, issueSheet.item, comment);
    saveItemStatus(issueSheet.date, issueSheet.item, "issue", comment);
    setIssueSheet(null);
    setToast("Issue saved");
  }

  // ── PDF single day ──────────────────────────────────────────────────────────
  async function exportPDF(date) {
    setToast("Building inspection report…");
    try {
      const { blob, filename, ref } = await buildVehicleCheckPDF({
        checkDate: date || selectedDate,
        dayData: getDayData(date || selectedDate),
        settings, checklist: CHECKLIST,
      });
      const url = URL.createObjectURL(blob);
      setPdfPack({ blob, url, filename, ref });
      setToast("");
    } catch (e) {
      setToast("Could not build PDF — try again");
    }
  }

  // ── PDF multi-day (selected weeks) ─────────────────────────────────────────
  async function exportSelectedPDF() {
    if (selectedWeeks.size === 0) { setToast("Select at least one week"); return; }
    setBuildingPDF(true);
    setToast("Building multi-week report…");
    try {
      // Collect all days from selected weeks that have data
      const allDays = [];
      for (const monday of [...selectedWeeks].sort()) {
        weekDates(monday).forEach(date => {
          const d = getDayData(date);
          if (Object.keys(d.items).length > 0) allDays.push(date);
        });
      }
      if (allDays.length === 0) { setToast("No completed checks in selected weeks"); setBuildingPDF(false); return; }

      // Build one PDF per day, combine into a multi-page blob using jsPDF
      // For now build individual PDFs and share the first; in future merge
      const { blob, filename, ref } = await buildVehicleCheckPDF({
        checkDate: allDays[0],
        dayData: getDayData(allDays[0]),
        settings, checklist: CHECKLIST,
        // Pass all days for a summary report
        allDays: allDays.map(d => ({ date: d, dayData: getDayData(d) })),
      });
      const url = URL.createObjectURL(blob);
      setPdfPack({ blob, url, filename, ref, weekCount: selectedWeeks.size, dayCount: allDays.length });
      setToast("");
    } catch (e) {
      console.error(e);
      setToast("Could not build PDF — try again");
    }
    setBuildingPDF(false);
  }

  function closePdfPack() {
    if (pdfPack?.url) URL.revokeObjectURL(pdfPack.url);
    setPdfPack(null);
  }

  async function sharePdfPack() {
    if (!pdfPack) return;
    const file = new File([pdfPack.blob], pdfPack.filename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: `Vehicle Inspection ${pdfPack.ref}`, files: [file] }); } catch {}
    } else {
      const a = document.createElement("a");
      a.href = pdfPack.url; a.download = pdfPack.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setToast("PDF downloaded");
    }
  }

  // ── History grouping ────────────────────────────────────────────────────────
  const historyMonths = useMemo(() => buildHistory(checks), [checks]);

  function toggleMonth(key) { setCollapsedMonths(s => ({ ...s, [key]: !s[key] })); }

  function toggleWeekSelect(mondayISO) {
    setSelectedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(mondayISO)) next.delete(mondayISO); else next.add(mondayISO);
      return next;
    });
  }

  // ── Daily view derived state ────────────────────────────────────────────────
  const todayData = getDayData(selectedDate);
  const allItems  = CHECKLIST.flatMap(s => s.items);
  const checkedCount = allItems.filter(i => todayData.items[i]?.status).length;
  const issueCount   = allItems.filter(i => todayData.items[i]?.status === "issue").length;
  const allGood      = checkedCount === allItems.length && issueCount === 0;
  const isCurrentWeek = currentMonday === getMondayOfWeek(today);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* Issue sheet */}
      <AnimatePresence>
        {issueSheet && (
          <IssueSheet item={issueSheet.item} date={issueSheet.date}
            currentComment={getItemComment(issueSheet.date, issueSheet.item)}
            onSave={handleIssueSave} onClose={() => setIssueSheet(null)} />
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel settings={settings}
            onSave={s => { setSettings(s); saveVehicleSettings(s); setToast("Settings saved"); }}
            onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>

      {/* PDF preview sheet */}
      <AnimatePresence>
        {pdfPack && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closePdfPack} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto">
              <div className="flex justify-center pt-2.5 pb-1"><div className="w-12 h-1 rounded-full bg-slate-300" /></div>
              <div className="px-5 pt-2 pb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-base font-black text-slate-900">Inspection Report Ready</p>
                  <p className="text-xs text-slate-500 truncate">
                    {pdfPack.weekCount ? `${pdfPack.weekCount} week${pdfPack.weekCount !== 1 ? "s" : ""} · ${pdfPack.dayCount} day${pdfPack.dayCount !== 1 ? "s" : ""}` : smartDate(selectedDate)}
                    {" · "}{pdfPack.ref}
                  </p>
                </div>
                <button onClick={closePdfPack} className="p-2 rounded-lg text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center"><X size={20} /></button>
              </div>
              <div className="px-4 pb-3">
                <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50" style={{ height: 280 }}>
                  <iframe src={pdfPack.url} title="Report preview" className="w-full h-full" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 text-center">{pdfPack.filename}</p>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 space-y-2" style={{ background: "#F7F3F3" }}>
                <button onClick={sharePdfPack}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                  style={{ background: "#8B1A1A" }}>
                  <Send size={16} /> Share (Mail, WhatsApp, Outlook…)
                </button>
                <button onClick={() => window.open(pdfPack.url, "_blank")}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
                  <FileDown size={14} /> Open PDF
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          title="Vehicle Checklist"
          subtitle={`${settings.vehicle}${settings.registration ? ` · ${settings.registration}` : ""}`}
        />
        <div className="flex gap-2 shrink-0">
          {tab === "daily" && checkedCount > 0 && (
            <button onClick={() => exportPDF()}
              className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <FileDown size={18} />
            </button>
          )}
          <button onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Vehicle card */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#FEE2E2" }}>
            <Car size={20} style={{ color: "#8B1A1A" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-slate-900 leading-tight">{settings.vehicle || "No vehicle set"}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {settings.registration && <span className="text-xs font-bold text-slate-500 bg-slate-100 rounded-lg px-2 py-0.5 font-mono">{settings.registration}</span>}
              {settings.driver && <span className="text-xs text-slate-400">{settings.driver}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Tab switcher */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTab("daily")}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border-2 min-h-[48px] transition-all"
          style={tab === "daily"
            ? { background: "#8B1A1A", color: "white", borderColor: "#8B1A1A" }
            : { background: "white", color: "#64748B", borderColor: "#E2E8F0" }}>
          <Calendar size={16} /> Daily Check
        </button>
        <button onClick={() => setTab("history")}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border-2 min-h-[48px] transition-all"
          style={tab === "history"
            ? { background: "#8B1A1A", color: "white", borderColor: "#8B1A1A" }
            : { background: "white", color: "#64748B", borderColor: "#E2E8F0" }}>
          <History size={16} /> History
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* DAILY TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "daily" && (
        <>
          {/* Week navigator with prev/next + date picker */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
                {weekLabel(currentMonday)}
              </p>
              <div className="flex items-center gap-1">
                {/* Date picker */}
                <label className="relative p-2 rounded-xl border border-slate-200 bg-white text-slate-500 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer">
                  <Calendar size={14} />
                  <input type="date" value={selectedDate} min={minDate} max={today}
                    onChange={handleDatePick}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                </label>
                <button onClick={goToPrevWeek} disabled={addWeeks(currentMonday, -1) < minDate}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 min-w-[36px] min-h-[36px] flex items-center justify-center disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={goToNextWeek} disabled={isCurrentWeek}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 min-w-[36px] min-h-[36px] flex items-center justify-center disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
                {!isCurrentWeek && (
                  <button onClick={goToToday}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-xl min-h-[36px]"
                    style={{ background: "#F7F3F3", color: "#8B1A1A" }}>
                    Today
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {weekDays.map((date, i) => {
                const dayData  = getDayData(date);
                const items    = dayData.items || {};
                const hasIssue = Object.values(items).some(v => v.status === "issue");
                const isOk     = Object.keys(items).length > 0 && !hasIssue;
                const isActive = date === selectedDate;
                const isFuture = date > today;
                return (
                  <button key={date} onClick={() => setSelectedDate(date)} disabled={isFuture}
                    className="flex flex-col items-center gap-1 rounded-2xl py-2.5 px-1 transition-all border-2"
                    style={{
                      background: isActive ? "#8B1A1A" : "white",
                      borderColor: isActive ? "#8B1A1A" : hasIssue ? "#FECACA" : isOk ? "#BBF7D0" : "#E2E8F0",
                      opacity: isFuture ? 0.35 : 1,
                    }}>
                    <span className="text-[10px] font-bold leading-none" style={{ color: isActive ? "rgba(255,255,255,0.7)" : "#94A3B8" }}>{DAY_LABELS[i]}</span>
                    <span className="text-sm font-black leading-none mt-0.5" style={{ color: isActive ? "white" : "#1E293B" }}>
                      {new Date(date + "T12:00:00").getDate()}
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full mt-0.5"
                      style={{ background: isActive ? "rgba(255,255,255,0.5)" : hasIssue ? "#EF4444" : isOk ? "#22C55E" : "transparent" }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status summary */}
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-2xl border-2 p-3 flex items-center gap-2.5"
              style={{ background: allGood ? "#F0FDF4" : issueCount > 0 ? "#FEF2F2" : "#F8FAFC", borderColor: allGood ? "#BBF7D0" : issueCount > 0 ? "#FECACA" : "#E2E8F0" }}>
              {allGood ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                : issueCount > 0 ? <AlertTriangle size={18} className="text-red-500 shrink-0" />
                : <Minus size={18} className="text-slate-300 shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-black leading-tight"
                  style={{ color: allGood ? "#166534" : issueCount > 0 ? "#991B1B" : "#64748B" }}>
                  {allGood ? "All clear" : issueCount > 0 ? `${issueCount} issue${issueCount !== 1 ? "s" : ""} flagged` : `${checkedCount} / ${allItems.length} checked`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{smartDate(selectedDate)}{selectedDate === today ? " — Today" : ""}</p>
              </div>
            </div>
            <button onClick={() => resetDay(selectedDate)}
              className="p-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-400 min-w-[52px] min-h-[52px] flex items-center justify-center shrink-0">
              <RotateCcw size={16} />
            </button>
          </div>

          {/* All Good button */}
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => markAllGood(selectedDate)}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-black text-white shadow-sm min-h-[60px]"
            style={{ background: allGood ? "#16A34A" : "#8B1A1A" }}>
            <CheckCircle2 size={22} />
            {allGood ? "All Good — Tap to re-confirm" : "All Good — Mark Everything OK"}
          </motion.button>

          <p className="text-xs text-slate-400 text-center -mt-2">
            Tap above for a quick all-clear, or tap individual items to flag issues.
          </p>

          {/* Checklist sections */}
          {CHECKLIST.map(({ section, items }) => {
            const sectionIssues = items.filter(item => getDayData(selectedDate).items[item]?.status === "issue").length;
            const sectionOk = items.filter(item => getDayData(selectedDate).items[item]?.status === "ok").length;
            const collapsed = collapsedSections[section];
            return (
              <div key={section}>
                <button onClick={() => setCollapsedSections(s => ({ ...s, [section]: !s[section] }))}
                  className="w-full flex items-center justify-between px-1 mb-2 group">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-500 uppercase tracking-wider">{section}</p>
                    {sectionIssues > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-red-700" style={{ background: "#FEE2E2" }}>
                        {sectionIssues} issue{sectionIssues !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">{sectionOk}/{items.length}</span>
                    <div className="rounded-full p-0.5 bg-slate-100">
                      {collapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                      <Card className="divide-y divide-slate-50 overflow-hidden">
                        {items.map(item => {
                          const status  = getItemStatus(selectedDate, item);
                          const comment = getItemComment(selectedDate, item);
                          const ss      = statusStyle(status);
                          return (
                            <div key={item}>
                              <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-slate-50"
                                onClick={() => cycleStatus(selectedDate, item)}>
                                <div className="shrink-0">
                                  {status === "ok"    && <CheckCircle2 size={20} className="text-green-500" />}
                                  {status === "issue" && <XCircle size={20} className="text-red-500" />}
                                  {status === "na"    && <Minus size={20} className="text-slate-300" />}
                                  {!status            && <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-white" />}
                                </div>
                                <p className="flex-1 text-sm font-bold text-slate-800">{item}</p>
                                <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black border"
                                  style={{ background: ss.bg, color: ss.color, borderColor: ss.border }}>
                                  {status === "ok" ? "OK" : status === "issue" ? "Issue" : status === "na" ? "N/A" : "—"}
                                </span>
                                {status === "issue" && <ChevronRight size={15} className="text-slate-300 shrink-0" />}
                              </div>
                              {status === "issue" && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                                  <button onClick={() => setIssueSheet({ item, date: selectedDate })}
                                    className="w-full text-left px-4 pb-3.5 pt-0 flex items-start gap-2">
                                    <div className="w-4 shrink-0 mt-0.5" />
                                    {comment ? (
                                      <div className="flex-1 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                                        <p className="text-xs font-black text-red-700 mb-0.5">Issue note</p>
                                        <p className="text-xs text-red-600 leading-snug">{comment}</p>
                                        <p className="text-[10px] text-red-400 mt-1.5 font-medium">Tap to edit</p>
                                      </div>
                                    ) : (
                                      <div className="flex-1 rounded-xl border-2 border-dashed border-red-200 px-3 py-2.5 flex items-center gap-2">
                                        <FileText size={13} className="text-red-400 shrink-0" />
                                        <p className="text-xs font-bold text-red-500">Add issue description</p>
                                      </div>
                                    )}
                                  </button>
                                </motion.div>
                              )}
                            </div>
                          );
                        })}
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* General comments */}
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">Other Comments</p>
            <Card className="p-4">
              <textarea value={getDayData(selectedDate).generalComment || ""}
                onChange={e => persistDay(selectedDate, { ...getDayData(selectedDate), generalComment: e.target.value })}
                placeholder="Any other observations for today…" rows={3}
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300 resize-none" />
            </Card>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "history" && (
        <>
          {/* Select mode toolbar */}
          <div className="flex items-center gap-2">
            <button onClick={() => { setSelectMode(s => !s); setSelectedWeeks(new Set()); }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border-2 min-h-[48px] transition-all"
              style={selectMode
                ? { background: "#8B1A1A", color: "white", borderColor: "#8B1A1A" }
                : { background: "white", color: "#64748B", borderColor: "#E2E8F0" }}>
              {selectMode ? <X size={15} /> : <Check size={15} />}
              {selectMode ? "Cancel" : "Select weeks"}
            </button>
            {selectMode && selectedWeeks.size > 0 && (
              <button onClick={exportSelectedPDF} disabled={buildingPDF}
                className="flex items-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-white min-h-[48px] disabled:opacity-50"
                style={{ background: "#8B1A1A" }}>
                <FileDown size={15} />
                Export {selectedWeeks.size} week{selectedWeeks.size !== 1 ? "s" : ""}
              </button>
            )}
          </div>

          {selectMode && (
            <p className="text-xs text-slate-400 text-center -mt-2">
              Select one or more weeks then tap Export to build a combined PDF to share.
            </p>
          )}

          {/* Monthly groups */}
          {historyMonths.map(month => {
            const collapsed = collapsedMonths[month.key];
            const monthHasData = month.weeks.some(w => w.hasAny);
            const monthIssues = month.weeks.filter(w => w.hasIssue).length;

            return (
              <div key={month.key}>
                <button onClick={() => toggleMonth(month.key)}
                  className="w-full flex items-center justify-between px-1 mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-500 uppercase tracking-wider">{month.label}</p>
                    {monthIssues > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-red-700" style={{ background: "#FEE2E2" }}>
                        {monthIssues} issue week{monthIssues !== 1 ? "s" : ""}
                      </span>
                    )}
                    {!monthHasData && (
                      <span className="text-xs text-slate-400">— no data</span>
                    )}
                  </div>
                  <div className="rounded-full p-0.5 bg-slate-100">
                    {collapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                      <Card className="overflow-hidden">
                        {month.weeks.map(week => (
                          <WeekRow key={week.mondayISO} week={week} checksMap={checks}
                            selected={selectedWeeks}
                            onSelect={toggleWeekSelect}
                            onDayClick={date => {
                              setCurrentMonday(getMondayOfWeek(date));
                              setSelectedDate(date);
                              setTab("daily");
                            }}
                            selectMode={selectMode}
                          />
                        ))}
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
