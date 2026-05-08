import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll } from "./offline/offlineDb";
import SyncStatusBadge from "./components/SyncStatusBadge";

import {
  Bell, Calendar, ChevronRight, ChevronLeft, Clipboard, File as FileIcon,
  Home, LogOut, Plus, Search, Shield, Trash2, Users,
  Eye, EyeOff, RefreshCw, Check, AlertCircle,
  Settings, X, TrendingUp, Edit2, Save,
  Wrench, Clock, MapPin, Hash, Camera, Image, Video, Paperclip,
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

// ─── PIN ──────────────────────────────────────────────────────────────────────
const PIN_KEY = "powermate_pin_hash";
const PIN_UNLOCKED_KEY = "powermate_pin_unlocked";

async function hashPIN(pin) {
  const data = new TextEncoder().encode(pin + "powerworks_salt_2026");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
const getPINHash = () => localStorage.getItem(PIN_KEY);
const isSessionUnlocked = () => sessionStorage.getItem(PIN_UNLOCKED_KEY) === "true";
const setSessionUnlocked = () => sessionStorage.setItem(PIN_UNLOCKED_KEY, "true");

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

function buildNotificationItems(followups = [], equipment = []) {
  const items = [];
  const todayStr = todayISO();

  // Morning summary at 7am for today's follow-ups
  const todayFollowups = followups.filter(f => f.date === todayStr && !f.completed);
  if (todayFollowups.length > 0) {
    const fireAt = new Date(todayStr + "T07:00:00");
    if (fireAt > new Date()) {
      items.push({
        id: "morning_" + todayStr,
        title: "📋 PowerMate — Today's Follow-ups",
        body: `You have ${todayFollowups.length} follow-up${todayFollowups.length !== 1 ? "s" : ""} today.`,
        fireAt: fireAt.toISOString(),
        tag: "morning_summary",
      });
    }
  }

  // Per-followup reminders — respect the reminder field if set
  followups.filter(f => f.date >= todayStr && !f.completed).forEach(f => {
    if (f.reminder === "none") return;
    const baseTime = f.date + "T" + (f.time || "09:00") + ":00";
    const base = new Date(baseTime);
    let fireAt = base;
    switch (f.reminder) {
      case "15_before": fireAt = new Date(base.getTime() - 15 * 60000); break;
      case "30_before": fireAt = new Date(base.getTime() - 30 * 60000); break;
      case "1h_before": fireAt = new Date(base.getTime() - 60 * 60000); break;
      case "1d_before": { const d = new Date(f.date + "T09:00:00"); d.setDate(d.getDate() - 1); fireAt = d; break; }
      case "morning":   fireAt = new Date(f.date + "T07:00:00"); break;
      default:          fireAt = base; break; // on_time or undefined
    }
    if (fireAt > new Date()) {
      items.push({
        id: "fu_" + f.id,
        title: "🔔 " + f.title,
        body: f.client ? `Client: ${f.client}` : "Tap to view.",
        fireAt: fireAt.toISOString(),
        tag: "fu_" + f.id,
      });
    }
  });

  // Equipment service reminders
  equipment.filter(e => e.service_due).forEach(eq => {
    const due = new Date(eq.service_due + "T09:00:00");
    const warn = new Date(due); warn.setDate(warn.getDate() - 3);
    if (warn > new Date()) items.push({ id: "ew_" + eq.id, title: "⚠️ Service Due Soon: " + eq.name, body: `Service due in 3 days. S/N: ${eq.serial || "N/A"}`, fireAt: warn.toISOString(), tag: "ew_" + eq.id });
    if (due > new Date()) items.push({ id: "ed_" + eq.id, title: "🔧 Service Due Today: " + eq.name, body: `${eq.make || ""} ${eq.model || ""} — ${eq.location || ""}`, fireAt: due.toISOString(), tag: "ed_" + eq.id });
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

function genId() { return `local_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

// ─── Photo / Media Helpers ────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file, maxWidth = 1200, quality = 0.75) {
  // Videos: just convert to base64 without compression
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
  } catch (e) {
    console.warn("Photo upload failed:", e);
    return null;
  }
}

// ─── Media Picker Component ───────────────────────────────────────────────────
function MediaPicker({ onAdd, disabled = false }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      const base64 = await compressImage(file);
      const isVideo = file.type.startsWith("video/");
      onAdd({ id: genId(), base64, isVideo, name: file.name, type: file.type, uploadStatus: "pending" });
    }
  }

  return (
    <div className="flex gap-2">
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-xs font-bold text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40">
        <Camera size={15} /> Camera
      </button>
      <button type="button" onClick={() => galleryRef.current?.click()} disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-xs font-bold text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40">
        <Image size={15} /> Gallery
      </button>
    </div>
  );
}

// ─── Media Gallery Component ──────────────────────────────────────────────────
function MediaGallery({ media = [], onDelete, readonly = false }) {
  const [lightbox, setLightbox] = useState(null);
  if (!media.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {media.map((m, i) => (
          <div key={m.id || i} className="relative group">
            {m.isVideo
              ? (
                <div className="w-20 h-20 rounded-xl bg-slate-900 flex items-center justify-center cursor-pointer border-2 border-slate-200"
                  onClick={() => setLightbox(m)}>
                  <Video size={22} className="text-white" />
                </div>
              ) : (
                <img src={m.url || m.base64} alt="attachment" onClick={() => setLightbox(m)}
                  className="w-20 h-20 rounded-xl object-cover cursor-pointer border-2 border-slate-100 hover:border-red-300 transition-colors" />
              )
            }
            {m.uploadStatus === "pending" && (
              <span className="absolute bottom-1 left-1 rounded-full bg-amber-500 w-2 h-2" title="Not uploaded" />
            )}
            {!readonly && onDelete && (
              <button onClick={() => onDelete(m.id)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white p-2"><X size={24} /></button>
            {lightbox.isVideo
              ? <video src={lightbox.url || lightbox.base64} controls className="max-w-full max-h-full rounded-xl" onClick={e => e.stopPropagation()} />
              : <img src={lightbox.url || lightbox.base64} alt="full" className="max-w-full max-h-full rounded-xl object-contain" />
            }
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function Card({ children, className="", onClick }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${onClick?"cursor-pointer active:scale-[0.98] transition-transform":""} ${className}`} onClick={onClick}>{children}</div>;
}

function Btn({ children, onClick, disabled, variant="solid", className="", type="button", size="md" }) {
  const sizes = { sm:"px-3 py-2 text-xs rounded-xl", md:"px-4 py-3 text-sm rounded-2xl", lg:"px-6 py-4 text-base rounded-2xl" };
  const vs = { solid:{background:BRAND.primary,color:"#fff"}, outline:{background:"#fff",color:BRAND.primary,border:`2px solid ${BRAND.primary}`}, danger:{background:"#DC2626",color:"#fff"}, secondary:{background:BRAND.light,color:BRAND.primary}, success:{background:"#16A34A",color:"#fff"}, warning:{background:"#D97706",color:"#fff"} };
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-40 ${sizes[size]} ${className}`} style={vs[variant]||vs.solid}>{children}</button>;
}

function Field({ label, value, onChange, placeholder="", type="text", multiline=false, required=false }) {
  const cls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors";
  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">{label}{required&&<span className="text-red-500 ml-1">*</span>}</label>}
      {multiline
        ? <textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={4} className={cls+" resize-none"} />
        : <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={cls} />}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>}
      <select value={value||""} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors">
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder="Search…" }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-red-300 transition-colors" />
      {value && <button onClick={()=>onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14}/></button>}
    </div>
  );
}

function StagePill({ stage }) {
  const c = STAGE_COLORS[stage]||STAGE_COLORS["New Lead"];
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{background:c.bg,color:c.text}}><span className="w-1.5 h-1.5 rounded-full" style={{background:c.dot}}/>{stage}</span>;
}

function ServiceBadge({ dueDate }) {
  const d = daysDiff(dueDate);
  if (d===null) return null;
  if (d<0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">⚠️ Overdue</span>;
  if (d<=3) return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">Due in {d}d</span>;
  if (d<=14) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Due {smartDate(dueDate)}</span>;
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">{smartDate(dueDate)}</span>;
}

function Empty({ title, text, icon:Icon=Users }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-10 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:BRAND.light}}><Icon size={22} style={{color:BRAND.primary}}/></div>
      <p className="font-bold text-slate-800">{title}</p>
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
    <button onClick={onClick} className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-bold transition-all" style={{color:active?BRAND.primary:"#94A3B8"}}>
      <div className={`rounded-xl p-1.5 transition-all ${active?"bg-red-50":""}`}><Icon size={18}/></div>
      <span>{label}</span>
      {!!badge && <span className="absolute right-0 top-0.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] text-white font-black">{badge}</span>}
    </button>
  );
}

function PageHeader({ title, subtitle }) {
  return <div className="mb-5"><h1 className="text-xl font-black text-slate-900 tracking-tight">{title}</h1>{subtitle&&<p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}</div>;
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

function FilterPills({ options, value, onChange, dangerValue }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(o => (
        <button key={o} onClick={()=>onChange(o)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${value===o?"text-white":"bg-white border border-slate-200 text-slate-500"}`}
          style={value===o?{background:o===dangerValue?"#DC2626":o==="Due Soon"?"#D97706":BRAND.primary}:{}}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state={hasError:false}; }
  static getDerivedStateFromError() { return {hasError:true}; }
  componentDidCatch(e,i) { console.error("PowerMate:",e,i); }
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

// ─── PIN Keypad (shared) ──────────────────────────────────────────────────────
function PINKeypad({ pin, onDigit, onBack }) {
  return (
    <>
      <div className="flex justify-center gap-3 mb-8">
        {Array.from({length:6}).map((_,i)=>(
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${i<pin.length?"scale-110":""}`} style={{background:i<pin.length?BRAND.primary:"#E2E8F0"}}/>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
          <button key={i}
            onClick={()=>{ if(d==="⌫") onBack(); else if(d!=="") onDigit(String(d)); }}
            className={`h-16 rounded-2xl text-xl font-black transition-all active:scale-95 ${d===""?"invisible":"bg-white shadow-sm border border-slate-100 text-slate-800 hover:border-red-200"}`}>
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
        <PINKeypad pin={step==="set"?pin:confirm} onDigit={handleDigit} onBack={()=>{if(step==="set")setPIN(p=>p.slice(0,-1));else setConfirm(c=>c.slice(0,-1));}} />
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
    const next=(pin+d).slice(0,6); setPIN(next);
    if(next.length===6){
      if(await hashPIN(next)===getPINHash()){setSessionUnlocked();onUnlock();}
      else{setError("Incorrect PIN");setShake(true);setTimeout(()=>{setShake(false);setPIN("");setError("");},700);}
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{background:BRAND.light}}>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <img src={BRAND.logo} alt="PW" className="mx-auto mb-4 h-12 object-contain" onError={e=>e.target.style.display="none"}/>
          <h1 className="text-xl font-black text-slate-900">Enter PIN</h1>
          <p className="mt-1 text-sm text-slate-500">Unlock PowerMate</p>
        </div>
        <motion.div animate={shake?{x:[-8,8,-8,8,0]}:{}} transition={{duration:0.4}}>
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
          <PINKeypad pin={pin} onDigit={handleDigit} onBack={()=>setPIN(p=>p.slice(0,-1))}/>
        </motion.div>
        <button onClick={onForgot} className="mt-6 w-full text-center text-sm font-bold text-slate-400 hover:text-red-600 transition-colors">Forgot PIN? Sign in again</button>
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
    if(!email||!password){setMsg({text:"Please enter email and password.",type:"error"});return;}
    setLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) setMsg({text:error.message,type:"error"});
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
            <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 pr-10 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors"/>
              <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
              </button>
            </div>
          </div>
          {msg.text&&<div className={`rounded-xl p-3 text-sm font-medium ${msg.type==="success"?"bg-green-50 text-green-700":"bg-red-50 text-red-700"}`}>{msg.text}</div>}
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

  const todayFU=followups.filter(f=>f.date===today&&!f.completed);
  const overdueFU=followups.filter(f=>f.date<today&&!f.completed);
  const pendingQ=quotes.filter(q=>q.status==="Pending");
  const wonRev=quotes.filter(q=>q.status==="Accepted").reduce((s,q)=>s+parseFloat(q.value||0),0);
  const overdueEquip=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0);
  const dueSoonEquip=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)>=0&&daysDiff(e.service_due)<=7);

  const pCount=PIPELINE_STAGES.reduce((a,s)=>{a[s]=clients.filter(c=>(c.stage||"New Lead")===s).length;return a},{});
  const wonC=pCount["Won"]||0;
  const convRate=clients.length>0?Math.round((wonC/clients.length)*100):0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-black text-slate-900">Dashboard</h1><p className="text-xs text-slate-400">{niceDate()}</p></div>
        <img src={BRAND.logo} alt="PW" className="h-8 object-contain opacity-80" onError={e=>e.target.style.display="none"}/>
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {overdueFU.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-3 cursor-pointer" onClick={()=>setScreen("Followups")}>
            <AlertCircle size={16} className="text-red-600 shrink-0"/>
            <p className="text-sm font-bold text-red-700 flex-1">{overdueFU.length} overdue follow-up{overdueFU.length!==1?"s":""}</p>
            <ChevronRight size={14} className="text-red-400 shrink-0"/>
          </motion.div>
        )}
        {overdueEquip.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} className="flex items-center gap-3 rounded-2xl bg-orange-50 border border-orange-200 p-3 cursor-pointer" onClick={()=>setScreen("Equipment")}>
            <Wrench size={16} className="text-orange-600 shrink-0"/>
            <p className="text-sm font-bold text-orange-700 flex-1">{overdueEquip.length} equipment service{overdueEquip.length!==1?"s":""} overdue</p>
            <ChevronRight size={14} className="text-orange-400 shrink-0"/>
          </motion.div>
        )}
        {dueSoonEquip.length>0&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-3 cursor-pointer" onClick={()=>setScreen("Equipment")}>
            <Clock size={16} className="text-amber-600 shrink-0"/>
            <p className="text-sm font-bold text-amber-700 flex-1">{dueSoonEquip.length} service{dueSoonEquip.length!==1?"s":""} due within 7 days</p>
            <ChevronRight size={14} className="text-amber-400 shrink-0"/>
          </motion.div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Tasks" value={todayFU.length} sub="follow-ups due" color={BRAND.primary} icon={Calendar}/>
        <StatCard label="Pending Quotes" value={pendingQ.length} sub="awaiting response" color="#B45309" icon={FileIcon}/>
        <StatCard label="Won Revenue" value={`R${Math.round(wonRev/1000)}k`} sub="accepted quotes" color="#16A34A" icon={TrendingUp}/>
        <StatCard label="Win Rate" value={`${convRate}%`} sub={`${wonC} of ${clients.length} clients`} color="#7C3AED" icon={Wrench}/>
      </div>

      {/* Pipeline */}
      <Card className="p-4">
        <p className="mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Sales Pipeline</p>
        <div className="space-y-2">
          {PIPELINE_STAGES.filter(s=>s!=="Lost").map(stage=>{
            const count=pCount[stage]||0;
            const max=Math.max(...Object.values(pCount),1);
            const c=STAGE_COLORS[stage];
            return (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-20 text-xs font-bold shrink-0" style={{color:c.text}}>{stage}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all" style={{width:`${(count/max)*100}%`,background:c.dot}}/>
                </div>
                <span className="text-xs font-black text-slate-500 w-4 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3">
        {[{icon:Users,label:"Clients",screen:"Clients",count:clients.length},{icon:Calendar,label:"Follow-ups",screen:"Followups",count:followups.length},{icon:FileIcon,label:"Quotes",screen:"Quotes",count:quotes.length},{icon:Wrench,label:"Equipment",screen:"Equipment",count:equipment.length}].map(({icon:Icon,label,screen,count})=>(
          <Card key={label} className="p-4" onClick={()=>setScreen(screen)}>
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2" style={{background:BRAND.light}}><Icon size={16} style={{color:BRAND.primary}}/></div>
              <ChevronRight size={14} className="text-slate-300"/>
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
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [filterStage,setFilterStage]=useState("All");
  const [editId,setEditId]=useState(null);
  const [toast,setToast]=useState("");
  const [form,setForm]=useState({company:"",branch:"",contact:"",phone:"",stage:"New Lead"});
  const clients=data.clients||[];

  function resetForm(){setForm({company:"",branch:"",contact:"",phone:"",stage:"New Lead"});setEditId(null);setShowForm(false);}

  async function saveClient(){
    if(!form.company.trim()){alert("Company name is required.");return;}
    if(editId){
      const existing = clients.find(c=>c.id===editId);
      const updated = {...existing,...form,sync_status:"pending"};
      setData(d=>({...d,
        clients:(d.clients||[]).map(c=>c.id===editId?updated:c),
        syncQueue:[{id:genId(),table:"companies",action:"update",data:updated,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])],
      }));
      await offlineSave("companies",updated);
      setToast("Client updated");
    } else {
      const item={id:genId(),user_id:userId,...form,created_at:new Date().toISOString(),sync_status:"pending"};
      setData(d=>({...d,clients:[item,...(d.clients||[])],syncQueue:[{id:genId(),table:"companies",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
      await offlineSave("companies",item);
      setToast("Client added");
    }
    resetForm();
  }

  async function deleteClient(id){if(!window.confirm("Delete this client?"))return;setData(d=>({...d,clients:(d.clients||[]).filter(c=>c.id!==id)}));}
  function startEdit(c){setForm({company:c.company||"",branch:c.branch||"",contact:c.contact||"",phone:c.phone||"",stage:c.stage||"New Lead"});setEditId(c.id);setShowForm(true);}

  const filtered=clients
    .filter(c=>filterStage==="All"||(c.stage||"New Lead")===filterStage)
    .filter(c=>!search||[c.company,c.branch,c.contact].some(f=>f?.toLowerCase().includes(search.toLowerCase())));
  const grouped=filtered.reduce((a,c)=>{const k=c.company||"Unknown";if(!a[k])a[k]=[];a[k].push(c);return a},{});

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast&&<Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Clients" subtitle={`${clients.length} total`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>
      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId?"Edit Client":"New Client"}</p>
              <Field label="Company" value={form.company} onChange={v=>setForm(f=>({...f,company:v}))} placeholder="e.g. Anglo American" required/>
              <Field label="Branch / Mine / Site" value={form.branch} onChange={v=>setForm(f=>({...f,branch:v}))} placeholder="e.g. Mogalakwena Mine"/>
              <Field label="Contact Person" value={form.contact} onChange={v=>setForm(f=>({...f,contact:v}))} placeholder="Contact name"/>
              <Field label="Phone" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} placeholder="Phone number"/>
              <SelectField label="Pipeline Stage" value={form.stage} onChange={v=>setForm(f=>({...f,stage:v}))} options={PIPELINE_STAGES}/>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveClient}><Save size={14}/>{editId?"Update":"Add Client"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <SearchBar value={search} onChange={setSearch} placeholder="Search clients…"/>
      <FilterPills options={["All",...PIPELINE_STAGES]} value={filterStage} onChange={setFilterStage} dangerValue="Lost"/>
      {Object.keys(grouped).length===0&&<Empty title="No clients found" text="Add your first client." icon={Users}/>}
      <div className="space-y-4">
        {Object.entries(grouped).map(([cn,branches])=>(
          <Card key={cn} className="overflow-hidden">
            <div className="px-4 pt-4 pb-2"><p className="font-black text-slate-900">{cn}</p><p className="text-xs text-slate-400">{branches.length} branch{branches.length!==1?"es":""}</p></div>
            <div className="divide-y divide-slate-50">
              {branches.map(c=>(
                <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-bold text-slate-800">{c.branch||"Main Branch"}</p><StagePill stage={c.stage||"New Lead"}/></div>
                    {c.contact&&<p className="text-xs text-slate-500 mt-0.5">{c.contact}</p>}
                    {c.phone&&<p className="text-xs text-slate-400">{c.phone}</p>}
                    {c.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={()=>startEdit(c)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13}/></button>
                    <button onClick={()=>deleteClient(c.id)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={13}/></button>
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

// ─── Toast notification ───────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg"
      style={{background:BRAND.primary,whiteSpace:"nowrap"}}>
      ✓ {message}
    </motion.div>
  );
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────
function FollowupsScreen({ data, setData, userId }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [view, setView] = useState("list");
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ title: "", client: "", date: todayISO(), time: "09:00", reminder: "on_time" });
  const followups = data.followups || [];
  const today = todayISO();

  const REMINDER_OPTIONS = [
    { value: "on_time",   label: "At time of follow-up" },
    { value: "15_before", label: "15 minutes before" },
    { value: "30_before", label: "30 minutes before" },
    { value: "1h_before", label: "1 hour before" },
    { value: "1d_before", label: "1 day before (9am)" },
    { value: "morning",   label: "Day-of morning (7am)" },
    { value: "none",      label: "No reminder" },
  ];

  function getReminderFireTime(date, time, reminder) {
    const base = new Date(`${date}T${time || "09:00"}:00`);
    switch (reminder) {
      case "15_before": return new Date(base.getTime() - 15 * 60000);
      case "30_before": return new Date(base.getTime() - 30 * 60000);
      case "1h_before": return new Date(base.getTime() - 60 * 60000);
      case "1d_before": { const d = new Date(date + "T09:00:00"); d.setDate(d.getDate() - 1); return d; }
      case "morning":   return new Date(date + "T07:00:00");
      case "none":      return null;
      default:          return base;
    }
  }

  function resetForm() { setForm({ title: "", client: "", date: todayISO(), time: "09:00", reminder: "on_time" }); setEditId(null); setShowForm(false); }

  function startEdit(f) {
    setForm({ title: f.title||"", client: f.client||"", date: f.date||todayISO(), time: f.time||"09:00", reminder: f.reminder||"on_time" });
    setEditId(f.id);
    setShowForm(true);
  }

  async function saveFollowup() {
    if (!form.title.trim()) { alert("Please enter a title."); return; }
    if (editId) {
      const existing = followups.find(f => f.id === editId);
      const updated = { ...existing, ...form, sync_status: "pending" };
      setData(d => ({
        ...d,
        followups: (d.followups||[]).map(f => f.id === editId ? updated : f),
        syncQueue: [{ id: genId(), table: "followups", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])],
      }));
      await offlineSave("followups", updated);
      setToast("Follow-up updated");
    } else {
      const item = { id: genId(), user_id: userId, ...form, completed: false, created_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({
        ...d,
        followups: [item, ...(d.followups||[])],
        syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue||[])],
      }));
      await offlineSave("followups", item);
      if (Notification.permission === "granted" && form.reminder !== "none") {
        const fireAt = getReminderFireTime(form.date, form.time, form.reminder);
        if (fireAt && fireAt > new Date()) {
          scheduleNotificationsViaSW([{ id: "fu_" + item.id, title: "🔔 Follow-up: " + item.title, body: item.client ? `Client: ${item.client}` : "Tap to view.", fireAt: fireAt.toISOString(), tag: "fu_" + item.id }]);
        }
      }
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
    if (!window.confirm("Delete?")) return;
    setData(d => ({ ...d, followups: (d.followups||[]).filter(f => f.id !== id) }));
  }

  // ── Calendar helpers ──
  function calDays() {
    const first = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    // Start week on Monday: shift Sunday(0) to 6
    const startPad = (first + 6) % 7;
    return { startPad, daysInMonth };
  }

  function dateStr(day) {
    return `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function followupsOnDay(day) {
    const ds = dateStr(day);
    return followups.filter(f => f.date === ds);
  }

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
    setSelectedDay(null);
  }

  const { startPad, daysInMonth } = calDays();
  const calCells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  // Pad to complete last row
  while (calCells.length % 7 !== 0) calCells.push(null);

  const selectedDayFollowups = selectedDay ? followupsOnDay(selectedDay) : [];

  // ── List view filtered ──
  const filtered = followups
    .filter(f => !search || [f.title, f.client].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .filter(f => {
      if (filter === "Today") return f.date === today && !f.completed;
      if (filter === "Overdue") return f.date < today && !f.completed;
      if (filter === "Done") return f.completed;
      return true;
    })
    .sort((a, b) => a.completed - b.completed || a.date.localeCompare(b.date));

  const pendingCount = followups.filter(f => !f.completed).length;
  const overdueCount = followups.filter(f => f.date < today && !f.completed).length;

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast("")} />}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader title="Follow-ups" subtitle={`${pendingCount} pending${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`} />
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
            <button onClick={() => setView("list")}
              className={`px-3 py-2 text-xs font-bold transition-all ${view === "list" ? "text-white" : "text-slate-400"}`}
              style={view === "list" ? { background: BRAND.primary } : {}}>☰</button>
            <button onClick={() => setView("calendar")}
              className={`px-3 py-2 text-xs font-bold transition-all ${view === "calendar" ? "text-white" : "text-slate-400"}`}
              style={view === "calendar" ? { background: BRAND.primary } : {}}>📅</button>
          </div>
          <Btn size="sm" onClick={() => { if (showForm && editId) resetForm(); else setShowForm(!showForm); }}>
            {showForm ? <X size={14} /> : <Plus size={14} />}{showForm ? "Cancel" : "Add"}
          </Btn>
        </div>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId ? "Edit Follow-up" : "New Follow-up"}</p>
              <Field label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Call mine buyer" required />
              <Field label="Client" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Company / branch" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
                <Field label="Time" type="time" value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">🔔 Reminder</label>
                <select value={form.reminder} onChange={e => setForm(f => ({ ...f, reminder: e.target.value }))}
                  className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors">
                  {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {Notification.permission !== "granted" && (
                  <p className="mt-1.5 text-xs text-amber-600 font-medium">⚠️ Enable notifications in Settings to receive reminders.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveFollowup}><Save size={14} />{editId ? "Update" : "Add Follow-up"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar View */}
      <AnimatePresence mode="wait">
        {view === "calendar" && (
          <motion.div key="cal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            <Card className="p-4">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <p className="text-sm font-black text-slate-900">{MONTH_NAMES[calMonth]} {calYear}</p>
                <button onClick={nextMonth} className="p-2 rounded-xl bg-slate-50 text-slate500 hover:bg-slate-100 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calCells.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />;
                  const ds = dateStr(day);
                  const dayFUs = followupsOnDay(day);
                  const isToday = ds === today;
                  const isSelected = selectedDay === day;
                  const hasOverdue = dayFUs.some(f => !f.completed && ds < today);
                  const hasPending = dayFUs.some(f => !f.completed && ds >= today);
                  const allDone = dayFUs.length > 0 && dayFUs.every(f => f.completed);

                  return (
                    <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)}
                      className={`relative flex flex-col items-center justify-start rounded-xl p-1 min-h-[44px] transition-all ${isSelected ? "ring-2" : ""}`}
                      style={{
                        background: isSelected ? BRAND.light : isToday ? "#FFF1F2" : "transparent",
                        ringColor: BRAND.primary,
                      }}>
                      <span className={`text-xs font-bold leading-none ${isToday ? "text-red-700" : isSelected ? "text-red-800" : "text-slate-700"}`}>
                        {day}
                      </span>
                      {dayFUs.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                          {dayFUs.slice(0, 3).map((f, idx) => (
                            <span key={idx} className="w-1.5 h-1.5 rounded-full"
                              style={{ background: f.completed ? "#86EFAC" : ds < today ? "#F87171" : BRAND.primary }} />
                          ))}
                          {dayFUs.length > 3 && <span className="text-[8px] text-slate-400 font-bold">+{dayFUs.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                {[
                  { color: BRAND.primary, label: "Upcoming" },
                  { color: "#F87171", label: "Overdue" },
                  { color: "#86EFAC", label: "Done" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] text-slate-400 font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Selected day followups */}
            {selectedDay && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">
                  {MONTH_NAMES[calMonth]} {selectedDay} — {selectedDayFollowups.length} item{selectedDayFollowups.length !== 1 ? "s" : ""}
                </p>
                {selectedDayFollowups.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-sm text-slate-400">No follow-ups on this day</p>
                    <Btn size="sm" className="mt-3" onClick={() => {
                      setForm(f => ({ ...f, date: dateStr(selectedDay) }));
                      setShowForm(true);
                    }}><Plus size={13} />Add for this day</Btn>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {selectedDayFollowups.map(f => (
                      <Card key={f.id} className="flex items-center gap-3 p-3">
                        <button onClick={() => toggleDone(f.id)}
                          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${f.completed ? "bg-green-100 text-green-600" : f.date < today ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
                          <Check size={15} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${f.completed ? "line-through text-slate-400" : "text-slate-900"}`}>{f.title}</p>
                          <p className="text-xs text-slate-400">{f.client || "No client"}{f.time ? ` · ${f.time}` : ""}</p>
                          {f.reminder && f.reminder !== "none" && (
                            <p className="text-xs text-blue-400">🔔 {REMINDER_OPTIONS.find(o => o.value === f.reminder)?.label || f.reminder}</p>
                          )}
                        </div>
                        <button onClick={() => deleteFollowup(f.id)} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </Card>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Upcoming this month summary */}
            {!selectedDay && (() => {
              const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
              const thisMonthFUs = followups.filter(f => f.date.startsWith(monthStr) && !f.completed);
              if (!thisMonthFUs.length) return null;
              return (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">This month — {thisMonthFUs.length} pending</p>
                  <div className="space-y-2">
                    {thisMonthFUs.sort((a,b) => a.date.localeCompare(b.date)).slice(0, 5).map(f => (
                      <Card key={f.id} className="flex items-center gap-3 p-3">
                        <button onClick={() => toggleDone(f.id)}
                          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${f.date < today ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
                          <Check size={15} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{f.title}</p>
                          <p className="text-xs text-slate-400">{f.client || "No client"} · {smartDate(f.date)}{f.time ? ` at ${f.time}` : ""}</p>
                        </div>
                        {f.date < today && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">Overdue</span>}
                      </Card>
                    ))}
                    {thisMonthFUs.length > 5 && <p className="text-center text-xs text-slate-400">+{thisMonthFUs.length - 5} more — tap a day to see all</p>}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* List View */}
        {view === "list" && (
          <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Search follow-ups…" />
            <FilterPills options={["All", "Today", "Overdue", "Done"]} value={filter} onChange={setFilter} dangerValue="Overdue" />
            {filtered.length === 0 && <Empty title="No follow-ups" text="Add a follow-up or switch to calendar view." icon={Calendar} />}
            <div className="space-y-2">
              {filtered.map(f => (
                <Card key={f.id} className="flex items-center gap-3 p-3">
                  <button onClick={() => toggleDone(f.id)}
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${f.completed ? "bg-green-100 text-green-600" : f.date < today ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
                    <Check size={15} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${f.completed ? "line-through text-slate-400" : "text-slate-900"}`}>{f.title}</p>
                    <p className="text-xs text-slate-400">{f.client || "No client"} · {smartDate(f.date)}{f.time ? ` at ${f.time}` : ""}</p>
                    {f.reminder && f.reminder !== "none" && !f.completed && (
                      <p className="text-xs text-blue-400">🔔 {REMINDER_OPTIONS.find(o => o.value === f.reminder)?.label || f.reminder}</p>
                    )}
                  </div>
                  {f.date < today && !f.completed && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">Overdue</span>}
                  <button onClick={() => startEdit(f)} className="shrink-0 p-1.5 text-slate-300 hover:text-blue-500 transition-colors"><Edit2 size={13} /></button>
                  <button onClick={() => deleteFollowup(f.id)} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </Card>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Quotes ───────────────────────────────────────────────────────────────────
function QuotesScreen({ data, setData, userId }) {
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("All");
  const [editId,setEditId]=useState(null);
  const [toast,setToast]=useState("");
  const [form,setForm]=useState({client_name:"",description:"",value:"",status:"Pending"});
  const quotes=data.quotes||[];

  function resetForm(){setForm({client_name:"",description:"",value:"",status:"Pending"});setEditId(null);setShowForm(false);}

  async function saveQuote(){
    if(!form.description.trim()){alert("Please enter a description.");return;}
    if(editId){
      const existing = quotes.find(q=>q.id===editId);
      const updated = {...existing,...form,value:parseFloat(form.value||0),sync_status:"pending"};
      setData(d=>({...d,
        quotes:(d.quotes||[]).map(q=>q.id===editId?updated:q),
        syncQueue:[{id:genId(),table:"quotes",action:"update",data:updated,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])],
      }));
      await offlineSave("quotes",updated);
      setToast("Quote updated");
    } else {
      const item={id:genId(),user_id:userId,...form,value:parseFloat(form.value||0),sent_date:todayISO(),created_at:new Date().toISOString(),sync_status:"pending"};
      setData(d=>({...d,quotes:[item,...(d.quotes||[])],syncQueue:[{id:genId(),table:"quotes",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
      await offlineSave("quotes",item);
      setToast("Quote added");
    }
    resetForm();
  }

  async function deleteQuote(id){if(!window.confirm("Delete this quote?"))return;setData(d=>({...d,quotes:(d.quotes||[]).filter(q=>q.id!==id)}));}
  function startEdit(q){setForm({client_name:q.client_name||"",description:q.description||"",value:String(q.value||""),status:q.status||"Pending"});setEditId(q.id);setShowForm(true);}

  const filtered=quotes
    .filter(q=>filterStatus==="All"||q.status===filterStatus)
    .filter(q=>!search||[q.client_name,q.description].some(x=>x?.toLowerCase().includes(search.toLowerCase())));
  const totalValue=filtered.reduce((s,q)=>s+parseFloat(q.value||0),0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Quotes" subtitle={`${quotes.length} total · ${formatCurrency(totalValue)}`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>
      <AnimatePresence>{toast&&<Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>
      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId?"Edit Quote":"New Quote"}</p>
              <Field label="Client" value={form.client_name} onChange={v=>setForm(f=>({...f,client_name:v}))} placeholder="Client / branch"/>
              <Field label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="What the quote covers" multiline required/>
              <Field label="Value (R)" type="number" value={form.value} onChange={v=>setForm(f=>({...f,value:v}))} placeholder="0.00"/>
              <SelectField label="Status" value={form.status} onChange={v=>setForm(f=>({...f,status:v}))} options={["Pending","Accepted","Rejected","Expired"]}/>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveQuote}><Save size={14}/>{editId?"Update":"Add Quote"}</Btn>
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
                    <p className="text-sm font-bold text-slate-900">{q.client_name||"Unknown client"}</p>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{background:sc.bg,color:sc.text}}>{q.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{q.description}</p>
                  <p className="mt-1 text-base font-black" style={{color:BRAND.primary}}>{formatCurrency(q.value)}</p>
                  {q.sent_date&&<p className="text-xs text-slate-400 mt-0.5">Sent {smartDate(q.sent_date)}</p>}
                  {q.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={()=>startEdit(q)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13}/></button>
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

// ─── Notes ────────────────────────────────────────────────────────────────────
function NotesScreen({ data, setData, userId, isOnline }) {
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [toast,setToast]=useState("");
  const [form,setForm]=useState({client:"",note:""});
  const [pendingMedia,setPendingMedia]=useState([]);
  const notes=data.notes||[];

  function addMedia(m){ setPendingMedia(pm=>[...pm,m]); }
  function removeMedia(id){ setPendingMedia(pm=>pm.filter(m=>m.id!==id)); }

  async function addNote(){
    if(!form.note.trim()){alert("Please enter a note.");return;}
    const item={id:genId(),user_id:userId,...form,media:pendingMedia,created_at:new Date().toISOString(),sync_status:"pending"};
    setData(d=>({...d,notes:[item,...(d.notes||[])],syncQueue:[{id:genId(),table:"notes",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
    await offlineSave("notes",item);
    // Try upload media if online
    if(isOnline && pendingMedia.length>0){
      const uploaded = await Promise.all(pendingMedia.map(async m=>{
        const path=`notes/${item.id}/${m.id}`;
        const url=await uploadPhotoToSupabase(m.base64,path);
        return url?{...m,url,base64:undefined,uploadStatus:"done"}:m;
      }));
      const updatedItem={...item,media:uploaded};
      setData(d=>({...d,notes:(d.notes||[]).map(n=>n.id===item.id?updatedItem:n)}));
      await offlineSave("notes",updatedItem);
    }
    setForm({client:"",note:""});setPendingMedia([]);setShowForm(false);
    setToast("Note saved");
  }

  async function deleteNoteMedia(noteId, mediaId){
    const note=notes.find(n=>n.id===noteId);
    if(!note) return;
    const updated={...note,media:(note.media||[]).filter(m=>m.id!==mediaId)};
    setData(d=>({...d,notes:(d.notes||[]).map(n=>n.id===noteId?updated:n)}));
    await offlineSave("notes",updated);
  }

  async function deleteNote(id){if(!window.confirm("Delete this note?"))return;setData(d=>({...d,notes:(d.notes||[]).filter(n=>n.id!==id)}));}

  const filtered=notes.filter(n=>!search||[n.client,n.note].some(x=>x?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast&&<Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Field Notes" subtitle={`${notes.length} notes`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>
      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <Field label="Client / Branch" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} placeholder="Client name"/>
              <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} placeholder="Type your visit note…" multiline required/>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Attach Photos / Videos</label>
                <MediaPicker onAdd={addMedia}/>
                <MediaGallery media={pendingMedia} onDelete={removeMedia}/>
              </div>
              <Btn className="w-full" onClick={addNote}><Plus size={14}/>Add Note{pendingMedia.length>0?` + ${pendingMedia.length} file${pendingMedia.length!==1?"s":""}`:""}</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <SearchBar value={search} onChange={setSearch} placeholder="Search notes…"/>
      {filtered.length===0&&<Empty title="No notes yet" text="Add your first visit note." icon={Clipboard}/>}
      <div className="space-y-2">
        {filtered.map(n=>(
          <Card key={n.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{n.client||"General Note"}</p>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{n.note}</p>
                {(n.media||[]).length>0&&(
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <Paperclip size={11}/>{n.media.length} attachment{n.media.length!==1?"s":""}
                  </div>
                )}
                <MediaGallery media={n.media||[]} onDelete={mid=>deleteNoteMedia(n.id,mid)}/>
                <p className="mt-1.5 text-xs text-slate-400">{n.created_at?new Date(n.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):""}</p>
                {n.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
              </div>
              <button onClick={()=>deleteNote(n.id)} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Equipment ────────────────────────────────────────────────────────────────
function EquipmentScreen({ data, setData, userId, isOnline }) {
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("All");
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:"",type:"",make:"",model:"",serial:"",location:"",client:"",service_due:"",notes:""});
  const [pendingMedia,setPendingMedia]=useState([]);
  const equipment=data.equipment||[];

  function resetForm(){setForm({name:"",type:"",make:"",model:"",serial:"",location:"",client:"",service_due:"",notes:""});setEditId(null);setShowForm(false);setPendingMedia([]);}

  function addMedia(m){ setPendingMedia(pm=>[...pm,m]); }
  function removeMedia(id){ setPendingMedia(pm=>pm.filter(m=>m.id!==id)); }

  async function saveEquipment(){
    if(!form.name.trim()){alert("Equipment name is required.");return;}
    if(editId){
      const existing=equipment.find(e=>e.id===editId);
      const allMedia=[...(existing?.media||[]),...pendingMedia];
      const updated={...existing,...form,media:allMedia,sync_status:"pending"};
      setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===editId?updated:e)}));
      await offlineSave("equipment",updated);
      // Upload new media if online
      if(isOnline && pendingMedia.length>0){
        const uploaded=await Promise.all(pendingMedia.map(async m=>{
          const path=`equipment/${editId}/${m.id}`;
          const url=await uploadPhotoToSupabase(m.base64,path);
          return url?{...m,url,uploadStatus:"done"}:m;
        }));
        const finalItem={...updated,media:[...(existing?.media||[]),...uploaded]};
        setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===editId?finalItem:e)}));
        await offlineSave("equipment",finalItem);
      }
    } else {
      const item={id:genId(),user_id:userId,...form,media:pendingMedia,created_at:new Date().toISOString(),sync_status:"pending"};
      setData(d=>({...d,equipment:[item,...(d.equipment||[])],syncQueue:[{id:genId(),table:"equipment",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
      await offlineSave("equipment",item);
      if(isOnline && pendingMedia.length>0){
        const uploaded=await Promise.all(pendingMedia.map(async m=>{
          const path=`equipment/${item.id}/${m.id}`;
          const url=await uploadPhotoToSupabase(m.base64,path);
          return url?{...m,url,uploadStatus:"done"}:m;
        }));
        const finalItem={...item,media:uploaded};
        setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===item.id?finalItem:e)}));
        await offlineSave("equipment",finalItem);
      }
    }
    resetForm();
  }

  async function deleteEquipMedia(equipId, mediaId){
    const eq=equipment.find(e=>e.id===equipId);
    if(!eq) return;
    const updated={...eq,media:(eq.media||[]).filter(m=>m.id!==mediaId)};
    setData(d=>({...d,equipment:(d.equipment||[]).map(e=>e.id===equipId?updated:e)}));
    await offlineSave("equipment",updated);
  }

  async function deleteEquipment(id){if(!window.confirm("Delete this equipment record?"))return;setData(d=>({...d,equipment:(d.equipment||[]).filter(e=>e.id!==id)}));}

  function startEdit(e){
    setForm({name:e.name||"",type:e.type||"",make:e.make||"",model:e.model||"",serial:e.serial||"",location:e.location||"",client:e.client||"",service_due:e.service_due||"",notes:e.notes||""});
    setPendingMedia([]);
    setEditId(e.id);setShowForm(true);
  }

  const filtered=equipment
    .filter(e=>{
      const d=e.service_due?daysDiff(e.service_due):null;
      if(filter==="Overdue") return d!==null&&d<0;
      if(filter==="Due Soon") return d!==null&&d>=0&&d<=14;
      if(filter==="OK") return d===null||d>14;
      return true;
    })
    .filter(e=>!search||[e.name,e.type,e.make,e.model,e.serial,e.location,e.client].some(x=>x?.toLowerCase().includes(search.toLowerCase())));

  const overdueCount=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0).length;
  const dueSoonCount=equipment.filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)>=0&&daysDiff(e.service_due)<=14).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Equipment" subtitle={`${equipment.length} registered · ${overdueCount} overdue`}/>
        <Btn size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={14}/>:<Plus size={14}/>}{showForm?"Cancel":"Add"}</Btn>
      </div>

      {(overdueCount>0||dueSoonCount>0)&&(
        <div className="grid grid-cols-2 gap-3">
          {overdueCount>0&&<div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center"><p className="text-2xl font-black text-red-700">{overdueCount}</p><p className="text-xs font-bold text-red-500">Overdue Service</p></div>}
          {dueSoonCount>0&&<div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center"><p className="text-2xl font-black text-amber-700">{dueSoonCount}</p><p className="text-xs font-bold text-amber-500">Due in 14 Days</p></div>}
        </div>
      )}

      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
            <Card className="p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">{editId?"Edit Equipment":"Register Equipment"}</p>
              <Field label="Equipment Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. Main Compressor Unit" required/>
              <Field label="Type / Category" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} placeholder="e.g. Compressor, Generator, Pump…"/>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make / Brand" value={form.make} onChange={v=>setForm(f=>({...f,make:v}))} placeholder="e.g. Atlas Copco"/>
                <Field label="Model" value={form.model} onChange={v=>setForm(f=>({...f,model:v}))} placeholder="e.g. GA110"/>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Serial Number</label>
                <div className="relative">
                  <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input value={form.serial} onChange={e=>setForm(f=>({...f,serial:e.target.value}))} placeholder="Serial / Asset number"
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 pl-8 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors font-mono"/>
                </div>
              </div>
              <Field label="Location / Site" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="e.g. Pump Room B, Level 3"/>
              <Field label="Client / Site" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} placeholder="Linked client or site"/>
              <Field label="Next Service Due" type="date" value={form.service_due} onChange={v=>setForm(f=>({...f,service_due:v}))}/>
              <Field label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Additional notes…" multiline/>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Photos / Videos</label>
                <MediaPicker onAdd={addMedia}/>
                {pendingMedia.length>0&&(
                  <>
                    <p className="mt-2 text-xs text-slate-400">{pendingMedia.length} file{pendingMedia.length!==1?"s":""} ready to attach</p>
                    <MediaGallery media={pendingMedia} onDelete={removeMedia}/>
                  </>
                )}
                {editId&&(equipment.find(e=>e.id===editId)?.media||[]).length>0&&(
                  <>
                    <p className="mt-2 text-xs font-bold text-slate-500">Existing photos:</p>
                    <MediaGallery media={equipment.find(e=>e.id===editId)?.media||[]} onDelete={mid=>deleteEquipMedia(editId,mid)}/>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveEquipment}><Save size={14}/>{editId?"Update":"Register"}</Btn>
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
                  <p className="text-sm font-black text-slate-900">{eq.name}</p>
                  {eq.type&&<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{eq.type}</span>}
                  {eq.service_due&&<ServiceBadge dueDate={eq.service_due}/>}
                </div>
                {(eq.make||eq.model)&&<p className="text-xs text-slate-500">{[eq.make,eq.model].filter(Boolean).join(" · ")}</p>}
                {eq.serial&&(
                  <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
                    <Hash size={10} className="text-slate-400"/>
                    <span className="text-xs font-mono font-bold text-slate-600">{eq.serial}</span>
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {eq.location&&<span className="inline-flex items-center gap-1 text-xs text-slate-400"><MapPin size={10}/>{eq.location}</span>}
                  {eq.client&&<span className="inline-flex items-center gap-1 text-xs text-slate-400"><Users size={10}/>{eq.client}</span>}
                </div>
                {eq.service_due&&<p className="mt-1 text-xs text-slate-400">Service due: {smartDate(eq.service_due)}</p>}
                {eq.notes&&<p className="mt-1 text-xs text-slate-500 italic">{eq.notes}</p>}
                {(eq.media||[]).length>0&&(
                  <>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Paperclip size={11}/>{eq.media.length} photo{eq.media.length!==1?"s":""}
                    </div>
                    <MediaGallery media={eq.media||[]} onDelete={mid=>deleteEquipMedia(eq.id,mid)}/>
                  </>
                )}
                {eq.sync_status==="pending"&&<span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced</span>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={()=>startEdit(eq)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13}/></button>
                <button onClick={()=>deleteEquipment(eq.id)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={13}/></button>
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
  const pendingCount=(data.syncQueue||[]).filter(i=>i.status==="pending").length;
  function changePIN(){localStorage.removeItem(PIN_KEY);sessionStorage.removeItem(PIN_UNLOCKED_KEY);window.location.reload();}

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Sync, security & account"/>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sync</p>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-bold text-slate-800">{pendingCount} item{pendingCount!==1?"s":""} pending</p><p className="text-xs text-slate-400">{isOnline?"Connected":"Offline — syncs when connected"}</p></div>
          <Btn size="sm" variant={isOnline?"solid":"secondary"} onClick={onSyncNow} disabled={!isOnline||syncing||pendingCount===0}>
            <RefreshCw size={13} className={syncing?"animate-spin":""}/>
            {syncing?"Syncing…":"Sync Now"}
          </Btn>
        </div>
        {pendingCount>0
          ?<div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-700">⚠️ {pendingCount} items not yet synced to cloud</p></div>
          :<div className="rounded-xl bg-green-50 p-3"><p className="text-xs font-bold text-green-700">✓ All data synced</p></div>
        }
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notifications</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Push Notifications</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {notifPermission==="granted"?"✓ Active — follow-up & service reminders on":
               notifPermission==="denied"?"✗ Blocked in browser settings":
               "Daily summary + on-time follow-up & equipment alerts"}
            </p>
          </div>
          {notifPermission==="granted"
            ?<span className="shrink-0 text-green-600 text-xs font-bold">Active ✓</span>
            :notifPermission!=="denied"&&<Btn size="sm" variant="warning" onClick={onRequestNotif}><Bell size={13}/>Enable</Btn>
          }
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Security</p>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-bold text-slate-800">PIN Lock</p><p className="text-xs text-slate-400">Change your 6-digit PIN</p></div>
          <Btn size="sm" variant="secondary" onClick={changePIN}><Shield size={13}/>Change PIN</Btn>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Summary</p>
        {[
          {label:"Clients",count:(data.clients||[]).length},
          {label:"Follow-ups",count:(data.followups||[]).length},
          {label:"Quotes",count:(data.quotes||[]).length},
          {label:"Notes",count:(data.notes||[]).length},
          {label:"Equipment",count:(data.equipment||[]).length},
        ].map(({label,count})=>(
          <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="text-sm font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </Card>

      <Btn variant="danger" className="w-full" onClick={onLogout}><LogOut size={16}/>Log Out</Btn>
      <p className="text-center text-xs text-slate-300">PowerMate v2.1 · Power Works (Pty) Ltd</p>
    </div>
  );
}

// ─── Supabase Sync ────────────────────────────────────────────────────────────
async function pushSyncQueue(syncQueue, setData) {
  const pending=(syncQueue||[]).filter(i=>i.status==="pending");
  if(pending.length===0) return;
  const TABLE_MAP={companies:"clients",followups:"followups",notes:"notes",quotes:"quotes",equipment:"equipment"};
  const results=await Promise.allSettled(pending.map(async item=>{
    const table=TABLE_MAP[item.table]||item.table;
    if(item.action==="insert"||item.action==="upsert"){const{error}=await supabase.from(table).upsert(item.data,{onConflict:"id"});if(error)throw error;}
    else if(item.action==="update"){const{error}=await supabase.from(table).update(item.data).eq("id",item.data.id);if(error)throw error;}
    else if(item.action==="delete"){const{error}=await supabase.from(table).delete().eq("id",item.data.id);if(error)throw error;}
    return item.id;
  }));
  const ok=results.filter(r=>r.status==="fulfilled").map(r=>r.value);
  setData(d=>({
    ...d,
    syncQueue:(d.syncQueue||[]).filter(i=>!ok.includes(i.id)),
    clients:(d.clients||[]).map(c=>ok.includes(c.id)?{...c,sync_status:"synced"}:c),
    quotes:(d.quotes||[]).map(q=>ok.includes(q.id)?{...q,sync_status:"synced"}:q),
    followups:(d.followups||[]).map(f=>ok.includes(f.id)?{...f,sync_status:"synced"}:f),
    notes:(d.notes||[]).map(n=>ok.includes(n.id)?{...n,sync_status:"synced"}:n),
    equipment:(d.equipment||[]).map(e=>ok.includes(e.id)?{...e,sync_status:"synced"}:e),
  }));
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const isOnline=useOnlineStatus();
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [screen,setScreen]=useState("Home");
  const [syncing,setSyncing]=useState(false);
  const [pinState,setPinState]=useState("checking");
  const [notifPermission,setNotifPermission]=useState("Notification" in window?Notification.permission:"denied");
  const [data,setData]=useState({clients:[],followups:[],quotes:[],notes:[],equipment:[],syncQueue:[]});

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
    try{const saved=localStorage.getItem("powermate_v2_data");if(saved)setData(d=>({...d,...JSON.parse(saved)}));}
    catch(e){console.warn("Could not load local data",e);}
  },[]);

  // Save to localStorage - strip base64 media to avoid 5MB quota crash
  useEffect(()=>{
    try{
      const safeData = {
        ...data,
        notes: (data.notes||[]).map(n => ({...n, media: (n.media||[]).map(m => ({...m, base64: m.url ? undefined : m.base64?.slice(0,100)+"[truncated]"}))})),
        equipment: (data.equipment||[]).map(e => ({...e, media: (e.media||[]).map(m => ({...m, base64: m.url ? undefined : m.base64?.slice(0,100)+"[truncated]"}))})),
      };
      localStorage.setItem("powermate_v2_data", JSON.stringify(safeData));
    }
    catch(e){console.warn("Could not save local data",e);}
  },[data]);

  // Pull data from Supabase on login
  useEffect(()=>{
    if(!session||!isOnline) return;
    async function pullFromSupabase(){
      try {
        const uid = session.user.id;
        const [clientsRes, followupsRes, quotesRes, notesRes, equipRes] = await Promise.all([
          supabase.from("clients").select("*").eq("user_id", uid),
          supabase.from("followups").select("*").eq("user_id", uid),
          supabase.from("quotes").select("*").eq("user_id", uid),
          supabase.from("notes").select("*").eq("user_id", uid),
          supabase.from("equipment").select("*").eq("user_id", uid),
        ]);
        setData(d => ({
          ...d,
          clients:   clientsRes.data?.length   ? clientsRes.data   : d.clients,
          followups: followupsRes.data?.length  ? followupsRes.data : d.followups,
          quotes:    quotesRes.data?.length     ? quotesRes.data    : d.quotes,
          notes:     notesRes.data?.length      ? notesRes.data     : d.notes,
          equipment: equipRes.data?.length      ? equipRes.data     : d.equipment,
        }));
      } catch(e){ console.warn("Supabase pull failed:", e); }
    }
    pullFromSupabase();
  },[session?.user?.id, isOnline]);
  useEffect(()=>{
    if(notifPermission!=="granted") return;
    scheduleNotificationsViaSW(buildNotificationItems(data.followups,data.equipment));
  },[data.followups,data.equipment,notifPermission]);

  // Auto-sync when online
  useEffect(()=>{
    if(!isOnline||!session) return;
    const pending=(data.syncQueue||[]).filter(i=>i.status==="pending");
    if(pending.length===0) return;
    const t=setTimeout(()=>pushSyncQueue(data.syncQueue,setData),3000);
    return()=>clearTimeout(t);
  },[isOnline,session]);

  async function handleSyncNow(){setSyncing(true);await pushSyncQueue(data.syncQueue,setData);setSyncing(false);}

  async function handleRequestNotif(){
    const granted=await requestNotificationPermission();
    setNotifPermission(granted?"granted":"denied");
    if(granted) scheduleNotificationsViaSW(buildNotificationItems(data.followups,data.equipment));
  }

  async function logout(){localStorage.removeItem(PIN_KEY);sessionStorage.removeItem(PIN_UNLOCKED_KEY);await supabase.auth.signOut();setSession(null);}
  async function forgotPIN(){localStorage.removeItem(PIN_KEY);sessionStorage.removeItem(PIN_UNLOCKED_KEY);await supabase.auth.signOut();setSession(null);}

  const pendingCount=(data.syncQueue||[]).filter(i=>i.status==="pending").length;
  const flaggedQuotes=(data.quotes||[]).filter(q=>q.status==="Pending").length;
  const overdueEquip=(data.equipment||[]).filter(e=>e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0).length;

  if(loading) return <Spinner/>;
  if(!session) return <AuthScreen/>;
  if(pinState==="checking") return <Spinner/>;
  if(pinState==="setup") return <PINSetupScreen onComplete={()=>setPinState("unlocked")}/>;
  if(pinState==="locked") return <PINLockScreen onUnlock={()=>setPinState("unlocked")} onForgot={forgotPIN}/>;

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
    {icon:Home,      label:"Home",    key:"Home"},
    {icon:Users,     label:"Clients", key:"Clients"},
    {icon:Calendar,  label:"Follow",  key:"Followups"},
    {icon:FileIcon,  label:"Quotes",  key:"Quotes",    badge:flaggedQuotes||undefined},
    {icon:Clipboard, label:"Notes",   key:"Notes"},
    {icon:Wrench,    label:"Equip",   key:"Equipment", badge:overdueEquip||undefined},
    {icon:Settings,  label:"More",    key:"More",      badge:pendingCount||undefined},
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-24" style={{background:BRAND.light}}>
        <main className="mx-auto max-w-2xl px-4 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.15}}>
              {screens[screen]}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 backdrop-blur-md px-1 pt-1 pb-safe shadow-lg">
          <div className="mx-auto grid max-w-2xl grid-cols-7 gap-0.5">
            {NAV.map(({icon,label,key,badge})=>(
              <NavTab key={key} icon={icon} label={label} active={screen===key} onClick={()=>setScreen(key)} badge={badge}/>
            ))}
          </div>
        </nav>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing}/>
      </div>
    </ErrorBoundary>
  );
}
