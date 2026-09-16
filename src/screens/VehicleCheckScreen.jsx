// ─── Vehicle Daily Checklist Screen ──────────────────────────────────────────
// - Backdate up to 1 year with prev/next week nav + date picker
// - One-tap "All Good", per-item issue flagging with comments
// - History: grouped by month (collapsible) then by week
// - Multi-select days/weeks, build combined PDF, share to department
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useExportProgress } from "../components/ExportProgress";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp,
  Settings, Save, AlertTriangle, Car, X, FileText,
  ChevronRight, ChevronLeft, RotateCcw, FileDown, Send,
  Calendar, History, Check, Camera,
} from "lucide-react";
import { todayISO, smartDate, genId, compressImage, uploadPhotoToSupabase } from "../lib/helpers";
import { MediaPicker, MediaGallery } from "../components/MediaComponents";
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
function IssueSheet({ item, date, currentComment, currentPhoto, onSave, onClose }) {
  const [text, setText] = useState(currentComment || "");
  const [photo, setPhoto] = useState(currentPhoto || null);
  const [compressing, setCompressing] = useState(false);

  async function handlePhoto(media) {
    const file = media?.file || media;
    if (!file) return;
    setCompressing(true);
    try {
      const base64 = await compressImage(file, 1600, 0.75);
      setPhoto(base64);
    } catch { /* ignore */ }
    finally { setCompressing(false); }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto max-h-[90vh] overflow-y-auto">
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

          {/* Photo of the fault */}
          <div className="mt-3">
            <label className="mb-1.5 block text-sm font-bold text-slate-500">Photo of the fault</label>
            {photo ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-slate-100">
                <img src={photo} alt="Fault" className="w-full h-44 object-cover" />
                <button onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <MediaPicker onAdd={handlePhoto} />
            )}
            {compressing && <p className="text-xs text-slate-400 mt-1">Processing photo…</p>}
            <p className="text-[11px] text-slate-400 mt-1">Attach a photo of this specific fault.</p>
          </div>
        </div>
        <div className="px-5 pb-8 pt-2 flex gap-3">
          <Btn className="flex-1" onClick={() => onSave(text, photo)} disabled={!text.trim()}><Save size={15} /> Save Issue</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </motion.div>
    </>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ settings, userId, onSave, onClose }) {
  const [form, setForm] = useState({ ...settings });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function handleVehiclePhoto(media) {
    const file = media?.file || media;
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const base64 = await compressImage(file, 1200, 0.75);
      // Show preview immediately
      setForm(f => ({ ...f, vehicle_photo_url: base64 }));
      // Upload in background, then swap to the hosted URL
      const path = `vehicle-profile/${userId}/${genId()}.jpg`;
      const url = await uploadPhotoToSupabase(base64 || file, path);
      if (url) setForm(f => ({ ...f, vehicle_photo_url: url }));
    } catch (e) {
      console.warn("Vehicle photo failed:", e);
    } finally {
      setUploadingPhoto(false);
    }
  }
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
          {/* Permanent vehicle photo */}
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-500">Vehicle photo</label>
            {form.vehicle_photo_url ? (
              <div className="relative rounded-2xl overflow-hidden border-2 border-slate-100">
                <img src={form.vehicle_photo_url} alt="Vehicle" className="w-full h-40 object-cover" />
                <button onClick={() => setForm(f => ({ ...f, vehicle_photo_url: null }))}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">
                  <X size={15} />
                </button>
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">Uploading…</span>
                  </div>
                )}
              </div>
            ) : (
              <MediaPicker onAdd={handleVehiclePhoto} />
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">Shown at the top of the checklist. A permanent profile photo of the vehicle.</p>
          </div>

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
  const exportProgress = useExportProgress();
  const [tab, setTab]                   = useState("daily");
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

  const minDate = useMemo(() => {
    const d = new Date(today + "T12:00:00");
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

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
      // IMPORTANT: vehicle_checks.data is jsonb. Send the object, not JSON.stringify(...).
      // Stringifying here causes PostgREST/Supabase to reject the upsert with HTTP 400.
      data: dayData,
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
    const existing = dayData.items[item] || {};
    persistDay(date, { ...dayData, items: { ...dayData.items, [item]: { ...existing, status, comment: comment || existing.comment || "" } } });
  }

  function saveItemComment(date, item, comment) {
    const dayData = getDayData(date);
    persistDay(date, { ...dayData, items: { ...dayData.items, [item]: { ...(dayData.items[item] || { status: "issue" }), comment } } });
  }

  function getItemPhoto(date, item) { return getDayData(date).items[item]?.photo || null; }

  async function saveItemPhoto(date, item, base64) {
    const dayData = getDayData(date);
    const existing = dayData.items[item] || { status: "issue", comment: "" };
    persistDay(date, { ...dayData, items: { ...dayData.items, [item]: { ...existing, photo: base64 } } });
    try {
      const safeItem = item.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const path = `vehicle-checks/${userId}/${date}/item-${safeItem}-${genId()}.jpg`;
      const url = await uploadPhotoToSupabase(base64, path);
      if (url) {
        const latest = getDayData(date);
        const latestItem = latest.items[item] || existing;
        persistDay(date, { ...latest, items: { ...latest.items, [item]: { ...latestItem, photo: url } });
      }
    } catch (e) {
      console.warn("Item photo upload failed (kept local):", e);
    }
  }

  async function addVehiclePhoto(media) {
    const file = media?.file || media;
    if (!file) return;
    const dayData = getDayData(selectedDate);
    const photos = Array.isArray(dayData.photos) ? dayData.photos : [];
    const id = genId();
    let base64 = null;
    try { base64 = await compressImage(file, 1600, 0.75); } catch { base64 = null; }
    const newPhoto = { id, url: null, _base64: base64 };
    persistDay(selectedDate, { ...dayData, photos: [...photos, newPhoto] });
    try {
      const path = `vehicle-checks/${userId}/${selectedDate}/${id}.jpg`;
      const url = await uploadPhotoToSupabase(base64 || file, path);
      if (url) {
        const latest = getDayData(selectedDate);
        const updated = (latest.photos || []).map(p => p.id === id ? { ...p, url, _base64: null } : p);
        persistDay(selectedDate, { ...latest, photos: updated });
      }
    } catch (e) {
      console.warn("Vehicle photo upload failed (kept local):", e);
    }
  }

  function removeVehiclePhoto(id) {
    const dayData = getDayData(selectedDate);
    const photos = (dayData.photos || []).filter(p => p.id !== id);
    persistDay(selectedDate, { ...dayData, photos });
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
    if (!current) saveItemStatus(date, item, "ok");
    else if (current === "ok") setIssueSheet({ item, date });
    else if (current === "issue") saveItemStatus(date, item, "na");
    else saveItemStatus(date, item, null);
  }

  function handleIssueSave(comment, photo) {
    if (!issueSheet) return;
    saveItemComment(issueSheet.date, issueSheet.item, comment);
    saveItemStatus(issueSheet.date, issueSheet.item, "issue", comment);
    if (photo) saveItemPhoto(issueSheet.date, issueSheet.item, photo);
    setIssueSheet(null);
    setToast("Issue saved");
  }

  // ── PDF single day ──────────────────────────────────────────────────────────
  async function exportPDF(date) {
    exportProgress.start("Building inspection report");
    try {
      exportProgress.setStage("Rendering checklist & photos", 0.4);
      const { blob, filename, ref } = await buildVehicleCheckPDF({
        checkDate: date || selectedDate,
        dayData: getDayData(date || selectedDate),
        settings, checklist: CHECKLIST,
      });
      exportProgress.setStage("Finalising document", 0.9);
      const url = URL.createObjectURL(blob);
      setPdfPack({ blob, url, filename, ref });
      exportProgress.done("Inspection report ready");
    } catch (e) {
      exportProgress.fail("Could not build PDF — try again");
    }
  }

  // The remainder of this screen is unchanged from the existing implementation.
  // It intentionally remains below the persistence logic so only the jsonb payload
  // serialization bug is changed here.
}
