// ─── Vehicle Daily Checklist Screen ──────────────────────────────────────────
// Daily vehicle inspection checklist for Power Works field vehicles.
// - One-tap "All Good" for normal days
// - Per-item issue flagging with comment box
// - Settings panel: vehicle, driver, registration (persisted to localStorage)
// - Weekly Mon–Fri view; stored per-date in app data + synced
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Minus,
  ChevronDown,
  ChevronUp,
  Settings,
  Save,
  AlertTriangle,
  Car,
  X,
  FileText,
  ChevronRight,
  RotateCcw,
  FileDown,
  Send,
} from "lucide-react";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { buildVehicleCheckPDF } from "../lib/vehicleCheckPDF";
import {
  Card, Btn, Field, Toast, Empty, PageHeader, useConfirm,
} from "../components/ui";

// ─── Checklist items grouped by section ──────────────────────────────────────
const CHECKLIST = [
  {
    section: "Exterior",
    items: [
      "Body / Frame",
      "Cab / Load Bin",
      "Tonneau Cover / Cargo Net",
      "Bumpers",
      "Tow Bar (if applicable)",
      "License Disk & Plates",
      "Windshield",
      "Wipers & Washers",
      "Locks",
      "Mirrors",
      "Tyres / Wheels (incl. Spare)",
      "Underneath",
      "Suspension",
    ],
  },
  {
    section: "Engine",
    items: [
      "Hoses",
      "Fluids — Engine Oil",
      "Fluids — Brake",
      "Fluids — Transmission",
      "Fluids — Radiator",
      "Fluids — Washer",
      "Fluids — Power Steering",
      "Clutch (if applicable)",
      "Belts",
      "Fuel",
      "Battery",
      "Exhaust",
    ],
  },
  {
    section: "Electrical",
    items: [
      "Daytime Running Lights (if fitted)",
      "Headlight — Low Beam",
      "Headlight — High Beam",
      "Indicators & Hazard Lights",
      "Reverse Lights",
    ],
  },
  {
    section: "Interior",
    items: [
      "Clean & Free of Clutter",
      "Foot Wells Clean & Free of Clutter",
      "Windows Clean",
      "Instrument Panel / Warning Lights",
      "Hooter",
      "Driver Controls",
      "Steering",
      "Seats",
      "Seat Belts",
      "Accessories, Radio, BT etc.",
      "Fan, Heater / Demister / Air Con",
      "Fire Extinguisher",
      "First Aid Kit",
      "Warning Triangles",
      "Star Bar",
      "Reverse Hooter",
      "Buggy Whips",
      "Wheel Chocks",
    ],
  },
  {
    section: "Operation",
    items: [
      "Sounds (unusual)",
      "Vibrations (unusual)",
      "Indicator or Warning Lights",
    ],
  },
];

const VEHICLE_SETTINGS_KEY = "pm_vehicle_settings";
const DEFAULT_SETTINGS = {
  vehicle:      "Toyota Hilux",
  driver:       "",
  registration: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadVehicleSettings() {
  try {
    const raw = localStorage.getItem(VEHICLE_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveVehicleSettings(s) {
  localStorage.setItem(VEHICLE_SETTINGS_KEY, JSON.stringify(s));
}

// Get Mon–Sun of the week containing a given ISO date
function weekDates(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 5 }, (_, i) => {
    const dd = new Date(mon);
    dd.setDate(mon.getDate() + i);
    return dd.toISOString().slice(0, 10);
  });
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ─── Status chip ─────────────────────────────────────────────────────────────
// ok | issue | na | null (not checked)
function statusStyle(s) {
  if (s === "ok")    return { bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" };
  if (s === "issue") return { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" };
  if (s === "na")    return { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" };
  return { bg: "#F8FAFC", color: "#94A3B8", border: "#E2E8F0" };
}

// ─── Issue comment sheet ──────────────────────────────────────────────────────
function IssueSheet({ item, date, currentComment, onSave, onClose }) {
  const [text, setText] = useState(currentComment || "");
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        <div className="px-5 pt-2 pb-2 flex items-start justify-between">
          <div>
            <p className="text-base font-black text-slate-900">{item}</p>
            <p className="text-xs text-slate-400 mt-0.5">{smartDate(date)} · Issue flagged</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-2">
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 mb-4">
            <p className="text-xs font-bold text-red-700">
              ⚠️ Report concerns immediately. Do not operate the vehicle until you are sure it is safe.
            </p>
          </div>
          <label className="block text-sm font-bold text-slate-600 mb-1.5">
            Describe the issue <span className="text-red-500">*</span>
          </label>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. Left rear tyre is flat, oil level below minimum mark…"
            rows={4}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors resize-none"
          />
        </div>

        <div className="px-5 pb-8 flex gap-3">
          <Btn className="flex-1" onClick={() => onSave(text)} disabled={!text.trim()}>
            <Save size={15} /> Save Issue
          </Btn>
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
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        <div className="px-5 pt-2 pb-4 flex items-center justify-between">
          <p className="text-base font-black text-slate-900">Vehicle Settings</p>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-2 space-y-3">
          <Field
            label="Vehicle (Make & Model)"
            value={form.vehicle}
            onChange={v => setForm(f => ({ ...f, vehicle: v }))}
            placeholder="e.g. Toyota Hilux, Ford Ranger…"
          />
          <Field
            label="Registration Number"
            value={form.registration}
            onChange={v => setForm(f => ({ ...f, registration: v.toUpperCase() }))}
            placeholder="e.g. MN31MJGP"
          />
          <Field
            label="Driver / Inspected By"
            value={form.driver}
            onChange={v => setForm(f => ({ ...f, driver: v }))}
            placeholder="Your name"
          />
        </div>

        <div className="px-5 pb-10 pt-2">
          <Btn className="w-full" onClick={() => { onSave(form); onClose(); }}>
            <Save size={15} /> Save Settings
          </Btn>
          <p className="text-xs text-slate-400 text-center mt-2.5 leading-relaxed">
            These details are saved to this device and pre-filled on every daily checklist.
          </p>
        </div>
      </motion.div>
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function VehicleCheckScreen({ data, setData, userId }) {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings]         = useState(loadVehicleSettings);
  const [toast, setToast]               = useState("");
  const [issueSheet, setIssueSheet]     = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [pdfPack, setPdfPack]           = useState(null);
  const { confirm, dialog }             = useConfirm();

  const weekDays = useMemo(() => weekDates(selectedDate), [selectedDate]);
  const checks = data.vehicleChecks || {};

  // ── Get or initialise a day's data ─────────────────────────────────────────
  function getDayData(date) {
    return checks[date] || { items: {}, generalComment: "", submitted: false };
  }

  function getItemStatus(date, item) {
    return getDayData(date).items[item]?.status || null;
  }

  function getItemComment(date, item) {
    return getDayData(date).items[item]?.comment || "";
  }

  // ── Save a status change ────────────────────────────────────────────────────
  function saveItemStatus(date, item, status, comment = "") {
    const dayData = getDayData(date);
    const updated = {
      ...dayData,
      items: {
        ...dayData.items,
        [item]: { status, comment: comment || dayData.items[item]?.comment || "" },
      },
    };
    persistDay(date, updated);
  }

  function saveItemComment(date, item, comment) {
    const dayData = getDayData(date);
    const updated = {
      ...dayData,
      items: {
        ...dayData.items,
        [item]: { ...(dayData.items[item] || { status: "issue" }), comment },
      },
    };
    persistDay(date, updated);
  }

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
      syncQueue: [{
        id: genId(), table: "vehicle_checks",
        action: "upsert", data: row,
        status: "pending", created_at: new Date().toISOString(),
      }, ...(d.syncQueue || [])],
    }));
    triggerImmediateSync();
  }

  // ── "All Good" — mark every item OK for the selected date ──────────────────
  function markAllGood(date) {
    const allItems = CHECKLIST.flatMap(s => s.items);
    const dayData = getDayData(date);
    const updatedItems = {};
    allItems.forEach(item => {
      // Preserve existing issues and NA — only fill in unchecked items
      const existing = dayData.items[item];
      updatedItems[item] = existing?.status === "issue" || existing?.status === "na"
        ? existing
        : { status: "ok", comment: "" };
    });
    const updated = { ...dayData, items: updatedItems };
    persistDay(date, updated);
    setToast("All items marked OK ✓");
  }

  // ── "Reset day" ─────────────────────────────────────────────────────────────
  async function resetDay(date) {
    const ok = await confirm(`Clear all checks for ${smartDate(date)}?`, { confirmLabel: "Clear" });
    if (!ok) return;
    persistDay(date, { items: {}, generalComment: "", submitted: false });
    setToast("Day cleared");
  }

  // ── Cycle status on tap: null → ok → issue → na → null ────────────────────
  function cycleStatus(date, item) {
    const current = getItemStatus(date, item);
    if (current === null || current === undefined) {
      saveItemStatus(date, item, "ok");
    } else if (current === "ok") {
      // Open issue sheet
      setIssueSheet({ item, date });
    } else if (current === "issue") {
      saveItemStatus(date, item, "na");
    } else {
      saveItemStatus(date, item, null);
    }
  }

  function handleIssueSave(comment) {
    if (!issueSheet) return;
    saveItemComment(issueSheet.date, issueSheet.item, comment);
    saveItemStatus(issueSheet.date, issueSheet.item, "issue", comment);
    setIssueSheet(null);
    setToast("Issue saved");
  }

  function toggleSection(section) {
    setCollapsedSections(s => ({ ...s, [section]: !s[section] }));
  }

  // ── Summary for the selected date ──────────────────────────────────────────
  const todayData = getDayData(selectedDate);
  const allItems  = CHECKLIST.flatMap(s => s.items);
  const checkedCount = allItems.filter(i => todayData.items[i]?.status).length;
  const issueCount   = allItems.filter(i => todayData.items[i]?.status === "issue").length;
  const allGood      = checkedCount === allItems.length && issueCount === 0;

  // ── PDF export ──────────────────────────────────────────────────────────────
  async function exportPDF() {
    setToast("Building inspection report...");
    try {
      const { blob, filename, ref } = await buildVehicleCheckPDF({
        checkDate: selectedDate,
        dayData:   getDayData(selectedDate),
        settings,
        checklist: CHECKLIST,
      });
      const url = URL.createObjectURL(blob);
      setPdfPack({ blob, url, filename, ref });
      setToast("");
    } catch (e) {
      console.error("PDF build failed:", e);
      setToast("Could not build PDF — try again");
    }
  }

  function closePdfPack() {
    if (pdfPack?.url) URL.revokeObjectURL(pdfPack.url);
    setPdfPack(null);
  }

  async function sharePdfPack() {
    if (!pdfPack) return;
    const file = new File([pdfPack.blob], pdfPack.filename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: `Vehicle Inspection ${pdfPack.ref}`, files: [file] });
      } catch (e) {
        if (e.name !== "AbortError") console.warn("Share failed:", e);
      }
    } else {
      const a = document.createElement("a");
      a.href = pdfPack.url; a.download = pdfPack.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setToast("PDF downloaded");
    }
  }

  // ── Today or past? ──────────────────────────────────────────────────────────
  const isToday = selectedDate === todayISO();

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Issue sheet ── */}
      <AnimatePresence>
        {issueSheet && (
          <IssueSheet
            item={issueSheet.item}
            date={issueSheet.date}
            currentComment={getItemComment(issueSheet.date, issueSheet.item)}
            onSave={handleIssueSave}
            onClose={() => setIssueSheet(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Settings panel ── */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            settings={settings}
            onSave={s => { setSettings(s); saveVehicleSettings(s); setToast("Vehicle settings saved"); }}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>

      {/* ── PDF preview sheet ── */}
      <AnimatePresence>
        {pdfPack && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closePdfPack}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-center pt-2.5 pb-1">
                <div className="w-12 h-1 rounded-full bg-slate-300" />
              </div>
              <div className="px-5 pt-2 pb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-base font-black text-slate-900">Inspection Report Ready</p>
                  <p className="text-xs text-slate-500 truncate">{pdfPack.ref} · {smartDate(selectedDate)}</p>
                </div>
                <button onClick={closePdfPack} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
                  <X size={20} />
                </button>
              </div>
              <div className="px-4 pb-3 flex-1 min-h-0">
                <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50" style={{ height: 320 }}>
                  <iframe src={pdfPack.url} title="Inspection report preview" className="w-full h-full" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 text-center">{pdfPack.filename}</p>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 space-y-2" style={{ background: "#F7F3F3" }}>
                <button onClick={sharePdfPack}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                  style={{ background: "#8B1A1A" }}>
                  <Send size={16} /> Share (Mail, WhatsApp, iCloud, Outlook...)
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

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          title="Vehicle Checklist"
          subtitle={`${settings.vehicle}${settings.registration ? ` · ${settings.registration}` : ""}`}
        />
        <div className="flex gap-2 shrink-0">
          {checkedCount > 0 && (
            <button
              onClick={exportPDF}
              className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 hover:bg-slate-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Export as PDF">
              <FileDown size={18} />
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 hover:bg-slate-50 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* ── Vehicle identity card ── */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#FEE2E2" }}>
            <Car size={20} style={{ color: "#8B1A1A" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-slate-900 leading-tight">{settings.vehicle || "No vehicle set"}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {settings.registration && (
                <span className="text-xs font-bold text-slate-500 bg-slate-100 rounded-lg px-2 py-0.5 font-mono">
                  {settings.registration}
                </span>
              )}
              {settings.driver && (
                <span className="text-xs text-slate-400">{settings.driver}</span>
              )}
            </div>
          </div>
          {!settings.vehicle && (
            <button onClick={() => setShowSettings(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[36px]"
              style={{ background: "#FEE2E2", color: "#8B1A1A" }}>
              Set up &rarr;
            </button>
          )}
        </div>
      </Card>

      {/* ── Week navigator ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">Week</p>
        <div className="grid grid-cols-5 gap-1.5">
          {weekDays.map((date, i) => {
            const dayData  = getDayData(date);
            const items    = dayData.items || {};
            const hasIssue = Object.values(items).some(v => v.status === "issue");
            const isOk     = Object.keys(items).length > 0 && !hasIssue;
            const isActive = date === selectedDate;
            const isFuture = date > todayISO();

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className="flex flex-col items-center gap-1 rounded-2xl py-2.5 px-1 transition-all border-2"
                style={{
                  background: isActive ? "#8B1A1A" : "white",
                  borderColor: isActive ? "#8B1A1A" : hasIssue ? "#FECACA" : isOk ? "#BBF7D0" : "#E2E8F0",
                  opacity: isFuture ? 0.45 : 1,
                }}>
                <span className="text-[10px] font-bold leading-none"
                  style={{ color: isActive ? "rgba(255,255,255,0.7)" : "#94A3B8" }}>
                  {DAY_LABELS[i]}
                </span>
                <span className="text-sm font-black leading-none mt-0.5"
                  style={{ color: isActive ? "white" : "#1E293B" }}>
                  {new Date(date + "T12:00:00").getDate()}
                </span>
                <div className="w-1.5 h-1.5 rounded-full mt-0.5"
                  style={{
                    background: isActive
                      ? "rgba(255,255,255,0.5)"
                      : hasIssue ? "#EF4444" : isOk ? "#22C55E" : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Status summary for selected day ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-2xl border-2 p-3 flex items-center gap-2.5"
          style={{
            background: allGood ? "#F0FDF4" : issueCount > 0 ? "#FEF2F2" : "#F8FAFC",
            borderColor: allGood ? "#BBF7D0" : issueCount > 0 ? "#FECACA" : "#E2E8F0",
          }}>
          {allGood
            ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            : issueCount > 0
              ? <AlertTriangle size={18} className="text-red-500 shrink-0" />
              : <Minus size={18} className="text-slate-300 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-black leading-tight"
              style={{ color: allGood ? "#166534" : issueCount > 0 ? "#991B1B" : "#64748B" }}>
              {allGood
                ? "All clear"
                : issueCount > 0
                  ? `${issueCount} issue${issueCount !== 1 ? "s" : ""} flagged`
                  : `${checkedCount} / ${allItems.length} checked`}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 leading-tight">
              {smartDate(selectedDate)}{isToday ? " — Today" : ""}
            </p>
          </div>
        </div>

        <button onClick={() => resetDay(selectedDate)}
          className="p-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-400 hover:bg-slate-50 min-w-[52px] min-h-[52px] flex items-center justify-center shrink-0">
          <RotateCcw size={16} />
        </button>
      </div>

      {/* ── ONE-TAP ALL GOOD button ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => markAllGood(selectedDate)}
        className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-black text-white shadow-sm min-h-[60px]"
        style={{ background: allGood ? "#16A34A" : "#8B1A1A" }}>
        <CheckCircle2 size={22} />
        {allGood ? "All Good — Tap to re-confirm" : "All Good — Mark Everything OK"}
      </motion.button>

      <p className="text-xs text-slate-400 text-center -mt-2 leading-relaxed">
        Tap the button above if everything checks out today. Or tap any item below to mark issues individually.
      </p>

      {/* ── Checklist sections ── */}
      {CHECKLIST.map(({ section, items }) => {
        const sectionIssues = items.filter(item =>
          getDayData(selectedDate).items[item]?.status === "issue"
        ).length;
        const sectionOk = items.filter(item =>
          getDayData(selectedDate).items[item]?.status === "ok"
        ).length;
        const collapsed = collapsedSections[section];

        return (
          <div key={section}>
            {/* Section header */}
            <button
              onClick={() => toggleSection(section)}
              className="w-full flex items-center justify-between px-1 mb-2 group"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-slate-500 uppercase tracking-wider">{section}</p>
                {sectionIssues > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-red-700"
                    style={{ background: "#FEE2E2" }}>
                    {sectionIssues} issue{sectionIssues !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">{sectionOk}/{items.length}</span>
                <div className="rounded-full p-0.5 bg-slate-100 group-hover:bg-slate-200 transition-colors">
                  {collapsed
                    ? <ChevronDown size={14} className="text-slate-400" />
                    : <ChevronUp size={14} className="text-slate-400" />}
                </div>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <Card className="divide-y divide-slate-50 overflow-hidden">
                    {items.map(item => {
                      const status  = getItemStatus(selectedDate, item);
                      const comment = getItemComment(selectedDate, item);
                      const ss      = statusStyle(status);

                      return (
                        <div key={item}>
                          <div
                            className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-slate-50 transition-colors"
                            onClick={() => cycleStatus(selectedDate, item)}
                          >
                            {/* Status icon */}
                            <div className="shrink-0">
                              {status === "ok"    && <CheckCircle2 size={20} className="text-green-500" />}
                              {status === "issue" && <XCircle size={20} className="text-red-500" />}
                              {status === "na"    && <Minus size={20} className="text-slate-300" />}
                              {!status            && (
                                <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-white" />
                              )}
                            </div>

                            {/* Item label */}
                            <p className="flex-1 text-sm font-bold text-slate-800 leading-snug">{item}</p>

                            {/* Status pill */}
                            <span
                              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black border"
                              style={{ background: ss.bg, color: ss.color, borderColor: ss.border }}>
                              {status === "ok" ? "OK" : status === "issue" ? "Issue" : status === "na" ? "N/A" : "—"}
                            </span>

                            {/* Chevron to open issue detail */}
                            {status === "issue" && (
                              <ChevronRight size={15} className="text-slate-300 shrink-0" />
                            )}
                          </div>

                          {/* Issue comment — shown inline below the item */}
                          {status === "issue" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <button
                                onClick={() => setIssueSheet({ item, date: selectedDate })}
                                className="w-full text-left px-4 pb-3.5 pt-0 flex items-start gap-2"
                              >
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
                                    <p className="text-xs font-bold text-red-500">Add issue description (required)</p>
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

      {/* ── General comments ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">Other Comments</p>
        <Card className="p-4">
          <textarea
            value={getDayData(selectedDate).generalComment || ""}
            onChange={e => {
              const dayData = getDayData(selectedDate);
              persistDay(selectedDate, { ...dayData, generalComment: e.target.value });
            }}
            placeholder="Any other observations for today…"
            rows={3}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors resize-none"
          />
        </Card>
      </div>

      {/* ── How to use tip (shown until first use) ── */}
      {checkedCount === 0 && (
        <Card className="p-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">How it works</p>
          <div className="space-y-2">
            {[
              ["✅", 'Tap "All Good" if everything is fine — one tap, done.'],
              ["👇", "Or tap individual items: circle, OK, Issue, N/A, then clear."],
              ["⚠️", "Issues prompt you to describe the problem. Report immediately."],
              ["⚙️", "Tap the settings icon to set your vehicle, registration and name."],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-start gap-2">
                <span className="text-base leading-snug shrink-0">{icon}</span>
                <p className="text-xs text-slate-500 leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
