import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll } from "./offline/offlineDb";
import SyncStatusBadge from "./components/SyncStatusBadge";
import ReportExport from "./ReportExport";

import {
  Bell, Calendar, ChevronRight, ChevronLeft, Clipboard, File as FileIcon,
  Home, LogOut, Plus, Search, Shield, Trash2, Users,
  Eye, EyeOff, RefreshCw, Check, AlertCircle,
  Settings, X, TrendingUp, Edit2, Save,
  Wrench, Clock, MapPin, Hash, Camera, Image, Video, Paperclip,
  ChevronDown, ChevronUp, Phone,
} from "lucide-react";

// ─── Brand ────────────────────────────────────────────────────────────────────
const BRAND = {
  primary: "#8B1A1A",
  primaryDark: "#6B1414",
  light: "#F7F3F3",
  logo: "https://powerstart.eu/wp-content/uploads/2021/10/Power-Works-Logo.png",
};

const PIPELINE_STAGES = ["New Lead", "Contacted", "Quoted", "Active", "Won", "Lost"];

const STAGE_COLORS = {
  "New Lead": { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
  Contacted:  { bg: "#F0FDF4", text: "#15803D", dot: "#22C55E" },
  Quoted:     { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
  Active:     { bg: "#FAF5FF", text: "#7E22CE", dot: "#A855F7" },
  Won:        { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
  Lost:       { bg: "#FFF1F2", text: "#BE123C", dot: "#F43F5E" },
};

const QUOTE_STATUS_COLORS = {
  Pending:  { bg: "#FFFBEB", text: "#B45309" },
  Accepted: { bg: "#F0FDF4", text: "#15803D" },
  Rejected: { bg: "#FFF1F2", text: "#BE123C" },
  Expired:  { bg: "#F8FAFC", text: "#64748B" },
};

const NOTE_URGENCY = {
  Normal:   { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC", dot: "#22C55E" },
  Urgent:   { bg: "#FFFBEB", text: "#B45309", border: "#FCD34D", dot: "#F59E0B" },
  Critical: { bg: "#FFF1F2", text: "#BE123C", border: "#FCA5A5", dot: "#F43F5E" },
};
const URGENCY_ESCALATION = { Normal: "Urgent", Urgent: "Critical", Critical: "Critical" };

// Reminder options — outside component to avoid re-creation on every render
const REMINDER_OPTIONS = [
  { value: "on_time",   label: "At time of follow-up" },
  { value: "15_before", label: "15 minutes before" },
  { value: "30_before", label: "30 minutes before" },
  { value: "1h_before", label: "1 hour before" },
  { value: "1d_before", label: "1 day before (9am)" },
  { value: "morning",   label: "Day-of morning (7am)" },
  { value: "none",      label: "No reminder" },
];

// ─── PIN ──────────────────────────────────────────────────────────────────────
const PIN_KEY = "powermate_pin_hash";
const PIN_UNLOCKED_KEY = "powermate_pin_unlocked";
const PIN_ATTEMPTS_KEY = "powermate_pin_attempts";
const PIN_LOCKOUT_KEY = "powermate_pin_lockout_until";
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1000;

async function hashPIN(pin) {
  const data = new TextEncoder().encode(pin + "powerworks_salt_2026");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
const getPINHash = () => localStorage.getItem(PIN_KEY);
const isSessionUnlocked = () => sessionStorage.getItem(PIN_UNLOCKED_KEY) === "true";
const setSessionUnlocked = () => sessionStorage.setItem(PIN_UNLOCKED_KEY, "true");

function getPINAttempts() { return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || "0", 10); }
function incrementPINAttempts() { const n = getPINAttempts() + 1; localStorage.setItem(PIN_ATTEMPTS_KEY, String(n)); return n; }
function resetPINAttempts() { localStorage.removeItem(PIN_ATTEMPTS_KEY); localStorage.removeItem(PIN_LOCKOUT_KEY); }
function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(PIN_LOCKOUT_KEY) || "0", 10);
  return until > Date.now() ? until - Date.now() : 0;
}
function setLockout() { localStorage.setItem(PIN_LOCKOUT_KEY, String(Date.now() + PIN_LOCKOUT_MS)); }

// ─── Telemetry ────────────────────────────────────────────────────────────────
async function logEvent(name, data = {}) {
  console.log("[PowerMate]", name, data);
  if (!navigator.onLine) return;
  try { await supabase.from("events").insert({ name, data, timestamp: new Date().toISOString(), user_agent: navigator.userAgent }); }
  catch (e) { console.warn("[PowerMate] Telemetry failed:", e?.message); }
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

async function scheduleNotificationsViaSW(items) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: "SCHEDULE_NOTIFICATIONS", items });
  } catch (e) { console.warn("SW schedule failed", e); }
}

function buildNotificationItems(followups = [], equipment = [], notes = []) {
  const items = [];
  const todayStr = todayISO();

  const todayFollowups = followups.filter(f => f.date === todayStr && !f.completed);
  if (todayFollowups.length > 0) {
    const fireAt = new Date(todayStr + "T07:00:00");
    if (fireAt > new Date()) {
      items.push({ id: "morning_" + todayStr, title: "📋 PowerMate — Today's Follow-ups", body: `You have ${todayFollowups.length} follow-up${todayFollowups.length !== 1 ? "s" : ""} today.`, fireAt: fireAt.toISOString(), tag: "morning_summary" });
    }
  }

  followups.filter(f => f.date >= todayStr && !f.completed).forEach(f => {
    if (f.reminder === "none") return;
    const base = new Date(`${f.date}T${f.time || "09:00"}:00`);
    let fireAt = base;
    switch (f.reminder) {
      case "15_before": fireAt = new Date(base.getTime() - 15 * 60000); break;
      case "30_before": fireAt = new Date(base.getTime() - 30 * 60000); break;
      case "1h_before": fireAt = new Date(base.getTime() - 60 * 60000); break;
      case "1d_before": { const d = new Date(f.date + "T09:00:00"); d.setDate(d.getDate() - 1); fireAt = d; break; }
      case "morning":   fireAt = new Date(f.date + "T07:00:00"); break;
      default: break;
    }
    if (fireAt > new Date()) {
      items.push({ id: "fu_" + f.id, title: "🔔 " + f.title, body: f.client ? `Client: ${f.client}` : "Tap to view.", fireAt: fireAt.toISOString(), tag: "fu_" + f.id });
    }
  });

  equipment.filter(e => e.service_due).forEach(eq => {
    const due = new Date(eq.service_due + "T09:00:00");
    const warn = new Date(due); warn.setDate(warn.getDate() - 3);
    if (warn > new Date()) items.push({ id: "ew_" + eq.id, title: "⚠️ Service Due Soon: " + eq.name, body: `Service due in 3 days.`, fireAt: warn.toISOString(), tag: "ew_" + eq.id });
    if (due > new Date()) items.push({ id: "ed_" + eq.id, title: "🔧 Service Due Today: " + eq.name, body: `${eq.make || ""} ${eq.model || ""}`.trim(), fireAt: due.toISOString(), tag: "ed_" + eq.id });
  });

  notes.filter(n => n.resolve_by && !n.resolved).forEach(n => {
    const fireAt = new Date(n.resolve_by + "T09:00:00");
    if (fireAt > new Date()) {
      const urg = n.urgency || "Normal";
      items.push({ id: "note_" + n.id, title: `${urg === "Critical" ? "🚨" : urg === "Urgent" ? "⚠️" : "📌"} Unresolved Note: ${n.client || "General"}`, body: (n.note || "").slice(0, 80), fireAt: fireAt.toISOString(), tag: "note_" + n.id });
    }
  });

  return items;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0,10); }

function niceDate(d) {
  if (!d) d = new Date();
  return d.toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
}

function smartDate(ds) {
  if (!ds) return "";
  const d = new Date(ds+"T12:00:00"), t = new Date(todayISO()+"T12:00:00");
  const diff = Math.round((d-t)/86400000);
  if (diff===0) return "Today";
  if (diff===1) return "Tomorrow";
  if (diff===-1) return "Yesterday";
  if (diff>1&&diff<=7) return d.toLocaleDateString("en-GB",{weekday:"long"});
  if (diff<-1&&diff>=-7) return `${Math.abs(diff)} days ago`;
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}

function daysDiff(ds) {
  if (!ds) return null;
  return Math.round((new Date(ds+"T12:00:00")-new Date(todayISO()+"T12:00:00"))/86400000);
}

function formatCurrency(v) {
  return "R "+parseFloat(v||0).toLocaleString("en-ZA",{minimumFractionDigits:2});
}

// Use crypto.randomUUID() — zero collision risk, no Date.now() tricks
function genId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `local_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
}

// ─── Photo / Media Helpers ────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file, maxWidth = 1600, quality = 0.78) {
  if (file.type.startsWith("video/")) return fileToBase64(file);
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(fileToBase64(file)); };
    img.src = url;
  });
}

async function uploadPhotoToSupabase(base64, path) {
  try {
    const res = await fetch(base64);
    const blob = await res.blob();
    const { error } = await supabase.storage.from("powermate-media").upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    const { data } = supabase.storage.from("powermate-media").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) { console.warn("Photo upload failed:", e); return null; }
}

const MAX_FILE_SIZE_MB = 50;

// ─── Confirm Dialog (replaces window.confirm) ─────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = "Delete", confirmVariant = "danger" }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 pb-safe px-4 pb-6"
      onClick={onCancel}>
      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <p className="text-base font-bold text-slate-800 text-center">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-2xl border-2 border-slate-200 py-3.5 text-sm font-bold text-slate-600 active:scale-95 transition-transform">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 rounded-2xl py-3.5 text-sm font-bold text-white active:scale-95 transition-transform ${confirmVariant === "danger" ? "bg-red-600" : "bg-green-600"}`}>
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── useConfirm hook ──────────────────────────────────────────────────────────
function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({ message, options, resolve });
    });
  }, []);

  const dialog = state ? (
    <AnimatePresence>
      <ConfirmDialog
        message={state.message}
        confirmLabel={state.options.confirmLabel || "Confirm"}
        confirmVariant={state.options.confirmVariant || "danger"}
        onConfirm={() => { setState(null); state.resolve(true); }}
        onCancel={() => { setState(null); state.resolve(false); }}
      />
    </AnimatePresence>
  ) : null;

  return { confirm, dialog };
}

// ─── Media Picker ─────────────────────────────────────────────────────────────
function MediaPicker({ onAdd, disabled = false }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        // Instead of alert, just skip with a console warning — caller can handle feedback
        console.warn(`File too large: ${file.name}`);
        continue;
      }
      try {
        const base64 = await compressImage(file);
        const isVideo = file.type.startsWith("video/");
        onAdd({ id: genId(), base64, isVideo, name: file.name, type: file.type, uploadStatus: "pending" });
      } catch (e) { console.warn("Could not process file:", e); }
    }
  }

  return (
    <div className="flex gap-2">
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3.5 text-sm font-bold text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40 min-h-[48px]">
        <Camera size={16} /> Camera
      </button>
      <button type="button" onClick={() => galleryRef.current?.click()} disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3.5 text-sm font-bold text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40 min-h-[48px]">
        <Image size={16} /> Gallery
      </button>
    </div>
  );
}

// ─── Media Gallery ────────────────────────────────────────────────────────────
function MediaGallery({ media = [], onDelete, readonly = false }) {
  const [lightbox, setLightbox] = useState(null);
  if (!media.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {media.map((m, i) => (
          <div key={m.id || i} className="relative group">
            {m.isVideo
              ? <div className="w-20 h-20 rounded-xl bg-slate-900 flex items-center justify-center cursor-pointer border-2 border-slate-200" onClick={() => setLightbox(m)}><Video size={22} className="text-white"/></div>
              : <img src={m.url || m.base64} alt="attachment" onClick={() => setLightbox(m)} className="w-20 h-20 rounded-xl object-cover cursor-pointer border-2 border-slate-100 hover:border-red-300 transition-colors"/>
            }
            {m.uploadStatus === "pending" && <span className="absolute bottom-1 left-1 rounded-full bg-amber-500 w-2.5 h-2.5" title="Not uploaded"/>}
            {!readonly && onDelete && (
              <button onClick={() => onDelete(m.id)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md">
                <X size={11}/>
              </button>
            )}
          </div>
        ))}
      </div>
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/20"><X size={24}/></button>
            {lightbox.isVideo
              ? <video src={lightbox.url || lightbox.base64} controls className="max-w-full max-h-full rounded-xl" onClick={e => e.stopPropagation()}/>
              : <img src={lightbox.url || lightbox.base64} alt="full" className="max-w-full max-h-full rounded-xl object-contain"/>
            }
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Card({ children, className="", onClick }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${onClick?"cursor-pointer active:scale-[0.98] transition-transform":""} ${className}`} onClick={onClick}>{children}</div>;
}

function Btn({ children, onClick, disabled, variant="solid", className="", type="button", size="md" }) {
  const sizes = { sm:"px-4 py-2.5 text-sm rounded-xl min-h-[44px]", md:"px-5 py-3.5 text-sm rounded-2xl min-h-[48px]", lg:"px-6 py-4 text-base rounded-2xl min-h-[52px]" };
  const vs = {
    solid:     { background: BRAND.primary, color: "#fff" },
    outline:   { background: "#fff", color: BRAND.primary, border: `2px solid ${BRAND.primary}` },
    danger:    { background: "#DC2626", color: "#fff" },
    secondary: { background: BRAND.light, color: BRAND.primary },
    success:   { background: "#16A34A", color: "#fff" },
    warning:   { background: "#D97706", color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-40 ${sizes[size]} ${className}`}
      style={vs[variant]||vs.solid}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder="", type="text", multiline=false, required=false, maxLength }) {
  const cls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors";
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-bold text-slate-500">{label}{required&&<span className="text-red-500 ml-1">*</span>}</label>}
      {multiline
        ? <textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={4} maxLength={maxLength||5000} className={cls+" resize-none"}/>
        : <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength||500} className={cls}/>
      }
      {maxLength && (value||"").length > maxLength*0.85 && (
        <p className="mt-1 text-xs text-slate-400 text-right">{(value||"").length}/{maxLength}</p>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-bold text-slate-500">{label}</label>}
      <select value={value||""} onChange={e=>onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[52px]">
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// Client selector dropdown (for follow-ups — picks from real clients)
function ClientSelector({ label, value, onChange, clients = [], placeholder = "Select client…" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = clients.filter(c =>
    !search || c.company?.toLowerCase().includes(search.toLowerCase()) || c.branch?.toLowerCase().includes(search.toLowerCase())
  );

  const selected = clients.find(c => c.id === value);

  return (
    <div ref={ref} className="relative">
      {label && <label className="mb-1.5 block text-sm font-bold text-slate-500">{label}</label>}
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base text-left flex items-center justify-between outline-none focus:border-red-300 min-h-[52px] transition-colors">
        <span className={selected ? "text-slate-900 font-medium" : "text-slate-400"}>
          {selected ? `${selected.company}${selected.branch ? ` — ${selected.branch}` : ""}` : placeholder}
        </span>
        <ChevronDown size={16} className="text-slate-400 shrink-0"/>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-60 flex flex-col">
            <div className="p-2 border-b border-slate-50">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm outline-none"/>
            </div>
            <div className="overflow-y-auto">
              <button type="button" onClick={() => { onChange(""); onChange(null); setOpen(false); setSearch(""); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-50">
                — No client
              </button>
              {filtered.map(c => (
                <button key={c.id} type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors ${c.id === value ? "font-bold text-red-700 bg-red-50" : "text-slate-800"}`}>
                  <span className="font-bold">{c.company}</span>
                  {c.branch && <span className="text-slate-400 ml-1">— {c.branch}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No clients found</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder="Search…" }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white py-3 pl-10 pr-10 text-base outline-none focus:border-red-300 transition-colors min-h-[48px]"/>
      {value && <button onClick={()=>onChange("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 p-1"><X size={15}/></button>}
    </div>
  );
}

function StagePill({ stage }) {
  const c = STAGE_COLORS[stage]||STAGE_COLORS["New Lead"];
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{background:c.bg,color:c.text}}><span className="w-2 h-2 rounded-full" style={{background:c.dot}}/>{stage}</span>;
}

function ServiceBadge({ dueDate }) {
  const d = daysDiff(dueDate);
  if (d===null) return null;
  if (d<0) return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">⚠️ Overdue</span>;
  if (d<=3) return <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">Due in {d}d</span>;
  if (d<=14) return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Due {smartDate(dueDate)}</span>;
  return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{smartDate(dueDate)}</span>;
}

function Empty({ title, text, icon:Icon=Users }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-10 text-center">
      <div className="mx-auto mb-3 w-14 h-14 rounded-2xl flex items-center justify-center" style={{background:BRAND.light}}><Icon size={24} style={{color:BRAND.primary}}/></div>
      <p className="font-bold text-slate-800 text-base">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function StatCard({ label, value, sub, color=BRAND.primary, icon:Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-black" style={{color}}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {Icon && <div className="rounded-xl p-2.5" style={{background:BRAND.light}}><Icon size={18} style={{color}}/></div>}
      </div>
    </Card>
  );
}

function NavTab({ icon:Icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition-all min-h-[56px]"
      style={{color:active?BRAND.primary:"#94A3B8"}}>
      <div className={`rounded-xl p-2 transition-all ${active?"bg-red-50":""}`}><Icon size={20}/></div>
      <span className="leading-none">{label}</span>
      {!!badge && <span className="absolute right-0.5 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] text-white font-black min-w-[18px] text-center">{badge}</span>}
    </button>
  );
}

function PageHeader({ title, subtitle }) {
  return <div className="mb-5"><h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>{subtitle&&<p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}</div>;
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{background:BRAND.light}}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 animate-spin" style={{borderTopColor:BRAND.primary}}/>
        <p className="text-sm font-bold text-slate-400">Loading PowerMate…</p>
      </div>
    </div>
  );
}

function DataLoadingScreen() {
  return (
    <div className="min-h-screen pb-28" style={{background:BRAND.light}}>
      <main className="mx-auto max-w-2xl px-4 pt-4 space-y-4">
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-2">
            <div className="h-7 w-32 rounded-xl bg-slate-200 animate-pulse"/>
            <div className="h-4 w-48 rounded-xl bg-slate-100 animate-pulse"/>
          </div>
          <div className="h-8 w-16 rounded-xl bg-slate-200 animate-pulse"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i=>(
            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100">
              <div className="h-4 w-20 rounded-lg bg-slate-100 animate-pulse mb-2"/>
              <div className="h-8 w-12 rounded-lg bg-slate-200 animate-pulse mb-1"/>
              <div className="h-3 w-24 rounded-lg bg-slate-100 animate-pulse"/>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-3">
          {[1,2,3,4].map(i=>(
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-16 rounded-lg bg-slate-100 animate-pulse"/>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 animate-pulse"/>
              <div className="h-4 w-6 rounded-lg bg-slate-100 animate-pulse"/>
            </div>
          ))}
        </div>
        <div className="text-center pt-4">
          <p className="text-xs text-slate-400">Syncing your data…</p>
        </div>
      </main>
    </div>
  );
}

function FilterPills({ options, value, onChange, dangerValue }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(o => (
        <button key={o} onClick={()=>onChange(o)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-all min-h-[40px] ${value===o?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
          style={value===o?{background:o===dangerValue?"#DC2626":o==="Due Soon"?"#D97706":BRAND.primary}:{}}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, onDone, type = "success" }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  const bg = type === "error" ? "#DC2626" : BRAND.primary;
  return (
    <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-lg"
      style={{background:bg,whiteSpace:"nowrap",minWidth:"160px",textAlign:"center"}}>
      {type === "success" ? "✓ " : "✗ "}{message}
    </motion.div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state={hasError:false}; }
  static getDerivedStateFromError() { return {hasError:true}; }
  componentDidCatch(e,i) {
    console.error("PowerMate:",e,i);
    try { logEvent("app_crashed", { message: e?.message, stack: (e?.stack||"").slice(0,500) }); } catch(_){}
  }
  render() {
    if (this.state.hasError) return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{background:BRAND.light}}>
        <Card className="max-w-sm w-full p-8 space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-black text-slate-900">Something went wrong</h2>
          <Btn className="w-full" onClick={()=>window.location.reload()}>Reload App</Btn>
        </Card>
      </div>
    );
    return this.props.children;
  }
}

// ─── PIN Keypad ───────────────────────────────────────────────────────────────
function PINKeypad({ pin, onDigit, onBack }) {
  return (
    <>
      <div className="flex justify-center gap-4 mb-8">
        {Array.from({length:6}).map((_,i)=>(
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${i<pin.length?"scale-125":""}`}
            style={{background:i<pin.length?BRAND.primary:"#E2E8F0"}}/>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
          <button key={i}
            onClick={()=>{ if(d==="⌫") onBack(); else if(d!=="") onDigit(String(d)); }}
            className={`h-[60px] rounded-2xl text-xl font-black transition-all active:scale-95 ${d===""?"invisible":"bg-white shadow-sm border border-slate-100 text-slate-800 hover:border-red-200"}`}>
            {d}
          </button>
        ))}
      </div>
    </>
  );
}

// ─── PIN Setup ────────────────────────────────────────────────────────────────
function PINSetupScreen({ onComplete }) {
  const [pin, setPIN] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState("set");
  const [error, setError] = useState("");

  function handleDigit(d) {
    if (step==="set") {
      const next=(pin+d).slice(0,6); setPIN(next);
      if(next.length===6){setStep("confirm");setError("");}
    } else {
      const next=(confirm+d).slice(0,6); setConfirm(next);
      if(next.length===6){
        if(next===pin) savePIN(pin);
        else{setError("PINs don't match. Try again.");setConfirm("");setPIN("");setStep("set");}
      }
    }
  }

  async function savePIN(p) {
    localStorage.setItem(PIN_KEY, await hashPIN(p));
    setSessionUnlocked(); onComplete();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{background:BRAND.light}}>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center" style={{background:BRAND.primary}}><Shield size={28} color="white"/></div>
          <h1 className="text-xl font-black text-slate-900">{step==="set"?"Set Your PIN":"Confirm PIN"}</h1>
          <p className="mt-1 text-sm text-slate-500">{step==="set"?"Choose a 6-digit PIN to secure the app":"Re-enter your PIN to confirm"}</p>
        </div>
        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
        <PINKeypad pin={step==="set"?pin:confirm} onDigit={handleDigit} onBack={()=>{if(step==="set")setPIN(p=>p.slice(0,-1));else setConfirm(c=>c.slice(0,-1));}}/>
      </motion.div>
    </div>
  );
}

// ─── PIN Lock ─────────────────────────────────────────────────────────────────
function PINLockScreen({ onUnlock, onForgot }) {
  const [pin, setPIN] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [lockoutMs, setLockoutMs] = useState(getLockoutRemaining());

  useEffect(() => {
    if (lockoutMs <= 0) return;
    const t = setInterval(() => {
      const r = getLockoutRemaining();
      setLockoutMs(r);
      if (r <= 0) { setError(""); resetPINAttempts(); }
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutMs]);

  async function handleDigit(d) {
    if (lockoutMs > 0) return;
    const next = (pin + d).slice(0, 6); setPIN(next);
    if (next.length === 6) {
      if (await hashPIN(next) === getPINHash()) {
        resetPINAttempts(); setSessionUnlocked(); onUnlock();
      } else {
        const attempts = incrementPINAttempts();
        if (attempts >= PIN_MAX_ATTEMPTS) {
          setLockout(); setLockoutMs(PIN_LOCKOUT_MS);
          setError(`Too many attempts. Locked for 5 minutes.`);
          logEvent("pin_locked_out", { attempts });
        } else {
          setError(`Incorrect PIN — ${PIN_MAX_ATTEMPTS - attempts} attempt${PIN_MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} left`);
        }
        setShake(true);
        setTimeout(() => { setShake(false); setPIN(""); }, 700);
      }
    }
  }

  const lockedOut = lockoutMs > 0;
  const minutes = Math.ceil(lockoutMs / 60000);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{background:BRAND.light}}>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <img src={BRAND.logo} alt="PW" className="mx-auto mb-4 h-12 object-contain" onError={e=>e.target.style.display="none"}/>
          <h1 className="text-xl font-black text-slate-900">{lockedOut?"Locked Out":"Enter PIN"}</h1>
          <p className="mt-1 text-sm text-slate-500">{lockedOut?`Try again in ${minutes} minute${minutes!==1?"s":""}` : "Unlock PowerMate"}</p>
        </div>
        <motion.div animate={shake?{x:[-8,8,-8,8,0]}:{}} transition={{duration:0.4}}>
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
          <PINKeypad pin={pin} onDigit={handleDigit} onBack={()=>!lockedOut&&setPIN(p=>p.slice(0,-1))}/>
        </motion.div>
        <button onClick={onForgot} className="mt-6 w-full text-center text-sm font-bold text-slate-400 hover:text-red-600 transition-colors py-3">
          Forgot PIN? Sign in again
        </button>
      </motion.div>
    </div>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState({text:"",type:"error"});

  async function login() {
    if(!email||!password){setMsg({text:"Please enter your email and password.",type:"error"});return;}
    setLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) {
      const msg = error.message?.includes("Invalid login") || error.message?.includes("invalid")
        ? "Incorrect email or password. Please try again."
        : error.message?.includes("network") || error.message?.includes("fetch")
        ? "No internet connection. Please check your network and try again."
        : "Sign in failed. Please try again.";
      setMsg({text: msg, type:"error"});
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{background:BRAND.light}}>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src={BRAND.logo} alt="PW" className="mb-4 h-16 object-contain" onError={e=>e.target.style.display="none"}/>
          <h1 className="text-2xl font-black" style={{color:BRAND.primary}}>PowerMate</h1>
          <p className="mt-1 text-sm text-slate-400">Power Works Field Service CRM</p>
        </div>
        <Card className="p-6 space-y-4">
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@powerworks.com" type="email"/>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-500">Password</label>
            <div className="relative">
              <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&login()}
                placeholder="••••••••"
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pr-12 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[52px]"/>
              <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
                {showPw?<EyeOff size={18}/>:<Eye size={18}/>}
              </button>
            </div>
          </div>
          {msg.text&&<div className={`rounded-xl p-3.5 text-sm font-medium ${msg.type==="success"?"bg-green-50 text-green-700":"bg-red-50 text-red-700"}`}>{msg.text}</div>}
          <Btn className="w-full" size="lg" onClick={login} disabled={loading}>{loading?"Please wait…":"Sign In"}</Btn>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Power Works (Pty) Ltd</p>
      </motion.div>
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function HomeScreen({ data, setScreen }) {
  const today=todayISO();
  const clients=data.clients||[];
  const quotes=data.quotes||[];
  const followups=data.followups||[];
  const equipment=data.equipment||[];
  const notes=data.notes||[];

  const todayFU=followups.filter(f=>f.date===today&&!f.completed);
  const overdueFU=followups.filter(f=>f.date<today&&!f.completed);
  const pendingQ=quotes.filter(q=>q.status==="Pending");
  const wonRev=quotes.filter(q=>q.status==="Accepted").reduce((s,q)=>s+parseFloat(q.value||0),0);
  const overdueEquip=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0);
  const dueSoonEquip=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)>=0&&daysDiff(e.service_due)<=7);
  const criticalNotes=notes.filter(n=>!n.resolved&&n.urgency==="Critical");
  const overdueNotes=notes.filter(n=>!n.resolved&&n.resolve_by&&n.resolve_by<today);
  const pCount=PIPELINE_STAGES.reduce((a,s)=>{a[s]=clients.filter(c=>(c.stage||"New Lead")===s).length;return a},{});
  const wonC=pCount["Won"]||0;
  const convRate=clients.length>0?Math.round((wonC/clients.length)*100):0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-2xl font-black text-slate-900">Dashboard</h1><p className="text-sm text-slate-400">{niceDate()}</p></div>
        <img src={BRAND.logo} alt="PW" className="h-8 object-contain opacity-80" onError={e=>e.target.style.display="none"}/>
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {criticalNotes.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
            className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-4 cursor-pointer min-h-[56px]" onClick={()=>setScreen("Notes")}>
            <AlertCircle size={18} className="text-red-600 shrink-0"/>
            <p className="text-sm font-bold text-red-700 flex-1">🚨 {criticalNotes.length} critical note{criticalNotes.length!==1?"s":""} unresolved</p>
            <ChevronRight size={16} className="text-red-400 shrink-0"/>
          </motion.div>
        )}
        {overdueNotes.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
            className="flex items-center gap-3 rounded-2xl bg-orange-50 border border-orange-200 p-4 cursor-pointer min-h-[56px]" onClick={()=>setScreen("Notes")}>
            <Clipboard size={18} className="text-orange-600 shrink-0"/>
            <p className="text-sm font-bold text-orange-700 flex-1">⏰ {overdueNotes.length} overdue note{overdueNotes.length!==1?"s":""} — resolve date passed</p>
            <ChevronRight size={16} className="text-orange-400 shrink-0"/>
          </motion.div>
        )}
        {overdueFU.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
            className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-4 cursor-pointer min-h-[56px]" onClick={()=>setScreen("Followups")}>
            <AlertCircle size={18} className="text-red-600 shrink-0"/>
            <p className="text-sm font-bold text-red-700 flex-1">{overdueFU.length} overdue follow-up{overdueFU.length!==1?"s":""}</p>
            <ChevronRight size={16} className="text-red-400 shrink-0"/>
          </motion.div>
        )}
        {overdueEquip.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
            className="flex items-center gap-3 rounded-2xl bg-orange-50 border border-orange-200 p-4 cursor-pointer min-h-[56px]" onClick={()=>setScreen("Equipment")}>
            <Wrench size={18} className="text-orange-600 shrink-0"/>
            <p className="text-sm font-bold text-orange-700 flex-1">{overdueEquip.length} equipment service{overdueEquip.length!==1?"s":""} overdue</p>
            <ChevronRight size={16} className="text-orange-400 shrink-0"/>
          </motion.div>
        )}
        {dueSoonEquip.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
            className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 cursor-pointer min-h-[56px]" onClick={()=>setScreen("Equipment")}>
            <Clock size={18} className="text-amber-600 shrink-0"/>
            <p className="text-sm font-bold text-amber-700 flex-1">{dueSoonEquip.length} service{dueSoonEquip.length!==1?"s":""} due within 7 days</p>
            <ChevronRight size={16} className="text-amber-400 shrink-0"/>
          </motion.div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Tasks" value={todayFU.length} sub="follow-ups due" color={BRAND.primary} icon={Calendar}/>
        <StatCard label="Pending Quotes" value={pendingQ.length} sub="awaiting response" color="#B45309" icon={FileIcon}/>
        <StatCard label="Won Revenue" value={`R${Math.round(wonRev/1000)}k`} sub="accepted quotes" color="#16A34A" icon={TrendingUp}/>
        <StatCard label="Win Rate" value={`${convRate}%`} sub={`${wonC} of ${clients.length} clients`} color="#7C3AED" icon={TrendingUp}/>
      </div>

      {/* Pipeline */}
      <Card className="p-4">
        <p className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wider">Sales Pipeline</p>
        <div className="space-y-2.5">
          {PIPELINE_STAGES.filter(s=>s!=="Lost").map(stage=>{
            const count=pCount[stage]||0;
            const total=clients.length||1;
            const c=STAGE_COLORS[stage];
            return (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-20 text-sm font-bold shrink-0" style={{color:c.text}}>{stage}</span>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all" style={{width:`${(count/total)*100}%`,background:c.dot}}/>
                </div>
                <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {icon:Users,   label:"Clients",    screen:"Clients",   count:clients.length},
          {icon:Calendar,label:"Follow-ups", screen:"Followups", count:followups.filter(f=>!f.completed).length},
          {icon:FileIcon,label:"Quotes",     screen:"Quotes",    count:quotes.length},
          {icon:Wrench,  label:"Equipment",  screen:"Equipment", count:equipment.length},
        ].map(({icon:Icon,label,screen,count})=>(
          <Card key={label} className="p-4" onClick={()=>setScreen(screen)}>
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2.5" style={{background:BRAND.light}}><Icon size={18} style={{color:BRAND.primary}}/></div>
              <ChevronRight size={16} className="text-slate-300"/>
            </div>
            <p className="text-2xl font-black text-slate-900">{count}</p>
            <p className="text-sm text-slate-400">{label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Clients ──────────────────────────────────────────────────────────────────
function ClientsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("All");
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState("");
  const [expandedClient, setExpandedClient] = useState(null); // company name that's expanded
  const [showFollowupForm, setShowFollowupForm] = useState(null); // client id to add followup for
  const [form, setForm] = useState({ company:"", branch:"", contact:"", phone:"", email:"", stage:"New Lead", notes:"" });
  const { confirm, dialog } = useConfirm();
  const clients = data.clients || [];
  const followups = data.followups || [];
  const today = todayISO();

  function resetForm() { setForm({ company:"", branch:"", contact:"", phone:"", email:"", stage:"New Lead", notes:"" }); setEditId(null); setShowForm(false); }

  async function saveClient() {
    if (!form.company.trim()) { setToast("Company name is required"); return; }
    if (editId) {
      const existing = clients.find(c => c.id === editId);
      const updated = { ...existing, ...form, sync_status: "pending" };
      setData(d => ({
        ...d,
        clients: (d.clients||[]).map(c => c.id === editId ? updated : c),
        syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])],
      }));
      await offlineSave("clients", updated);
      setToast("Client updated");
    } else {
      const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({
        ...d,
        clients: [item, ...(d.clients||[])],
        syncQueue: [{ id: genId(), table: "clients", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])],
      }));
      await offlineSave("clients", item);
      setToast("Client added");
    }
    resetForm();
  }

  async function deleteClient(id, companyName) {
    const ok = await confirm(`Delete ${companyName}? This cannot be undone.`, { confirmLabel: "Delete", confirmVariant: "danger" });
    if (!ok) return;
    setData(d => ({ ...d, clients: (d.clients||[]).filter(c => c.id !== id) }));
    setToast("Client deleted");
  }

  function startEdit(c) {
    setForm({ company: c.company||"", branch: c.branch||"", contact: c.contact||"", phone: c.phone||"", email: c.email||"", stage: c.stage||"New Lead", notes: c.notes||"" });
    setEditId(c.id);
    setShowForm(true);
  }

  // Get followups for a specific client
  function getClientFollowups(clientId) {
    return followups.filter(f => f.client_id === clientId).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.date.localeCompare(b.date);
    });
  }

  const filtered = clients
    .filter(c => filterStage === "All" || (c.stage||"New Lead") === filterStage)
    .filter(c => !search || [c.company, c.branch, c.contact].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const grouped = filtered.reduce((a, c) => {
    const k = c.company || "Unknown";
    if (!a[k]) a[k] = [];
    a[k].push(c);
    return a;
  }, {});

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")}/>}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Clients" subtitle={`${clients.length} total`}/>
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={15}/> : <Plus size={15}/>}{showForm ? "Cancel" : "Add Client"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId ? "Edit Client" : "New Client"}</p>
              <Field label="Company Name" value={form.company} onChange={v=>setForm(f=>({...f,company:v}))} placeholder="e.g. Anglo American" required/>
              <Field label="Branch / Mine / Site" value={form.branch} onChange={v=>setForm(f=>({...f,branch:v}))} placeholder="e.g. Mogalakwena Mine"/>
              <Field label="Contact Person" value={form.contact} onChange={v=>setForm(f=>({...f,contact:v}))} placeholder="Contact name"/>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} placeholder="Phone number" type="tel"/>
                <Field label="Email" value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} placeholder="Email" type="email"/>
              </div>
              <SelectField label="Pipeline Stage" value={form.stage} onChange={v=>setForm(f=>({...f,stage:v}))} options={PIPELINE_STAGES}/>
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Notes about this client…" multiline/>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveClient}><Save size={15}/>{editId ? "Update" : "Add Client"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search clients…"/>
      <FilterPills options={["All",...PIPELINE_STAGES]} value={filterStage} onChange={setFilterStage} dangerValue="Lost"/>

      {Object.keys(grouped).length === 0 && <Empty title="No clients found" text="Add your first client." icon={Users}/>}

      <div className="space-y-3">
        {Object.entries(grouped).map(([cn, branches]) => {
          const isExpanded = expandedClient === cn;
          // All followups for any branch of this company
          const allBranchIds = branches.map(b => b.id);
          const companyFollowups = followups.filter(f => allBranchIds.includes(f.client_id));
          const pendingFU = companyFollowups.filter(f => !f.completed);
          const overdueFU = companyFollowups.filter(f => !f.completed && f.date < today);

          return (
            <Card key={cn} className="overflow-hidden">
              {/* Company header — tap to expand */}
              <button className="w-full text-left px-4 pt-4 pb-3 flex items-center justify-between"
                onClick={() => setExpandedClient(isExpanded ? null : cn)}>
                <div>
                  <p className="font-black text-slate-900 text-base">{cn}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-sm text-slate-400">{branches.length} branch{branches.length!==1?"es":""}</p>
                    {pendingFU.length > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${overdueFU.length > 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {overdueFU.length > 0 ? `⚠️ ${overdueFU.length} overdue` : `${pendingFU.length} follow-up${pendingFU.length !== 1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-slate-400 shrink-0"/> : <ChevronDown size={18} className="text-slate-400 shrink-0"/>}
              </button>

              {/* Branches */}
              <div className="divide-y divide-slate-50">
                {branches.map(c => {
                  const clientFU = getClientFollowups(c.id);
                  const clientOverdue = clientFU.filter(f => !f.completed && f.date < today).length;
                  const clientPending = clientFU.filter(f => !f.completed).length;

                  return (
                    <div key={c.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">{c.branch || "Main Branch"}</p>
                            <StagePill stage={c.stage||"New Lead"}/>
                          </div>
                          {c.contact && <p className="text-sm text-slate-500 mt-0.5">{c.contact}</p>}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {c.phone && (
                              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium" onClick={e => e.stopPropagation()}>
                                <Phone size={12}/>{c.phone}
                              </a>
                            )}
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="text-sm text-blue-600 truncate max-w-[160px]" onClick={e => e.stopPropagation()}>
                                {c.email}
                              </a>
                            )}
                          </div>
                          {c.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.notes}</p>}
                          {c.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => startEdit(c)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15}/></button>
                          <button onClick={() => deleteClient(c.id, c.company)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15}/></button>
                        </div>
                      </div>

                      {/* Follow-ups section — shown when company is expanded */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                            className="mt-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Follow-ups {clientPending > 0 ? `· ${clientPending} pending` : ""}
                              </p>
                              <button
                                onClick={() => setShowFollowupForm(showFollowupForm === c.id ? null : c.id)}
                                className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold min-h-[36px]"
                                style={{background:BRAND.light,color:BRAND.primary}}>
                                <Plus size={12}/> Add
                              </button>
                            </div>

                            {/* Inline add follow-up form */}
                            <AnimatePresence>
                              {showFollowupForm === c.id && (
                                <InlineFollowupForm
                                  client={c}
                                  userId={userId}
                                  data={data}
                                  setData={setData}
                                  onDone={() => setShowFollowupForm(null)}
                                />
                              )}
                            </AnimatePresence>

                            {clientFU.length === 0 && showFollowupForm !== c.id && (
                              <p className="text-sm text-slate-400 py-2">No follow-ups yet. Tap + Add to create one.</p>
                            )}
                            <div className="space-y-2">
                              {clientFU.map(f => (
                                <ClientFollowupRow key={f.id} followup={f} data={data} setData={setData} today={today}/>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline follow-up form (inside client card) ───────────────────────────────
function InlineFollowupForm({ client, userId, data, setData, onDone }) {
  const [form, setForm] = useState({
    title: "",
    date: todayISO(),
    time: "09:00",
    reminder: "morning",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const item = {
      id: genId(),
      user_id: userId,
      client_id: client.id,          // FK to clients.id
      client: client.company,        // denormalized string for display
      branch: client.branch || "",
      ...form,
      completed: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };
    setData(d => ({
      ...d,
      followups: [item, ...(d.followups||[])],
      syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])],
    }));
    await offlineSave("followups", item);
    setSaving(false);
    onDone();
  }

  return (
    <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
      className="bg-slate-50 rounded-xl p-3 space-y-2.5 mb-3">
      <Field label="What to follow up on" value={form.title} onChange={v=>setForm(f=>({...f,title:v}))}
        placeholder={`e.g. Call ${client.contact || client.company} re quote`}/>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
        <Field label="Time" type="time" value={form.time} onChange={v=>setForm(f=>({...f,time:v}))}/>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-bold text-slate-500">Reminder</label>
        <select value={form.reminder} onChange={e=>setForm(f=>({...f,reminder:e.target.value}))}
          className="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm outline-none focus:border-red-300 min-h-[48px]">
          {REMINDER_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <Field label="Notes (optional)" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Any extra context…" multiline/>
      <div className="flex gap-2">
        <Btn className="flex-1" size="sm" onClick={save} disabled={saving || !form.title.trim()}>
          <Check size={14}/>{saving ? "Saving…" : "Save Follow-up"}
        </Btn>
        <Btn variant="secondary" size="sm" onClick={onDone}>Cancel</Btn>
      </div>
    </motion.div>
  );
}

// ─── Follow-up row inside client card ─────────────────────────────────────────
function ClientFollowupRow({ followup: f, data, setData, today }) {
  const isOverdue = !f.completed && f.date < today;

  async function toggleDone() {
    const up = { ...f, completed: !f.completed, sync_status: "pending" };
    setData(d => ({ ...d, followups: (d.followups||[]).map(x => x.id === f.id ? up : x) }));
    await offlineSave("followups", up);
  }

  async function deleteIt() {
    setData(d => ({ ...d, followups: (d.followups||[]).filter(x => x.id !== f.id) }));
  }

  return (
    <div className={`flex items-center gap-2.5 rounded-xl p-2.5 ${isOverdue ? "bg-red-50" : f.completed ? "bg-slate-50" : "bg-white border border-slate-100"}`}>
      <button onClick={toggleDone}
        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${f.completed ? "bg-green-100 text-green-600" : isOverdue ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
        <Check size={15}/>
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold truncate ${f.completed ? "line-through text-slate-400" : isOverdue ? "text-red-800" : "text-slate-900"}`}>{f.title}</p>
        <p className="text-xs text-slate-400">{smartDate(f.date)}{f.time ? ` at ${f.time}` : ""}</p>
      </div>
      {isOverdue && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">Overdue</span>}
      <button onClick={deleteIt} className="shrink-0 p-2 rounded-xl text-slate-300 hover:text-red-500 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
        <Trash2 size={13}/>
      </button>
    </div>
  );
}

// ─── Follow-ups Screen (daily task list view) ─────────────────────────────────
function FollowupsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("Upcoming");
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ title:"", client_id:"", date:todayISO(), time:"09:00", reminder:"morning", notes:"" });
  const { confirm, dialog } = useConfirm();
  const followups = data.followups || [];
  const clients = data.clients || [];
  const today = todayISO();
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0,10);

  function resetForm() { setForm({ title:"", client_id:"", date:todayISO(), time:"09:00", reminder:"morning", notes:"" }); setEditId(null); setShowForm(false); }

  function startEdit(f) {
    setForm({ title:f.title||"", client_id:f.client_id||"", date:f.date||todayISO(), time:f.time||"09:00", reminder:f.reminder||"morning", notes:f.notes||"" });
    setEditId(f.id);
    setShowForm(true);
  }

  async function saveFollowup() {
    if (!form.title.trim()) { setToast("Please enter a title"); return; }

    // Resolve client name from client_id
    const selectedClient = clients.find(c => c.id === form.client_id);
    const clientName = selectedClient ? selectedClient.company : "";
    const clientBranch = selectedClient ? (selectedClient.branch || "") : "";

    if (editId) {
      const existing = followups.find(f => f.id === editId);
      const updated = { ...existing, ...form, client: clientName, branch: clientBranch, sync_status: "pending" };
      setData(d => ({
        ...d,
        followups: (d.followups||[]).map(f => f.id === editId ? updated : f),
        syncQueue: [{ id:genId(), table:"followups", action:"update", data:updated, status:"pending", created_at:new Date().toISOString() }, ...(d.syncQueue||[])],
      }));
      await offlineSave("followups", updated);
      setToast("Follow-up updated");
    } else {
      const item = {
        id: genId(),
        user_id: userId,
        ...form,
        client: clientName,
        branch: clientBranch,
        completed: false,
        created_at: new Date().toISOString(),
        sync_status: "pending",
      };
      setData(d => ({
        ...d,
        followups: [item, ...(d.followups||[])],
        syncQueue: [{ id:genId(), table:"followups", action:"insert", data:item, status:"pending", created_at:new Date().toISOString() }, ...(d.syncQueue||[])],
      }));
      await offlineSave("followups", item);
      setToast("Follow-up added");
    }
    resetForm();
  }

  async function toggleDone(id) {
    const t = followups.find(f => f.id === id);
    const up = { ...t, completed: !t.completed, sync_status: "pending" };
    setData(d => ({ ...d, followups: (d.followups||[]).map(f => f.id === id ? up : f) }));
    await offlineSave("followups", up);
  }

  async function deleteFollowup(id) {
    const ok = await confirm("Delete this follow-up?", { confirmLabel: "Delete" });
    if (!ok) return;
    setData(d => ({ ...d, followups: (d.followups||[]).filter(f => f.id !== id) }));
    setToast("Follow-up deleted");
  }

  // Filter logic
  const filtered = followups
    .filter(f => {
      if (filter === "Overdue") return f.date < today && !f.completed;
      if (filter === "Today")   return f.date === today && !f.completed;
      if (filter === "This week") return f.date > today && f.date <= nextWeekStr && !f.completed;
      if (filter === "Done")    return f.completed;
      // "Upcoming" = overdue + today + next 7 days, not done
      return !f.completed;
    })
    .sort((a, b) => a.completed - b.completed || a.date.localeCompare(b.date));

  const overdueCount = followups.filter(f => f.date < today && !f.completed).length;
  const todayCount = followups.filter(f => f.date === today && !f.completed).length;
  const pendingTotal = followups.filter(f => !f.completed).length;

  // Group "Upcoming" by date bucket
  const grouped = filter === "Upcoming" || filter === "All"
    ? filtered.reduce((acc, f) => {
        let bucket;
        if (f.completed) { bucket = "Done"; }
        else if (f.date < today) { bucket = "Overdue"; }
        else if (f.date === today) { bucket = "Today"; }
        else if (f.date <= nextWeekStr) { bucket = "This Week"; }
        else { bucket = "Later"; }
        if (!acc[bucket]) acc[bucket] = [];
        acc[bucket].push(f);
        return acc;
      }, {})
    : null;

  const bucketOrder = ["Overdue", "Today", "This Week", "Later", "Done"];

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")}/>}</AnimatePresence>

      <div className="flex items-center justify-between">
        <PageHeader title="Follow-ups" subtitle={`${pendingTotal} pending${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`}/>
        <Btn size="sm" onClick={() => { if (showForm && editId) resetForm(); else setShowForm(!showForm); }}>
          {showForm ? <X size={15}/> : <Plus size={15}/>}{showForm ? "Cancel" : "Add"}
        </Btn>
      </div>

      {/* Quick stats strip */}
      {(overdueCount > 0 || todayCount > 0) && (
        <div className="flex gap-3">
          {overdueCount > 0 && (
            <button onClick={() => setFilter("Overdue")} className="flex-1 rounded-2xl bg-red-50 border border-red-200 p-3 text-center">
              <p className="text-2xl font-black text-red-700">{overdueCount}</p>
              <p className="text-xs font-bold text-red-500">Overdue</p>
            </button>
          )}
          {todayCount > 0 && (
            <button onClick={() => setFilter("Today")} className="flex-1 rounded-2xl bg-blue-50 border border-blue-200 p-3 text-center">
              <p className="text-2xl font-black text-blue-700">{todayCount}</p>
              <p className="text-xs font-bold text-blue-500">Due Today</p>
            </button>
          )}
        </div>
      )}

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId ? "Edit Follow-up" : "New Follow-up"}</p>
              <Field label="What to follow up on" value={form.title} onChange={v=>setForm(f=>({...f,title:v}))} placeholder="e.g. Call mine buyer re quote" required/>
              <ClientSelector label="Client" value={form.client_id} onChange={v=>setForm(f=>({...f,client_id:v}))} clients={clients} placeholder="Select client (optional)"/>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
                <Field label="Time" type="time" value={form.time} onChange={v=>setForm(f=>({...f,time:v}))}/>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">🔔 Reminder</label>
                <select value={form.reminder} onChange={e=>setForm(f=>({...f,reminder:e.target.value}))}
                  className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 min-h-[52px]">
                  {REMINDER_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Any context…" multiline/>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveFollowup}><Save size={15}/>{editId ? "Update" : "Add Follow-up"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <FilterPills options={["Upcoming", "Overdue", "Today", "This week", "Done"]} value={filter} onChange={setFilter} dangerValue="Overdue"/>

      {filtered.length === 0 && (
        <Empty title={filter === "Done" ? "No completed follow-ups" : "All clear!"} text={filter === "Done" ? "Complete some follow-ups to see them here." : "No follow-ups in this category."} icon={Calendar}/>
      )}

      {/* Grouped view for Upcoming */}
      {grouped ? (
        <div className="space-y-4">
          {bucketOrder.filter(b => grouped[b]?.length > 0).map(bucket => (
            <div key={bucket}>
              <p className={`text-sm font-bold uppercase tracking-wider px-1 mb-2 ${bucket === "Overdue" ? "text-red-600" : bucket === "Today" ? "text-blue-600" : "text-slate-400"}`}>
                {bucket === "Overdue" ? `⚠️ ${bucket}` : bucket === "Today" ? `📍 ${bucket}` : bucket}
                {" "}({grouped[bucket].length})
              </p>
              <div className="space-y-2">
                {grouped[bucket].map(f => (
                  <FollowupCard key={f.id} f={f} today={today} onToggle={() => toggleDone(f.id)} onEdit={() => startEdit(f)} onDelete={() => deleteFollowup(f.id)}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <FollowupCard key={f.id} f={f} today={today} onToggle={() => toggleDone(f.id)} onEdit={() => startEdit(f)} onDelete={() => deleteFollowup(f.id)}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Follow-up card (list view) ───────────────────────────────────────────────
function FollowupCard({ f, today, onToggle, onEdit, onDelete }) {
  const isOverdue = !f.completed && f.date < today;
  const reminder = REMINDER_OPTIONS.find(o => o.value === f.reminder);
  return (
    <Card className={`p-3.5 ${isOverdue ? "border-l-4 border-l-red-400" : ""}`}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle}
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${f.completed ? "bg-green-100 text-green-600" : isOverdue ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
          <Check size={16}/>
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-base font-bold ${f.completed ? "line-through text-slate-400" : "text-slate-900"}`}>{f.title}</p>
          {(f.client || f.branch) && (
            <p className="text-sm text-slate-500 mt-0.5">
              {f.client}{f.branch ? ` — ${f.branch}` : ""}
            </p>
          )}
          <p className="text-sm text-slate-400 mt-0.5">{smartDate(f.date)}{f.time ? ` at ${f.time}` : ""}</p>
          {f.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{f.notes}</p>}
          {reminder && reminder.value !== "none" && !f.completed && (
            <p className="text-xs text-blue-400 mt-0.5">🔔 {reminder.label}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {isOverdue && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-600 self-start">Overdue</span>}
          <button onClick={onEdit} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={14}/></button>
          <button onClick={onDelete} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={14}/></button>
        </div>
      </div>
    </Card>
  );
}

// ─── Quotes ───────────────────────────────────────────────────────────────────
function QuotesScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ client_name:"", description:"", value:"", status:"Pending" });
  const { confirm, dialog } = useConfirm();
  const quotes = data.quotes || [];

  function resetForm() { setForm({ client_name:"", description:"", value:"", status:"Pending" }); setEditId(null); setShowForm(false); }

  async function saveQuote() {
    if (!form.description.trim()) { setToast("Please enter a description"); return; }
    if (editId) {
      const existing = quotes.find(q => q.id === editId);
      const updated = { ...existing, ...form, value:parseFloat(form.value||0), sync_status:"pending" };
      setData(d => ({ ...d, quotes:(d.quotes||[]).map(q=>q.id===editId?updated:q), syncQueue:[{id:genId(),table:"quotes",action:"update",data:updated,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])] }));
      await offlineSave("quotes", updated);
      setToast("Quote updated");
    } else {
      const item = { id:genId(), user_id:userId, ...form, value:parseFloat(form.value||0), sent_date:todayISO(), created_at:new Date().toISOString(), sync_status:"pending" };
      setData(d => ({ ...d, quotes:[item,...(d.quotes||[])], syncQueue:[{id:genId(),table:"quotes",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])] }));
      await offlineSave("quotes", item);
      setToast("Quote added");
    }
    resetForm();
  }

  async function deleteQuote(id, name) {
    const ok = await confirm(`Delete quote for ${name || "this client"}?`, { confirmLabel: "Delete" });
    if (!ok) return;
    setData(d => ({ ...d, quotes:(d.quotes||[]).filter(q=>q.id!==id) }));
    setToast("Quote deleted");
  }

  function startEdit(q) { setForm({ client_name:q.client_name||"", description:q.description||"", value:String(q.value||""), status:q.status||"Pending" }); setEditId(q.id); setShowForm(true); }

  const filtered = quotes
    .filter(q => filterStatus==="All" || q.status===filterStatus)
    .filter(q => !search || [q.client_name,q.description].some(x=>x?.toLowerCase().includes(search.toLowerCase())));
  const totalValue = filtered.reduce((s,q)=>s+parseFloat(q.value||0),0);

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-center justify-between">
        <PageHeader title="Quotes" subtitle={`${quotes.length} total · ${formatCurrency(totalValue)}`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={15}/>:<Plus size={15}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>
      <AnimatePresence>{toast && <Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId?"Edit Quote":"New Quote"}</p>
              <Field label="Client" value={form.client_name} onChange={v=>setForm(f=>({...f,client_name:v}))} placeholder="Client / branch"/>
              <Field label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="What the quote covers" multiline required/>
              <Field label="Value (R)" type="number" value={form.value} onChange={v=>setForm(f=>({...f,value:v}))} placeholder="0.00"/>
              <SelectField label="Status" value={form.status} onChange={v=>setForm(f=>({...f,status:v}))} options={["Pending","Accepted","Rejected","Expired"]}/>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveQuote}><Save size={15}/>{editId?"Update":"Add Quote"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <SearchBar value={search} onChange={setSearch} placeholder="Search quotes…"/>
      <FilterPills options={["All","Pending","Accepted","Rejected","Expired"]} value={filterStatus} onChange={setFilterStatus} dangerValue="Rejected"/>
      {filtered.length===0&&<Empty title="No quotes found" text="Add a quote or change filters." icon={FileIcon}/>}
      <div className="space-y-2">
        {filtered.map(q=>{
          const sc=QUOTE_STATUS_COLORS[q.status]||QUOTE_STATUS_COLORS.Pending;
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-slate-900">{q.client_name||"Unknown client"}</p>
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{background:sc.bg,color:sc.text}}>{q.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{q.description}</p>
                  <p className="mt-1.5 text-lg font-black" style={{color:BRAND.primary}}>{formatCurrency(q.value)}</p>
                  {q.sent_date&&<p className="text-xs text-slate-400 mt-0.5">Sent {smartDate(q.sent_date)}</p>}
                  {q.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={()=>startEdit(q)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15}/></button>
                  <button onClick={()=>deleteQuote(q.id,q.client_name)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15}/></button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Notes ────────────────────────────────────────────────────────────────────
function UrgencyBadge({ urgency = "Normal" }) {
  const u = NOTE_URGENCY[urgency] || NOTE_URGENCY.Normal;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border"
      style={{background:u.bg,color:u.text,borderColor:u.border}}>
      <span className="w-2 h-2 rounded-full" style={{background:u.dot}}/>
      {urgency}
    </span>
  );
}

function NotesScreen({ data, setData, userId, isOnline }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Unresolved");
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ client:"", note:"", urgency:"Normal", resolve_by:"" });
  const [pendingMedia, setPendingMedia] = useState([]);
  const { confirm, dialog } = useConfirm();
  const notes = data.notes || [];
  const today = todayISO();

  function addMedia(m) { setPendingMedia(pm=>[...pm,m]); }
  function removeMedia(id) { setPendingMedia(pm=>pm.filter(m=>m.id!==id)); }

  async function addNote() {
    if (!form.note.trim()) { setToast("Please enter a note"); return; }
    const item = { id:genId(), user_id:userId, ...form, media:pendingMedia, resolved:false, created_at:new Date().toISOString(), sync_status:"pending" };
    setData(d=>({...d,notes:[item,...(d.notes||[])],syncQueue:[{id:genId(),table:"notes",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
    await offlineSave("notes", item);
    if (form.resolve_by && Notification.permission==="granted") {
      const fireAt = new Date(form.resolve_by+"T09:00:00");
      if (fireAt > new Date()) {
        const urg=form.urgency||"Normal";
        const emoji=urg==="Critical"?"🚨":urg==="Urgent"?"⚠️":"📌";
        scheduleNotificationsViaSW([{id:"note_"+item.id,title:emoji+" Unresolved Note: "+(form.client||"General"),body:form.note.slice(0,80),fireAt:fireAt.toISOString(),tag:"note_"+item.id}]);
      }
    }
    if (isOnline && pendingMedia.length>0) {
      const uploaded=await Promise.all(pendingMedia.map(async m=>{const path="notes/"+item.id+"/"+m.id;const url=await uploadPhotoToSupabase(m.base64,path);return url?{...m,url,base64:undefined,uploadStatus:"done"}:m;}));
      const updatedItem={...item,media:uploaded};
      setData(d=>({...d,notes:(d.notes||[]).map(n=>n.id===item.id?updatedItem:n)}));
      await offlineSave("notes",updatedItem);
    }
    setForm({client:"",note:"",urgency:"Normal",resolve_by:""});
    setPendingMedia([]); setShowForm(false); setToast("Note saved");
  }

  async function resolveNote(id) {
    const n=notes.find(n=>n.id===id); if(!n) return;
    const updated={...n,resolved:true,resolved_at:new Date().toISOString(),sync_status:"pending"};
    setData(d=>({...d,notes:(d.notes||[]).map(x=>x.id===id?updated:x),syncQueue:[{id:genId(),table:"notes",action:"update",data:updated,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
    await offlineSave("notes",updated); setToast("Note resolved");
  }

  async function unresolveNote(id) {
    const n=notes.find(n=>n.id===id); if(!n) return;
    const updated={...n,resolved:false,resolved_at:null,sync_status:"pending"};
    setData(d=>({...d,notes:(d.notes||[]).map(x=>x.id===id?updated:x)}));
    await offlineSave("notes",updated);
  }

  async function changeUrgency(id,urgency) {
    const n=notes.find(n=>n.id===id); if(!n) return;
    const updated={...n,urgency,sync_status:"pending"};
    setData(d=>({...d,notes:(d.notes||[]).map(x=>x.id===id?updated:x),syncQueue:[{id:genId(),table:"notes",action:"update",data:updated,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
    await offlineSave("notes",updated);
  }

  async function deleteNote(id) {
    const ok = await confirm("Delete this note?", { confirmLabel:"Delete" });
    if (!ok) return;
    setData(d=>({...d,notes:(d.notes||[]).filter(n=>n.id!==id)}));
    setToast("Note deleted");
  }

  async function deleteNoteMedia(noteId,mediaId) {
    const note=notes.find(n=>n.id===noteId); if(!note) return;
    const updated={...note,media:(note.media||[]).filter(m=>m.id!==mediaId)};
    setData(d=>({...d,notes:(d.notes||[]).map(n=>n.id===noteId?updated:n)}));
    await offlineSave("notes",updated);
  }

  const unresolvedCount=notes.filter(n=>!n.resolved).length;
  const criticalCount=notes.filter(n=>!n.resolved&&n.urgency==="Critical").length;
  const overdueCount=notes.filter(n=>!n.resolved&&n.resolve_by&&n.resolve_by<today).length;

  const filtered=notes
    .filter(n=>filterStatus==="All"?true:filterStatus==="Resolved"?n.resolved:!n.resolved)
    .filter(n=>filterUrgency==="All"||(n.urgency||"Normal")===filterUrgency)
    .filter(n=>!search||[n.client,n.note].some(x=>x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>{const u={Critical:0,Urgent:1,Normal:2};if(a.resolved!==b.resolved)return a.resolved?1:-1;return(u[a.urgency||"Normal"]||2)-(u[b.urgency||"Normal"]||2);});

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast&&<Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Field Notes" subtitle={`${unresolvedCount} unresolved · ${notes.length} total`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={15}/>:<Plus size={15}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>

      {(criticalCount>0||overdueCount>0)&&(
        <div className="flex gap-2 flex-wrap">
          {criticalCount>0&&<div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold border" style={{background:NOTE_URGENCY.Critical.bg,color:NOTE_URGENCY.Critical.text,borderColor:NOTE_URGENCY.Critical.border}}>🚨 {criticalCount} Critical</div>}
          {overdueCount>0&&<div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold border" style={{background:NOTE_URGENCY.Urgent.bg,color:NOTE_URGENCY.Urgent.text,borderColor:NOTE_URGENCY.Urgent.border}}>⏰ {overdueCount} Overdue</div>}
        </div>
      )}

      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">New Note</p>
              <Field label="Client / Branch" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} placeholder="Client name"/>
              <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} placeholder="Type your visit note…" multiline required/>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Urgency</label>
                <div className="flex gap-2">
                  {Object.keys(NOTE_URGENCY).map(u=>(
                    <button key={u} type="button" onClick={()=>setForm(f=>({...f,urgency:u}))}
                      className="flex-1 rounded-xl py-3 text-sm font-bold border-2 transition-all min-h-[48px]"
                      style={form.urgency===u?{background:NOTE_URGENCY[u].bg,color:NOTE_URGENCY[u].text,borderColor:NOTE_URGENCY[u].dot}:{background:"#F8FAFC",color:"#94A3B8",borderColor:"#E2E8F0"}}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Resolve By (optional)" type="date" value={form.resolve_by} onChange={v=>setForm(f=>({...f,resolve_by:v}))}/>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Attach Photos / Videos</label>
                <MediaPicker onAdd={addMedia}/>
                <MediaGallery media={pendingMedia} onDelete={removeMedia}/>
              </div>
              <Btn className="w-full" onClick={addNote}><Plus size={15}/>Add Note{pendingMedia.length>0?` + ${pendingMedia.length} file${pendingMedia.length!==1?"s":""}`:""}</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search notes…"/>
      <div className="space-y-2">
        <FilterPills options={["Unresolved","Resolved","All"]} value={filterStatus} onChange={setFilterStatus} dangerValue={null}/>
        <FilterPills options={["All","Normal","Urgent","Critical"]} value={filterUrgency} onChange={setFilterUrgency} dangerValue="Critical"/>
      </div>

      {filtered.length===0&&<Empty title="No notes found" text="Add a note or change your filters." icon={Clipboard}/>}

      <div className="space-y-2">
        {filtered.map(n=>{
          const urg=NOTE_URGENCY[n.urgency||"Normal"]||NOTE_URGENCY.Normal;
          const isOverdue=!n.resolved&&n.resolve_by&&n.resolve_by<today;
          return (
            <Card key={n.id} className="overflow-hidden" style={{borderLeft:"3px solid "+urg.dot}}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className={"text-base font-bold "+(n.resolved?"text-slate-400 line-through":"text-slate-900")}>{n.client||"General Note"}</p>
                      <UrgencyBadge urgency={n.urgency||"Normal"}/>
                      {n.resolved&&<span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Resolved</span>}
                      {isOverdue&&<span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Overdue</span>}
                    </div>
                    <p className={"text-sm leading-relaxed "+(n.resolved?"text-slate-400":"text-slate-600")}>{n.note}</p>
                    {n.resolve_by&&!n.resolved&&<p className={"mt-1 text-sm font-medium "+(isOverdue?"text-red-600":"text-slate-400")}>Resolve by: {smartDate(n.resolve_by)}</p>}
                    {n.resolved&&n.resolved_at&&<p className="mt-1 text-xs text-slate-400">Resolved {new Date(n.resolved_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</p>}
                    {(n.media||[]).length>0&&<div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Paperclip size={11}/>{n.media.length} attachment{n.media.length!==1?"s":""}</div>}
                    <MediaGallery media={n.media||[]} onDelete={mid=>deleteNoteMedia(n.id,mid)}/>
                    <p className="mt-1.5 text-xs text-slate-400">{n.created_at?new Date(n.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):""}</p>
                    {n.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                  </div>
                  <button onClick={()=>deleteNote(n.id)} className="shrink-0 p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15}/></button>
                </div>
                {!n.resolved&&(
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      {Object.keys(NOTE_URGENCY).map(u2=>(
                        <button key={u2} onClick={()=>changeUrgency(n.id,u2)}
                          className="rounded-lg px-3 py-1.5 text-sm font-bold border transition-all min-h-[40px]"
                          style={(n.urgency||"Normal")===u2?{background:NOTE_URGENCY[u2].bg,color:NOTE_URGENCY[u2].text,borderColor:NOTE_URGENCY[u2].dot}:{background:"#F8FAFC",color:"#CBD5E1",borderColor:"#E2E8F0"}}>
                          {u2}
                        </button>
                      ))}
                    </div>
                    <Btn size="sm" variant="success" onClick={()=>resolveNote(n.id)}><Check size={13}/> Resolve</Btn>
                  </div>
                )}
                {n.resolved&&(
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <button onClick={()=>unresolveNote(n.id)} className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-1">Mark as unresolved</button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Equipment ────────────────────────────────────────────────────────────────
function EquipmentScreen({ data, setData, userId, isOnline }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({name:"",type:"",make:"",model:"",serial:"",location:"",client:"",service_due:"",notes:""});
  const [pendingMedia, setPendingMedia] = useState([]);
  const { confirm, dialog } = useConfirm();
  const equipment = data.equipment || [];

  function resetForm(){setForm({name:"",type:"",make:"",model:"",serial:"",location:"",client:"",service_due:"",notes:""});setEditId(null);setShowForm(false);setPendingMedia([]);}
  function addMedia(m){setPendingMedia(pm=>[...pm,m]);}
  function removeMedia(id){setPendingMedia(pm=>pm.filter(m=>m.id!==id));}

  async function saveEquipment(){
    if(!form.name.trim()){setToast("Equipment name is required");return;}
    if(editId){
      const existing=equipment.find(e=>e.id===editId);
      const allMedia=[...(existing?.media||[]),...pendingMedia];
      const updated={...existing,...form,media:allMedia,sync_status:"pending"};
      setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===editId?updated:e)}));
      await offlineSave("equipment",updated);
      if(isOnline&&pendingMedia.length>0){
        const uploaded=await Promise.all(pendingMedia.map(async m=>{const path=`equipment/${editId}/${m.id}`;const url=await uploadPhotoToSupabase(m.base64,path);return url?{...m,url,uploadStatus:"done"}:m;}));
        const finalItem={...updated,media:[...(existing?.media||[]),...uploaded]};
        setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===editId?finalItem:e)}));
        await offlineSave("equipment",finalItem);
      }
      setToast("Equipment updated");
    } else {
      const item={id:genId(),user_id:userId,...form,media:pendingMedia,created_at:new Date().toISOString(),sync_status:"pending"};
      setData(d=>({...d,equipment:[item,...(d.equipment||[])],syncQueue:[{id:genId(),table:"equipment",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
      await offlineSave("equipment",item);
      if(isOnline&&pendingMedia.length>0){
        const uploaded=await Promise.all(pendingMedia.map(async m=>{const path=`equipment/${item.id}/${m.id}`;const url=await uploadPhotoToSupabase(m.base64,path);return url?{...m,url,uploadStatus:"done"}:m;}));
        const finalItem={...item,media:uploaded};
        setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===item.id?finalItem:e)}));
        await offlineSave("equipment",finalItem);
      }
      setToast("Equipment added");
    }
    resetForm();
  }

  async function deleteEquipMedia(equipId,mediaId){
    const eq=equipment.find(e=>e.id===equipId);if(!eq)return;
    const updated={...eq,media:(eq.media||[]).filter(m=>m.id!==mediaId)};
    setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===equipId?updated:e)}));
    await offlineSave("equipment",updated);
  }

  async function deleteEquipment(id,name){
    const ok=await confirm(`Delete ${name}?`,{confirmLabel:"Delete"});
    if(!ok)return;
    setData(d=>({...d,equipment:(d.equipment||[]).filter(e=>e.id!==id)}));
    setToast("Equipment deleted");
  }

  function startEdit(e){
    setForm({name:e.name||"",type:e.type||"",make:e.make||"",model:e.model||"",serial:e.serial||"",location:e.location||"",client:e.client||"",service_due:e.service_due||"",notes:e.notes||""});
    setPendingMedia([]);setEditId(e.id);setShowForm(true);
  }

  const filtered=equipment
    .filter(e=>{const d=e.service_due?daysDiff(e.service_due):null;if(filter==="Overdue")return d!==null&&d<0;if(filter==="Due Soon")return d!==null&&d>=0&&d<=14;if(filter==="OK")return d===null||d>14;return true;})
    .filter(e=>!search||[e.name,e.type,e.make,e.model,e.serial,e.location,e.client].some(x=>x?.toLowerCase().includes(search.toLowerCase())));

  const overdueCount=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0).length;
  const dueSoonCount=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)>=0&&daysDiff(e.service_due)<=14).length;

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast&&<Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Equipment" subtitle={`${equipment.length} registered · ${overdueCount} overdue`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={15}/>:<Plus size={15}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>

      {(overdueCount>0||dueSoonCount>0)&&(
        <div className="grid grid-cols-2 gap-3">
          {overdueCount>0&&<div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center"><p className="text-2xl font-black text-red-700">{overdueCount}</p><p className="text-sm font-bold text-red-500">Overdue Service</p></div>}
          {dueSoonCount>0&&<div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center"><p className="text-2xl font-black text-amber-700">{dueSoonCount}</p><p className="text-sm font-bold text-amber-500">Due in 14 Days</p></div>}
        </div>
      )}

      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId?"Edit Equipment":"Register Equipment"}</p>
              <Field label="Equipment Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. Main Compressor Unit" required/>
              <Field label="Type / Category" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} placeholder="e.g. Compressor, Generator, Pump…"/>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make / Brand" value={form.make} onChange={v=>setForm(f=>({...f,make:v}))} placeholder="e.g. Atlas Copco"/>
                <Field label="Model" value={form.model} onChange={v=>setForm(f=>({...f,model:v}))} placeholder="e.g. GA110"/>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Serial Number</label>
                <div className="relative">
                  <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input value={form.serial} onChange={e=>setForm(f=>({...f,serial:e.target.value}))} placeholder="Serial / Asset number"
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pl-9 text-base outline-none focus:border-red-300 focus:bg-white transition-colors font-mono min-h-[52px]"/>
                </div>
              </div>
              <Field label="Location / Site" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="e.g. Pump Room B, Level 3"/>
              <Field label="Client / Site" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} placeholder="Linked client or site"/>
              <Field label="Next Service Due" type="date" value={form.service_due} onChange={v=>setForm(f=>({...f,service_due:v}))}/>
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Additional notes…" multiline/>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Photos / Videos</label>
                <MediaPicker onAdd={addMedia}/>
                {pendingMedia.length>0&&<><p className="mt-2 text-sm text-slate-400">{pendingMedia.length} file{pendingMedia.length!==1?"s":""} ready</p><MediaGallery media={pendingMedia} onDelete={removeMedia}/></>}
                {editId&&(equipment.find(e=>e.id===editId)?.media||[]).length>0&&<><p className="mt-2 text-sm font-bold text-slate-500">Existing photos:</p><MediaGallery media={equipment.find(e=>e.id===editId)?.media||[]} onDelete={mid=>deleteEquipMedia(editId,mid)}/></>}
              </div>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveEquipment}><Save size={15}/>{editId?"Update":"Register"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search name, serial, location…"/>
      <FilterPills options={["All","Overdue","Due Soon","OK"]} value={filter} onChange={setFilter} dangerValue="Overdue"/>
      {filtered.length===0&&<Empty title="No equipment found" text="Register your first piece of equipment." icon={Wrench}/>}

      <div className="space-y-2">
        {filtered.map(eq=>(
          <Card key={eq.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-base font-black text-slate-900">{eq.name}</p>
                  {eq.type&&<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{eq.type}</span>}
                  {eq.service_due&&<ServiceBadge dueDate={eq.service_due}/>}
                </div>
                {(eq.make||eq.model)&&<p className="text-sm text-slate-500">{[eq.make,eq.model].filter(Boolean).join(" · ")}</p>}
                {eq.serial&&<div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Hash size={11} className="text-slate-400"/><span className="text-sm font-mono font-bold text-slate-600">{eq.serial}</span></div>}
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {eq.location&&<span className="inline-flex items-center gap-1 text-sm text-slate-400"><MapPin size={12}/>{eq.location}</span>}
                  {eq.client&&<span className="inline-flex items-center gap-1 text-sm text-slate-400"><Users size={12}/>{eq.client}</span>}
                </div>
                {eq.service_due&&<p className="mt-1 text-sm text-slate-400">Service due: {smartDate(eq.service_due)}</p>}
                {eq.notes&&<p className="mt-1 text-sm text-slate-500 italic">{eq.notes}</p>}
                {(eq.media||[]).length>0&&<><div className="mt-1 flex items-center gap-1 text-sm text-slate-400"><Paperclip size={12}/>{eq.media.length} photo{eq.media.length!==1?"s":""}</div><MediaGallery media={eq.media||[]} onDelete={mid=>deleteEquipMedia(eq.id,mid)}/></>}
                {eq.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={()=>startEdit(eq)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15}/></button>
                <button onClick={()=>deleteEquipment(eq.id,eq.name)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15}/></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── More ─────────────────────────────────────────────────────────────────────
function MoreScreen({ data, onLogout, onSyncNow, syncing, isOnline, notifPermission, onRequestNotif }) {
  const { confirm, dialog } = useConfirm();
  const pendingCount=(data.syncQueue||[]).filter(i=>i.status==="pending").length;
  function changePIN(){localStorage.removeItem(PIN_KEY);sessionStorage.removeItem(PIN_UNLOCKED_KEY);window.location.reload();}

  async function handleLogout() {
    const ok = await confirm("Sign out of PowerMate?", { confirmLabel:"Sign Out", confirmVariant:"danger" });
    if (ok) onLogout();
  }

  return (
    <div className="space-y-4">
      {dialog}
      <PageHeader title="Settings" subtitle="Sync, security & account"/>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Sync Status</p>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline?"bg-green-500":"bg-slate-300"}`}/>
              <p className="text-base font-bold text-slate-800">{isOnline?"Online":"Offline"}</p>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">{isOnline?"Connected to cloud":"Changes saved locally, will sync when back online"}</p>
          </div>
          <Btn size="sm" variant={isOnline?"solid":"secondary"} onClick={onSyncNow} disabled={!isOnline||syncing||pendingCount===0}>
            <RefreshCw size={14} className={syncing?"animate-spin":""}/>
            {syncing?"Syncing…":"Sync Now"}
          </Btn>
        </div>
        {pendingCount>0
          ?<div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5">
            <p className="text-sm font-bold text-amber-700">⚠️ {pendingCount} change{pendingCount!==1?"s":""} waiting to sync</p>
            <p className="text-xs text-amber-600 mt-0.5">{isOnline?"Tap Sync Now or wait — syncs automatically":"Will sync automatically when you reconnect"}</p>
          </div>
          :<div className="rounded-xl bg-green-50 border border-green-200 p-3.5">
            <p className="text-sm font-bold text-green-700">✓ All data synced to cloud</p>
            <p className="text-xs text-green-600 mt-0.5">Your data is safe and visible on all devices</p>
          </div>
        }
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Notifications</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-800">Push Notifications</p>
            <p className="text-sm text-slate-400 mt-0.5">
              {notifPermission==="granted"?"✓ Active — follow-up reminders on":
               notifPermission==="denied"?"✗ Blocked in browser settings":
               "Get reminders for follow-ups and service due dates"}
            </p>
          </div>
          {notifPermission==="granted"
            ?<span className="shrink-0 text-green-600 text-sm font-bold">Active ✓</span>
            :notifPermission!=="denied"&&<Btn size="sm" variant="warning" onClick={onRequestNotif}><Bell size={14}/>Enable</Btn>
          }
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Security</p>
        <div className="flex items-center justify-between">
          <div><p className="text-base font-bold text-slate-800">PIN Lock</p><p className="text-sm text-slate-400">Change your 6-digit PIN</p></div>
          <Btn size="sm" variant="secondary" onClick={changePIN}><Shield size={14}/>Change PIN</Btn>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Data Summary</p>
        {[
          {label:"Clients",count:(data.clients||[]).length},
          {label:"Follow-ups",count:(data.followups||[]).length},
          {label:"Quotes",count:(data.quotes||[]).length},
          {label:"Notes",count:(data.notes||[]).length},
          {label:"Equipment",count:(data.equipment||[]).length},
        ].map(({label,count})=>(
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
            <p className="text-base text-slate-600">{label}</p>
            <p className="text-base font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </Card>

      <ReportExport data={data} />

      <Btn variant="danger" className="w-full" size="lg" onClick={handleLogout}><LogOut size={16}/>Sign Out</Btn>
      <p className="text-center text-xs text-slate-300">PowerMate v2.2 · Power Works (Pty) Ltd</p>
    </div>
  );
}

// ─── Supabase Sync ────────────────────────────────────────────────────────────
let _syncInProgress = false;

async function pushSyncQueue(syncQueue, setData) {
  if (_syncInProgress) return;
  _syncInProgress = true;
  try {
    const pending = (syncQueue||[]).filter(i=>i.status==="pending");
    if (pending.length===0) return;

    // Deduplicate — keep latest per (table, id, action)
    const seen = new Map();
    const deduped = [];
    for (let i=pending.length-1;i>=0;i--) {
      const item=pending[i];
      const key=`${item.table}:${item.data?.id}:${item.action}`;
      if(seen.has(key)) continue;
      seen.set(key,true);
      deduped.unshift(item);
    }

    const results = await Promise.allSettled(deduped.map(async item => {
      const table = item.table; // now correctly using "clients", "followups" etc.
      let payload = item.data;
      if (payload?.media) payload={...payload,media:payload.media.map(m=>({...m,base64:undefined}))};
      if (item.action==="insert"||item.action==="upsert") {
        const {error}=await supabase.from(table).upsert(payload,{onConflict:"id"});
        if(error) throw error;
      } else if (item.action==="update") {
        const {error}=await supabase.from(table).update(payload).eq("id",payload.id);
        if(error) throw error;
      } else if (item.action==="delete") {
        const {error}=await supabase.from(table).delete().eq("id",payload.id);
        if(error) throw error;
      }
      return item.id;
    }));

    const ok=results.filter(r=>r.status==="fulfilled").map(r=>r.value);
    const failed=results.filter(r=>r.status==="rejected");
    if(failed.length>0) {
      console.warn("[PowerMate] Sync failures:",failed.length);
      logEvent("sync_failed",{count:failed.length,errors:failed.slice(0,3).map(f=>f.reason?.message||"unknown")});
      // Dispatch a custom event so the UI can show a toast — visible failure is better than silent
      window.dispatchEvent(new CustomEvent("powermate:sync_failed", {
        detail: { count: failed.length, message: failed[0]?.reason?.message || "Unknown error" }
      }));
    }
    if(ok.length>0) logEvent("sync_succeeded",{count:ok.length});

    const succeededEntityIds=deduped.filter(item=>ok.includes(item.id)).map(item=>item.data?.id).filter(Boolean);
    const succeededQueueIds=new Set();
    pending.forEach(item=>{if(succeededEntityIds.includes(item.data?.id))succeededQueueIds.add(item.id);});

    setData(d=>({
      ...d,
      syncQueue:(d.syncQueue||[]).filter(i=>!succeededQueueIds.has(i.id)),
      clients:(d.clients||[]).map(c=>succeededEntityIds.includes(c.id)?{...c,sync_status:"synced"}:c),
      quotes:(d.quotes||[]).map(q=>succeededEntityIds.includes(q.id)?{...q,sync_status:"synced"}:q),
      followups:(d.followups||[]).map(f=>succeededEntityIds.includes(f.id)?{...f,sync_status:"synced"}:f),
      notes:(d.notes||[]).map(n=>succeededEntityIds.includes(n.id)?{...n,sync_status:"synced"}:n),
      equipment:(d.equipment||[]).map(e=>succeededEntityIds.includes(e.id)?{...e,sync_status:"synced"}:e),
    }));
  } finally {
    _syncInProgress=false;
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const isOnline=useOnlineStatus();
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [screen,setScreen]=useState("Home");
  const [syncing,setSyncing]=useState(false);
  const [syncError,setSyncError]=useState("");

  // Listen for sync failures from the sync engine and show user-visible toast
  useEffect(()=>{
    function handleSyncFail(e) {
      setSyncError(`Sync failed: ${e.detail?.message || "Check your connection"}`);
      setTimeout(()=>setSyncError(""),5000);
    }
    window.addEventListener("powermate:sync_failed", handleSyncFail);
    return ()=>window.removeEventListener("powermate:sync_failed", handleSyncFail);
  },[]);
  const [pinState,setPinState]=useState("checking");
  const [notifPermission,setNotifPermission]=useState("Notification" in window?Notification.permission:"denied");
  const [data,setData]=useState({clients:[],followups:[],quotes:[],notes:[],equipment:[],syncQueue:[]});
  const [dataLoading,setDataLoading]=useState(true);

  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data:{session:s}})=>{if(mounted){setSession(s||null);setLoading(false);}});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));
    return()=>{mounted=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!session) return;
    if(!getPINHash()){setPinState("setup");return;}
    if(isSessionUnlocked()){setPinState("unlocked");return;}
    setPinState("locked");
  },[session]);

  useEffect(()=>{
    // Load from localStorage first (instant), then IndexedDB (fuller offline data)
    async function loadLocalData() {
      // 1. Try localStorage first — fast, available immediately
      try {
        const saved = localStorage.getItem("powermate_v2_data");
        if (saved) {
          const parsed = JSON.parse(saved);
          setData(d => ({ ...d, ...parsed }));
        }
      } catch(e) { console.warn("localStorage load failed:", e); }

      // 2. Then try IndexedDB — may have newer offline data not yet in localStorage
      try {
        const tables = ["clients", "followups", "quotes", "notes", "equipment"];
        const results = await Promise.all(tables.map(t => offlineGetAll(t)));
        const [clients, followups, quotes, notes, equipment] = results;
        setData(d => ({
          ...d,
          ...(clients?.length   ? { clients }   : {}),
          ...(followups?.length ? { followups } : {}),
          ...(quotes?.length    ? { quotes }    : {}),
          ...(notes?.length     ? { notes }     : {}),
          ...(equipment?.length ? { equipment } : {}),
        }));
      } catch(e) { console.warn("IndexedDB load failed:", e); }
    }
    loadLocalData();
  },[]);

  // Save to localStorage — strip base64 to avoid quota crash
  useEffect(()=>{
    const t=setTimeout(()=>{
      try{
        // Strip base64 ONLY if we have a real URL (uploaded to Supabase)
        // Keep base64 if no URL — this is unsaved offline media the user needs
        const safeData={
          ...data,
          notes:(data.notes||[]).map(n=>({...n,media:(n.media||[]).map(m=>m.url?{...m,base64:undefined}:m)})),
          equipment:(data.equipment||[]).map(e=>({...e,media:(e.media||[]).map(m=>m.url?{...m,base64:undefined}:m)})),
        };
        // Check size before saving — warn user if approaching limit
        const serialized = JSON.stringify(safeData);
        const sizeMB = (serialized.length / 1024 / 1024).toFixed(1);
        if (parseFloat(sizeMB) > 4) {
          console.warn(`[PowerMate] localStorage approaching limit: ${sizeMB}MB`);
          logEvent("localStorage_size_warning", { sizeMB });
        }
        localStorage.setItem("powermate_v2_data", serialized);
      } catch(e){
        console.warn("Could not save local data",e);
        if(e.name==="QuotaExceededError") logEvent("localStorage_quota_exceeded",{message:e.message});
      }
    },500);
    return()=>clearTimeout(t);
  },[data]);

  // Auto-escalate overdue note urgency
  useEffect(()=>{
    const today=todayISO();
    const notes=data.notes||[];
    let didChange=false;
    const escalated=notes.map(n=>{
      if(n.resolved||!n.resolve_by||n.resolve_by>=today) return n;
      if(n.last_escalated===n.resolve_by) return n;
      const next=URGENCY_ESCALATION[n.urgency||"Normal"];
      if(next===(n.urgency||"Normal")) return{...n,last_escalated:n.resolve_by};
      didChange=true;
      return{...n,urgency:next,last_escalated:n.resolve_by,sync_status:"pending"};
    });
    if(didChange) setData(d=>({...d,notes:escalated}));
  },[]);

  // Pull from Supabase + real-time subscriptions for cross-device sync
  useEffect(() => {
    if (!session) return;
    if (!isOnline) { setDataLoading(false); return; }
    const uid = session.user.id;

    // Initial pull — always prefer server data when online
    async function pull() {
      try {
        const [a, b, c, d, e] = await Promise.all([
          supabase.from("clients").select("id,user_id,company,division,contact,phone,email,location,branch,stage,pipeline_status,sync_status,auto_created,source,notes,created_at,updated_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
          supabase.from("followups").select("id,user_id,client_id,client,branch,title,date,time,reminder,notes,completed,sync_status,auto_generated,created_at").eq("user_id", uid).order("date", { ascending: false }).limit(500),
          supabase.from("quotes").select("id,user_id,client_name,description,value,status,sent_date,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
          supabase.from("notes").select("id,user_id,client,note,urgency,resolve_by,resolved,resolved_at,last_escalated,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
          supabase.from("equipment").select("id,user_id,name,type,make,model,serial,location,client,service_due,notes,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
        ]);
        setData(prev => ({
          ...prev,
          clients:   a.error ? prev.clients   : (a.data || []),
          followups: b.error ? prev.followups : (b.data || []),
          quotes:    c.error ? prev.quotes    : (c.data || []),
          notes:     d.error ? prev.notes     : (d.data || []),
          equipment: e.error ? prev.equipment : (e.data || []),
        }));
      } catch (e) {
        console.warn("Supabase pull failed:", e);
        // If online pull fails, make sure we show whatever we have locally
        // (already loaded from localStorage/IndexedDB above)
      } finally {
        setDataLoading(false);
      }
    }
    pull();

    // Real-time listeners — any change on any device updates all others instantly
    const tables = ["clients", "followups", "quotes", "notes", "equipment"];
    const channels = tables.map(table =>
      supabase.channel(`realtime_${table}_${uid}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${uid}`,
        }, payload => {
          setData(prev => {
            const current = prev[table] || [];
            if (payload.eventType === "INSERT") {
              const exists = current.find(r => r.id === payload.new.id);
              return exists ? prev : { ...prev, [table]: [payload.new, ...current] };
            }
            if (payload.eventType === "UPDATE") {
              return { ...prev, [table]: current.map(r => r.id === payload.new.id ? payload.new : r) };
            }
            if (payload.eventType === "DELETE") {
              return { ...prev, [table]: current.filter(r => r.id !== payload.old.id) };
            }
            return prev;
          });
        })
        .subscribe()
    );

    // Cleanup on unmount
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [session?.user?.id, isOnline]);

  useEffect(()=>{
    if(notifPermission!=="granted") return;
    scheduleNotificationsViaSW(buildNotificationItems(data.followups,data.equipment,data.notes));
  },[data.followups,data.equipment,notifPermission]);

  // Auto-sync pending items — 5s debounce to batch multiple rapid changes
  useEffect(()=>{
    if(!isOnline||!session) return;
    const pending=(data.syncQueue||[]).filter(i=>i.status==="pending");
    if(pending.length===0) return;
    const t=setTimeout(()=>pushSyncQueue(data.syncQueue,setData),5000);
    return()=>clearTimeout(t);
  },[isOnline,session,data.syncQueue?.length]);

  async function handleSyncNow(){setSyncing(true);await pushSyncQueue(data.syncQueue,setData);setSyncing(false);}

  async function handleRequestNotif(){
    const granted=await requestNotificationPermission();
    setNotifPermission(granted?"granted":"denied");
    if(granted) scheduleNotificationsViaSW(buildNotificationItems(data.followups,data.equipment,data.notes));
  }

  async function logout(){
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    resetPINAttempts();
    try{await supabase.auth.signOut();}catch(e){console.warn("Sign out failed:",e);}
    setSession(null);
  }

  async function forgotPIN(){
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    resetPINAttempts();
    try{await supabase.auth.signOut();}catch(e){console.warn("Sign out failed:",e);}
    setSession(null);
  }

  const pendingCount=(data.syncQueue||[]).filter(i=>i.status==="pending").length;
  const flaggedQuotes=(data.quotes||[]).filter(q=>q.status==="Pending").length;
  const overdueEquip=(data.equipment||[]).filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0).length;
  const overdueFollowups=(data.followups||[]).filter(f=>f.date<todayISO()&&!f.completed).length;

  if(loading) return <Spinner/>;
  if(!session) return <AuthScreen/>;
  if(pinState==="checking") return <Spinner/>;
  if(pinState==="setup") return <PINSetupScreen onComplete={()=>setPinState("unlocked")}/>;
  if(pinState==="locked") return <PINLockScreen onUnlock={()=>setPinState("unlocked")} onForgot={forgotPIN}/>;
  if(dataLoading) return <DataLoadingScreen/>;

  const screens={
    Home:      <HomeScreen data={data} setScreen={setScreen}/>,
    Clients:   <ClientsScreen data={data} setData={setData} userId={session.user.id}/>,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id}/>,
    Quotes:    <QuotesScreen data={data} setData={setData} userId={session.user.id}/>,
    Notes:     <NotesScreen data={data} setData={setData} userId={session.user.id} isOnline={isOnline}/>,
    Equipment: <EquipmentScreen data={data} setData={setData} userId={session.user.id} isOnline={isOnline}/>,
    More:      <MoreScreen data={data} onLogout={logout} onSyncNow={handleSyncNow} syncing={syncing} isOnline={isOnline} notifPermission={notifPermission} onRequestNotif={handleRequestNotif}/>,
  };

  const NAV=[
    {icon:Home,      label:"Home",     key:"Home"},
    {icon:Users,     label:"Clients",  key:"Clients"},
    {icon:Calendar,  label:"Follow-ups",key:"Followups", badge:overdueFollowups||undefined},
    {icon:FileIcon,  label:"Quotes",   key:"Quotes",     badge:flaggedQuotes||undefined},
    {icon:Clipboard, label:"Notes",    key:"Notes"},
    {icon:Wrench,    label:"Equipment",key:"Equipment",   badge:overdueEquip||undefined},
    {icon:Settings,  label:"More",     key:"More",        badge:pendingCount||undefined},
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-28" style={{background:BRAND.light}}>
        <main className="mx-auto max-w-2xl px-4 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.15}}>
              {screens[screen]}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 backdrop-blur-md px-1 pt-1 pb-safe shadow-lg">
          <div className="mx-auto grid max-w-2xl grid-cols-7 gap-0 pb-1">
            {NAV.map(({icon,label,key,badge})=>(
              <NavTab key={key} icon={icon} label={label} active={screen===key} onClick={()=>setScreen(key)} badge={badge}/>
            ))}
          </div>
        </nav>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing}/>
        <AnimatePresence>
          {syncError && <Toast message={syncError} type="error" onDone={()=>setSyncError("")}/>}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
