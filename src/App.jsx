import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll, offlineDelete, compressImage, fileToBase64 } from "./offline/offlineDb";
import SyncStatusBadge from "./components/SyncStatusBadge";

import {
  Bell, Calendar, Camera, ChevronRight, ChevronDown, ChevronUp,
  Clipboard, File as FileIcon, Home, LogOut, Plus, Search,
  Shield, Trash2, Users, Eye, EyeOff, BarChart2, RefreshCw,
  Check, Settings, X, TrendingUp, Filter, Edit2, Save,
  Target, AlertCircle, Wrench, Zap, DollarSign, MapPin,
  PenTool, Clock, Image, Video, Package, Hash, Building,
  Building2, ChevronLeft, Phone, Mail, Star, AlertTriangle,
} from "lucide-react";

// ─── Brand ────────────────────────────────────────────────────────────────────
const BRAND = {
  primary: "#8B1A1A",
  primaryDark: "#6B1414",
  primaryLight: "#B22222",
  charcoal: "#1C1C1C",
  light: "#F7F3F3",
  accent: "#C0392B",
  gold: "#D4A017",
  logo: "https://powerstart.eu/wp-content/uploads/2021/10/Power-Works-Logo.png",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = ["New Lead", "Contacted", "Quoted", "Active", "Won", "Lost"];

const STAGE_COLORS = {
  "New Lead":  { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
  Contacted:   { bg: "#F0FDF4", text: "#15803D", dot: "#22C55E" },
  Quoted:      { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
  Active:      { bg: "#FAF5FF", text: "#7E22CE", dot: "#A855F7" },
  Won:         { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
  Lost:        { bg: "#FFF1F2", text: "#BE123C", dot: "#F43F5E" },
};

const QUOTE_STATUS_COLORS = {
  Pending:  { bg: "#FFFBEB", text: "#B45309" },
  Accepted: { bg: "#F0FDF4", text: "#15803D" },
  Rejected: { bg: "#FFF1F2", text: "#BE123C" },
  Expired:  { bg: "#F8FAFC", text: "#64748B" },
};

const EQUIPMENT_TYPES = [
  "Generator", "Compressor", "Pump", "Motor",
  "Panel / Switchgear", "Transformer", "UPS", "Other"
];

const JOB_STATUSES = ["Open", "In Progress", "Pending Parts", "Completed", "Cancelled"];
const JOB_STATUS_COLORS = {
  Open:           { bg: "#EFF6FF", text: "#1D4ED8" },
  "In Progress":  { bg: "#FFFBEB", text: "#B45309" },
  "Pending Parts":{ bg: "#FAF5FF", text: "#7E22CE" },
  Completed:      { bg: "#F0FDF4", text: "#15803D" },
  Cancelled:      { bg: "#FFF1F2", text: "#BE123C" },
};

const EXPENSE_TYPES = ["Fuel", "Accommodation", "Materials", "Toll", "Parking", "Other"];

// ─── PIN Security ─────────────────────────────────────────────────────────────
const PIN_KEY = "powermate_pin_hash";
const PIN_UNLOCKED_KEY = "powermate_pin_unlocked";

async function hashPIN(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "powerworks_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getPINHash() { return localStorage.getItem(PIN_KEY); }
function isSessionUnlocked() { return sessionStorage.getItem(PIN_UNLOCKED_KEY) === "true"; }
function setSessionUnlocked() { sessionStorage.setItem(PIN_UNLOCKED_KEY, "true"); }

// ─── Notification helpers ─────────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function scheduleReminders(followups = [], notes = []) {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "SCHEDULE_NOTIFICATIONS",
    followups,
    notes,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function niceDate(d) {
  if (!d) d = new Date();
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function smartDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date(todayISO() + "T12:00:00");
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 7) return date.toLocaleDateString("en-GB", { weekday: "long" });
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} days ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(v) {
  return "R " + parseFloat(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 });
}

function genId() { return `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function getDaysUntilService(dateStr) {
  if (!dateStr) return null;
  const diff = Math.round((new Date(dateStr + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000);
  return diff;
}

// ─── UI Components ────────────────────────────────────────────────────────────
function Card({ children, className = "", onClick }) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "solid", className = "", type = "button", size = "md" }) {
  const base = "inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-2 text-xs rounded-xl", md: "px-4 py-3 text-sm rounded-2xl", lg: "px-6 py-4 text-base rounded-2xl" };
  const variants = {
    solid:     { background: BRAND.primary, color: "#fff" },
    outline:   { background: "#fff", color: BRAND.primary, border: `2px solid ${BRAND.primary}` },
    danger:    { background: "#DC2626", color: "#fff" },
    secondary: { background: BRAND.light, color: BRAND.primary },
    ghost:     { background: "transparent", color: BRAND.primary },
    success:   { background: "#16A34A", color: "#fff" },
    warning:   { background: "#D97706", color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${className}`}
      style={variants[variant] || variants.solid}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false, required = false, hint = "" }) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
          {label}{required && <span className="text-red-500">*</span>}
        </label>
      )}
      {multiline ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4}
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors resize-none" />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors" />
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
      <select value={value || ""} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors">
        <option value="">— Select —</option>
        {options.map(o => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-red-300 transition-colors" />
      {value && <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
    </div>
  );
}

function StagePill({ stage }) {
  const c = STAGE_COLORS[stage] || STAGE_COLORS["New Lead"];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />{stage}
    </span>
  );
}

function StatusPill({ status, colors }) {
  const c = colors[status] || { bg: "#F1F5F9", text: "#64748B" };
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: c.bg, color: c.text }}>{status}</span>;
}

function Empty({ title, text, icon: Icon = Users }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-10 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: BRAND.light }}>
        <Icon size={22} style={{ color: BRAND.primary }} />
      </div>
      <p className="font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function StatCard({ label, value, sub, color = BRAND.primary, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-black" style={{ color }}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {Icon && <div className="rounded-xl p-2.5" style={{ background: BRAND.light }}><Icon size={18} style={{ color }} /></div>}
      </div>
    </Card>
  );
}

function NavTab({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[9px] font-bold transition-all"
      style={{ color: active ? BRAND.primary : "#94A3B8" }}>
      <div className={`rounded-xl p-1.5 transition-all ${active ? "bg-red-50" : ""}`}><Icon size={18} /></div>
      <span className="truncate w-full text-center">{label}</span>
      {!!badge && <span className="absolute right-0 top-0 rounded-full bg-red-600 px-1 py-0.5 text-[8px] text-white font-black min-w-[14px] text-center">{badge}</span>}
    </button>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: BRAND.light }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 animate-spin" style={{ borderTopColor: BRAND.primary }} />
        <p className="text-sm font-bold text-slate-400">Loading PowerMate…</p>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = true, count }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{count}</span>}
        <span className="ml-auto text-slate-400">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      <AnimatePresence>
        {open && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{children}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

// ─── Digital Signature Pad ────────────────────────────────────────────────────
function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1C1C1C";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function end(e) { e.preventDefault(); drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  function save() {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer Signature</p>
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden">
        <canvas ref={canvasRef} width={340} height={160} className="w-full touch-none"
          onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={end} />
      </div>
      <p className="text-xs text-slate-400 text-center">Sign above with finger or stylus</p>
      <div className="flex gap-2">
        <Btn variant="secondary" size="sm" onClick={clear}>Clear</Btn>
        <Btn size="sm" className="flex-1" onClick={save}><Check size={13} />Save Signature</Btn>
        <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("PowerMate error:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: BRAND.light }}>
          <Card className="max-w-sm w-full p-8 space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-black text-slate-900">Something went wrong</h2>
            <p className="text-sm text-slate-500">Please refresh and try again.</p>
            <Btn className="w-full" onClick={() => window.location.reload()}>Reload App</Btn>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── PIN Setup ────────────────────────────────────────────────────────────────
function PINSetupScreen({ onComplete }) {
  const [pin, setPIN] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState("set");
  const [error, setError] = useState("");

  function handleDigit(d) {
    if (step === "set") {
      const next = (pin + d).slice(0, 6);
      setPIN(next);
      if (next.length === 6) { setStep("confirm"); setError(""); }
    } else {
      const next = (confirm + d).slice(0, 6);
      setConfirm(next);
      if (next.length === 6) {
        if (next === pin) { savePIN(pin); }
        else { setError("PINs don't match. Try again."); setConfirm(""); setPIN(""); setStep("set"); }
      }
    }
  }

  async function savePIN(p) {
    const hash = await hashPIN(p);
    localStorage.setItem(PIN_KEY, hash);
    setSessionUnlocked();
    await requestNotificationPermission();
    onComplete();
  }

  const current = step === "set" ? pin : confirm;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: BRAND.primary }}>
            <Shield size={28} color="white" />
          </div>
          <h1 className="text-xl font-black text-slate-900">{step === "set" ? "Set Your PIN" : "Confirm PIN"}</h1>
          <p className="mt-1 text-sm text-slate-500">{step === "set" ? "Choose a 6-digit PIN" : "Re-enter to confirm"}</p>
        </div>
        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-4 h-4 rounded-full transition-all ${i < current.length ? "scale-110" : ""}`}
              style={{ background: i < current.length ? BRAND.primary : "#E2E8F0" }} />
          ))}
        </div>
        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d, i) => (
            <button key={i}
              onClick={() => { if (d === "⌫") { step === "set" ? setPIN(p => p.slice(0,-1)) : setConfirm(c => c.slice(0,-1)); } else if (d !== "") handleDigit(String(d)); }}
              className={`h-16 rounded-2xl text-xl font-black transition-all active:scale-95 ${d === "" ? "invisible" : "bg-white shadow-sm border border-slate-100 text-slate-800 hover:border-red-200"}`}>
              {d}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── PIN Lock ─────────────────────────────────────────────────────────────────
function PINLockScreen({ onUnlock, onForgot }) {
  const [pin, setPIN] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  async function handleDigit(d) {
    const next = (pin + d).slice(0, 6);
    setPIN(next);
    if (next.length === 6) {
      const hash = await hashPIN(next);
      if (hash === getPINHash()) { setSessionUnlocked(); onUnlock(); }
      else {
        setError("Incorrect PIN");
        setShake(true);
        setTimeout(() => { setShake(false); setPIN(""); setError(""); }, 600);
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <img src={BRAND.logo} alt="Power Works" className="mx-auto mb-4 h-12 object-contain" onError={e => e.target.style.display = "none"} />
          <h1 className="text-xl font-black text-slate-900">Enter PIN</h1>
          <p className="mt-1 text-sm text-slate-500">Unlock PowerMate</p>
        </div>
        <motion.div animate={shake ? { x: [-8,8,-8,8,0] } : {}} transition={{ duration: 0.4 }}>
          <div className="flex justify-center gap-3 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all ${i < pin.length ? "scale-110" : ""}`}
                style={{ background: i < pin.length ? BRAND.primary : "#E2E8F0" }} />
            ))}
          </div>
        </motion.div>
        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d, i) => (
            <button key={i}
              onClick={() => { if (d === "⌫") setPIN(p => p.slice(0,-1)); else if (d !== "") handleDigit(String(d)); }}
              className={`h-16 rounded-2xl text-xl font-black transition-all active:scale-95 ${d === "" ? "invisible" : "bg-white shadow-sm border border-slate-100 text-slate-800"}`}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={onForgot} className="mt-6 w-full text-center text-sm font-bold text-slate-400 hover:text-red-600 transition-colors">
          Forgot PIN? Sign in again
        </button>
      </motion.div>
    </div>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "error" });

  async function login() {
    if (!email || !password) { setMsg({ text: "Please enter email and password.", type: "error" }); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg({ text: error.message, type: "error" });
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src={BRAND.logo} alt="Power Works" className="mb-4 h-16 object-contain" onError={e => e.target.style.display = "none"} />
          <h1 className="text-2xl font-black" style={{ color: BRAND.primary }}>PowerMate</h1>
          <p className="mt-1 text-sm text-slate-400">Power Works Field Service CRM</p>
        </div>
        <Card className="p-6 space-y-4">
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@powerworks.com" type="email" />
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 pr-10 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {msg.text && <div className={`rounded-xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
          <Btn className="w-full" size="lg" onClick={login} disabled={loading}>{loading ? "Please wait…" : "Sign In"}</Btn>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Power Works (Pty) Ltd</p>
      </motion.div>
    </div>
  );
}

// ─── Home / Dashboard ─────────────────────────────────────────────────────────
function HomeScreen({ data, setScreen }) {
  const today = todayISO();
  const clients = data.clients || [];
  const quotes = data.quotes || [];
  const followups = data.followups || [];
  const jobcards = data.jobcards || [];
  const equipment = data.equipment || [];

  const todaysFollowups = followups.filter(f => f.date === today && !f.completed);
  const overdueFollowups = followups.filter(f => f.date < today && !f.completed);
  const pendingQuotes = quotes.filter(q => q.status === "Pending");
  const totalRevenue = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const openJobs = jobcards.filter(j => j.status !== "Completed" && j.status !== "Cancelled");
  const overdueService = equipment.filter(e => {
    const days = getDaysUntilService(e.nextServiceDate);
    return days !== null && days <= 14;
  });

  const pipelineCounts = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s] = clients.filter(c => (c.stage || "New Lead") === s).length;
    return acc;
  }, {});
  const wonClients = pipelineCounts["Won"] || 0;
  const convRate = clients.length > 0 ? Math.round((wonClients / clients.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-400">{niceDate()}</p>
        </div>
        <img src={BRAND.logo} alt="PW" className="h-8 object-contain opacity-80" onError={e => e.target.style.display = "none"} />
      </div>

      {/* Alerts */}
      {overdueFollowups.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-3 cursor-pointer" onClick={() => setScreen("Followups")}>
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <p className="text-sm font-bold text-red-700 flex-1">{overdueFollowups.length} overdue follow-up{overdueFollowups.length !== 1 ? "s" : ""}</p>
          <ChevronRight size={14} className="text-red-400" />
        </div>
      )}
      {overdueService.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-3 cursor-pointer" onClick={() => setScreen("Equipment")}>
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm font-bold text-amber-700 flex-1">{overdueService.length} equipment item{overdueService.length !== 1 ? "s" : ""} due for service</p>
          <ChevronRight size={14} className="text-amber-400" />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Tasks" value={todaysFollowups.length} sub="follow-ups due" color={BRAND.primary} icon={Calendar} />
        <StatCard label="Open Jobs" value={openJobs.length} sub="field service jobs" color="#7C3AED" icon={Wrench} />
        <StatCard label="Won Revenue" value={`R${Math.round(totalRevenue/1000)}k`} sub="accepted quotes" color="#16A34A" icon={TrendingUp} />
        <StatCard label="Win Rate" value={`${convRate}%`} sub={`${wonClients}/${clients.length} clients`} color="#D97706" icon={Target} />
      </div>

      {/* Pipeline */}
      <Card className="p-4">
        <p className="mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Sales Pipeline</p>
        <div className="space-y-2">
          {PIPELINE_STAGES.filter(s => s !== "Lost").map(stage => {
            const count = pipelineCounts[stage] || 0;
            const max = Math.max(...Object.values(pipelineCounts), 1);
            const c = STAGE_COLORS[stage];
            return (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-20 text-xs font-bold shrink-0" style={{ color: c.text }}>{stage}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(count/max)*100}%`, background: c.dot }} />
                </div>
                <span className="text-xs font-black text-slate-500 w-4 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick nav */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Users, label: "Clients", key: "Clients", count: clients.length },
          { icon: Calendar, label: "Follow-ups", key: "Followups", count: followups.length },
          { icon: FileIcon, label: "Quotes", key: "Quotes", count: quotes.length },
          { icon: Wrench, label: "Field Jobs", key: "JobCards", count: jobcards.length },
          { icon: Package, label: "Equipment", key: "Equipment", count: equipment.length },
          { icon: DollarSign, label: "Expenses", key: "Expenses", count: (data.expenses||[]).length },
        ].map(({ icon: Icon, label, key, count }) => (
          <Card key={key} className="p-3" onClick={() => setScreen(key)}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="rounded-lg p-1.5" style={{ background: BRAND.light }}><Icon size={14} style={{ color: BRAND.primary }} /></div>
              <ChevronRight size={12} className="text-slate-300" />
            </div>
            <p className="text-lg font-black text-slate-900">{count}</p>
            <p className="text-[10px] text-slate-400 font-bold">{label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Clients (3-level hierarchy) ──────────────────────────────────────────────
function ClientsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("All");
  const [editId, setEditId] = useState(null);
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [form, setForm] = useState({ company: "", site: "", subsite: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "" });

  const clients = data.clients || [];

  function resetForm() { setForm({ company: "", site: "", subsite: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "" }); setEditId(null); setShowForm(false); }

  async function saveClient() {
    if (!form.company.trim()) { alert("Company name is required."); return; }
    if (editId) {
      const updated = clients.map(c => c.id === editId ? { ...c, ...form, sync_status: "pending" } : c);
      setData(d => ({ ...d, clients: updated }));
      await offlineSave("companies", { ...clients.find(c => c.id === editId), ...form, sync_status: "pending" });
    } else {
      const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({ ...d, clients: [item, ...(d.clients||[])], syncQueue: [{ id: genId(), table: "companies", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] }));
      await offlineSave("companies", item);
    }
    resetForm();
  }

  async function deleteClient(id) {
    if (!window.confirm("Delete this client?")) return;
    setData(d => ({ ...d, clients: (d.clients||[]).filter(c => c.id !== id) }));
    await offlineDelete("companies", id);
  }

  function startEdit(c) { setForm({ company: c.company||"", site: c.site||"", subsite: c.subsite||"", contact: c.contact||"", phone: c.phone||"", email: c.email||"", stage: c.stage||"New Lead", notes: c.notes||"" }); setEditId(c.id); setShowForm(true); }

  function toggleCompany(name) { setExpandedCompanies(e => ({ ...e, [name]: !e[name] })); }

  const filtered = clients
    .filter(c => filterStage === "All" || (c.stage||"New Lead") === filterStage)
    .filter(c => !search || [c.company, c.site, c.subsite, c.contact].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  // 3-level grouping: company → site → subsite
  const grouped = {};
  filtered.forEach(c => {
    const comp = c.company || "Unknown";
    const site = c.site || "";
    if (!grouped[comp]) grouped[comp] = {};
    if (!grouped[comp][site]) grouped[comp][site] = [];
    grouped[comp][site].push(c);
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Clients" subtitle={`${clients.length} total`}
        action={<Btn size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <X size={14}/> : <Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId ? "Edit Client" : "New Client"}</p>
              <Field label="Company" value={form.company} onChange={v=>setForm(f=>({...f,company:v}))} placeholder="e.g. Anglo American" required />
              <Field label="Site / Mine" value={form.site} onChange={v=>setForm(f=>({...f,site:v}))} placeholder="e.g. Mogalakwena Mine" hint="Second level grouping" />
              <Field label="Sub-site / Shaft / Division" value={form.subsite} onChange={v=>setForm(f=>({...f,subsite:v}))} placeholder="e.g. Shaft 3, North Plant" hint="Third level grouping" />
              <Field label="Contact Person" value={form.contact} onChange={v=>setForm(f=>({...f,contact:v}))} placeholder="Contact name" />
              <Field label="Phone" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} placeholder="Phone number" type="tel" />
              <Field label="Email" value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} placeholder="Email address" type="email" />
              <SelectField label="Pipeline Stage" value={form.stage} onChange={v=>setForm(f=>({...f,stage:v}))} options={PIPELINE_STAGES} />
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Any notes about this client…" multiline />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveClient}><Save size={14}/>{editId?"Update":"Add Client"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All",...PIPELINE_STAGES].map(s => (
          <button key={s} onClick={() => setFilterStage(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterStage===s?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
            style={filterStage===s?{background:BRAND.primary}:{}}>
            {s}
          </button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 && <Empty title="No clients found" text="Add your first client or adjust filters." icon={Users} />}

      <div className="space-y-3">
        {Object.entries(grouped).map(([companyName, sites]) => {
          const isOpen = expandedCompanies[companyName] !== false;
          const totalBranches = Object.values(sites).flat().length;
          return (
            <Card key={companyName} className="overflow-hidden">
              <button onClick={() => toggleCompany(companyName)} className="flex items-center justify-between gap-3 w-full px-4 py-3 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black" style={{ background: BRAND.primary }}>
                    {companyName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">{companyName}</p>
                    <p className="text-xs text-slate-400">{Object.keys(sites).length} site{Object.keys(sites).length!==1?"s":""} · {totalBranches} contact{totalBranches!==1?"s":""}</p>
                  </div>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }}>
                    {Object.entries(sites).map(([siteName, contacts]) => (
                      <div key={siteName} className="border-t border-slate-50">
                        {siteName && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50">
                            <Building size={12} className="text-slate-400" />
                            <p className="text-xs font-bold text-slate-600">{siteName}</p>
                          </div>
                        )}
                        {contacts.map(c => (
                          <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3 border-t border-slate-50 first:border-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {c.subsite && <p className="text-xs font-bold text-slate-700">↳ {c.subsite}</p>}
                                <StagePill stage={c.stage||"New Lead"} />
                              </div>
                              {c.contact && <p className="text-xs text-slate-600 mt-0.5">{c.contact}</p>}
                              {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                              {c.sync_status==="pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={()=>startEdit(c)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13}/></button>
                              <button onClick={()=>deleteClient(c.id)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={13}/></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────
function FollowupsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState({ title: "", client: "", date: todayISO(), reminderTime: "08:00", notes: "" });

  const followups = data.followups || [];
  const today = todayISO();

  async function addFollowup() {
    if (!form.title.trim()) { alert("Please enter a follow-up title."); return; }
    const item = { id: genId(), user_id: userId, ...form, completed: false, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => {
      const updated = { ...d, followups: [item, ...(d.followups||[])], syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] };
      scheduleReminders(updated.followups, updated.notes||[]);
      return updated;
    });
    await offlineSave("followups", item);
    setForm({ title: "", client: "", date: todayISO(), reminderTime: "08:00", notes: "" });
    setShowForm(false);
  }

  async function toggleDone(id) {
    const target = followups.find(f => f.id === id);
    const updated = { ...target, completed: !target.completed, sync_status: "pending" };
    setData(d => ({ ...d, followups: (d.followups||[]).map(f => f.id===id ? updated : f) }));
    await offlineSave("followups", updated);
  }

  async function deleteFollowup(id) {
    if (!window.confirm("Delete this follow-up?")) return;
    setData(d => ({ ...d, followups: (d.followups||[]).filter(f => f.id!==id) }));
    await offlineDelete("followups", id);
  }

  const filtered = followups
    .filter(f => !search || [f.title, f.client].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .filter(f => {
      if (filter==="Today") return f.date===today && !f.completed;
      if (filter==="Overdue") return f.date<today && !f.completed;
      if (filter==="Done") return f.completed;
      return true;
    })
    .sort((a,b) => a.completed - b.completed || a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <PageHeader title="Follow-ups" subtitle={`${followups.filter(f=>!f.completed).length} pending`}
        action={<Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <Field label="Follow-up" value={form.title} onChange={v=>setForm(f=>({...f,title:v}))} placeholder="e.g. Call mine buyer" required />
              <Field label="Client" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} placeholder="Company / site" />
              <Field label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} />
              <Field label="Reminder Time" type="time" value={form.reminderTime} onChange={v=>setForm(f=>({...f,reminderTime:v}))} hint="You'll get a push notification at this time" />
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Additional details…" multiline />
              <Btn className="w-full" onClick={addFollowup}><Bell size={14}/>Set Follow-up + Reminder</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search follow-ups…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All","Today","Overdue","Done"].map(f => (
          <button key={f} onClick={()=>setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filter===f?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
            style={filter===f?{background:f==="Overdue"?"#DC2626":BRAND.primary}:{}}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length===0 && <Empty title="No follow-ups" text="Add a follow-up with a reminder." icon={Calendar} />}

      <div className="space-y-2">
        {filtered.map(f => (
          <Card key={f.id} className="flex items-center gap-3 p-3">
            <button onClick={()=>toggleDone(f.id)}
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${f.completed?"bg-green-100 text-green-600":f.date<today?"bg-red-100 text-red-500":"bg-slate-100 text-slate-400"}`}>
              <Check size={15}/>
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${f.completed?"line-through text-slate-400":"text-slate-900"}`}>{f.title}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-slate-400">{f.client||"No client"} · {smartDate(f.date)}</p>
                {f.reminderTime && <span className="flex items-center gap-1 text-xs text-blue-500"><Bell size={10}/>{f.reminderTime}</span>}
              </div>
            </div>
            {f.date<today && !f.completed && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">Overdue</span>}
            <button onClick={()=>deleteFollowup(f.id)} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Quotes ───────────────────────────────────────────────────────────────────
function QuotesScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ client_name: "", description: "", value: "", status: "Pending", validUntil: "" });

  const quotes = data.quotes || [];

  function resetForm() { setForm({ client_name:"", description:"", value:"", status:"Pending", validUntil:"" }); setEditId(null); setShowForm(false); }

  async function saveQuote() {
    if (!form.description.trim()) { alert("Please enter a quote description."); return; }
    if (editId) {
      const updated = quotes.map(q => q.id===editId ? {...q,...form,value:parseFloat(form.value||0),sync_status:"pending"} : q);
      setData(d => ({ ...d, quotes: updated }));
      await offlineSave("quotes", { ...quotes.find(q=>q.id===editId), ...form, value: parseFloat(form.value||0), sync_status: "pending" });
    } else {
      const item = { id: genId(), user_id: userId, ...form, value: parseFloat(form.value||0), sent_date: todayISO(), created_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({ ...d, quotes: [item,...(d.quotes||[])], syncQueue: [{ id: genId(), table: "quotes", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] }));
      await offlineSave("quotes", item);
    }
    resetForm();
  }

  async function deleteQuote(id) {
    if (!window.confirm("Delete this quote?")) return;
    setData(d => ({ ...d, quotes: (d.quotes||[]).filter(q=>q.id!==id) }));
    await offlineDelete("quotes", id);
  }

  const filtered = quotes
    .filter(q => filterStatus==="All" || q.status===filterStatus)
    .filter(q => !search || [q.client_name, q.description].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  const totalValue = filtered.reduce((s,q) => s+parseFloat(q.value||0), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Quotes" subtitle={`${quotes.length} total · ${formatCurrency(totalValue)}`}
        action={<Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId?"Edit Quote":"New Quote"}</p>
              <Field label="Client" value={form.client_name} onChange={v=>setForm(f=>({...f,client_name:v}))} placeholder="Client / branch" />
              <Field label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="What the quote covers" multiline required />
              <Field label="Value (R)" type="number" value={form.value} onChange={v=>setForm(f=>({...f,value:v}))} placeholder="0.00" />
              <Field label="Valid Until" type="date" value={form.validUntil} onChange={v=>setForm(f=>({...f,validUntil:v}))} />
              <SelectField label="Status" value={form.status} onChange={v=>setForm(f=>({...f,status:v}))} options={["Pending","Accepted","Rejected","Expired"]} />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveQuote}><Save size={14}/>{editId?"Update":"Add Quote"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search quotes…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All","Pending","Accepted","Rejected","Expired"].map(s => (
          <button key={s} onClick={()=>setFilterStatus(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterStatus===s?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
            style={filterStatus===s?{background:BRAND.primary}:{}}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length===0 && <Empty title="No quotes found" text="Add a quote or change filters." icon={FileIcon} />}

      <div className="space-y-2">
        {filtered.map(q => {
          const sc = QUOTE_STATUS_COLORS[q.status]||QUOTE_STATUS_COLORS.Pending;
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 truncate">{q.client_name||"Unknown client"}</p>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{background:sc.bg,color:sc.text}}>{q.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{q.description}</p>
                  <p className="mt-1 text-base font-black" style={{color:BRAND.primary}}>{formatCurrency(q.value)}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {q.sent_date && <p className="text-xs text-slate-400">Sent {smartDate(q.sent_date)}</p>}
                    {q.validUntil && <p className="text-xs text-slate-400">Valid until {smartDate(q.validUntil)}</p>}
                  </div>
                  {q.sync_status==="pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={()=>{ setForm({client_name:q.client_name||"",description:q.description||"",value:String(q.value||""),status:q.status||"Pending",validUntil:q.validUntil||""}); setEditId(q.id); setShowForm(true); }} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13}/></button>
                  <button onClick={()=>deleteQuote(q.id)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={13}/></button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Notes with reminder ──────────────────────────────────────────────────────
function NotesScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ client: "", note: "", reminderDate: "", reminderTime: "08:00", tag: "" });

  const notes = data.notes || [];
  const NOTE_TAGS = ["General", "Site Visit", "Call", "Meeting", "Urgent", "Follow-up needed"];

  async function addNote() {
    if (!form.note.trim()) { alert("Please enter a note."); return; }
    const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => {
      const updated = { ...d, notes: [item,...(d.notes||[])], syncQueue: [{ id: genId(), table: "notes", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] };
      scheduleReminders(updated.followups||[], updated.notes);
      return updated;
    });
    await offlineSave("notes", item);
    setForm({ client:"", note:"", reminderDate:"", reminderTime:"08:00", tag:"" });
    setShowForm(false);
  }

  async function deleteNote(id) {
    if (!window.confirm("Delete this note?")) return;
    setData(d => ({ ...d, notes: (d.notes||[]).filter(n=>n.id!==id) }));
    await offlineDelete("notes", id);
  }

  const filtered = notes.filter(n => !search || [n.client, n.note, n.tag].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  const TAG_COLORS = { General:"#64748B", "Site Visit":"#7C3AED", Call:"#0284C7", Meeting:"#15803D", Urgent:"#DC2626", "Follow-up needed":"#D97706" };

  return (
    <div className="space-y-4">
      <PageHeader title="Field Notes" subtitle={`${notes.length} notes`}
        action={<Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <Field label="Client / Branch" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} placeholder="Client name" />
              <SelectField label="Tag" value={form.tag} onChange={v=>setForm(f=>({...f,tag:v}))} options={NOTE_TAGS} />
              <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} placeholder="Type your note…" multiline required />
              <div className="rounded-xl bg-blue-50 p-3 space-y-2">
                <p className="text-xs font-bold text-blue-700">🔔 Set a reminder (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Reminder Date" type="date" value={form.reminderDate} onChange={v=>setForm(f=>({...f,reminderDate:v}))} />
                  <Field label="Reminder Time" type="time" value={form.reminderTime} onChange={v=>setForm(f=>({...f,reminderTime:v}))} />
                </div>
              </div>
              <Btn className="w-full" onClick={addNote}><Plus size={14}/>Add Note</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search notes…" />

      {filtered.length===0 && <Empty title="No notes yet" text="Add your first field note." icon={Clipboard} />}

      <div className="space-y-2">
        {filtered.map(n => (
          <Card key={n.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-bold text-slate-900">{n.client||"General Note"}</p>
                  {n.tag && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{background:TAG_COLORS[n.tag]||"#64748B"}}>{n.tag}</span>}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{n.note}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <p className="text-xs text-slate-400">{n.created_at ? new Date(n.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}</p>
                  {n.reminderDate && <span className="flex items-center gap-1 text-xs text-blue-500 font-bold"><Bell size={10}/>{smartDate(n.reminderDate)} {n.reminderTime}</span>}
                </div>
                {n.sync_status==="pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
              </div>
              <button onClick={()=>deleteNote(n.id)} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Equipment Register ───────────────────────────────────────────────────────
function EquipmentScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [form, setForm] = useState({ name:"", type:"Generator", make:"", model:"", serialNumber:"", location:"", clientId:"", nextServiceDate:"", notes:"" });

  const equipment = data.equipment || [];
  const clients = data.clients || [];
  const clientOptions = clients.map(c => ({ value: c.id, label: `${c.company}${c.site?" – "+c.site:""}${c.subsite?" / "+c.subsite:""}` }));

  function resetForm() { setForm({ name:"",type:"Generator",make:"",model:"",serialNumber:"",location:"",clientId:"",nextServiceDate:"",notes:"" }); setShowForm(false); }

  async function saveEquipment() {
    if (!form.name.trim() && !form.serialNumber.trim()) { alert("Please enter equipment name or serial number."); return; }
    const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({ ...d, equipment: [item,...(d.equipment||[])], syncQueue: [{ id: genId(), table: "equipment", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] }));
    await offlineSave("equipment", item);
    resetForm();
  }

  async function deleteEquipment(id) {
    if (!window.confirm("Delete this equipment?")) return;
    setData(d => ({ ...d, equipment: (d.equipment||[]).filter(e=>e.id!==id) }));
    await offlineDelete("equipment", id);
  }

  const filtered = equipment
    .filter(e => filterType==="All" || e.type===filterType)
    .filter(e => !search || [e.name, e.make, e.model, e.serialNumber, e.location].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  function serviceBadge(dateStr) {
    const days = getDaysUntilService(dateStr);
    if (days === null) return null;
    if (days < 0) return { text: "Overdue", bg: "#FEE2E2", color: "#DC2626" };
    if (days <= 7) return { text: `${days}d`, bg: "#FEF3C7", color: "#D97706" };
    if (days <= 30) return { text: `${days}d`, bg: "#DBEAFE", color: "#2563EB" };
    return { text: `${days}d`, bg: "#F0FDF4", color: "#16A34A" };
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Equipment Register" subtitle={`${equipment.length} items`}
        action={<Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">Register Equipment</p>
              <Field label="Equipment Name / Description" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. 500kVA Generator" />
              <SelectField label="Type" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} options={EQUIPMENT_TYPES} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make / Brand" value={form.make} onChange={v=>setForm(f=>({...f,make:v}))} placeholder="e.g. Cummins" />
                <Field label="Model" value={form.model} onChange={v=>setForm(f=>({...f,model:v}))} placeholder="e.g. C500D5" />
              </div>
              <Field label="Serial Number" value={form.serialNumber} onChange={v=>setForm(f=>({...f,serialNumber:v}))} placeholder="Serial number" hint="Unique identifier for this unit" />
              <Field label="Location / Site" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="e.g. Main plant room, Shaft 3" />
              <SelectField label="Client / Site" value={form.clientId} onChange={v=>setForm(f=>({...f,clientId:v}))} options={clientOptions} />
              <Field label="Next Service Date" type="date" value={form.nextServiceDate} onChange={v=>setForm(f=>({...f,nextServiceDate:v}))} hint="You'll be alerted 14 days before" />
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Any additional notes…" multiline />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveEquipment}><Package size={14}/>Register Equipment</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by name, serial, make…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All",...EQUIPMENT_TYPES].map(t => (
          <button key={t} onClick={()=>setFilterType(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterType===t?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
            style={filterType===t?{background:BRAND.primary}:{}}>
            {t}
          </button>
        ))}
      </div>

      {filtered.length===0 && <Empty title="No equipment found" text="Register your first piece of equipment." icon={Package} />}

      <div className="space-y-2">
        {filtered.map(e => {
          const badge = serviceBadge(e.nextServiceDate);
          const linkedClient = clients.find(c=>c.id===e.clientId);
          return (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold text-white" style={{background:BRAND.primary}}>{e.type}</span>
                    {badge && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{background:badge.bg,color:badge.color}}>Service: {badge.text}</span>}
                  </div>
                  <p className="mt-1 font-bold text-slate-900 text-sm">{e.name||`${e.make} ${e.model}`}</p>
                  <div className="mt-1 space-y-0.5">
                    {e.serialNumber && <p className="text-xs text-slate-500 flex items-center gap-1"><Hash size={10}/>{e.serialNumber}</p>}
                    {(e.make||e.model) && <p className="text-xs text-slate-500">{[e.make,e.model].filter(Boolean).join(" · ")}</p>}
                    {e.location && <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={10}/>{e.location}</p>}
                    {linkedClient && <p className="text-xs text-slate-500 flex items-center gap-1"><Building size={10}/>{linkedClient.company}{linkedClient.site?" – "+linkedClient.site:""}</p>}
                  </div>
                  {e.sync_status==="pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                </div>
                <button onClick={()=>deleteEquipment(e.id)} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Job Cards ────────────────────────────────────────────────────────────────
function JobCardsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [activeJob, setActiveJob] = useState(null);
  const [showSig, setShowSig] = useState(false);
  const [form, setForm] = useState({ title:"", clientId:"", equipmentId:"", description:"", status:"Open", priority:"Normal", scheduledDate: todayISO() });

  const jobcards = data.jobcards || [];
  const clients = data.clients || [];
  const equipment = data.equipment || [];

  function resetForm() { setForm({ title:"",clientId:"",equipmentId:"",description:"",status:"Open",priority:"Normal",scheduledDate:todayISO() }); setShowForm(false); }

  async function saveJob() {
    if (!form.title.trim()) { alert("Please enter a job title."); return; }
    const item = { id: genId(), user_id: userId, ...form, signature: null, closedAt: null, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({ ...d, jobcards: [item,...(d.jobcards||[])], syncQueue: [{ id: genId(), table: "jobcards", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] }));
    await offlineSave("jobcards", item);
    resetForm();
  }

  async function updateJobStatus(id, status) {
    const updated = jobcards.map(j => j.id===id ? { ...j, status, closedAt: status==="Completed"?new Date().toISOString():j.closedAt, sync_status:"pending" } : j);
    setData(d => ({ ...d, jobcards: updated }));
    await offlineSave("jobcards", updated.find(j=>j.id===id));
  }

  async function saveSignature(id, sigDataUrl) {
    const updated = jobcards.map(j => j.id===id ? { ...j, signature: sigDataUrl, sync_status:"pending" } : j);
    setData(d => ({ ...d, jobcards: updated }));
    await offlineSave("jobcards", updated.find(j=>j.id===id));
    setShowSig(false);
    setActiveJob(null);
  }

  async function deleteJob(id) {
    if (!window.confirm("Delete this job card?")) return;
    setData(d => ({ ...d, jobcards: (d.jobcards||[]).filter(j=>j.id!==id) }));
    await offlineDelete("jobcards", id);
  }

  const filtered = jobcards
    .filter(j => filterStatus==="All" || j.status===filterStatus)
    .filter(j => !search || [j.title, j.description].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => new Date(b.created_at)-new Date(a.created_at));

  const PRIORITY_COLORS = { Normal:{bg:"#F1F5F9",text:"#64748B"}, High:{bg:"#FEF3C7",text:"#D97706"}, Urgent:{bg:"#FEE2E2",text:"#DC2626"} };

  return (
    <div className="space-y-4">
      <PageHeader title="Field Jobs" subtitle={`${jobcards.filter(j=>j.status!=="Completed"&&j.status!=="Cancelled").length} open`}
        action={<Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"New Job"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">New Job Card</p>
              <Field label="Job Title" value={form.title} onChange={v=>setForm(f=>({...f,title:v}))} placeholder="e.g. Generator service – Shaft 3" required />
              <SelectField label="Client" value={form.clientId} onChange={v=>setForm(f=>({...f,clientId:v}))} options={clients.map(c=>({value:c.id,label:`${c.company}${c.site?" – "+c.site:""}`}))} />
              <SelectField label="Equipment" value={form.equipmentId} onChange={v=>setForm(f=>({...f,equipmentId:v}))} options={equipment.map(e=>({value:e.id,label:`${e.name||e.type} – S/N: ${e.serialNumber||"N/A"}`}))} />
              <Field label="Description / Fault" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="Describe the work to be done…" multiline />
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Priority" value={form.priority} onChange={v=>setForm(f=>({...f,priority:v}))} options={["Normal","High","Urgent"]} />
                <Field label="Scheduled Date" type="date" value={form.scheduledDate} onChange={v=>setForm(f=>({...f,scheduledDate:v}))} />
              </div>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveJob}><Wrench size={14}/>Create Job Card</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search jobs…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All",...JOB_STATUSES].map(s => (
          <button key={s} onClick={()=>setFilterStatus(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterStatus===s?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
            style={filterStatus===s?{background:BRAND.primary}:{}}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length===0 && <Empty title="No jobs found" text="Create your first job card." icon={Wrench} />}

      <div className="space-y-3">
        {filtered.map(j => {
          const linkedClient = clients.find(c=>c.id===j.clientId);
          const linkedEquip = equipment.find(e=>e.id===j.equipmentId);
          const pc = PRIORITY_COLORS[j.priority]||PRIORITY_COLORS.Normal;
          return (
            <Card key={j.id} className="overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <StatusPill status={j.status} colors={JOB_STATUS_COLORS} />
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{background:pc.bg,color:pc.text}}>{j.priority}</span>
                    </div>
                    <p className="font-bold text-slate-900 text-sm">{j.title}</p>
                    {linkedClient && <p className="text-xs text-slate-500 mt-0.5">{linkedClient.company}{linkedClient.site?" – "+linkedClient.site:""}</p>}
                    {linkedEquip && <p className="text-xs text-slate-400">{linkedEquip.name||linkedEquip.type} · S/N: {linkedEquip.serialNumber||"N/A"}</p>}
                    {j.description && <p className="mt-1 text-xs text-slate-600 line-clamp-2">{j.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">Scheduled: {smartDate(j.scheduledDate)}</p>
                    {j.signature && <p className="text-xs text-green-600 font-bold mt-0.5">✓ Customer signed</p>}
                  </div>
                  <button onClick={()=>deleteJob(j.id)} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>
                </div>

                {/* Job actions */}
                {j.status!=="Completed" && j.status!=="Cancelled" && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {j.status==="Open" && <Btn size="sm" variant="warning" onClick={()=>updateJobStatus(j.id,"In Progress")}><Zap size={12}/>Start Job</Btn>}
                    {j.status==="In Progress" && <Btn size="sm" variant="success" onClick={()=>updateJobStatus(j.id,"Completed")}><Check size={12}/>Complete</Btn>}
                    {!j.signature && (
                      <Btn size="sm" variant="outline" onClick={()=>{ setActiveJob(j.id); setShowSig(true); }}>
                        <PenTool size={12}/>Get Signature
                      </Btn>
                    )}
                    <Btn size="sm" variant="secondary" onClick={()=>updateJobStatus(j.id,"Cancelled")}>Cancel Job</Btn>
                  </div>
                )}
              </div>

              {/* Signature panel */}
              {showSig && activeJob===j.id && (
                <div className="border-t border-slate-100 p-4">
                  <SignaturePad onSave={(sig)=>saveSignature(j.id,sig)} onCancel={()=>{ setShowSig(false); setActiveJob(null); }} />
                </div>
              )}
              {j.signature && (
                <div className="border-t border-slate-100 p-3">
                  <p className="text-xs font-bold text-slate-500 mb-2">Customer Signature</p>
                  <img src={j.signature} alt="Signature" className="h-16 object-contain border border-slate-100 rounded-lg" />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
function ExpensesScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ type:"Fuel", amount:"", description:"", jobId:"", date: todayISO() });

  const expenses = data.expenses || [];
  const jobcards = data.jobcards || [];

  async function saveExpense() {
    if (!form.amount || parseFloat(form.amount)<=0) { alert("Please enter an amount."); return; }
    const item = { id: genId(), user_id: userId, ...form, amount: parseFloat(form.amount), created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({ ...d, expenses: [item,...(d.expenses||[])], syncQueue: [{ id: genId(), table: "expenses", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])] }));
    await offlineSave("expenses", item);
    setForm({ type:"Fuel", amount:"", description:"", jobId:"", date: todayISO() });
    setShowForm(false);
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    setData(d => ({ ...d, expenses: (d.expenses||[]).filter(e=>e.id!==id) }));
    await offlineDelete("expenses", id);
  }

  const filtered = expenses.filter(e => !search || [e.type, e.description].some(x => x?.toLowerCase().includes(search.toLowerCase())));
  const totalExpenses = filtered.reduce((s,e) => s+parseFloat(e.amount||0), 0);

  const TYPE_ICONS = { Fuel:"⛽", Accommodation:"🏨", Materials:"🔧", Toll:"🚗", Parking:"🅿️", Other:"💳" };

  return (
    <div className="space-y-4">
      <PageHeader title="Expenses" subtitle={`Total: ${formatCurrency(totalExpenses)}`}
        action={<Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <SelectField label="Type" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} options={EXPENSE_TYPES} />
              <Field label="Amount (R)" type="number" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} placeholder="0.00" required />
              <Field label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="e.g. Fuel to Mogalakwena Mine" />
              <SelectField label="Linked Job (optional)" value={form.jobId} onChange={v=>setForm(f=>({...f,jobId:v}))} options={jobcards.map(j=>({value:j.id,label:j.title}))} />
              <Field label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} />
              <Btn className="w-full" onClick={saveExpense}><DollarSign size={14}/>Add Expense</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search expenses…" />

      {filtered.length===0 && <Empty title="No expenses" text="Log your first expense claim." icon={DollarSign} />}

      <div className="space-y-2">
        {filtered.map(e => {
          const linkedJob = jobcards.find(j=>j.id===e.jobId);
          return (
            <Card key={e.id} className="flex items-center gap-3 p-4">
              <div className="text-2xl w-10 text-center shrink-0">{TYPE_ICONS[e.type]||"💳"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">{e.type}</p>
                  <p className="text-sm font-black" style={{color:BRAND.primary}}>{formatCurrency(e.amount)}</p>
                </div>
                {e.description && <p className="text-xs text-slate-500 truncate">{e.description}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-400">{smartDate(e.date)}</p>
                  {linkedJob && <p className="text-xs text-blue-500">· {linkedJob.title}</p>}
                </div>
                {e.sync_status==="pending" && <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
              </div>
              <button onClick={()=>deleteExpense(e.id)} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Media Gallery ────────────────────────────────────────────────────────────
function MediaScreen({ data, setData, userId }) {
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [form, setForm] = useState({ caption:"", clientId:"", jobId:"" });
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const media = data.media || [];
  const clients = data.clients || [];
  const jobcards = data.jobcards || [];

  async function handlePhotoUpload(files) {
    if (!files || files.length===0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        // Compress image using canvas
        const compressed = await compressImage(file, 1200, 0.85);
        const base64 = await fileToBase64(compressed);
        const originalSize = (file.size/1024).toFixed(0);
        const compressedSize = (compressed.size/1024).toFixed(0);

        let publicUrl = null;
        // Try Supabase upload if online
        try {
          const fileName = `${userId}/${Date.now()}_${file.name}`;
          const { data: uploadData } = await supabase.storage.from("powermate-media").upload(fileName, compressed, { contentType:"image/jpeg" });
          if (uploadData) {
            const { data: { publicUrl: url } } = supabase.storage.from("powermate-media").getPublicUrl(fileName);
            publicUrl = url;
          }
        } catch (uploadErr) { /* offline — use base64 */ }

        const item = {
          id: genId(), user_id: userId, type: "photo",
          caption: form.caption, clientId: form.clientId, jobId: form.jobId,
          base64, publicUrl, fileName: file.name,
          originalSize: `${originalSize}KB`, compressedSize: `${compressedSize}KB`,
          created_at: new Date().toISOString(), sync_status: publicUrl?"synced":"pending"
        };
        setData(d => ({ ...d, media: [item,...(d.media||[])] }));
        await offlineSave("media", { ...item, base64: item.base64.slice(0,100)+"..." }); // save without full base64 to IndexedDB
        localStorage.setItem(`media_b64_${item.id}`, item.base64); // store full base64 separately
      } catch (err) { console.error("Photo upload error:", err); }
    }
    setUploading(false);
    setForm(f=>({...f,caption:""}));
  }

  async function handleVideoUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      let publicUrl = null;
      let thumbnailBase64 = null;

      // Generate video thumbnail
      try {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        await new Promise(r => { video.onloadedmetadata = r; });
        video.currentTime = 1;
        await new Promise(r => { video.onseeked = r; });
        const canvas = document.createElement("canvas");
        canvas.width = 320; canvas.height = 180;
        canvas.getContext("2d").drawImage(video, 0, 0, 320, 180);
        thumbnailBase64 = canvas.toDataURL("image/jpeg", 0.7);
      } catch (e) { /* thumbnail failed */ }

      // Upload to Supabase storage
      try {
        const fileName = `${userId}/${Date.now()}_${file.name}`;
        const { data: uploadData } = await supabase.storage.from("powermate-media").upload(fileName, file, { contentType: file.type });
        if (uploadData) {
          const { data: { publicUrl: url } } = supabase.storage.from("powermate-media").getPublicUrl(fileName);
          publicUrl = url;
        }
      } catch (e) { /* offline */ }

      const item = {
        id: genId(), user_id: userId, type: "video",
        caption: form.caption, clientId: form.clientId, jobId: form.jobId,
        thumbnailBase64, publicUrl, fileName: file.name,
        fileSize: `${(file.size/1024/1024).toFixed(1)}MB`,
        created_at: new Date().toISOString(),
        sync_status: publicUrl?"synced":"pending",
        note: !publicUrl ? "Video will upload when connected" : null
      };
      setData(d => ({ ...d, media: [item,...(d.media||[])] }));
      await offlineSave("media", { ...item, thumbnailBase64: null });
      if (thumbnailBase64) localStorage.setItem(`media_thumb_${item.id}`, thumbnailBase64);
    } catch (err) { console.error("Video upload error:", err); }
    setUploading(false);
  }

  async function deleteMedia(id) {
    if (!window.confirm("Delete this media?")) return;
    setData(d => ({ ...d, media: (d.media||[]).filter(m=>m.id!==id) }));
    localStorage.removeItem(`media_b64_${id}`);
    localStorage.removeItem(`media_thumb_${id}`);
    await offlineDelete("media", id);
  }

  function getBase64(item) {
    if (item.base64 && item.base64.length > 100) return item.base64;
    return localStorage.getItem(`media_b64_${item.id}`) || localStorage.getItem(`media_thumb_${item.id}`);
  }

  const filtered = media
    .filter(m => filterType==="All" || m.type===filterType)
    .filter(m => !search || [m.caption, m.fileName].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4">
      <PageHeader title="Media Gallery" subtitle={`${media.length} files`} />

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Upload Media</p>
        <Field label="Caption" value={form.caption} onChange={v=>setForm(f=>({...f,caption:v}))} placeholder="Describe this photo/video…" />
        <SelectField label="Client (optional)" value={form.clientId} onChange={v=>setForm(f=>({...f,clientId:v}))} options={clients.map(c=>({value:c.id,label:c.company+(c.site?" – "+c.site:"")}))} />
        <SelectField label="Linked Job (optional)" value={form.jobId} onChange={v=>setForm(f=>({...f,jobId:v}))} options={jobcards.map(j=>({value:j.id,label:j.title}))} />
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={()=>fileInputRef.current?.click()} disabled={uploading}>
            <Camera size={14}/>{uploading?"Uploading…":"Photo"}
          </Btn>
          <Btn variant="secondary" onClick={()=>videoInputRef.current?.click()} disabled={uploading}>
            <Video size={14}/>Video
          </Btn>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>handlePhotoUpload(e.target.files)} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e=>handleVideoUpload(e.target.files[0])} />
        <p className="text-xs text-slate-400">Photos auto-compressed to 85% quality at max 1200px. Videos stored as link + thumbnail.</p>
      </Card>

      <SearchBar value={search} onChange={setSearch} placeholder="Search media…" />
      <div className="flex gap-2">
        {["All","photo","video"].map(t => (
          <button key={t} onClick={()=>setFilterType(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterType===t?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
            style={filterType===t?{background:BRAND.primary}:{}}>
            {t==="All"?"All":t==="photo"?"📷 Photos":"🎥 Videos"}
          </button>
        ))}
      </div>

      {filtered.length===0 && <Empty title="No media yet" text="Upload photos or videos from the field." icon={Image} />}

      <div className="grid grid-cols-2 gap-2">
        {filtered.map(m => {
          const src = m.publicUrl || getBase64(m);
          const linkedClient = clients.find(c=>c.id===m.clientId);
          const linkedJob = jobcards.find(j=>j.id===m.jobId);
          return (
            <Card key={m.id} className="overflow-hidden">
              <div className="relative aspect-video bg-slate-100">
                {src ? (
                  <img src={m.type==="video"?(m.thumbnailBase64||localStorage.getItem(`media_thumb_${m.id}`)||src):src}
                    alt={m.caption||m.fileName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    {m.type==="video"?<Video size={28}/>:<Image size={28}/>}
                  </div>
                )}
                {m.type==="video" && <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"><span className="text-white text-lg ml-1">▶</span></div></div>}
                {m.sync_status==="pending" && <div className="absolute top-1 right-1 rounded-full bg-amber-500 w-2 h-2" title="Not synced"/>}
              </div>
              <div className="p-2">
                {m.caption && <p className="text-xs font-bold text-slate-800 truncate">{m.caption}</p>}
                <p className="text-[10px] text-slate-400 truncate">{m.fileName}</p>
                {m.compressedSize && <p className="text-[10px] text-green-600">{m.originalSize} → {m.compressedSize}</p>}
                {m.fileSize && <p className="text-[10px] text-slate-400">{m.fileSize}</p>}
                {linkedClient && <p className="text-[10px] text-slate-400 truncate">{linkedClient.company}</p>}
                {linkedJob && <p className="text-[10px] text-blue-500 truncate">{linkedJob.title}</p>}
                <button onClick={()=>deleteMedia(m.id)} className="mt-1 text-[10px] text-red-400 font-bold">Delete</button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Settings / More ──────────────────────────────────────────────────────────
function MoreScreen({ data, onLogout, onSyncNow, syncing, isOnline }) {
  const pendingCount = (data.syncQueue||[]).filter(i=>i.status==="pending").length;

  function changePIN() { localStorage.removeItem(PIN_KEY); sessionStorage.removeItem(PIN_UNLOCKED_KEY); window.location.reload(); }

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Sync, security & account" />

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sync Status</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">{pendingCount} pending item{pendingCount!==1?"s":""}</p>
            <p className="text-xs text-slate-400">{isOnline?"Connected":"Offline — syncs when connected"}</p>
          </div>
          <Btn size="sm" variant={isOnline?"solid":"secondary"} onClick={onSyncNow} disabled={!isOnline||syncing||pendingCount===0}>
            <RefreshCw size={13} className={syncing?"animate-spin":""}/>{syncing?"Syncing…":"Sync Now"}
          </Btn>
        </div>
        <div className={`rounded-xl p-3 ${pendingCount>0?"bg-amber-50":"bg-green-50"}`}>
          <p className={`text-xs font-bold ${pendingCount>0?"text-amber-700":"text-green-700"}`}>
            {pendingCount>0?`⚠️ ${pendingCount} unsynced item${pendingCount!==1?"s":""}. Connect to sync.`:"✓ All data synced to cloud"}
          </p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Security</p>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-bold text-slate-800">PIN Lock</p><p className="text-xs text-slate-400">SHA-256 hashed 6-digit PIN</p></div>
          <Btn size="sm" variant="secondary" onClick={changePIN}><Shield size={13}/>Change PIN</Btn>
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-bold text-slate-800">Push Notifications</p><p className="text-xs text-slate-400">Follow-up & note reminders</p></div>
          <Btn size="sm" variant="outline" onClick={requestNotificationPermission}><Bell size={13}/>Enable</Btn>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Summary</p>
        {[
          { label:"Clients", count:(data.clients||[]).length, icon:Users },
          { label:"Follow-ups", count:(data.followups||[]).length, icon:Calendar },
          { label:"Quotes", count:(data.quotes||[]).length, icon:FileIcon },
          { label:"Equipment", count:(data.equipment||[]).length, icon:Package },
          { label:"Job Cards", count:(data.jobcards||[]).length, icon:Wrench },
          { label:"Expenses", count:(data.expenses||[]).length, icon:DollarSign },
          { label:"Media files", count:(data.media||[]).length, icon:Image },
          { label:"Notes", count:(data.notes||[]).length, icon:Clipboard },
        ].map(({ label, count, icon: Icon }) => (
          <div key={label} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2"><Icon size={13} className="text-slate-400"/><p className="text-sm text-slate-600">{label}</p></div>
            <p className="text-sm font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </Card>

      <Btn variant="danger" className="w-full" onClick={onLogout}><LogOut size={16}/>Log Out</Btn>
      <p className="text-center text-xs text-slate-300">PowerMate v3.0 · Power Works (Pty) Ltd</p>
    </div>
  );
}

// ─── Supabase sync ────────────────────────────────────────────────────────────
async function pushSyncQueue(syncQueue, setData) {
  const pending = (syncQueue||[]).filter(i=>i.status==="pending");
  if (pending.length===0) return;

  const results = await Promise.allSettled(
    pending.map(async (item) => {
      if (item.action==="insert"||item.action==="upsert") {
        const { error } = await supabase.from(item.table).upsert(item.data, { onConflict:"id" });
        if (error) throw error;
      } else if (item.action==="update") {
        const { error } = await supabase.from(item.table).update(item.data).eq("id", item.data.id);
        if (error) throw error;
      } else if (item.action==="delete") {
        const { error } = await supabase.from(item.table).delete().eq("id", item.data.id);
        if (error) throw error;
      }
      return item.id;
    })
  );

  const succeeded = results.filter(r=>r.status==="fulfilled").map(r=>r.value);
  setData(d => ({
    ...d,
    syncQueue: (d.syncQueue||[]).filter(i=>!succeeded.includes(i.id)),
    clients: (d.clients||[]).map(c => succeeded.includes(c.id)?{...c,sync_status:"synced"}:c),
    quotes: (d.quotes||[]).map(q => succeeded.includes(q.id)?{...q,sync_status:"synced"}:q),
    followups: (d.followups||[]).map(f => succeeded.includes(f.id)?{...f,sync_status:"synced"}:f),
    notes: (d.notes||[]).map(n => succeeded.includes(n.id)?{...n,sync_status:"synced"}:n),
    equipment: (d.equipment||[]).map(e => succeeded.includes(e.id)?{...e,sync_status:"synced"}:e),
    jobcards: (d.jobcards||[]).map(j => succeeded.includes(j.id)?{...j,sync_status:"synced"}:j),
    expenses: (d.expenses||[]).map(e => succeeded.includes(e.id)?{...e,sync_status:"synced"}:e),
  }));
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("Home");
  const [syncing, setSyncing] = useState(false);
  const [pinState, setPinState] = useState("checking");

  const [data, setData] = useState({
    clients:[], followups:[], quotes:[], notes:[],
    equipment:[], jobcards:[], expenses:[], media:[], syncQueue:[],
  });

  // Auth
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s||null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { mounted=false; subscription.unsubscribe(); };
  }, []);

  // PIN gate
  useEffect(() => {
    if (!session) return;
    const pinHash = getPINHash();
    if (!pinHash) { setPinState("setup"); return; }
    if (isSessionUnlocked()) { setPinState("unlocked"); return; }
    setPinState("locked");
  }, [session]);

  // Load data
  useEffect(() => {
    try { const s = localStorage.getItem("powermate_v3_data"); if (s) setData(d=>({...d,...JSON.parse(s)})); }
    catch(e) { console.warn(e); }
  }, []);

  // Save data
  useEffect(() => {
    try {
      // Don't save full base64 in main storage (stored separately per item)
      const toSave = { ...data, media: (data.media||[]).map(m=>({...m,base64:undefined,thumbnailBase64:undefined})) };
      localStorage.setItem("powermate_v3_data", JSON.stringify(toSave));
    } catch(e) { console.warn(e); }
  }, [data]);

  // Auto-sync
  useEffect(() => {
    if (!isOnline||!session) return;
    const pending = (data.syncQueue||[]).filter(i=>i.status==="pending");
    if (pending.length===0) return;
    const timer = setTimeout(()=>pushSyncQueue(data.syncQueue,setData), 3000);
    return ()=>clearTimeout(timer);
  }, [isOnline,session]);

  // Schedule reminders after unlock
  useEffect(() => {
    if (pinState==="unlocked") {
      scheduleReminders(data.followups||[], data.notes||[]);
    }
  }, [pinState]);

  // Service worker message
  useEffect(() => {
    const handler = (e) => { if (e.data?.type==="BACKGROUND_SYNC") pushSyncQueue(data.syncQueue,setData); };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [data.syncQueue]);

  async function handleSyncNow() { setSyncing(true); await pushSyncQueue(data.syncQueue,setData); setSyncing(false); }
  async function logout() { localStorage.removeItem(PIN_KEY); sessionStorage.removeItem(PIN_UNLOCKED_KEY); await supabase.auth.signOut(); setSession(null); }
  async function forgotPIN() { localStorage.removeItem(PIN_KEY); sessionStorage.removeItem(PIN_UNLOCKED_KEY); await supabase.auth.signOut(); setSession(null); }

  const pendingCount = (data.syncQueue||[]).filter(i=>i.status==="pending").length;
  const flaggedQuotes = (data.quotes||[]).filter(q=>q.status==="Pending").length;
  const openJobs = (data.jobcards||[]).filter(j=>j.status!=="Completed"&&j.status!=="Cancelled").length;

  if (loading) return <Spinner />;
  if (!session) return <AuthScreen />;
  if (pinState==="checking") return <Spinner />;
  if (pinState==="setup") return <PINSetupScreen onComplete={()=>setPinState("unlocked")} />;
  if (pinState==="locked") return <PINLockScreen onUnlock={()=>setPinState("unlocked")} onForgot={forgotPIN} />;

  const screens = {
    Home: <HomeScreen data={data} setScreen={setScreen} />,
    Clients: <ClientsScreen data={data} setData={setData} userId={session.user.id} />,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id} />,
    Quotes: <QuotesScreen data={data} setData={setData} userId={session.user.id} />,
    Notes: <NotesScreen data={data} setData={setData} userId={session.user.id} />,
    Equipment: <EquipmentScreen data={data} setData={setData} userId={session.user.id} />,
    JobCards: <JobCardsScreen data={data} setData={setData} userId={session.user.id} />,
    Expenses: <ExpensesScreen data={data} setData={setData} userId={session.user.id} />,
    Media: <MediaScreen data={data} setData={setData} userId={session.user.id} />,
    More: <MoreScreen data={data} onLogout={logout} onSyncNow={handleSyncNow} syncing={syncing} isOnline={isOnline} />,
  };

  // Bottom nav tabs (primary 5 + more accessed via More screen quick links)
  const NAV = [
    { icon: Home, label: "Home", key: "Home" },
    { icon: Users, label: "Clients", key: "Clients" },
    { icon: Wrench, label: "Jobs", key: "JobCards", badge: openJobs||null },
    { icon: Package, label: "Equip", key: "Equipment" },
    { icon: Settings, label: "More", key: "More", badge: pendingCount||null },
  ];

  // Secondary screens accessible from Home quick-nav or More
  const SECONDARY_NAV = [
    { icon: Calendar, label: "Follow-ups", key: "Followups" },
    { icon: FileIcon, label: "Quotes", key: "Quotes", badge: flaggedQuotes },
    { icon: Clipboard, label: "Notes", key: "Notes" },
    { icon: DollarSign, label: "Expenses", key: "Expenses" },
    { icon: Image, label: "Media", key: "Media" },
  ];

  const isSecondary = SECONDARY_NAV.some(n=>n.key===screen);

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-24" style={{ background: BRAND.light }}>
        {/* Secondary screen back button */}
        {isSecondary && (
          <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-2 flex items-center gap-3">
            <button onClick={()=>setScreen("Home")} className="flex items-center gap-1 text-sm font-bold" style={{color:BRAND.primary}}>
              <ChevronLeft size={16}/>Home
            </button>
            <span className="text-slate-300">·</span>
            <p className="text-sm font-bold text-slate-700">{SECONDARY_NAV.find(n=>n.key===screen)?.label}</p>
          </div>
        )}

        {/* Secondary nav strip */}
        {!isSecondary && (
          <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide max-w-2xl mx-auto">
              {SECONDARY_NAV.map(({ icon: Icon, label, key, badge }) => (
                <button key={key} onClick={()=>setScreen(key)}
                  className="relative shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all bg-slate-50 border border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-700">
                  <Icon size={11}/>{label}
                  {!!badge && <span className="rounded-full bg-red-500 text-white text-[9px] px-1 py-0.5 font-black min-w-[14px] text-center">{badge}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <main className="mx-auto max-w-2xl px-4 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.15 }}>
              {screens[screen]}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 backdrop-blur-md px-2 pt-1 pb-2 shadow-lg">
          <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
            {NAV.map(({ icon, label, key, badge }) => (
              <NavTab key={key} icon={icon} label={label} active={screen===key} onClick={()=>setScreen(key)} badge={badge} />
            ))}
          </div>
        </nav>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing} />
      </div>
    </ErrorBoundary>
  );
}
