import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll } from "./offline/offlineDb";
import SyncStatusBadge from "./components/SyncStatusBadge";

import {
  Bell, Briefcase, Calendar, ChevronRight, ChevronLeft,
  Clipboard, File as FileIcon, Home, LogOut, Phone, Plus,
  Search, Shield, Trash2, Users, Eye, EyeOff, BarChart2,
  RefreshCw, Check, AlertTriangle, Settings, X, TrendingUp,
  Filter, Edit2, Save, ArrowRight, Zap, Target, Award,
  CheckCircle, Clock, AlertCircle,
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

// ─── PIN Security ─────────────────────────────────────────────────────────────
const PIN_KEY = "powermate_pin_hash";
const PIN_UNLOCKED_KEY = "powermate_pin_unlocked";

async function hashPIN(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "powerworks_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function getPINHash() {
  return localStorage.getItem(PIN_KEY);
}

function isSessionUnlocked() {
  return sessionStorage.getItem(PIN_UNLOCKED_KEY) === "true";
}

function setSessionUnlocked() {
  sessionStorage.setItem(PIN_UNLOCKED_KEY, "true");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function niceDate(d) {
  if (!d) d = new Date();
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
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
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatCurrency(v) {
  return "R " + parseFloat(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 });
}

function genId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
  const base = "inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-40";
  const sizes = { sm: "px-3 py-2 text-xs rounded-xl", md: "px-4 py-3 text-sm rounded-2xl", lg: "px-6 py-4 text-base rounded-2xl" };
  const variants = {
    solid:     { background: BRAND.primary, color: "#fff" },
    outline:   { background: "#fff", color: BRAND.primary, border: `2px solid ${BRAND.primary}` },
    danger:    { background: "#DC2626", color: "#fff" },
    secondary: { background: BRAND.light, color: BRAND.primary },
    ghost:     { background: "transparent", color: BRAND.primary },
    success:   { background: "#16A34A", color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${className}`}
      style={variants[variant] || variants.solid}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false, required = false }) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {multiline ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4}
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors resize-none" />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors" />
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>}
      <select value={value || ""} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-red-300 transition-colors" />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function StagePill({ stage }) {
  const c = STAGE_COLORS[stage] || STAGE_COLORS["New Lead"];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {stage}
    </span>
  );
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
        {Icon && (
          <div className="rounded-xl p-2.5" style={{ background: BRAND.light }}>
            <Icon size={18} style={{ color }} />
          </div>
        )}
      </div>
    </Card>
  );
}

function NavTab({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-bold transition-all"
      style={{ color: active ? BRAND.primary : "#94A3B8" }}>
      <div className={`rounded-xl p-1.5 transition-all ${active ? "bg-red-50" : ""}`}>
        <Icon size={19} />
      </div>
      <span>{label}</span>
      {!!badge && (
        <span className="absolute right-0.5 top-0.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] text-white font-black">
          {badge}
        </span>
      )}
    </button>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-black text-slate-900 tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
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

// ─── PIN Setup Screen ─────────────────────────────────────────────────────────
function PINSetupScreen({ onComplete }) {
  const [pin, setPIN] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState("set"); // "set" | "confirm"
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
        if (next === pin) {
          savePIN(pin);
        } else {
          setError("PINs don't match. Try again.");
          setConfirm("");
          setPIN("");
          setStep("set");
        }
      }
    }
  }

  async function savePIN(p) {
    const hash = await hashPIN(p);
    localStorage.setItem(PIN_KEY, hash);
    setSessionUnlocked();
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
          <h1 className="text-xl font-black text-slate-900">
            {step === "set" ? "Set Your PIN" : "Confirm Your PIN"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === "set" ? "Choose a 6-digit PIN to secure the app" : "Re-enter your PIN to confirm"}
          </p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-4 h-4 rounded-full transition-all ${i < current.length ? "scale-110" : ""}`}
              style={{ background: i < current.length ? BRAND.primary : "#E2E8F0" }} />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d, i) => (
            <button key={i}
              onClick={() => {
                if (d === "⌫") {
                  if (step === "set") setPIN(p => p.slice(0, -1));
                  else setConfirm(c => c.slice(0, -1));
                } else if (d !== "") {
                  handleDigit(String(d));
                }
              }}
              className={`h-16 rounded-2xl text-xl font-black transition-all active:scale-95 ${d === "" ? "invisible" : "bg-white shadow-sm border border-slate-100 text-slate-800 hover:border-red-200"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── PIN Lock Screen ──────────────────────────────────────────────────────────
function PINLockScreen({ onUnlock, onForgot }) {
  const [pin, setPIN] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  async function handleDigit(d) {
    const next = (pin + d).slice(0, 6);
    setPIN(next);
    if (next.length === 6) {
      const hash = await hashPIN(next);
      if (hash === getPINHash()) {
        setSessionUnlocked();
        onUnlock();
      } else {
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
          <img src={BRAND.logo} alt="Power Works" className="mx-auto mb-4 h-12 object-contain"
            onError={e => e.target.style.display = "none"} />
          <h1 className="text-xl font-black text-slate-900">Enter PIN</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your PIN to unlock PowerMate</p>
        </div>

        <motion.div animate={shake ? { x: [-8, 8, -8, 8, 0] } : {}} transition={{ duration: 0.4 }}>
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
              onClick={() => {
                if (d === "⌫") setPIN(p => p.slice(0, -1));
                else if (d !== "") handleDigit(String(d));
              }}
              className={`h-16 rounded-2xl text-xl font-black transition-all active:scale-95 ${d === "" ? "invisible" : "bg-white shadow-sm border border-slate-100 text-slate-800 hover:border-red-200"}`}
            >
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

// ─── Auth Screen ──────────────────────────────────────────────────────────────
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
          <img src={BRAND.logo} alt="Power Works" className="mb-4 h-16 object-contain"
            onError={e => e.target.style.display = "none"} />
          <h1 className="text-2xl font-black" style={{ color: BRAND.primary }}>PowerMate</h1>
          <p className="mt-1 text-sm text-slate-400">Power Works Field Service CRM</p>
        </div>

        <Card className="p-6 space-y-4">
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@powerworks.com" type="email" />

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 pr-10 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {msg.text && (
            <div className={`rounded-xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {msg.text}
            </div>
          )}

          <Btn className="w-full" size="lg" onClick={login} disabled={loading}>
            {loading ? "Please wait…" : "Sign In"}
          </Btn>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Power Works (Pty) Ltd</p>
      </motion.div>
    </div>
  );
}

// ─── Dashboard / Home ─────────────────────────────────────────────────────────
function HomeScreen({ data, setScreen }) {
  const today = todayISO();
  const clients = data.clients || [];
  const quotes = data.quotes || [];
  const followups = data.followups || [];

  const todaysFollowups = followups.filter(f => f.date === today && !f.completed);
  const overdueFollowups = followups.filter(f => f.date < today && !f.completed);
  const pendingQuotes = quotes.filter(q => q.status === "Pending");
  const totalRevenue = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const pipelineCounts = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s] = clients.filter(c => (c.stage || "New Lead") === s).length;
    return acc;
  }, {});
  const wonClients = pipelineCounts["Won"] || 0;
  const convRate = clients.length > 0 ? Math.round((wonClients / clients.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-400">{niceDate()}</p>
        </div>
        <img src={BRAND.logo} alt="PW" className="h-8 object-contain opacity-80"
          onError={e => e.target.style.display = "none"} />
      </div>

      {/* Alerts */}
      {overdueFollowups.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-4 cursor-pointer"
          onClick={() => setScreen("Followups")}>
          <AlertCircle size={18} className="text-red-600 shrink-0" />
          <p className="text-sm font-bold text-red-700">
            {overdueFollowups.length} overdue follow-up{overdueFollowups.length !== 1 ? "s" : ""} — tap to review
          </p>
          <ChevronRight size={16} className="text-red-400 ml-auto shrink-0" />
        </motion.div>
      )}

      {/* Key Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Tasks" value={todaysFollowups.length} sub="follow-ups due" color={BRAND.primary} icon={Calendar} />
        <StatCard label="Pending Quotes" value={pendingQuotes.length} sub="awaiting response" color="#B45309" icon={FileIcon} />
        <StatCard label="Won Revenue" value={`R${Math.round(totalRevenue / 1000)}k`} sub="from accepted quotes" color="#16A34A" icon={TrendingUp} />
        <StatCard label="Win Rate" value={`${convRate}%`} sub={`${wonClients} of ${clients.length} clients`} color="#7C3AED" icon={Target} />
      </div>

      {/* Pipeline funnel */}
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
                <div className="flex-1 h-2 rounded-full" style={{ background: "#F1F5F9" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(count / max) * 100}%`, background: c.dot }} />
                </div>
                <span className="text-xs font-black text-slate-500 w-5 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Users, label: "Clients", screen: "Clients", count: clients.length },
          { icon: Calendar, label: "Follow-ups", screen: "Followups", count: followups.length },
          { icon: FileIcon, label: "Quotes", screen: "Quotes", count: quotes.length },
          { icon: Clipboard, label: "Notes", screen: "Notes", count: (data.notes || []).length },
        ].map(({ icon: Icon, label, screen, count }) => (
          <Card key={label} className="p-4" onClick={() => setScreen(screen)}>
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2" style={{ background: BRAND.light }}>
                <Icon size={16} style={{ color: BRAND.primary }} />
              </div>
              <ChevronRight size={14} className="text-slate-300" />
            </div>
            <p className="text-xl font-black text-slate-900">{count}</p>
            <p className="text-xs text-slate-400">{label}</p>
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
  const [form, setForm] = useState({ company: "", branch: "", contact: "", phone: "", stage: "New Lead" });

  const clients = data.clients || [];

  function resetForm() { setForm({ company: "", branch: "", contact: "", phone: "", stage: "New Lead" }); setEditId(null); setShowForm(false); }

  async function saveClient() {
    if (!form.company.trim()) { alert("Company name is required."); return; }
    if (editId) {
      const updated = clients.map(c => c.id === editId ? { ...c, ...form, sync_status: "pending" } : c);
      setData(d => ({ ...d, clients: updated }));
      await offlineSave("companies", { ...clients.find(c => c.id === editId), ...form, sync_status: "pending" });
    } else {
      const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({ ...d, clients: [item, ...d.clients || []], syncQueue: [{ id: genId(), table: "companies", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
      await offlineSave("companies", item);
    }
    resetForm();
  }

  async function deleteClient(id) {
    if (!window.confirm("Delete this client?")) return;
    setData(d => ({ ...d, clients: (d.clients || []).filter(c => c.id !== id) }));
  }

  function startEdit(c) { setForm({ company: c.company || "", branch: c.branch || "", contact: c.contact || "", phone: c.phone || "", stage: c.stage || "New Lead" }); setEditId(c.id); setShowForm(true); }

  const filtered = clients
    .filter(c => filterStage === "All" || (c.stage || "New Lead") === filterStage)
    .filter(c => !search || [c.company, c.branch, c.contact].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const grouped = filtered.reduce((acc, c) => {
    const key = c.company || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Clients" subtitle={`${clients.length} total`} />
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId ? "Edit Client" : "New Client"}</p>
              <Field label="Company" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="e.g. Anglo American" required />
              <Field label="Branch / Mine / Site" value={form.branch} onChange={v => setForm(f => ({ ...f, branch: v }))} placeholder="e.g. Mogalakwena Mine" />
              <Field label="Contact Person" value={form.contact} onChange={v => setForm(f => ({ ...f, contact: v }))} placeholder="Contact name" />
              <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Phone number" />
              <SelectField label="Pipeline Stage" value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v }))} options={PIPELINE_STAGES} />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveClient}><Save size={14} />{editId ? "Update" : "Add Client"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />

      {/* Stage filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {["All", ...PIPELINE_STAGES].map(s => (
          <button key={s} onClick={() => setFilterStage(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterStage === s ? "text-white" : "bg-white border border-slate-200 text-slate-500"}`}
            style={filterStage === s ? { background: BRAND.primary } : {}}>
            {s}
          </button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 && <Empty title="No clients found" text="Add your first client or adjust filters." icon={Users} />}

      <div className="space-y-4">
        {Object.entries(grouped).map(([companyName, branches]) => (
          <Card key={companyName} className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <p className="font-black text-slate-900">{companyName}</p>
              <p className="text-xs text-slate-400">{branches.length} branch{branches.length !== 1 ? "es" : ""}</p>
            </div>
            <div className="divide-y divide-slate-50">
              {branches.map(c => (
                <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate">{c.branch || "Main Branch"}</p>
                      <StagePill stage={c.stage || "New Lead"} />
                    </div>
                    {c.contact && <p className="text-xs text-slate-500 mt-0.5">{c.contact}</p>}
                    {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                    {c.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(c)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => deleteClient(c.id)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────
function FollowupsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All"); // All | Today | Overdue | Done
  const [form, setForm] = useState({ title: "", client: "", date: todayISO() });

  const followups = data.followups || [];
  const today = todayISO();

  async function addFollowup() {
    if (!form.title.trim()) { alert("Please enter a follow-up title."); return; }
    const item = { id: genId(), user_id: userId, ...form, completed: false, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({ ...d, followups: [item, ...(d.followups || [])], syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
    await offlineSave("followups", item);
    setForm({ title: "", client: "", date: todayISO() });
    setShowForm(false);
  }

  async function toggleDone(id) {
    const target = followups.find(f => f.id === id);
    const updated = { ...target, completed: !target.completed, sync_status: "pending" };
    setData(d => ({ ...d, followups: (d.followups || []).map(f => f.id === id ? updated : f) }));
    await offlineSave("followups", updated);
  }

  async function deleteFollowup(id) {
    if (!window.confirm("Delete this follow-up?")) return;
    setData(d => ({ ...d, followups: (d.followups || []).filter(f => f.id !== id) }));
  }

  const filtered = followups
    .filter(f => !search || [f.title, f.client].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .filter(f => {
      if (filter === "Today") return f.date === today && !f.completed;
      if (filter === "Overdue") return f.date < today && !f.completed;
      if (filter === "Done") return f.completed;
      return true;
    })
    .sort((a, b) => a.completed - b.completed || a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Follow-ups" subtitle={`${followups.filter(f => !f.completed).length} pending`} />
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <Field label="Follow-up" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Call mine buyer" required />
              <Field label="Client" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Company / branch" />
              <Field label="Date" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
              <Btn className="w-full" onClick={addFollowup}><Plus size={14} />Add Follow-up</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search follow-ups…" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", "Today", "Overdue", "Done"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filter === f ? "text-white" : "bg-white border border-slate-200 text-slate-500"}`}
            style={filter === f ? { background: f === "Overdue" ? "#DC2626" : BRAND.primary } : {}}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <Empty title="No follow-ups" text="Add a follow-up or change filters." icon={Calendar} />}

      <div className="space-y-2">
        {filtered.map(f => (
          <Card key={f.id} className="flex items-center gap-3 p-3">
            <button onClick={() => toggleDone(f.id)}
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${f.completed ? "bg-green-100 text-green-600" : f.date < today ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
              <Check size={15} />
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${f.completed ? "line-through text-slate-400" : "text-slate-900"}`}>{f.title}</p>
              <p className="text-xs text-slate-400">{f.client || "No client"} · {smartDate(f.date)}</p>
            </div>
            {f.date < today && !f.completed && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">Overdue</span>}
            <button onClick={() => deleteFollowup(f.id)} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
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
  const [form, setForm] = useState({ client_name: "", description: "", value: "", status: "Pending" });

  const quotes = data.quotes || [];

  function resetForm() { setForm({ client_name: "", description: "", value: "", status: "Pending" }); setEditId(null); setShowForm(false); }

  async function saveQuote() {
    if (!form.description.trim()) { alert("Please enter a quote description."); return; }
    if (editId) {
      const updated = quotes.map(q => q.id === editId ? { ...q, ...form, value: parseFloat(form.value || 0), sync_status: "pending" } : q);
      setData(d => ({ ...d, quotes: updated }));
      await offlineSave("quotes", { ...quotes.find(q => q.id === editId), ...form, value: parseFloat(form.value || 0), sync_status: "pending" });
    } else {
      const item = { id: genId(), user_id: userId, ...form, value: parseFloat(form.value || 0), sent_date: todayISO(), created_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({ ...d, quotes: [item, ...(d.quotes || [])], syncQueue: [{ id: genId(), table: "quotes", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
      await offlineSave("quotes", item);
    }
    resetForm();
  }

  async function deleteQuote(id) {
    if (!window.confirm("Delete this quote?")) return;
    setData(d => ({ ...d, quotes: (d.quotes || []).filter(q => q.id !== id) }));
  }

  function startEdit(q) { setForm({ client_name: q.client_name || "", description: q.description || "", value: String(q.value || ""), status: q.status || "Pending" }); setEditId(q.id); setShowForm(true); }

  const filtered = quotes
    .filter(q => filterStatus === "All" || q.status === filterStatus)
    .filter(q => !search || [q.client_name, q.description].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  const totalValue = filtered.reduce((s, q) => s + parseFloat(q.value || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Quotes" subtitle={`${quotes.length} total · ${formatCurrency(totalValue)}`} />
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId ? "Edit Quote" : "New Quote"}</p>
              <Field label="Client" value={form.client_name} onChange={v => setForm(f => ({ ...f, client_name: v }))} placeholder="Client / branch" />
              <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="What the quote covers" multiline required />
              <Field label="Value (R)" type="number" value={form.value} onChange={v => setForm(f => ({ ...f, value: v }))} placeholder="0.00" />
              <SelectField label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={["Pending", "Accepted", "Rejected", "Expired"]} />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveQuote}><Save size={14} />{editId ? "Update" : "Add Quote"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search quotes…" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", "Pending", "Accepted", "Rejected", "Expired"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filterStatus === s ? "text-white" : "bg-white border border-slate-200 text-slate-500"}`}
            style={filterStatus === s ? { background: BRAND.primary } : {}}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <Empty title="No quotes found" text="Add a quote or change filters." icon={FileIcon} />}

      <div className="space-y-2">
        {filtered.map(q => {
          const sc = QUOTE_STATUS_COLORS[q.status] || QUOTE_STATUS_COLORS.Pending;
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 truncate">{q.client_name || "Unknown client"}</p>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: sc.bg, color: sc.text }}>{q.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{q.description}</p>
                  <p className="mt-1 text-base font-black" style={{ color: BRAND.primary }}>{formatCurrency(q.value)}</p>
                  {q.sent_date && <p className="text-xs text-slate-400 mt-0.5">Sent {smartDate(q.sent_date)}</p>}
                  {q.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(q)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13} /></button>
                  <button onClick={() => deleteQuote(q.id)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
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
function NotesScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ client: "", note: "" });

  const notes = data.notes || [];

  async function addNote() {
    if (!form.note.trim()) { alert("Please enter a note."); return; }
    const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({ ...d, notes: [item, ...(d.notes || [])], syncQueue: [{ id: genId(), table: "notes", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
    await offlineSave("notes", item);
    setForm({ client: "", note: "" });
    setShowForm(false);
  }

  async function deleteNote(id) {
    if (!window.confirm("Delete this note?")) return;
    setData(d => ({ ...d, notes: (d.notes || []).filter(n => n.id !== id) }));
  }

  const filtered = notes.filter(n => !search || [n.client, n.note].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Field Notes" subtitle={`${notes.length} notes`} />
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <Field label="Client / Branch" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Client name" />
              <Field label="Note" value={form.note} onChange={v => setForm(f => ({ ...f, note: v }))} placeholder="Type your visit note…" multiline required />
              <Btn className="w-full" onClick={addNote}><Plus size={14} />Add Note</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search notes…" />

      {filtered.length === 0 && <Empty title="No notes yet" text="Add your first visit note." icon={Clipboard} />}

      <div className="space-y-2">
        {filtered.map(n => (
          <Card key={n.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{n.client || "General Note"}</p>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{n.note}</p>
                <p className="mt-1.5 text-xs text-slate-400">{n.created_at ? new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                {n.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
              </div>
              <button onClick={() => deleteNote(n.id)} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── More / Settings ──────────────────────────────────────────────────────────
function MoreScreen({ data, onLogout, onSyncNow, syncing, isOnline }) {
  const pendingCount = (data.syncQueue || []).filter(i => i.status === "pending").length;

  function changePIN() {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Sync, security & account" />

      {/* Sync status */}
      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sync Status</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">{pendingCount} item{pendingCount !== 1 ? "s" : ""} pending</p>
            <p className="text-xs text-slate-400">{isOnline ? "Connected — tap to sync now" : "Offline — will sync when connected"}</p>
          </div>
          <Btn size="sm" variant={isOnline ? "solid" : "secondary"} onClick={onSyncNow} disabled={!isOnline || syncing || pendingCount === 0}>
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Btn>
        </div>
        {pendingCount > 0 && (
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-700">⚠️ {pendingCount} unsynced item{pendingCount !== 1 ? "s" : ""}</p>
            <p className="text-xs text-amber-600 mt-0.5">Connect to Wi-Fi or mobile data to sync your data to the cloud.</p>
          </div>
        )}
        {pendingCount === 0 && (
          <div className="rounded-xl bg-green-50 p-3">
            <p className="text-xs font-bold text-green-700">✓ All data synced</p>
          </div>
        )}
      </Card>

      {/* Security */}
      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Security</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">PIN Lock</p>
            <p className="text-xs text-slate-400">Change your 6-digit PIN</p>
          </div>
          <Btn size="sm" variant="secondary" onClick={changePIN}><Shield size={13} />Change PIN</Btn>
        </div>
      </Card>

      {/* Data summary */}
      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data Summary</p>
        {[
          { label: "Clients", count: (data.clients || []).length },
          { label: "Follow-ups", count: (data.followups || []).length },
          { label: "Quotes", count: (data.quotes || []).length },
          { label: "Notes", count: (data.notes || []).length },
        ].map(({ label, count }) => (
          <div key={label} className="flex items-center justify-between">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="text-sm font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </Card>

      <Btn variant="danger" className="w-full" onClick={onLogout}>
        <LogOut size={16} />Log Out
      </Btn>

      <p className="text-center text-xs text-slate-300">PowerMate v2.0 · Power Works (Pty) Ltd</p>
    </div>
  );
}

// ─── Supabase Sync ────────────────────────────────────────────────────────────
async function pushSyncQueue(syncQueue, setData) {
  const pending = (syncQueue || []).filter(i => i.status === "pending");
  if (pending.length === 0) return;

  const TABLE_MAP = {
    companies: "clients", branches: "clients", contacts: "clients",
    followups: "followups", notes: "notes", quotes: "quotes",
  };

  const results = await Promise.allSettled(
    pending.map(async (item) => {
      const table = TABLE_MAP[item.table] || item.table;
      if (item.action === "insert" || item.action === "upsert") {
        const { error } = await supabase.from(table).upsert(item.data, { onConflict: "id" });
        if (error) throw error;
      } else if (item.action === "update") {
        const { error } = await supabase.from(table).update(item.data).eq("id", item.data.id);
        if (error) throw error;
      } else if (item.action === "delete") {
        const { error } = await supabase.from(table).delete().eq("id", item.data.id);
        if (error) throw error;
      }
      return item.id;
    })
  );

  const succeededIds = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  setData(d => ({
    ...d,
    syncQueue: (d.syncQueue || []).filter(i => !succeededIds.includes(i.id)),
    clients: (d.clients || []).map(c => succeededIds.includes(c.id) ? { ...c, sync_status: "synced" } : c),
    quotes: (d.quotes || []).map(q => succeededIds.includes(q.id) ? { ...q, sync_status: "synced" } : q),
    followups: (d.followups || []).map(f => succeededIds.includes(f.id) ? { ...f, sync_status: "synced" } : f),
    notes: (d.notes || []).map(n => succeededIds.includes(n.id) ? { ...n, sync_status: "synced" } : n),
  }));
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("Home");
  const [syncing, setSyncing] = useState(false);
  const [pinState, setPinState] = useState("checking"); // checking | setup | locked | unlocked

  const [data, setData] = useState({
    clients: [], followups: [], quotes: [], notes: [], syncQueue: [],
  });

  // ── Auth ──
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s || null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // ── PIN gate ──
  useEffect(() => {
    if (!session) return;
    const pinHash = getPINHash();
    if (!pinHash) { setPinState("setup"); return; }
    if (isSessionUnlocked()) { setPinState("unlocked"); return; }
    setPinState("locked");
  }, [session]);

  // ── Load local data ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("powermate_v2_data");
      if (saved) setData(d => ({ ...d, ...JSON.parse(saved) }));
    } catch (e) { console.warn("Could not load local data", e); }
  }, []);

  // ── Save local data ──
  useEffect(() => {
    try { localStorage.setItem("powermate_v2_data", JSON.stringify(data)); }
    catch (e) { console.warn("Could not save local data", e); }
  }, [data]);

  // ── Auto-sync when online ──
  useEffect(() => {
    if (!isOnline || !session) return;
    const queue = data.syncQueue || [];
    const pending = queue.filter(i => i.status === "pending");
    if (pending.length === 0) return;
    const timer = setTimeout(() => pushSyncQueue(data.syncQueue, setData), 3000);
    return () => clearTimeout(timer);
  }, [isOnline, session]);

  async function handleSyncNow() {
    setSyncing(true);
    await pushSyncQueue(data.syncQueue, setData);
    setSyncing(false);
  }

  async function logout() {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    await supabase.auth.signOut();
    setSession(null);
  }

  async function forgotPIN() {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    await supabase.auth.signOut();
    setSession(null);
  }

  const pendingCount = (data.syncQueue || []).filter(i => i.status === "pending").length;
  const flaggedQuotes = (data.quotes || []).filter(q => q.status === "Pending").length;

  if (loading) return <Spinner />;
  if (!session) return <AuthScreen />;
  if (pinState === "checking") return <Spinner />;
  if (pinState === "setup") return <PINSetupScreen onComplete={() => setPinState("unlocked")} />;
  if (pinState === "locked") return <PINLockScreen onUnlock={() => setPinState("unlocked")} onForgot={forgotPIN} />;

  const screens = {
    Home: <HomeScreen data={data} setScreen={setScreen} />,
    Clients: <ClientsScreen data={data} setData={setData} userId={session.user.id} />,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id} />,
    Quotes: <QuotesScreen data={data} setData={setData} userId={session.user.id} />,
    Notes: <NotesScreen data={data} setData={setData} userId={session.user.id} />,
    More: <MoreScreen data={data} onLogout={logout} onSyncNow={handleSyncNow} syncing={syncing} isOnline={isOnline} />,
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-24" style={{ background: BRAND.light }}>
        <main className="mx-auto max-w-2xl px-4 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              {screens[screen]}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 backdrop-blur-md px-2 pt-1 pb-safe shadow-lg">
          <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
            {[
              { icon: Home, label: "Home", key: "Home" },
              { icon: Users, label: "Clients", key: "Clients" },
              { icon: Calendar, label: "Follow", key: "Followups" },
              { icon: FileIcon, label: "Quotes", key: "Quotes", badge: flaggedQuotes },
              { icon: Settings, label: "More", key: "More", badge: pendingCount },
            ].map(({ icon, label, key, badge }) => (
              <NavTab key={key} icon={icon} label={label} active={screen === key} onClick={() => setScreen(key)} badge={badge} />
            ))}
          </div>
        </nav>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing} />
      </div>
    </ErrorBoundary>
  );
}
