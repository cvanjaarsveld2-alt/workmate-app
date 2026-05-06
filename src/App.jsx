import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";
import {
  Bell, BriefcaseBusiness, CalendarDays, Camera, ChevronRight,
  ClipboardList, FileText, Home, LogOut, Mail, Mic, Phone,
  Plus, Search, ShieldCheck, Trash2, Upload, Users, Wrench, X,
  Eye, EyeOff, AlertTriangle, CheckCircle, BarChart2, RefreshCw,
  WifiOff, Wifi, Share2, MessageCircle, Copy, PenLine, ChevronLeft,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = ["New Lead", "Contacted", "Quoted", "Active", "Won", "Lost"];
const STAGE_COLORS = {
  "New Lead":  "bg-slate-100 text-slate-700",
  "Contacted": "bg-blue-100 text-blue-700",
  "Quoted":    "bg-amber-100 text-amber-700",
  "Active":    "bg-purple-100 text-purple-700",
  "Won":       "bg-green-100 text-green-700",
  "Lost":      "bg-red-100 text-red-700",
};
const OFFLINE_KEY = "powermate_offline_queue";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);
const niceDate = (d = new Date()) => d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const daysSince = (ds) => { if (!ds) return 999; return Math.max(0, Math.floor((new Date(`${todayISO()}T12:00:00`) - new Date(`${ds}T12:00:00`)) / 86400000)); };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); };
const weekEnd = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 7); return d.toISOString().slice(0, 10); };
const formatBytes = (b) => { if (!b) return "0 B"; const k = 1024, s = ["B","KB","MB","GB"], i = Math.floor(Math.log(b)/Math.log(k)); return `${(b/Math.pow(k,i)).toFixed(1)} ${s[i]}`; };
const addDays = (dateStr, days) => { const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const monthLabel = (d) => new Date(d).toLocaleDateString("en-GB", { month: "short" });

// ─── Offline Queue ────────────────────────────────────────────────────────────
const getQueue = () => { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch { return []; } };
const addToQueue = (op) => { const q = getQueue(); q.push({ ...op, id: Date.now() }); localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); };
const clearQueue = () => localStorage.removeItem(OFFLINE_KEY);

const processOfflineQueue = async () => {
  const queue = getQueue();
  if (queue.length === 0) return;
  const failed = [];
  for (const op of queue) {
    try {
      if (op.type === "insert") await supabase.from(op.table).insert(op.data);
      else if (op.type === "update") await supabase.from(op.table).update(op.data).eq("id", op.id);
      else if (op.type === "delete") await supabase.from(op.table).delete().eq("id", op.id);
    } catch { failed.push(op); }
  }
  if (failed.length > 0) localStorage.setItem(OFFLINE_KEY, JSON.stringify(failed));
  else clearQueue();
};

// ─── Notifications ────────────────────────────────────────────────────────────
const requestNotifPermission = async () => { if (!("Notification" in window)) return false; if (Notification.permission === "granted") return true; return (await Notification.requestPermission()) === "granted"; };
const scheduleNotif = (title, body, fireAt) => { const delay = fireAt - Date.now(); if (delay <= 0) return null; return setTimeout(() => { if (Notification.permission === "granted") new Notification(title, { body, icon: "/icon-192.png" }); }, delay); };
const scheduleItemNotifs = (item, mins) => { if (!item.date || !item.time) return []; const mt = new Date(`${item.date}T${item.time}:00`).getTime(); return mins.map(m => scheduleNotif(`⏰ PowerMate`, `${item.title}${item.client ? ` — ${item.client}` : ""} in ${m === 60 ? "1 hour" : `${m} min`}`, mt - m * 60000)).filter(Boolean); };

// ─── Upload ───────────────────────────────────────────────────────────────────
const uploadFile = async (file) => {
  try {
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `${Date.now()}-${clean}`;
    const { error } = await supabase.storage.from("powermate-files").upload(name, file, { cacheControl: "3600", upsert: false });
    if (error) { alert("Upload error: " + error.message); return null; }
    return supabase.storage.from("powermate-files").getPublicUrl(name).data.publicUrl;
  } catch (e) { alert("Upload failed: " + e.message); return null; }
};
const filesToStored = async (fileList) => { const out = []; for (const f of Array.from(fileList || [])) { const url = await uploadFile(f); if (url) out.push({ name: f.name, type: f.type || "File", size: f.size, url }); } return out; };

// ─── Photo Annotation ─────────────────────────────────────────────────────────
function PhotoAnnotator({ src, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [notePos, setNotePos] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    if (!imgLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      notes.forEach(n => {
        ctx.fillStyle = "rgba(234,179,8,0.85)";
        ctx.font = `bold ${Math.max(16, img.width / 40)}px Arial`;
        const tw = ctx.measureText(n.text).width;
        const pad = 10; const fh = Math.max(16, img.width / 40) + pad * 2;
        ctx.fillRect(n.x * img.width - pad, n.y * img.height - fh + pad, tw + pad * 2, fh);
        ctx.fillStyle = "#1e293b";
        ctx.fillText(n.text, n.x * img.width, n.y * img.height);
      });
    };
    img.src = src;
  }, [notes, imgLoaded, src]);

  const handleCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setNotePos({ x, y });
    setNewNote("");
  };

  const addNote = () => {
    if (!newNote.trim() || !notePos) return;
    setNotes(n => [...n, { ...notePos, text: newNote.trim() }]);
    setNotePos(null); setNewNote("");
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="flex items-center justify-between p-4">
        <button onClick={onCancel} className="text-white"><ChevronLeft size={24} /></button>
        <p className="font-bold text-white">Annotate Photo</p>
        <button onClick={save} className="rounded-xl bg-yellow-400 px-4 py-2 font-bold text-slate-900">Save</button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="relative" onClick={handleCanvasClick}>
          <img src={src} alt="annotate" className="w-full rounded-xl" onLoad={() => setImgLoaded(true)} style={{ display: "none" }} />
          <canvas ref={canvasRef} className="w-full rounded-xl cursor-crosshair" />
          <p className="mt-2 text-center text-xs text-slate-400">Tap anywhere on the photo to add a note</p>
        </div>
      </div>
      {notePos && (
        <div className="p-4 bg-slate-800">
          <p className="mb-2 text-sm font-semibold text-white">Note text:</p>
          <div className="flex gap-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Type your note…" className="flex-1 rounded-xl border border-slate-600 bg-slate-700 p-3 text-white outline-none" autoFocus />
            <button onClick={addNote} className="rounded-xl bg-yellow-400 px-4 font-bold text-slate-900">Add</button>
            <button onClick={() => setNotePos(null)} className="rounded-xl bg-slate-600 px-4 text-white">✕</button>
          </div>
        </div>
      )}
      {notes.length > 0 && (
        <div className="p-4 bg-slate-800 border-t border-slate-700">
          <p className="text-xs font-bold text-slate-400 mb-2">NOTES ({notes.length})</p>
          {notes.map((n, i) => (
            <div key={i} className="flex items-center justify-between mb-1">
              <p className="text-sm text-white">{n.text}</p>
              <button onClick={() => setNotes(ns => ns.filter((_, j) => j !== i))} className="text-red-400 text-xs ml-3">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Signature Pad ────────────────────────────────────────────────────────────
function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  const draw = (e) => { e.preventDefault(); if (!drawing.current) return; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.lineWidth = 2; ctx.strokeStyle = "#1e293b"; ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
  const stop = () => { drawing.current = false; };
  const clear = () => { const canvas = canvasRef.current; canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height); };
  const save = () => { const canvas = canvasRef.current; onSave(canvas.toDataURL("image/png")); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between p-4 border-b">
        <button onClick={onCancel} className="text-slate-500"><ChevronLeft size={24} /></button>
        <p className="font-bold text-slate-900">Client Signature</p>
        <button onClick={save} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white">Save</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="mb-4 text-sm text-slate-500">Sign below to confirm the service report</p>
        <canvas ref={canvasRef} width={600} height={300} className="w-full max-w-lg rounded-2xl border-2 border-dashed border-slate-300 touch-none bg-slate-50 cursor-crosshair"
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
        <button onClick={clear} className="mt-4 rounded-xl bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">Clear signature</button>
      </div>
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────────────────────
function ShareModal({ title, text, url, onClose }) {
  const [copied, setCopied] = useState(false);
  const whatsapp = () => { window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n\n${text}${url ? `\n\n${url}` : ""}`)}`); };
  const email = () => { window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}${url ? `\n\n${url}` : ""}`)}` ; };
  const copy = () => { navigator.clipboard.writeText(`${title}\n\n${text}${url ? `\n\n${url}` : ""}`); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="w-full rounded-t-3xl bg-white p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">Share</h2>
        <p className="text-sm text-slate-500 truncate">{title}</p>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={whatsapp} className="flex flex-col items-center gap-2 rounded-2xl bg-green-50 p-4">
            <MessageCircle size={28} className="text-green-600" />
            <p className="text-xs font-semibold text-green-700">WhatsApp</p>
          </button>
          <button onClick={email} className="flex flex-col items-center gap-2 rounded-2xl bg-blue-50 p-4">
            <Mail size={28} className="text-blue-600" />
            <p className="text-xs font-semibold text-blue-700">Email</p>
          </button>
          <button onClick={copy} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-4">
            {copied ? <CheckCircle size={28} className="text-green-600" /> : <Copy size={28} className="text-slate-600" />}
            <p className="text-xs font-semibold text-slate-700">{copied ? "Copied!" : "Copy"}</p>
          </button>
        </div>
        <button onClick={onClose} className="w-full rounded-2xl bg-slate-100 py-3 font-semibold text-slate-700">Cancel</button>
      </motion.div>
    </motion.div>
  );
}

// ─── UI primitives ────────────────────────────────────────────────────────────
const Card = ({ className = "", children }) => <div className={`bg-white ${className}`}>{children}</div>;
const CC = ({ className = "", children }) => <div className={className}>{children}</div>;

function Btn({ children, className = "", variant = "solid", onClick, type = "button", disabled = false }) {
  const s = variant === "outline" ? "border border-slate-200 bg-white text-slate-900" : variant === "danger" ? "bg-red-50 text-red-700" : "bg-slate-900 text-white";
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 px-4 py-3 ${s} ${className}`}>{children}</button>;
}

function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
      {multiline ? <textarea rows={3} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500" /> : <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500" />}
    </div>
  );
}

function BigAction({ icon: Icon, title, subtitle, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:scale-[1.01] hover:shadow-md">
      <div className="rounded-2xl bg-slate-900 p-4 text-white"><Icon size={26} /></div>
      <div className="flex-1"><p className="text-lg font-bold text-slate-900">{title}</p><p className="text-sm text-slate-500">{subtitle}</p></div>
      <ChevronRight className="text-slate-400" />
    </button>
  );
}

function NavTab({ icon: Icon, label, active, onClick }) {
  return <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition ${active ? "bg-slate-900 text-white" : "text-slate-500"}`}><Icon size={20} />{label}</button>;
}

function Empty({ title, text }) {
  return <div className="rounded-3xl bg-white p-5 text-center shadow-sm"><p className="font-bold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}

function Spinner() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" /></div>;
}

// ─── Offline Banner ───────────────────────────────────────────────────────────
function OfflineBanner({ isOnline, queueCount }) {
  if (isOnline && queueCount === 0) return null;
  return (
    <div className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-2 py-2 text-sm font-semibold ${isOnline ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`}>
      {isOnline ? <><Wifi size={16} />Back online — syncing {queueCount} item{queueCount !== 1 ? "s" : ""}…</> : <><WifiOff size={16} />Offline — changes saved locally</>}
    </div>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [newPw, setNewPw] = useState(""); const [confirmPw, setConfirmPw] = useState(""); const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false); const [loading, setLoading] = useState(false); const [msg, setMsg] = useState({ text: "", type: "error" });

  useEffect(() => { if (window.location.hash.includes("type=recovery")) setMode("resetpw"); }, []);

  const showMsg = (text, type = "error") => setMsg({ text, type });

  const login = async () => { if (!email || !password) { showMsg("Please enter email and password."); return; } setLoading(true); setMsg({ text: "" }); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) showMsg(error.message); setLoading(false); };
  const signup = async () => { if (!email || !password || !name) { showMsg("Please fill in all fields."); return; } if (password.length < 6) { showMsg("Password must be at least 6 characters."); return; } setLoading(true); setMsg({ text: "" }); const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } }); if (error) { showMsg(error.message); setLoading(false); return; } if (data.user) await supabase.from("users").upsert({ id: data.user.id, email, full_name: name, role: "employee" }); showMsg("Account created! You can now log in.", "success"); setMode("login"); setLoading(false); };
  const forgotPw = async () => { if (!email) { showMsg("Please enter your email address."); return; } setLoading(true); setMsg({ text: "" }); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://workmate-app-pez6.vercel.app" }); if (error) showMsg(error.message); else showMsg("Reset email sent! Check your inbox.", "success"); setLoading(false); };
  const resetPw = async () => { if (!newPw || !confirmPw) { showMsg("Please fill in both fields."); return; } if (newPw !== confirmPw) { showMsg("Passwords do not match."); return; } setLoading(true); const { error } = await supabase.auth.updateUser({ password: newPw }); if (error) showMsg(error.message); else { showMsg("Password updated! Please log in.", "success"); setTimeout(() => { setMode("login"); window.location.hash = ""; }, 2000); } setLoading(false); };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 rounded-3xl bg-slate-900 p-5 text-white shadow-lg"><ClipboardList size={36} /></div>
          <h1 className="text-3xl font-black text-slate-900">PowerMate</h1>
          <p className="mt-1 text-sm text-slate-500">Mobile sales & service assistant</p>
        </div>
        <Card className="rounded-3xl shadow-sm">
          <CC className="space-y-4 p-6">
            {mode === "resetpw" && (<><h2 className="text-xl font-bold">Set new password</h2><div><label className="mb-1 block text-sm font-semibold text-slate-800">New password</label><div className="relative"><input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500 pr-12" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div><Field label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />{msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}<Btn className="w-full rounded-2xl py-4" onClick={resetPw} disabled={loading}>{loading ? "Updating…" : "Set new password"}</Btn></>)}
            {mode === "forgot" && (<><div><h2 className="text-xl font-bold">Reset password</h2><p className="mt-1 text-sm text-slate-500">We'll send you a reset link.</p></div><Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />{msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}<Btn className="w-full rounded-2xl py-4" onClick={forgotPw} disabled={loading}>{loading ? "Sending…" : "Send reset email"}</Btn><button onClick={() => { setMode("login"); setMsg({ text: "" }); }} className="w-full text-center text-sm text-slate-500 underline">← Back to login</button></>)}
            {(mode === "login" || mode === "signup") && (<><div className="flex rounded-2xl bg-slate-100 p-1">{["login","signup"].map(m => <button key={m} onClick={() => { setMode(m); setMsg({ text: "" }); }} className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${mode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{m === "login" ? "Log in" : "Sign up"}</button>)}</div>{mode === "signup" && <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />}<Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" /><div><label className="mb-1 block text-sm font-semibold text-slate-800">Password</label><div className="relative"><input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500 pr-12" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>{mode === "login" && <button onClick={() => { setMode("forgot"); setMsg({ text: "" }); }} className="text-sm text-slate-500 underline text-left">Forgot password?</button>}{msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}<Btn className="w-full rounded-2xl py-4 text-base" onClick={mode === "login" ? login : signup} disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</Btn></>)}
          </CC>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Pipeline Screen ──────────────────────────────────────────────────────────
function PipelineScreen({ data, setData, userId, isOnline }) {
  const [dragging, setDragging] = useState(null);
  const [shareModal, setShareModal] = useState(null);

  const grouped = useMemo(() => {
    const g = {};
    PIPELINE_STAGES.forEach(s => g[s] = []);
    data.clients.forEach(c => { const s = c.pipeline_status || "New Lead"; if (g[s]) g[s].push(c); else g["New Lead"].push(c); });
    return g;
  }, [data.clients]);

  const moveClient = async (clientId, newStage) => {
    if (isOnline) await supabase.from("clients").update({ pipeline_status: newStage }).eq("id", clientId).eq("user_id", userId);
    else addToQueue({ type: "update", table: "clients", id: clientId, data: { pipeline_status: newStage } });
    setData(c => ({ ...c, clients: c.clients.map(cl => cl.id === clientId ? { ...cl, pipeline_status: newStage } : cl) }));
  };

  const onDragStart = (e, client) => { setDragging(client); e.dataTransfer.effectAllowed = "move"; };
  const onDrop = (e, stage) => { e.preventDefault(); if (dragging) { moveClient(dragging.id, stage); setDragging(null); } };
  const onDragOver = e => e.preventDefault();

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Sales Pipeline</h1><p className="text-sm text-slate-500">Drag clients between stages to track progress.</p></div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map(stage => (
          <div key={stage} className="min-w-[200px] rounded-3xl bg-slate-100 p-3 flex-shrink-0" onDrop={e => onDrop(e, stage)} onDragOver={onDragOver}>
            <div className="mb-3 flex items-center justify-between">
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${STAGE_COLORS[stage]}`}>{stage}</span>
              <span className="rounded-xl bg-white px-2 py-1 text-xs font-bold text-slate-500">{grouped[stage]?.length || 0}</span>
            </div>
            <div className="space-y-2">
              {(grouped[stage] || []).map(client => (
                <div key={client.id} draggable onDragStart={e => onDragStart(e, client)}
                  className="rounded-2xl bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing">
                  <p className="font-bold text-slate-900 text-sm">{client.company}</p>
                  {client.division && <p className="text-xs text-slate-500">{client.division}</p>}
                  {client.contact && <p className="text-xs text-slate-400">{client.contact}</p>}
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {PIPELINE_STAGES.filter(s => s !== stage).map(s => (
                      <button key={s} onClick={() => moveClient(client.id, s)} className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${STAGE_COLORS[s]}`}>→ {s}</button>
                    ))}
                  </div>
                  <button onClick={() => setShareModal({ title: client.company, text: `Client: ${client.company}\nStage: ${stage}\nContact: ${client.contact || "-"}\nPhone: ${client.phone || "-"}` })} className="mt-2 flex items-center gap-1 text-xs text-slate-400"><Share2 size={12} />Share</button>
                </div>
              ))}
              {grouped[stage]?.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Drop clients here</p>}
            </div>
          </div>
        ))}
      </div>
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
    </div>
  );
}

// ─── Dashboard Charts ─────────────────────────────────────────────────────────
function DashboardScreen({ data, userId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true);
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return { label: d.toLocaleDateString("en-GB", { month: "short" }), year: d.getFullYear(), month: d.getMonth() + 1, from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-31` }; });
    const monthStats = await Promise.all(months.map(async m => {
      const [convs, fus, svcs, clients] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", m.from).lte("created_at", m.to),
        supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("due_date", m.from).lte("due_date", m.to),
        supabase.from("service_reports").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", m.from).lte("created_at", m.to),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", m.from).lte("created_at", m.to),
      ]);
      return { label: m.label, visits: convs.count || 0, followUps: fus.count || 0, serviceReports: svcs.count || 0, newClients: clients.count || 0 };
    }));
    const pipeline = {};
    PIPELINE_STAGES.forEach(s => pipeline[s] = data.clients.filter(c => (c.pipeline_status || "New Lead") === s).length);
    setStats({ months: monthStats, pipeline });
    setLoading(false);
  };

  const BarChart = ({ data: chartData, dataKey, color, label }) => {
    const max = Math.max(...chartData.map(d => d[dataKey]), 1);
    return (
      <Card className="rounded-3xl shadow-sm">
        <CC className="p-4">
          <p className="mb-3 text-sm font-bold text-slate-700">{label}</p>
          <div className="flex items-end gap-2 h-32">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-xs font-bold text-slate-700">{d[dataKey] || ""}</p>
                <div className="w-full rounded-t-xl transition-all" style={{ height: `${(d[dataKey] / max) * 100}%`, minHeight: d[dataKey] > 0 ? "8px" : "2px", backgroundColor: color }} />
                <p className="text-xs text-slate-400">{d.label}</p>
              </div>
            ))}
          </div>
        </CC>
      </Card>
    );
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading dashboard…</div>;

  const totals = stats.months.reduce((a, m) => ({ visits: a.visits + m.visits, followUps: a.followUps + m.followUps, serviceReports: a.serviceReports + m.serviceReports, newClients: a.newClients + m.newClients }), { visits: 0, followUps: 0, serviceReports: 0, newClients: 0 });

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">My Dashboard</h1><p className="text-sm text-slate-500">Last 6 months performance.</p></div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        {[["Total Visits", totals.visits, "#3b82f6"], ["New Clients", totals.newClients, "#10b981"], ["Follow-ups", totals.followUps, "#f59e0b"], ["Service Reports", totals.serviceReports, "#8b5cf6"]].map(([l, v, c]) => (
          <Card key={l} className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-sm text-slate-500">{l}</p><p className="text-3xl font-black" style={{ color: c }}>{v}</p></CC></Card>
        ))}
      </div>

      {/* Charts */}
      <BarChart data={stats.months} dataKey="visits" color="#3b82f6" label="Monthly Visits / Conversations" />
      <BarChart data={stats.months} dataKey="newClients" color="#10b981" label="New Clients per Month" />
      <BarChart data={stats.months} dataKey="followUps" color="#f59e0b" label="Follow-ups per Month" />
      <BarChart data={stats.months} dataKey="serviceReports" color="#8b5cf6" label="Service Reports per Month" />

      {/* Pipeline summary */}
      <Card className="rounded-3xl shadow-sm">
        <CC className="p-4">
          <p className="mb-3 text-sm font-bold text-slate-700">Pipeline Summary</p>
          <div className="space-y-2">
            {PIPELINE_STAGES.map(s => (
              <div key={s} className="flex items-center gap-3">
                <span className={`w-24 rounded-xl px-2 py-1 text-xs font-bold text-center ${STAGE_COLORS[s]}`}>{s}</span>
                <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${((stats.pipeline[s] || 0) / Math.max(data.clients.length, 1)) * 100}%` }} />
                </div>
                <span className="text-sm font-bold text-slate-700">{stats.pipeline[s] || 0}</span>
              </div>
            ))}
          </div>
        </CC>
      </Card>
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function HomeScreen({ go, clients, planList, followUps, setData, userId, isOnline }) {
  const [view, setView] = useState("main");
  const due = followUps.filter(f => !f.completed && f.due_date && f.due_date <= todayISO());

  const delPlan = async id => { if (isOnline) await supabase.from("plan_items").delete().eq("id", id).eq("user_id", userId); else addToQueue({ type: "delete", table: "plan_items", id }); setData(c => ({ ...c, planList: c.planList.filter(i => i.id !== id) })); };
  const updPlan = async (id, field, val) => { if (isOnline) await supabase.from("plan_items").update({ [field]: val }).eq("id", id).eq("user_id", userId); else addToQueue({ type: "update", table: "plan_items", id, data: { [field]: val } }); setData(c => ({ ...c, planList: c.planList.map(i => i.id === id ? { ...i, [field]: val } : i) })); };
  const updFU = async (id, field, val) => { if (isOnline) await supabase.from("follow_ups").update({ [field]: val }).eq("id", id).eq("user_id", userId); else addToQueue({ type: "update", table: "follow_ups", id, data: { [field]: val } }); setData(c => ({ ...c, followUps: c.followUps.map(f => f.id === id ? { ...f, [field]: val } : f) })); };

  if (view === "today") return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => setView("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">Today's jobs / visits</h1>
      {planList.length === 0 && <Empty title="No items planned" text="Add jobs from the Calendar screen." />}
      {planList.map(item => (<Card key={item.id} className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4"><div className="grid grid-cols-2 gap-3"><Field label="Date" type="date" value={item.date} onChange={v => updPlan(item.id, "date", v)} /><Field label="Time" type="time" value={item.time} onChange={v => updPlan(item.id, "time", v)} /></div><Field label="Title" value={item.title} onChange={v => updPlan(item.id, "title", v)} /><Field label="Client" value={item.client} onChange={v => updPlan(item.id, "client", v)} /><Btn variant="danger" className="w-full rounded-2xl" onClick={() => delPlan(item.id)}>Delete</Btn></CC></Card>))}
    </div>
  );

  if (view === "followups") return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => setView("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">My Follow-ups</h1>
      {followUps.length === 0 && <Empty title="No follow-ups yet" text="Create one from a client profile." />}
      {followUps.map(f => (<Card key={f.id} className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4"><h2 className="text-lg font-bold">{f.client_name || "Follow-up"}</h2><Field label="Due date" type="date" value={f.due_date} onChange={v => updFU(f.id, "due_date", v)} /><Field label="Status" value={f.status} onChange={v => updFU(f.id, "status", v)} /><Field label="Outcome" multiline value={f.outcome} onChange={v => updFU(f.id, "outcome", v)} />{f.recurring && <div className="rounded-2xl bg-blue-50 p-3 text-xs text-blue-700 font-semibold">🔄 Recurring every {f.recurring_days} days</div>}<label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-semibold">Completed<input type="checkbox" checked={!!f.completed} onChange={e => updFU(f.id, "completed", e.target.checked)} className="h-5 w-5 accent-slate-900" /></label></CC></Card>))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
        <p className="text-sm text-slate-300">Today, {niceDate()}</p>
        <h1 className="mt-1 text-3xl font-bold">Your day is ready</h1>
        <p className="mt-2 text-slate-300">{planList.length} planned · {due.length} follow-ups due</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setView("today")} className="text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-sm text-slate-500">Today</p><p className="text-3xl font-bold">{planList.length}</p><p className="text-sm text-slate-500">jobs / visits</p></CC></Card></button>
        <button onClick={() => setView("followups")} className="text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-sm text-slate-500">Follow-ups</p><p className="text-3xl font-bold">{due.length}</p><p className="text-sm text-slate-500">due now</p></CC></Card></button>
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Quick actions</h2>
        <BigAction icon={CalendarDays} title="Calendar" subtitle="Manage your calendar items" onClick={() => go("Calendar")} />
        <BigAction icon={Plus} title="Add conversation" subtitle="Log a visit, call or WhatsApp" onClick={() => go("QuickAdd")} />
        <BigAction icon={Wrench} title="Service report" subtitle="Fault, work done, parts and PDF" onClick={() => go("Service")} />
        <BigAction icon={Camera} title="Photos / Documents" subtitle="Upload files linked to a client" onClick={() => go("Documents")} />
      </div>
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function CalendarScreen({ data, setData, userId, isOnline }) {
  const [ni, setNi] = useState({ date: todayISO(), time: "", title: "", client: "", location: "", type: "Follow-up", reminder: "30" });
  const [notifGranted, setNotifGranted] = useState(Notification?.permission === "granted");
  const timers = useRef([]);

  const enableNotifs = async () => { const g = await requestNotifPermission(); setNotifGranted(g); if (!g) alert("Notifications blocked. Please allow in browser settings."); };

  const add = async () => {
    if (!ni.date || !ni.time || !ni.title) { alert("Please add a date, time and title."); return; }
    const payload = { user_id: userId, date: ni.date, time: ni.time, title: ni.title, client: ni.client, location: ni.location, type: ni.type, reminder: ni.reminder };
    let item;
    if (isOnline) { const { data: r } = await supabase.from("plan_items").insert(payload).select().single(); item = r; }
    else { item = { ...payload, id: `offline_${Date.now()}` }; addToQueue({ type: "insert", table: "plan_items", data: payload }); }
    if (item) { setData(c => ({ ...c, planList: [...c.planList, item] })); if (notifGranted) { const t = scheduleItemNotifs(item, [parseInt(ni.reminder)]); timers.current.push(...t); } }
    setNi({ date: todayISO(), time: "", title: "", client: "", location: "", type: "Follow-up", reminder: "30" });
  };

  const upd = async (id, field, val) => { if (isOnline) await supabase.from("plan_items").update({ [field]: val }).eq("id", id).eq("user_id", userId); else addToQueue({ type: "update", table: "plan_items", id, data: { [field]: val } }); setData(c => ({ ...c, planList: c.planList.map(i => i.id === id ? { ...i, [field]: val } : i) })); };
  const del = async id => { if (isOnline) await supabase.from("plan_items").delete().eq("id", id).eq("user_id", userId); else addToQueue({ type: "delete", table: "plan_items", id }); setData(c => ({ ...c, planList: c.planList.filter(i => i.id !== id) })); };

  const grouped = useMemo(() => { const g = {}; [...data.planList].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).forEach(item => { const d = item.date || "No date"; if (!g[d]) g[d] = []; g[d].push(item); }); return g; }, [data.planList]);
  const gcal = item => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title || "")}&location=${encodeURIComponent(item.location || "")}&details=${encodeURIComponent(item.client || "")}`;

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Calendar</h1><p className="text-sm text-slate-500">Your schedule with reminders.</p></div>
      {!notifGranted && (<div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4"><div className="flex items-center gap-2"><Bell size={18} className="text-amber-600" /><p className="text-sm font-semibold text-amber-800">Enable notifications for meeting reminders</p></div><Btn className="rounded-xl text-sm py-2" onClick={enableNotifs}>Enable</Btn></div>)}
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <h2 className="font-bold">Add new item</h2>
          <div className="grid grid-cols-2 gap-3"><Field label="Date" type="date" value={ni.date} onChange={v => setNi(i => ({ ...i, date: v }))} /><Field label="Time" type="time" value={ni.time} onChange={v => setNi(i => ({ ...i, time: v }))} /></div>
          <Field label="Title" value={ni.title} onChange={v => setNi(i => ({ ...i, title: v }))} placeholder="Meeting title" />
          <select value={ni.client} onChange={e => setNi(i => ({ ...i, client: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Select client (optional)</option>{data.clients.map(c => <option key={c.id} value={`${c.company}${c.division ? ` - ${c.division}` : ""}`}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}</select>
          <Field label="Location" value={ni.location} onChange={v => setNi(i => ({ ...i, location: v }))} placeholder="Location (optional)" />
          <select value={ni.type} onChange={e => setNi(i => ({ ...i, type: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4"><option>Follow-up</option><option>Service</option><option>Sales</option><option>Meeting</option><option>Site visit</option></select>
          <div><label className="mb-1 block text-sm font-semibold text-slate-800">Remind me before</label><div className="grid grid-cols-3 gap-2">{[["15","15 min"],["30","30 min"],["60","1 hour"]].map(([val, label]) => (<button key={val} onClick={() => setNi(i => ({ ...i, reminder: val }))} className={`rounded-2xl border py-3 text-sm font-semibold transition ${ni.reminder === val ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>{label}</button>))}</div></div>
          <Btn className="w-full rounded-2xl py-6" onClick={add}>Add calendar item</Btn>
        </CC>
      </Card>
      {Object.keys(grouped).length === 0 && <Empty title="No calendar items" text="Add your first item above." />}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs font-bold text-slate-500 uppercase">{date === todayISO() ? "Today" : new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</span><div className="h-px flex-1 bg-slate-200" /></div>
          {items.map(item => (
            <Card key={item.id} className="rounded-3xl shadow-sm"><CC className="p-4">
              <div className="mb-3 flex items-center gap-3"><div className="rounded-2xl bg-slate-100 p-3 text-center min-w-[60px]"><p className="text-sm font-black">{item.time || "--:--"}</p><p className="text-xs text-slate-500">{item.type}</p></div><div className="flex-1"><p className="font-bold">{item.title}</p>{item.client && <p className="text-sm text-slate-500">{item.client}</p>}{item.location && <p className="text-xs text-slate-400">{item.location}</p>}{item.reminder && <p className="mt-1 text-xs text-amber-600 font-semibold">⏰ {item.reminder === "60" ? "1 hour" : `${item.reminder} min`} reminder</p>}</div></div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2"><Field label="Date" type="date" value={item.date} onChange={v => upd(item.id, "date", v)} /><Field label="Time" type="time" value={item.time} onChange={v => upd(item.id, "time", v)} /></div>
                <Field label="Title" value={item.title} onChange={v => upd(item.id, "title", v)} />
                <div><label className="mb-1 block text-sm font-semibold text-slate-800">Reminder</label><div className="grid grid-cols-3 gap-2">{[["15","15 min"],["30","30 min"],["60","1 hour"]].map(([val, label]) => (<button key={val} onClick={() => upd(item.id, "reminder", val)} className={`rounded-2xl border py-2 text-xs font-semibold transition ${item.reminder === val ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>{label}</button>))}</div></div>
                <a href={gcal(item)} target="_blank" rel="noreferrer"><Btn className="w-full rounded-2xl"><CalendarDays size={18} />Google Calendar</Btn></a>
                <Btn variant="danger" className="w-full rounded-2xl" onClick={() => del(item.id)}>Delete</Btn>
              </div>
            </CC></Card>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── QuickAdd ─────────────────────────────────────────────────────────────────
function QuickAddScreen({ data, setData, go, userId, userName, isOnline }) {
  const [selId, setSelId] = useState(""); const [nc, setNc] = useState({ company: "", division: "", contact: "", phone: "", email: "", location: "" });
  const [note, setNote] = useState(""); const [nextFU, setNextFU] = useState(""); const [recurring, setRecurring] = useState(false); const [recurringDays, setRecurringDays] = useState("7");
  const [rec, setRec] = useState(false); const [mr, setMr] = useState(null); const [audio, setAudio] = useState(""); const [audioErr, setAudioErr] = useState("");
  const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(false); const [annotating, setAnnotating] = useState(null);
  const sel = data.clients.find(c => c.id === selId);

  const startRec = async () => { try { setAudioErr(""); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); const chunks = []; recorder.ondataavailable = e => e.data?.size > 0 && chunks.push(e.data); recorder.onstop = () => { const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" }); const r = new FileReader(); r.onload = () => setAudio(r.result); r.readAsDataURL(blob); stream.getTracks().forEach(t => t.stop()); }; recorder.start(); setMr(recorder); setRec(true); } catch { setAudioErr("Microphone permission blocked."); } };
  const stopRec = () => { if (!mr || !rec) return; mr.stop(); setRec(false); setMr(null); };
  const handleFiles = async e => { setUploading(true); const s = await filesToStored(e.target.files); setFiles(c => [...c, ...s]); e.target.value = ""; setUploading(false); };

  const save = async () => {
    if (!selId && !nc.company.trim()) { alert("Please select or add a client."); return; }
    let cid = selId;
    if (!cid) {
      const payload = { user_id: userId, company: nc.company.trim(), division: nc.division.trim(), contact: nc.contact.trim(), phone: nc.phone.trim(), email: nc.email.trim(), location: nc.location.trim(), notes: "", pipeline_status: "New Lead" };
      if (isOnline) { const { data: inserted } = await supabase.from("clients").insert(payload).select().single(); if (inserted) { cid = inserted.id; setData(c => ({ ...c, clients: [...c.clients, inserted] })); } }
      else { cid = `offline_${Date.now()}`; addToQueue({ type: "insert", table: "clients", data: { ...payload, id: cid } }); setData(c => ({ ...c, clients: [...c.clients, { ...payload, id: cid }] })); }
    }
    if (!cid) return;
    const convPayload = { user_id: userId, client_id: cid, note, audio_data_url: audio, created_by_name: userName };
    if (isOnline) { const { data: conv } = await supabase.from("conversations").insert(convPayload).select().single(); if (conv) setData(c => ({ ...c, conversations: [conv, ...c.conversations] })); }
    else { addToQueue({ type: "insert", table: "conversations", data: convPayload }); setData(c => ({ ...c, conversations: [{ ...convPayload, id: `offline_${Date.now()}`, created_at: new Date().toISOString() }, ...c.conversations] })); }
    for (const f of files) { if (isOnline) { const { data: doc } = await supabase.from("documents").insert({ user_id: userId, client_id: cid, file_url: f.url, name: f.name }).select().single(); if (doc) setData(c => ({ ...c, documents: [...c.documents, doc] })); } }
    if (nextFU) {
      const client = data.clients.find(c => c.id === cid);
      const fuPayload = { user_id: userId, client_id: cid, client_name: client?.company || nc.company, due_date: nextFU, status: "Open", outcome: note, completed: false, recurring, recurring_days: parseInt(recurringDays) };
      if (isOnline) { const { data: fu } = await supabase.from("follow_ups").insert(fuPayload).select().single(); if (fu) setData(c => ({ ...c, followUps: [...c.followUps, fu] })); }
      else { addToQueue({ type: "insert", table: "follow_ups", data: fuPayload }); setData(c => ({ ...c, followUps: [...c.followUps, { ...fuPayload, id: `offline_${Date.now()}` }] })); }
    }
    setSelId(""); setNc({ company: "", division: "", contact: "", phone: "", email: "", location: "" }); setNote(""); setNextFU(""); setAudio(""); setFiles([]); setRecurring(false);
    alert("Conversation saved!"); go("Clients");
  };

  return (
    <div className="space-y-5">
      {annotating && <PhotoAnnotator src={annotating.url} onSave={annotated => { setFiles(f => f.map((x, i) => i === annotating.idx ? { ...x, url: annotated } : x)); setAnnotating(null); }} onCancel={() => setAnnotating(null)} />}
      <div><h1 className="text-2xl font-bold">Add conversation</h1><p className="text-sm text-slate-500">Log a visit, call, or WhatsApp.</p></div>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <select value={selId} onChange={e => setSelId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">+ New client or select existing</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}</select>
          {!selId && (<div className="space-y-3 rounded-2xl bg-slate-50 p-3"><Field label="Company" value={nc.company} onChange={v => setNc(c => ({ ...c, company: v }))} placeholder="Company name" /><Field label="Division / Site" value={nc.division} onChange={v => setNc(c => ({ ...c, division: v }))} /><Field label="Contact person" value={nc.contact} onChange={v => setNc(c => ({ ...c, contact: v }))} /><Field label="Phone" value={nc.phone} onChange={v => setNc(c => ({ ...c, phone: v }))} /><Field label="Email" value={nc.email} onChange={v => setNc(c => ({ ...c, email: v }))} /><Field label="Location" value={nc.location} onChange={v => setNc(c => ({ ...c, location: v }))} /></div>)}
          <Field label="What was discussed?" multiline value={note} onChange={setNote} placeholder="Notes…" />
          <Field label="Next follow-up date" type="date" value={nextFU} onChange={setNextFU} />
          {nextFU && (
            <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
              <label className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2"><RefreshCw size={15} />Recurring follow-up</span>
                <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="h-5 w-5 accent-slate-900" />
              </label>
              {recurring && (<div><label className="mb-1 block text-sm font-semibold text-slate-800">Repeat every</label><div className="grid grid-cols-3 gap-2">{[["7","7 days"],["14","14 days"],["30","30 days"]].map(([val, label]) => (<button key={val} onClick={() => setRecurringDays(val)} className={`rounded-2xl border py-2 text-sm font-semibold transition ${recurringDays === val ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>{label}</button>))}</div></div>)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="outline" className={`rounded-2xl py-6 ${rec ? "border-red-300 bg-red-100 text-red-700" : ""}`} onClick={rec ? stopRec : startRec}><Mic size={18} />{rec ? "Stop" : "Voice note"}</Btn>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold ${uploading ? "opacity-60 pointer-events-none" : ""}`}><Camera size={18} />{uploading ? "Uploading…" : "Add photo/video"}<input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} /></label>
          </div>
          {audioErr && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{audioErr}</div>}
          {audio && <div className="rounded-2xl bg-slate-50 p-3"><div className="mb-2 flex justify-between"><p className="text-sm font-semibold">Voice note</p><button onClick={() => setAudio("")} className="rounded-xl bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Delete</button></div><audio controls src={audio} className="w-full" /></div>}
          {files.length > 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
              {files.map((f, i) => (
                <div key={i} className="rounded-2xl bg-white p-2">
                  {f.type.startsWith("video/") ? <video controls src={f.url} className="h-32 w-full rounded-xl object-cover" /> : <img src={f.url} alt={f.name} className="h-32 w-full rounded-xl object-cover" />}
                  <p className="mt-1 truncate text-xs text-slate-600">{f.name}</p>
                  <div className="mt-2 flex gap-1">
                    {f.type.startsWith("image/") && <button onClick={() => setAnnotating({ url: f.url, idx: i })} className="flex-1 rounded-xl bg-yellow-50 py-1 text-xs font-semibold text-yellow-700"><PenLine size={12} className="inline mr-1" />Annotate</button>}
                    <button onClick={() => setFiles(c => c.filter((_, j) => j !== i))} className="flex-1 rounded-xl bg-red-50 py-1 text-xs font-semibold text-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Btn className="w-full rounded-2xl py-6 text-base" onClick={save}>Save conversation</Btn>
        </CC>
      </Card>
    </div>
  );
}

// ─── Clients ──────────────────────────────────────────────────────────────────
function ClientsScreen({ data, setData, go, userId, isOnline }) {
  const [search, setSearch] = useState(""); const [selId, setSelId] = useState(null); const [edit, setEdit] = useState(false); const [shareModal, setShareModal] = useState(null);
  const sel = data.clients.find(c => c.id === selId);
  const docs = data.documents.filter(d => d.client_id === selId);
  const convs = data.conversations.filter(c => c.client_id === selId);
  const filtered = useMemo(() => { const q = search.toLowerCase(); return data.clients.filter(c => `${c.company} ${c.division} ${c.contact} ${c.location}`.toLowerCase().includes(q)); }, [search, data.clients]);

  const addBlank = async () => { const payload = { user_id: userId, company: "New Company", division: "", contact: "", phone: "", email: "", location: "", notes: "", pipeline_status: "New Lead" }; if (isOnline) { const { data: r } = await supabase.from("clients").insert(payload).select().single(); if (r) { setData(c => ({ ...c, clients: [...c.clients, r] })); setSelId(r.id); setEdit(true); } } else { const id = `offline_${Date.now()}`; addToQueue({ type: "insert", table: "clients", data: { ...payload, id } }); setData(c => ({ ...c, clients: [...c.clients, { ...payload, id }] })); setSelId(id); setEdit(true); } };
  const upd = async (field, val) => { if (isOnline) await supabase.from("clients").update({ [field]: val }).eq("id", selId).eq("user_id", userId); else addToQueue({ type: "update", table: "clients", id: selId, data: { [field]: val } }); setData(c => ({ ...c, clients: c.clients.map(cl => cl.id === selId ? { ...cl, [field]: val } : cl) })); };
  const del = async () => { if (!sel || !confirm(`Delete ${sel.company}?`)) return; if (isOnline) await supabase.from("clients").delete().eq("id", sel.id).eq("user_id", userId); else addToQueue({ type: "delete", table: "clients", id: sel.id }); setData(c => ({ ...c, clients: c.clients.filter(cl => cl.id !== sel.id), followUps: c.followUps.filter(f => f.client_id !== sel.id) })); setSelId(null); setEdit(false); };
  const addFU = async () => { if (!sel) return; const payload = { user_id: userId, client_id: sel.id, client_name: sel.company, due_date: todayISO(), status: "Open", outcome: "", completed: false, recurring: false, recurring_days: 7 }; if (isOnline) { const { data: fu } = await supabase.from("follow_ups").insert(payload).select().single(); if (fu) setData(c => ({ ...c, followUps: [...c.followUps, fu] })); } else { addToQueue({ type: "insert", table: "follow_ups", data: payload }); setData(c => ({ ...c, followUps: [...c.followUps, { ...payload, id: `offline_${Date.now()}` }] })); } alert("Follow-up created."); };

  if (sel) return (
    <div className="space-y-5">
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
      <Btn variant="outline" className="rounded-2xl" onClick={() => { setSelId(null); setEdit(false); }}>← Back to clients</Btn>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">{edit ? <Field label="Company" value={sel.company} onChange={v => upd("company", v)} /> : <h1 className="text-2xl font-bold">{sel.company}</h1>}{!edit && sel.division && <p className="text-sm text-slate-500">{sel.division}</p>}</div>
            <Btn variant="outline" className="rounded-2xl" onClick={() => setEdit(!edit)}>{edit ? "Done" : "Edit"}</Btn>
          </div>
          {edit && <Field label="Division / Site" value={sel.division} onChange={v => upd("division", v)} />}

          {/* Pipeline status */}
          <div><label className="mb-2 block text-sm font-semibold text-slate-800">Pipeline stage</label><div className="flex flex-wrap gap-2">{PIPELINE_STAGES.map(s => (<button key={s} onClick={() => upd("pipeline_status", s)} className={`rounded-2xl px-3 py-1.5 text-xs font-bold transition ${(sel.pipeline_status || "New Lead") === s ? "ring-2 ring-slate-900 " : ""}${STAGE_COLORS[s]}`}>{s}</button>))}</div></div>

          <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
            {[["contact","Contact"],["phone","Phone"],["email","Email"],["location","Location"]].map(([f,l]) => (<div key={f}><label className="mb-1 block text-xs font-bold text-slate-500">{l}</label>{edit ? <input value={sel[f]||""} onChange={e => upd(f, e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" /> : <p className="text-sm text-slate-700">{sel[f]||"-"}</p>}</div>))}
          </div>
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-semibold">Notes</p>{edit ? <textarea rows={3} value={sel.notes||""} onChange={e => upd("notes", e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" /> : <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{sel.notes||"No notes yet."}</p>}</div>
          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${sel.phone||""}`}><Btn variant="outline" className="w-full rounded-2xl"><Phone size={16} /></Btn></a>
            <a href={`mailto:${sel.email||""}`}><Btn variant="outline" className="w-full rounded-2xl"><Mail size={16} /></Btn></a>
            <Btn className="rounded-2xl" onClick={() => go("QuickAdd")}>Add entry</Btn>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="outline" className="rounded-2xl" onClick={addFU}>Add follow-up</Btn>
            <Btn variant="outline" className="rounded-2xl" onClick={() => setShareModal({ title: sel.company, text: `Client: ${sel.company}\nContact: ${sel.contact||"-"}\nPhone: ${sel.phone||"-"}\nEmail: ${sel.email||"-"}\nLocation: ${sel.location||"-"}` })}><Share2 size={16} />Share</Btn>
          </div>
          <Btn variant="danger" className="w-full rounded-2xl" onClick={del}><Trash2 size={16} />Delete client</Btn>
          <div><h2 className="mb-2 text-lg font-bold">History</h2>{convs.length===0&&<p className="text-sm text-slate-500">No history yet.</p>}{convs.map(e => (<div key={e.id} className="mb-2 rounded-2xl bg-slate-50 p-3"><div className="flex justify-between"><p className="text-xs font-bold text-slate-500">{e.created_at?.slice(0,10)}</p><p className="text-xs text-slate-400">{e.created_by_name}</p></div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{e.note}</p>{e.audio_data_url&&<audio controls src={e.audio_data_url} className="mt-2 w-full" />}</div>))}</div>
          <div><h2 className="mb-2 text-lg font-bold">Linked files</h2>{docs.length===0&&<p className="text-sm text-slate-500">No files yet.</p>}<div className="grid grid-cols-2 gap-3">{docs.map(d => { const isImg=d.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i); const isVid=d.name?.match(/\.(mp4|mov|webm)$/i); return (<div key={d.id} className="rounded-2xl bg-slate-50 p-2">{isImg?<img src={d.file_url} alt={d.name} className="h-28 w-full rounded-xl object-cover" />:isVid?<video controls src={d.file_url} className="h-28 w-full rounded-xl" />:<div className="flex h-28 items-center justify-center rounded-xl bg-white"><FileText /></div>}<p className="mt-2 truncate text-xs text-slate-600">{d.name}</p></div>); })}</div></div>
        </CC>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">My Clients</h1><p className="text-sm text-slate-500">Your clients and contacts.</p></div><Btn className="rounded-2xl" onClick={addBlank}><Plus size={18} />Add</Btn></div>
      <div className="flex items-center gap-2 rounded-3xl bg-white p-3 shadow-sm"><Search size={20} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…" className="w-full bg-transparent p-2 text-base outline-none" /></div>
      {data.clients.length===0&&<Empty title="No clients yet" text="Tap Add to create your first client." />}
      <div className="space-y-3">
        {filtered.map(c => (<button key={c.id} onClick={() => setSelId(c.id)} className="w-full text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{c.company}</h2><p className="text-sm text-slate-500">{c.division||"No division"}</p><p className="mt-1 text-xs text-slate-500">{c.contact||"No contact"}</p></div><div className="flex flex-col items-end gap-2"><ChevronRight className="text-slate-400" /><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STAGE_COLORS[c.pipeline_status||"New Lead"]}`}>{c.pipeline_status||"New Lead"}</span></div></div></CC></Card></button>))}
      </div>
    </div>
  );
}

// ─── Service with signature ───────────────────────────────────────────────────
function ServiceScreen({ data, setData, userId, isOnline }) {
  const [rep, setRep] = useState({ clientId: "", machine: "", fault: "", workDone: "", partsUsed: "", technician: "" });
  const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(false);
  const [showSig, setShowSig] = useState(false); const [signature, setSignature] = useState(null);
  const [annotating, setAnnotating] = useState(null); const [shareModal, setShareModal] = useState(null);
  const sel = data.clients.find(c => c.id === rep.clientId);
  const handleFiles = async e => { setUploading(true); const s = await filesToStored(e.target.files); setFiles(c => [...c, ...s]); e.target.value = ""; setUploading(false); };

  const save = async () => {
    const payload = { user_id: userId, client_id: rep.clientId||null, machine: rep.machine, fault: rep.fault, work_done: rep.workDone, parts_used: rep.partsUsed, technician: rep.technician, signature_data_url: signature };
    if (isOnline) { const { data: r } = await supabase.from("service_reports").insert(payload).select().single(); if (r) setData(c => ({ ...c, serviceReports: [r, ...c.serviceReports] })); }
    else { addToQueue({ type: "insert", table: "service_reports", data: payload }); setData(c => ({ ...c, serviceReports: [{ ...payload, id: `offline_${Date.now()}`, created_at: new Date().toISOString() }, ...c.serviceReports] })); }
    for (const f of files) { if (isOnline && rep.clientId) { const { data: doc } = await supabase.from("documents").insert({ user_id: userId, client_id: rep.clientId, file_url: f.url, name: f.name }).select().single(); if (doc) setData(c => ({ ...c, documents: [...c.documents, doc] })); } }
    const pw = window.open("", "_blank");
    if (pw) { const esc = v => String(v||"").replace(/[&<>'"]/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;" }[m])); pw.document.write(`<html><head><title>Service Report</title><style>body{font-family:Arial,sans-serif;padding:30px}h1{border-bottom:2px solid #000;padding-bottom:8px}.s{margin-bottom:14px}.l{font-weight:bold}img{max-width:100%;margin-top:8px;border-radius:8px}.sig{border:1px solid #ccc;border-radius:8px;margin-top:8px}</style></head><body><h1>PowerMate Service Report</h1><div class="s"><span class="l">Client:</span> ${esc(sel?.company)}</div><div class="s"><span class="l">Machine:</span> ${esc(rep.machine)}</div><div class="s"><span class="l">Technician:</span> ${esc(rep.technician)}</div><div class="s"><span class="l">Date:</span> ${new Date().toLocaleDateString("en-GB")}</div><div class="s"><span class="l">Fault:</span><br/>${esc(rep.fault).replace(/\n/g,"<br/>")}</div><div class="s"><span class="l">Work Done:</span><br/>${esc(rep.workDone).replace(/\n/g,"<br/>")}</div><div class="s"><span class="l">Parts:</span><br/>${esc(rep.partsUsed).replace(/\n/g,"<br/>")}</div><h2>Photos</h2>${files.map(f => f.type.startsWith("image/")?`<img src="${f.url}"/>`:`<p>${esc(f.name)}</p>`).join("")}${signature?`<h2>Client Signature</h2><img src="${signature}" class="sig" style="max-width:300px"/>`:""}  <script>window.onload=function(){window.print()}<\/script></body></html>`); pw.document.close(); }
    setShareModal({ title: `Service Report — ${sel?.company || ""}`, text: `Machine: ${rep.machine}\nTechnician: ${rep.technician}\nFault: ${rep.fault}\nWork Done: ${rep.workDone}` });
    setRep({ clientId: "", machine: "", fault: "", workDone: "", partsUsed: "", technician: "" }); setFiles([]); setSignature(null);
  };

  return (
    <div className="space-y-5">
      {showSig && <SignaturePad onSave={sig => { setSignature(sig); setShowSig(false); }} onCancel={() => setShowSig(false)} />}
      {annotating && <PhotoAnnotator src={annotating.url} onSave={annotated => { setFiles(f => f.map((x, i) => i === annotating.idx ? { ...x, url: annotated } : x)); setAnnotating(null); }} onCancel={() => setAnnotating(null)} />}
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
      <div><h1 className="text-2xl font-bold">Service report</h1><p className="text-sm text-slate-500">Complete and create a PDF.</p></div>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <select value={rep.clientId} onChange={e => setRep(r => ({ ...r, clientId: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Select client / site</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division?` - ${c.division}`:""}</option>)}</select>
          <Field label="Machine / Equipment" value={rep.machine} onChange={v => setRep(r => ({ ...r, machine: v }))} />
          <Field label="Technician" value={rep.technician} onChange={v => setRep(r => ({ ...r, technician: v }))} />
          <Field label="Fault found" multiline value={rep.fault} onChange={v => setRep(r => ({ ...r, fault: v }))} />
          <Field label="Work done" multiline value={rep.workDone} onChange={v => setRep(r => ({ ...r, workDone: v }))} />
          <Field label="Parts used" multiline value={rep.partsUsed} onChange={v => setRep(r => ({ ...r, partsUsed: v }))} />
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold ${uploading?"opacity-60 pointer-events-none":""}`}>
            <Upload size={18} />{uploading?"Uploading…":"Add photos / files"}
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
          {files.map((f, i) => (
            <div key={i} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-sm font-semibold">{f.name}</p>
              {f.type.startsWith("image/") && <img src={f.url} alt={f.name} className="mt-2 max-h-40 w-full rounded-xl object-cover" />}
              <div className="mt-2 flex gap-2">
                {f.type.startsWith("image/") && <Btn variant="outline" className="flex-1 rounded-xl text-sm py-2" onClick={() => setAnnotating({ url: f.url, idx: i })}><PenLine size={14} />Annotate</Btn>}
                <Btn variant="danger" className="flex-1 rounded-xl text-sm py-2" onClick={() => setFiles(c => c.filter((_,j) => j !== i))}>Delete</Btn>
              </div>
            </div>
          ))}

          {/* Signature */}
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Client signature</p>
              <Btn variant="outline" className="rounded-xl text-sm py-2" onClick={() => setShowSig(true)}>{signature ? "Re-sign" : "Get signature"}</Btn>
            </div>
            {signature && <img src={signature} alt="Signature" className="mt-3 h-20 w-full rounded-xl border border-slate-200 object-contain bg-white" />}
          </div>

          <Btn className="w-full rounded-2xl py-6 text-base" onClick={save}>Save & create PDF</Btn>
        </CC>
      </Card>
    </div>
  );
}

// ─── Documents ────────────────────────────────────────────────────────────────
function DocumentsScreen({ data, setData, userId, isOnline }) {
  const [clientId, setClientId] = useState(""); const [uploading, setUploading] = useState(false);
  const handle = async e => { setUploading(true); const stored = await filesToStored(e.target.files); for (const f of stored) { if (isOnline) { const { data: doc } = await supabase.from("documents").insert({ user_id: userId, client_id: clientId||null, file_url: f.url, name: f.name }).select().single(); if (doc) setData(c => ({ ...c, documents: [...c.documents, doc] })); } } e.target.value = ""; setUploading(false); };
  const del = async id => { if (isOnline) await supabase.from("documents").delete().eq("id", id).eq("user_id", userId); else addToQueue({ type: "delete", table: "documents", id }); setData(c => ({ ...c, documents: c.documents.filter(d => d.id !== id) })); };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Documents</h1><p className="text-sm text-slate-500">Your uploaded files.</p></div>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Global document</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division?` - ${c.division}`:""}</option>)}</select>
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-6 font-semibold text-white ${uploading?"opacity-60 pointer-events-none":""}`}>
            <Upload size={18} />{uploading?"Uploading…":"Upload photo, video or document"}
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handle} disabled={uploading} />
          </label>
        </CC>
      </Card>
      {data.documents.length===0&&<Empty title="No documents" text="Upload your first file above." />}
      <div className="space-y-3">
        {data.documents.map(doc => { const client=data.clients.find(c=>c.id===doc.client_id); const isImg=doc.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i); const isVid=doc.name?.match(/\.(mp4|mov|webm)$/i); return (<Card key={doc.id} className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><FileText size={22} /></div><div className="flex-1 min-w-0"><p className="truncate font-bold">{doc.name}</p><p className="text-sm text-slate-500">{client?client.company:"Global"}</p></div><button onClick={() => del(doc.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><X size={18} /></button></div>{isImg&&<img src={doc.file_url} alt={doc.name} className="max-h-64 w-full rounded-2xl object-cover" />}{isVid&&<video controls src={doc.file_url} className="max-h-64 w-full rounded-2xl" />}{!isImg&&!isVid&&<a href={doc.file_url} target="_blank" rel="noreferrer"><Btn className="w-full rounded-2xl">Open document</Btn></a>}</CC></Card>); })}
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const [users, setUsers] = useState([]); const [stats, setStats] = useState({}); const [range, setRange] = useState({ from: weekStart(), to: weekEnd() }); const [loading, setLoading] = useState(true); const [tab, setTab] = useState("dashboard");
  useEffect(() => { loadAll(); }, [range]);
  const loadAll = async () => { setLoading(true); const { data: allUsers } = await supabase.from("users").select("*").order("full_name"); setUsers(allUsers||[]); const es = {}; for (const u of allUsers||[]) { const [cl,co,fu,sv,sa] = await Promise.all([supabase.from("clients").select("id",{count:"exact",head:true}).eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59"),supabase.from("conversations").select("id",{count:"exact",head:true}).eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59"),supabase.from("follow_ups").select("id,completed").eq("user_id",u.id).gte("due_date",range.from).lte("due_date",range.to),supabase.from("service_reports").select("id",{count:"exact",head:true}).eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59"),supabase.from("sales_reports").select("quotes,new_leads").eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59")]); es[u.id]={newClients:cl.count||0,conversations:co.count||0,followUpsTotal:(fu.data||[]).length,followUpsDone:(fu.data||[]).filter(f=>f.completed).length,serviceReports:sv.count||0,quotes:(sa.data||[]).reduce((s,r)=>s+parseInt(r.quotes||0),0),newLeads:(sa.data||[]).reduce((s,r)=>s+parseInt(r.new_leads||0),0)}; } setStats(es); setLoading(false); };
  const changeRole = async (id, r) => { await supabase.from("users").update({ role: r }).eq("id", id); loadAll(); };
  const totals = users.reduce((a,u)=>{const s=stats[u.id]||{};return{conversations:(a.conversations||0)+(s.conversations||0),newClients:(a.newClients||0)+(s.newClients||0),quotes:(a.quotes||0)+(s.quotes||0),newLeads:(a.newLeads||0)+(s.newLeads||0),followUpsDone:(a.followUpsDone||0)+(s.followUpsDone||0),serviceReports:(a.serviceReports||0)+(s.serviceReports||0)}},{});
  const exportPDF = () => { const w=window.open("","_blank"); if(!w){alert("Allow popups.");return;} const esc=v=>String(v||"").replace(/[&<>'"]/g,m=>({" &":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[m])); const rows=users.map(u=>{const s=stats[u.id]||{};return`<tr><td>${esc(u.full_name||u.email)}</td><td>${s.conversations||0}</td><td>${s.newClients||0}</td><td>${s.quotes||0}</td><td>${s.newLeads||0}</td><td>${s.followUpsDone||0}/${s.followUpsTotal||0}</td><td>${s.serviceReports||0}</td></tr>`;}).join(""); w.document.write(`<html><head><title>PowerMate Weekly Report</title><style>body{font-family:Arial,sans-serif;padding:30px}h1{border-bottom:2px solid #111;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#111;color:#fff}tr.total{font-weight:bold;background:#f1f5f9}</style></head><body><h1>PowerMate Weekly Report</h1><p><strong>Period:</strong> ${range.from} to ${range.to}</p><table><thead><tr><th>Employee</th><th>Visits</th><th>New Clients</th><th>Quotes</th><th>New Leads</th><th>Follow-ups</th><th>Svc Reports</th></tr></thead><tbody>${rows}<tr class="total"><td>TOTAL</td><td>${totals.conversations||0}</td><td>${totals.newClients||0}</td><td>${totals.quotes||0}</td><td>${totals.newLeads||0}</td><td>${totals.followUpsDone||0}</td><td>${totals.serviceReports||0}</td></tr></tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`); w.document.close(); };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Management</h1><p className="text-sm text-slate-500">Team performance & weekly reports.</p></div>
      <div className="flex rounded-2xl bg-slate-200 p-1 gap-1">{[["dashboard","Dashboard"],["weekly","Weekly"],["team","Team"]].map(([k,l])=>(<button key={k} onClick={()=>setTab(k)} className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${tab===k?"bg-white shadow-sm text-slate-900":"text-slate-600"}`}>{l}</button>))}</div>
      {(tab==="dashboard"||tab==="weekly")&&(<div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3"><label className="text-xs font-bold text-slate-500">From</label><input type="date" value={range.from} onChange={e=>setRange(r=>({...r,from:e.target.value}))} className="rounded-xl border border-slate-200 p-2 text-sm" /><label className="text-xs font-bold text-slate-500">To</label><input type="date" value={range.to} onChange={e=>setRange(r=>({...r,to:e.target.value}))} className="rounded-xl border border-slate-200 p-2 text-sm" />{tab==="weekly"&&<Btn className="rounded-2xl ml-auto" onClick={exportPDF}>Export PDF</Btn>}</div>)}
      {loading&&<div className="p-6 text-center text-slate-500">Loading…</div>}
      {!loading&&tab==="dashboard"&&(<div className="space-y-4"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Team totals</p><div className="grid grid-cols-3 gap-3">{[["Visits",totals.conversations],["New Clients",totals.newClients],["Quotes",totals.quotes],["New Leads",totals.newLeads],["Follow-ups",totals.followUpsDone],["Svc Reports",totals.serviceReports]].map(([l,v])=>(<div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black">{v||0}</p><p className="text-xs text-slate-500">{l}</p></div>))}</div></CC></Card><h2 className="text-lg font-bold">Per employee</h2>{users.map(u=>{const s=stats[u.id]||{};return(<Card key={u.id} className="rounded-3xl shadow-sm"><CC className="p-4"><div className="mb-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold">{(u.full_name||u.email||"?")[0].toUpperCase()}</div><div><p className="font-bold">{u.full_name||u.email}</p><span className={`text-xs font-semibold px-2 py-0.5 rounded-xl ${u.role==="admin"?"bg-slate-900 text-white":"bg-slate-100 text-slate-600"}`}>{u.role||"employee"}</span></div></div><div className="grid grid-cols-3 gap-2">{[["Visits",s.conversations],["New Clients",s.newClients],["Quotes",s.quotes],["New Leads",s.newLeads],["Follow-ups",`${s.followUpsDone||0}/${s.followUpsTotal||0}`],["Svc Reports",s.serviceReports]].map(([l,v])=>(<div key={l} className="rounded-2xl bg-slate-50 p-2 text-center"><p className="text-xl font-black">{v??0}</p><p className="text-xs text-slate-500">{l}</p></div>))}</div></CC></Card>);})}</div>)}
      {!loading&&tab==="weekly"&&(<div className="overflow-x-auto rounded-3xl shadow-sm"><table className="w-full bg-white text-sm"><thead><tr className="bg-slate-900 text-white"><th className="p-3 text-left">Employee</th><th className="p-3 text-center">Visits</th><th className="p-3 text-center">New Clients</th><th className="p-3 text-center">Quotes</th><th className="p-3 text-center">New Leads</th><th className="p-3 text-center">Follow-ups</th><th className="p-3 text-center">Svc Reports</th></tr></thead><tbody>{users.map((u,i)=>{const s=stats[u.id]||{};return(<tr key={u.id} className={i%2===0?"bg-white":"bg-slate-50"}><td className="p-3 font-semibold">{u.full_name||u.email}</td><td className="p-3 text-center">{s.conversations||0}</td><td className="p-3 text-center">{s.newClients||0}</td><td className="p-3 text-center">{s.quotes||0}</td><td className="p-3 text-center">{s.newLeads||0}</td><td className="p-3 text-center">{s.followUpsDone||0}/{s.followUpsTotal||0}</td><td className="p-3 text-center">{s.serviceReports||0}</td></tr>);})}<tr className="bg-slate-900 text-white font-bold"><td className="p-3">TOTAL</td><td className="p-3 text-center">{totals.conversations||0}</td><td className="p-3 text-center">{totals.newClients||0}</td><td className="p-3 text-center">{totals.quotes||0}</td><td className="p-3 text-center">{totals.newLeads||0}</td><td className="p-3 text-center">{totals.followUpsDone||0}</td><td className="p-3 text-center">{totals.serviceReports||0}</td></tr></tbody></table></div>)}
      {tab==="team"&&(<div className="space-y-3"><div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">Ask employees to sign up. You can promote them to admin here.</div>{users.map(u=>(<Card key={u.id} className="rounded-3xl shadow-sm"><CC className="flex items-center gap-3 p-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-lg">{(u.full_name||u.email||"?")[0].toUpperCase()}</div><div className="flex-1 min-w-0"><p className="font-bold truncate">{u.full_name||"No name"}</p><p className="text-xs text-slate-500 truncate">{u.email}</p><span className={`mt-1 inline-block rounded-xl px-2 py-0.5 text-xs font-semibold ${u.role==="admin"?"bg-slate-900 text-white":"bg-slate-100 text-slate-600"}`}>{u.role||"employee"}</span></div><button onClick={()=>changeRole(u.id,u.role==="admin"?"employee":"admin")} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold">{u.role==="admin"?"Make employee":"Make admin"}</button></CC></Card>))}</div>)}
    </div>
  );
}

// ─── More ─────────────────────────────────────────────────────────────────────
function MoreScreen({ go, data, setData, currentUser, onSignOut }) {
  const [sub, setSub] = useState("main"); const [sr, setSr] = useState({ week: "", visits: "", quotes: "", followUps: "", newLeads: "", summary: "" });
  const isAdmin = currentUser?.role === "admin";
  const saveSR = async () => { const { data: r } = await supabase.from("sales_reports").insert({ user_id: currentUser.id, week: sr.week, visits: sr.visits, quotes: sr.quotes, follow_ups: sr.followUps, new_leads: sr.newLeads, summary: sr.summary }).select().single(); if (r) setData(c => ({ ...c, salesReports: [r, ...c.salesReports] })); setSr({ week: "", visits: "", quotes: "", followUps: "", newLeads: "", summary: "" }); alert("Sales report saved."); };
  if (sub==="sales") return (<div className="space-y-5"><Btn variant="outline" className="rounded-2xl" onClick={()=>setSub("main")}>← Back</Btn><h1 className="text-2xl font-bold">My Sales Reports</h1><Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4"><Field label="Week / Date" value={sr.week} onChange={v=>setSr(r=>({...r,week:v}))} placeholder="e.g. Week 18" /><Field label="Total visits" value={sr.visits} onChange={v=>setSr(r=>({...r,visits:v}))} /><Field label="Quotes sent" value={sr.quotes} onChange={v=>setSr(r=>({...r,quotes:v}))} /><Field label="Follow-ups completed" value={sr.followUps} onChange={v=>setSr(r=>({...r,followUps:v}))} /><Field label="New leads" value={sr.newLeads} onChange={v=>setSr(r=>({...r,newLeads:v}))} /><Field label="Weekly summary" multiline value={sr.summary} onChange={v=>setSr(r=>({...r,summary:v}))} /><Btn className="w-full rounded-2xl py-6" onClick={saveSR}>Save sales report</Btn></CC></Card>{data.salesReports.map(r=><Card key={r.id} className="rounded-3xl shadow-sm"><CC className="p-4"><p className="font-bold">{r.week||r.created_at?.slice(0,10)}</p><p className="mt-1 text-sm text-slate-600">{r.summary}</p></CC></Card>)}</div>);
  if (sub==="settings") return (<div className="space-y-5"><Btn variant="outline" className="rounded-2xl" onClick={()=>setSub("main")}>← Back</Btn><h1 className="text-2xl font-bold">Settings</h1><Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4"><div className="rounded-2xl bg-slate-50 p-4 space-y-1"><p className="text-sm font-bold">Logged in as</p><p className="text-sm text-slate-700">{currentUser?.full_name||"No name"}</p><p className="text-xs text-slate-500">{currentUser?.email}</p><p className="text-xs font-semibold text-slate-500 capitalize">Role: {currentUser?.role||"employee"}</p></div><Btn variant="danger" className="w-full rounded-2xl py-4" onClick={onSignOut}><LogOut size={16} />Sign out</Btn></CC></Card></div>);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">More</h1><p className="text-sm text-slate-500">Reports and settings.</p></div>
      <div className="space-y-3">
        {isAdmin&&<BigAction icon={ShieldCheck} title="Management Dashboard" subtitle="Team performance & weekly reports" onClick={()=>go("Admin")} />}
        <BigAction icon={BarChart2} title="My Dashboard" subtitle="Charts and pipeline summary" onClick={()=>go("Dashboard")} />
        <BigAction icon={BriefcaseBusiness} title="My Sales Reports" subtitle="Log weekly visits, quotes and leads" onClick={()=>setSub("sales")} />
        <BigAction icon={ClipboardList} title="Settings & Account" subtitle="View account info and sign out" onClick={()=>setSub("settings")} />
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function PowerMateApp() {
  const [session, setSession] = useState(null); const [currentUser, setCurrentUser] = useState(null); const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("Home");
  const [data, setData] = useState({ clients: [], planList: [], followUps: [], documents: [], conversations: [], serviceReports: [], salesReports: [] });
  const [dataLoading, setDataLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(getQueue().length);

  // Online/offline detection
  useEffect(() => {
    const goOnline = async () => { setIsOnline(true); await processOfflineQueue(); setQueueCount(getQueue().length); };
    const goOffline = () => { setIsOnline(false); setQueueCount(getQueue().length); };
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); if (!session) setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => { setSession(s); if (!s) { setCurrentUser(null); setAuthLoading(false); } });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    const load = async () => { const { data: profile } = await supabase.from("users").select("*").eq("id", session.user.id).single(); setCurrentUser(profile ? { ...session.user, ...profile } : { ...session.user, role: "employee" }); setAuthLoading(false); };
    load();
  }, [session]);

  // Load data
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.id;
    const load = async () => {
      setDataLoading(true);
      const [clients, plans, fus, docs, convs, svcs, sales] = await Promise.all([
        supabase.from("clients").select("*").eq("user_id", uid).order("company"),
        supabase.from("plan_items").select("*").eq("user_id", uid).order("date").order("time"),
        supabase.from("follow_ups").select("*").eq("user_id", uid).order("due_date"),
        supabase.from("documents").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("conversations").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("service_reports").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("sales_reports").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      ]);
      setData({ clients: clients.data||[], planList: plans.data||[], followUps: fus.data||[], documents: docs.data||[], conversations: convs.data||[], serviceReports: svcs.data||[], salesReports: sales.data||[] });
      setDataLoading(false);
    };
    load();
  }, [currentUser]);

  // Auto-create recurring follow-ups when they come due
  useEffect(() => {
    if (!currentUser || !isOnline) return;
    const checkRecurring = async () => {
      const dueRecurring = data.followUps.filter(f => f.completed && f.recurring && f.due_date);
      for (const fu of dueRecurring) {
        const nextDate = addDays(fu.due_date, fu.recurring_days || 7);
        const alreadyExists = data.followUps.some(f => f.client_id === fu.client_id && f.due_date === nextDate && !f.completed);
        if (!alreadyExists && nextDate >= todayISO()) {
          const payload = { user_id: currentUser.id, client_id: fu.client_id, client_name: fu.client_name, due_date: nextDate, status: "Open", outcome: "", completed: false, recurring: true, recurring_days: fu.recurring_days };
          const { data: newFu } = await supabase.from("follow_ups").insert(payload).select().single();
          if (newFu) setData(c => ({ ...c, followUps: [...c.followUps, newFu] }));
        }
      }
    };
    checkRecurring();
  }, [data.followUps, currentUser, isOnline]);

  const signOut = async () => { await supabase.auth.signOut(); setScreen("Home"); };

  if (authLoading) return <Spinner />;
  if (!session || !currentUser) return <AuthScreen />;
  if (dataLoading) return <Spinner />;

  const uid = currentUser.id;
  const uname = currentUser.full_name || currentUser.email;
  const props = { data, setData, userId: uid, isOnline };

  const views = {
    Home: <HomeScreen go={setScreen} clients={data.clients} planList={data.planList} followUps={data.followUps} setData={setData} userId={uid} isOnline={isOnline} />,
    QuickAdd: <QuickAddScreen {...props} go={setScreen} userName={uname} />,
    Calendar: <CalendarScreen {...props} />,
    Clients: <ClientsScreen {...props} go={setScreen} />,
    Service: <ServiceScreen {...props} />,
    Documents: <DocumentsScreen {...props} />,
    Pipeline: <PipelineScreen {...props} />,
    Dashboard: <DashboardScreen data={data} userId={uid} />,
    More: <MoreScreen go={setScreen} data={data} setData={setData} currentUser={currentUser} onSignOut={signOut} />,
    Admin: <AdminDashboard currentUser={currentUser} />,
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <OfflineBanner isOnline={isOnline} queueCount={queueCount} />
      <div className={`mx-auto max-w-2xl px-4 pb-28 pt-4 ${!isOnline || queueCount > 0 ? "mt-8" : ""}`}>
        <header className="mb-4 flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white"><ClipboardList size={22} /></div>
            <div><p className="text-lg font-black leading-tight">PowerMate</p><p className="text-xs text-slate-500">{uname}</p></div>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && <WifiOff size={18} className="text-amber-500" />}
            <Btn className="rounded-2xl" onClick={() => setScreen("QuickAdd")}><Plus size={18} /></Btn>
          </div>
        </header>
        <motion.main key={screen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          {views[screen]}
        </motion.main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-6 gap-1">
          <NavTab icon={Home} label="Home" active={screen==="Home"} onClick={()=>setScreen("Home")} />
          <NavTab icon={Users} label="Clients" active={screen==="Clients"} onClick={()=>setScreen("Clients")} />
          <NavTab icon={ChevronRight} label="Pipeline" active={screen==="Pipeline"} onClick={()=>setScreen("Pipeline")} />
          <NavTab icon={Wrench} label="Service" active={screen==="Service"} onClick={()=>setScreen("Service")} />
          <NavTab icon={FileText} label="Docs" active={screen==="Documents"} onClick={()=>setScreen("Documents")} />
          <NavTab icon={Bell} label="More" active={screen==="More"} onClick={()=>setScreen("More")} />
        </div>
      </nav>
    </div>
  );
}
