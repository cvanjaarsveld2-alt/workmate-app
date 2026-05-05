import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "./supabase";
import {
  Bell, BriefcaseBusiness, CalendarDays, Camera, ChevronRight,
  ClipboardList, FileText, Home, LogOut, Mail, Mic, Phone,
  Plus, Search, ShieldCheck, Trash2, Upload, Users, Wrench, X,
  Eye, EyeOff, AlertTriangle, CheckCircle,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);
const niceDate = (d = new Date()) => d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const daysSince = (ds) => {
  if (!ds) return 999;
  return Math.max(0, Math.floor((new Date(`${todayISO()}T12:00:00`) - new Date(`${ds}T12:00:00`)) / 86400000));
};
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); };
const weekEnd = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 7); return d.toISOString().slice(0, 10); };
const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// ─── Notifications ────────────────────────────────────────────────────────────
const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const permission = await Notification.requestPermission();
  return permission === "granted";
};

const scheduleNotification = (title, body, fireAt) => {
  const now = Date.now();
  const delay = fireAt - now;
  if (delay <= 0) return null;
  const timerId = setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  }, delay);
  return timerId;
};

const scheduleItemNotifications = (item, reminderMinutes) => {
  if (!item.date || !item.time) return [];
  const [h, m] = item.time.split(":").map(Number);
  const meetingTime = new Date(`${item.date}T${item.time}:00`).getTime();
  const timers = [];
  reminderMinutes.forEach(mins => {
    const fireAt = meetingTime - mins * 60 * 1000;
    const tid = scheduleNotification(
      `⏰ PowerMate Reminder`,
      `${item.title}${item.client ? ` — ${item.client}` : ""} in ${mins} minute${mins !== 1 ? "s" : ""}`,
      fireAt
    );
    if (tid) timers.push(tid);
  });
  return timers;
};

// ─── File Upload ──────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB per file warning

const uploadFile = async (file) => {
  try {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File "${file.name}" is ${formatBytes(file.size)}. Files over 500MB may take a long time to upload.`);
    }
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `${Date.now()}-${clean}`;
    const { error } = await supabase.storage.from("powermate-files").upload(name, file, { cacheControl: "3600", upsert: false });
    if (error) { alert("Upload error: " + error.message); return null; }
    const { data } = supabase.storage.from("powermate-files").getPublicUrl(name);
    return data.publicUrl;
  } catch (e) { alert("Upload failed: " + e.message); return null; }
};

async function filesToStored(fileList) {
  const out = [];
  for (const f of Array.from(fileList || [])) {
    const url = await uploadFile(f);
    if (url) out.push({ name: f.name, type: f.type || "File", size: f.size, url });
  }
  return out;
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const Card = ({ className = "", children }) => <div className={`bg-white ${className}`}>{children}</div>;
const CC = ({ className = "", children }) => <div className={className}>{children}</div>;

function Btn({ children, className = "", variant = "solid", onClick, type = "button", disabled = false }) {
  const s = variant === "outline" ? "border border-slate-200 bg-white text-slate-900"
    : variant === "danger" ? "bg-red-50 text-red-700"
    : "bg-slate-900 text-white";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 px-4 py-3 ${s} ${className}`}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
      {multiline
        ? <textarea rows={3} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500" />
        : <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500" />}
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
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition ${active ? "bg-slate-900 text-white" : "text-slate-500"}`}>
      <Icon size={20} />{label}
    </button>
  );
}

function Empty({ title, text }) {
  return <div className="rounded-3xl bg-white p-5 text-center shadow-sm"><p className="font-bold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}

function Spinner() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" /></div>;
}

function Toast({ message, type = "success" }) {
  if (!message) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 shadow-lg text-sm font-semibold ${type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
      {type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {message}
    </motion.div>
  );
}

// ─── Auth Screen (Login + Signup + Forgot Password) ───────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup | forgot | resetpw
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [newPw, setNewPw] = useState(""); const [confirmPw, setConfirmPw] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false); const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "error" });

  // Handle password reset from email link
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setMode("resetpw");
    }
  }, []);

  const showMsg = (text, type = "error") => setMsg({ text, type });

  const login = async () => {
    if (!email || !password) { showMsg("Please enter email and password."); return; }
    setLoading(true); setMsg({ text: "" });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showMsg(error.message);
    setLoading(false);
  };

  const signup = async () => {
    if (!email || !password || !name) { showMsg("Please fill in all fields."); return; }
    if (password.length < 6) { showMsg("Password must be at least 6 characters."); return; }
    setLoading(true); setMsg({ text: "" });
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) { showMsg(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from("users").upsert({ id: data.user.id, email, full_name: name, role: "employee" });
    }
    showMsg("Account created! You can now log in.", "success");
    setMode("login"); setLoading(false);
  };

  const forgotPassword = async () => {
    if (!email) { showMsg("Please enter your email address."); return; }
    setLoading(true); setMsg({ text: "" });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://workmate-app-pez6.vercel.app",
    });
    if (error) showMsg(error.message);
    else showMsg("Password reset email sent! Check your inbox.", "success");
    setLoading(false);
  };

  const resetPassword = async () => {
    if (!newPw || !confirmPw) { showMsg("Please fill in both fields."); return; }
    if (newPw !== confirmPw) { showMsg("Passwords do not match."); return; }
    if (newPw.length < 6) { showMsg("Password must be at least 6 characters."); return; }
    setLoading(true); setMsg({ text: "" });
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) showMsg(error.message);
    else { showMsg("Password updated! Please log in.", "success"); setTimeout(() => { setMode("login"); window.location.hash = ""; }, 2000); }
    setLoading(false);
  };

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

            {/* Reset password screen (from email link) */}
            {mode === "resetpw" && (
              <>
                <h2 className="text-xl font-bold text-slate-900">Set new password</h2>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-800">New password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500 pr-12" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                <Field label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />
                {msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
                <Btn className="w-full rounded-2xl py-4 text-base" onClick={resetPassword} disabled={loading}>{loading ? "Updating…" : "Set new password"}</Btn>
              </>
            )}

            {/* Forgot password screen */}
            {mode === "forgot" && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Reset password</h2>
                  <p className="mt-1 text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
                </div>
                <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
                {msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
                <Btn className="w-full rounded-2xl py-4 text-base" onClick={forgotPassword} disabled={loading}>{loading ? "Sending…" : "Send reset email"}</Btn>
                <button onClick={() => { setMode("login"); setMsg({ text: "" }); }} className="w-full text-center text-sm text-slate-500 underline">← Back to login</button>
              </>
            )}

            {/* Login / Signup */}
            {(mode === "login" || mode === "signup") && (
              <>
                <div className="flex rounded-2xl bg-slate-100 p-1">
                  {["login", "signup"].map(m => (
                    <button key={m} onClick={() => { setMode(m); setMsg({ text: "" }); }}
                      className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${mode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
                      {m === "login" ? "Log in" : "Sign up"}
                    </button>
                  ))}
                </div>
                {mode === "signup" && <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />}
                <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-800">Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500 pr-12" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                {mode === "login" && (
                  <button onClick={() => { setMode("forgot"); setMsg({ text: "" }); }} className="text-sm text-slate-500 underline text-left">Forgot password?</button>
                )}
                {msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
                <Btn className="w-full rounded-2xl py-4 text-base" onClick={mode === "login" ? login : signup} disabled={loading}>
                  {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
                </Btn>
              </>
            )}
          </CC>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [range, setRange] = useState({ from: weekStart(), to: weekEnd() });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  useEffect(() => { loadAll(); }, [range]);

  const loadAll = async () => {
    setLoading(true);
    const { data: allUsers } = await supabase.from("users").select("*").order("full_name");
    setUsers(allUsers || []);
    const empStats = {};
    for (const u of allUsers || []) {
      const [clients, convs, fus, svcs, sales] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", u.id).gte("created_at", range.from).lte("created_at", range.to + "T23:59:59"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", u.id).gte("created_at", range.from).lte("created_at", range.to + "T23:59:59"),
        supabase.from("follow_ups").select("id,completed").eq("user_id", u.id).gte("due_date", range.from).lte("due_date", range.to),
        supabase.from("service_reports").select("id", { count: "exact", head: true }).eq("user_id", u.id).gte("created_at", range.from).lte("created_at", range.to + "T23:59:59"),
        supabase.from("sales_reports").select("quotes,new_leads").eq("user_id", u.id).gte("created_at", range.from).lte("created_at", range.to + "T23:59:59"),
      ]);
      empStats[u.id] = {
        newClients: clients.count || 0,
        conversations: convs.count || 0,
        followUpsTotal: (fus.data || []).length,
        followUpsDone: (fus.data || []).filter(f => f.completed).length,
        serviceReports: svcs.count || 0,
        quotes: (sales.data || []).reduce((s, r) => s + parseInt(r.quotes || 0), 0),
        newLeads: (sales.data || []).reduce((s, r) => s + parseInt(r.new_leads || 0), 0),
      };
    }
    setStats(empStats);
    setLoading(false);
  };

  const changeRole = async (id, newRole) => {
    await supabase.from("users").update({ role: newRole }).eq("id", id);
    loadAll();
  };

  const exportPDF = () => {
    const w = window.open("", "_blank");
    if (!w) { alert("Allow popups to export."); return; }
    const esc = v => String(v || "").replace(/[&<>'"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[m]));
    const totals = users.reduce((acc, u) => { const s = stats[u.id] || {}; return { conversations: (acc.conversations || 0) + (s.conversations || 0), newClients: (acc.newClients || 0) + (s.newClients || 0), quotes: (acc.quotes || 0) + (s.quotes || 0), newLeads: (acc.newLeads || 0) + (s.newLeads || 0), followUpsDone: (acc.followUpsDone || 0) + (s.followUpsDone || 0), serviceReports: (acc.serviceReports || 0) + (s.serviceReports || 0) }; }, {});
    const rows = users.map(u => { const s = stats[u.id] || {}; return `<tr><td>${esc(u.full_name || u.email)}</td><td>${s.conversations || 0}</td><td>${s.newClients || 0}</td><td>${s.quotes || 0}</td><td>${s.newLeads || 0}</td><td>${s.followUpsDone || 0}/${s.followUpsTotal || 0}</td><td>${s.serviceReports || 0}</td></tr>`; }).join("");
    w.document.write(`<html><head><title>PowerMate Weekly Report</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{border-bottom:2px solid #111;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#111;color:#fff}tr.total{background:#f1f5f9;font-weight:bold}.footer{margin-top:40px;font-size:12px;color:#888}</style></head><body><h1>PowerMate Weekly Report</h1><p><strong>Period:</strong> ${range.from} to ${range.to}</p><table><thead><tr><th>Employee</th><th>Visits</th><th>New Clients</th><th>Quotes</th><th>New Leads</th><th>Follow-ups</th><th>Service Reports</th></tr></thead><tbody>${rows}<tr class="total"><td>TOTAL</td><td>${totals.conversations || 0}</td><td>${totals.newClients || 0}</td><td>${totals.quotes || 0}</td><td>${totals.newLeads || 0}</td><td>${totals.followUpsDone || 0}</td><td>${totals.serviceReports || 0}</td></tr></tbody></table><div class="footer">Generated by PowerMate · ${todayISO()}</div><script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  };

  const totalStats = users.reduce((acc, u) => { const s = stats[u.id] || {}; return { conversations: (acc.conversations || 0) + (s.conversations || 0), newClients: (acc.newClients || 0) + (s.newClients || 0), quotes: (acc.quotes || 0) + (s.quotes || 0), newLeads: (acc.newLeads || 0) + (s.newLeads || 0), followUpsDone: (acc.followUpsDone || 0) + (s.followUpsDone || 0), serviceReports: (acc.serviceReports || 0) + (s.serviceReports || 0) }; }, {});

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-slate-900">Management</h1><p className="text-sm text-slate-500">Team performance & weekly reports.</p></div>
      <div className="flex rounded-2xl bg-slate-200 p-1 gap-1">
        {[["dashboard", "Dashboard"], ["weekly", "Weekly"], ["team", "Team"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${tab === k ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}>{l}</button>
        ))}
      </div>
      {(tab === "dashboard" || tab === "weekly") && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3">
          <label className="text-xs font-bold text-slate-500">From</label>
          <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" />
          <label className="text-xs font-bold text-slate-500">To</label>
          <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" />
          {tab === "weekly" && <Btn className="rounded-2xl ml-auto" onClick={exportPDF}>Export PDF</Btn>}
        </div>
      )}
      {loading && <div className="p-6 text-center text-slate-500">Loading…</div>}
      {!loading && tab === "dashboard" && (
        <div className="space-y-4">
          <Card className="rounded-3xl shadow-sm">
            <CC className="p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Team totals</p>
              <div className="grid grid-cols-3 gap-3">
                {[["Visits", totalStats.conversations], ["New Clients", totalStats.newClients], ["Quotes", totalStats.quotes], ["New Leads", totalStats.newLeads], ["Follow-ups", totalStats.followUpsDone], ["Svc Reports", totalStats.serviceReports]].map(([l, v]) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-900">{v || 0}</p><p className="text-xs text-slate-500">{l}</p></div>
                ))}
              </div>
            </CC>
          </Card>
          <h2 className="text-lg font-bold">Per employee</h2>
          {users.map(u => { const s = stats[u.id] || {}; return (
            <Card key={u.id} className="rounded-3xl shadow-sm">
              <CC className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold">{(u.full_name || u.email || "?")[0].toUpperCase()}</div>
                  <div><p className="font-bold text-slate-900">{u.full_name || u.email}</p><span className={`text-xs font-semibold px-2 py-0.5 rounded-xl ${u.role === "admin" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{u.role || "employee"}</span></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["Visits", s.conversations], ["New Clients", s.newClients], ["Quotes", s.quotes], ["New Leads", s.newLeads], ["Follow-ups", `${s.followUpsDone || 0}/${s.followUpsTotal || 0}`], ["Svc Reports", s.serviceReports]].map(([l, v]) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-2 text-center"><p className="text-xl font-black text-slate-900">{v ?? 0}</p><p className="text-xs text-slate-500">{l}</p></div>
                  ))}
                </div>
              </CC>
            </Card>
          ); })}
        </div>
      )}
      {!loading && tab === "weekly" && (
        <div className="overflow-x-auto rounded-3xl shadow-sm">
          <table className="w-full bg-white text-sm">
            <thead><tr className="bg-slate-900 text-white"><th className="p-3 text-left">Employee</th><th className="p-3 text-center">Visits</th><th className="p-3 text-center">New Clients</th><th className="p-3 text-center">Quotes</th><th className="p-3 text-center">New Leads</th><th className="p-3 text-center">Follow-ups</th><th className="p-3 text-center">Svc Reports</th></tr></thead>
            <tbody>
              {users.map((u, i) => { const s = stats[u.id] || {}; return (<tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}><td className="p-3 font-semibold">{u.full_name || u.email}</td><td className="p-3 text-center">{s.conversations || 0}</td><td className="p-3 text-center">{s.newClients || 0}</td><td className="p-3 text-center">{s.quotes || 0}</td><td className="p-3 text-center">{s.newLeads || 0}</td><td className="p-3 text-center">{s.followUpsDone || 0}/{s.followUpsTotal || 0}</td><td className="p-3 text-center">{s.serviceReports || 0}</td></tr>); })}
              <tr className="bg-slate-900 text-white font-bold"><td className="p-3">TOTAL</td><td className="p-3 text-center">{totalStats.conversations || 0}</td><td className="p-3 text-center">{totalStats.newClients || 0}</td><td className="p-3 text-center">{totalStats.quotes || 0}</td><td className="p-3 text-center">{totalStats.newLeads || 0}</td><td className="p-3 text-center">{totalStats.followUpsDone || 0}</td><td className="p-3 text-center">{totalStats.serviceReports || 0}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {tab === "team" && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">Ask employees to sign up on the app. You can promote them to admin here.</div>
          {users.map(u => (
            <Card key={u.id} className="rounded-3xl shadow-sm">
              <CC className="flex items-center gap-3 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-lg">{(u.full_name || u.email || "?")[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0"><p className="font-bold text-slate-900 truncate">{u.full_name || "No name"}</p><p className="text-xs text-slate-500 truncate">{u.email}</p><span className={`mt-1 inline-block rounded-xl px-2 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{u.role || "employee"}</span></div>
                <button onClick={() => changeRole(u.id, u.role === "admin" ? "employee" : "admin")} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{u.role === "admin" ? "Make employee" : "Make admin"}</button>
              </CC>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function HomeScreen({ go, clients, planList, followUps, setData, userId }) {
  const [view, setView] = useState("main");
  const due = followUps.filter(f => !f.completed && f.due_date && f.due_date <= todayISO());

  const delPlan = async (id) => { await supabase.from("plan_items").delete().eq("id", id).eq("user_id", userId); setData(c => ({ ...c, planList: c.planList.filter(i => i.id !== id) })); };
  const updPlan = async (id, field, val) => { await supabase.from("plan_items").update({ [field]: val }).eq("id", id).eq("user_id", userId); setData(c => ({ ...c, planList: c.planList.map(i => i.id === id ? { ...i, [field]: val } : i) })); };
  const updFU = async (id, field, val) => { await supabase.from("follow_ups").update({ [field]: val }).eq("id", id).eq("user_id", userId); setData(c => ({ ...c, followUps: c.followUps.map(f => f.id === id ? { ...f, [field]: val } : f) })); };

  if (view === "today") return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => setView("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">Today's jobs / visits</h1>
      {planList.length === 0 && <Empty title="No items planned" text="Add jobs from the Calendar screen." />}
      {planList.map(item => (
        <Card key={item.id} className="rounded-3xl shadow-sm">
          <CC className="space-y-3 p-4">
            <Field label="Date" type="date" value={item.date} onChange={v => updPlan(item.id, "date", v)} />
            <Field label="Time" type="time" value={item.time} onChange={v => updPlan(item.id, "time", v)} />
            <Field label="Title" value={item.title} onChange={v => updPlan(item.id, "title", v)} />
            <Field label="Client" value={item.client} onChange={v => updPlan(item.id, "client", v)} />
            <Field label="Location" value={item.location} onChange={v => updPlan(item.id, "location", v)} />
            <Btn variant="danger" className="w-full rounded-2xl" onClick={() => delPlan(item.id)}>Delete</Btn>
          </CC>
        </Card>
      ))}
    </div>
  );

  if (view === "followups") return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => setView("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">My Follow-ups</h1>
      {followUps.length === 0 && <Empty title="No follow-ups yet" text="Create one from a client profile." />}
      {followUps.map(f => (
        <Card key={f.id} className="rounded-3xl shadow-sm">
          <CC className="space-y-3 p-4">
            <h2 className="text-lg font-bold">{f.client_name || "Follow-up"}</h2>
            <Field label="Due date" type="date" value={f.due_date} onChange={v => updFU(f.id, "due_date", v)} />
            <Field label="Status" value={f.status} onChange={v => updFU(f.id, "status", v)} />
            <Field label="Outcome" multiline value={f.outcome} onChange={v => updFU(f.id, "outcome", v)} />
            <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-semibold">
              Completed
              <input type="checkbox" checked={!!f.completed} onChange={e => updFU(f.id, "completed", e.target.checked)} className="h-5 w-5 accent-slate-900" />
            </label>
          </CC>
        </Card>
      ))}
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

// ─── Calendar with date+time picker and notifications ─────────────────────────
function CalendarScreen({ data, setData, userId }) {
  const [ni, setNi] = useState({ date: todayISO(), time: "", title: "", client: "", location: "", type: "Follow-up", reminder: "30" });
  const [notifGranted, setNotifGranted] = useState(Notification?.permission === "granted");
  const timers = useRef([]);

  useEffect(() => {
    // Schedule notifications for all existing items on load
    if (notifGranted) {
      data.planList.forEach(item => {
        const mins = item.reminder ? [parseInt(item.reminder)] : [30];
        scheduleItemNotifications(item, mins);
      });
    }
    return () => timers.current.forEach(t => clearTimeout(t));
  }, [notifGranted]);

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
    if (!granted) alert("Notifications blocked. Please allow notifications in your browser settings.");
  };

  const add = async () => {
    if (!ni.date || !ni.time || !ni.title) { alert("Please add a date, time and title."); return; }
    const { data: item } = await supabase.from("plan_items").insert({ user_id: userId, date: ni.date, time: ni.time, title: ni.title, client: ni.client, location: ni.location, type: ni.type, reminder: ni.reminder }).select().single();
    if (item) {
      setData(c => ({ ...c, planList: [...c.planList, item] }));
      if (notifGranted) {
        const t = scheduleItemNotifications(item, [parseInt(ni.reminder)]);
        timers.current.push(...t);
      }
    }
    setNi({ date: todayISO(), time: "", title: "", client: "", location: "", type: "Follow-up", reminder: "30" });
  };

  const upd = async (id, field, val) => {
    await supabase.from("plan_items").update({ [field]: val }).eq("id", id).eq("user_id", userId);
    setData(c => ({ ...c, planList: c.planList.map(i => i.id === id ? { ...i, [field]: val } : i) }));
  };

  const del = async (id) => {
    await supabase.from("plan_items").delete().eq("id", id).eq("user_id", userId);
    setData(c => ({ ...c, planList: c.planList.filter(i => i.id !== id) }));
  };

  const gcal = item => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title || "")}&location=${encodeURIComponent(item.location || "")}&details=${encodeURIComponent(item.client || "")}&dates=${(item.date || "").replace(/-/g, "")}T${(item.time || "0800").replace(":", "")}00/${(item.date || "").replace(/-/g, "")}T${(item.time || "0900").replace(":", "")}00`;

  // Group by date
  const grouped = useMemo(() => {
    const groups = {};
    [...data.planList].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).forEach(item => {
      const d = item.date || "No date";
      if (!groups[d]) groups[d] = [];
      groups[d].push(item);
    });
    return groups;
  }, [data.planList]);

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Calendar</h1><p className="text-sm text-slate-500">Your personal calendar with reminders.</p></div>

      {/* Notification permission banner */}
      {!notifGranted && (
        <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4">
          <div className="flex items-center gap-2"><Bell size={18} className="text-amber-600" /><p className="text-sm font-semibold text-amber-800">Enable notifications to get meeting reminders</p></div>
          <Btn className="rounded-xl text-sm py-2" onClick={enableNotifications}>Enable</Btn>
        </div>
      )}

      {/* Add new item */}
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <h2 className="font-bold text-slate-900">Add new item</h2>

          {/* Date + Time side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" type="date" value={ni.date} onChange={v => setNi(i => ({ ...i, date: v }))} />
            <Field label="Time" type="time" value={ni.time} onChange={v => setNi(i => ({ ...i, time: v }))} />
          </div>

          <Field label="Title" value={ni.title} onChange={v => setNi(i => ({ ...i, title: v }))} placeholder="Meeting title" />
          <select value={ni.client} onChange={e => setNi(i => ({ ...i, client: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4">
            <option value="">Select client (optional)</option>
            {data.clients.map(c => <option key={c.id} value={`${c.company}${c.division ? ` - ${c.division}` : ""}`}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}
          </select>
          <Field label="Location" value={ni.location} onChange={v => setNi(i => ({ ...i, location: v }))} placeholder="Location (optional)" />
          <select value={ni.type} onChange={e => setNi(i => ({ ...i, type: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4">
            <option>Follow-up</option><option>Service</option><option>Sales</option><option>Meeting</option><option>Site visit</option>
          </select>

          {/* Reminder picker */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-800">Remind me before</label>
            <div className="grid grid-cols-3 gap-2">
              {[["15", "15 min"], ["30", "30 min"], ["60", "1 hour"]].map(([val, label]) => (
                <button key={val} onClick={() => setNi(i => ({ ...i, reminder: val }))}
                  className={`rounded-2xl border py-3 text-sm font-semibold transition ${ni.reminder === val ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Btn className="w-full rounded-2xl py-6" onClick={add}>Add calendar item</Btn>
        </CC>
      </Card>

      {Object.keys(grouped).length === 0 && <Empty title="No calendar items" text="Add your first item above." />}

      {/* Grouped by date */}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-bold text-slate-500 uppercase">{date === todayISO() ? "Today" : new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          {items.map(item => (
            <Card key={item.id} className="rounded-3xl shadow-sm">
              <CC className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-center min-w-[60px]">
                    <p className="text-sm font-black text-slate-900">{item.time || "--:--"}</p>
                    <p className="text-xs text-slate-500">{item.type}</p>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{item.title}</p>
                    {item.client && <p className="text-sm text-slate-500">{item.client}</p>}
                    {item.location && <p className="text-xs text-slate-400">{item.location}</p>}
                    {item.reminder && <p className="mt-1 text-xs text-amber-600 font-semibold">⏰ Reminder: {item.reminder === "60" ? "1 hour" : `${item.reminder} min`} before</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Date" type="date" value={item.date} onChange={v => upd(item.id, "date", v)} />
                    <Field label="Time" type="time" value={item.time} onChange={v => upd(item.id, "time", v)} />
                  </div>
                  <Field label="Title" value={item.title} onChange={v => upd(item.id, "title", v)} />
                  <Field label="Location" value={item.location} onChange={v => upd(item.id, "location", v)} />
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-800">Reminder</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[["15", "15 min"], ["30", "30 min"], ["60", "1 hour"]].map(([val, label]) => (
                        <button key={val} onClick={() => upd(item.id, "reminder", val)}
                          className={`rounded-2xl border py-2 text-xs font-semibold transition ${item.reminder === val ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <a href={gcal(item)} target="_blank" rel="noreferrer"><Btn className="w-full rounded-2xl"><CalendarDays size={18} />Add to Google Calendar</Btn></a>
                  <Btn variant="danger" className="w-full rounded-2xl" onClick={() => del(item.id)}>Delete</Btn>
                </div>
              </CC>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── QuickAdd ─────────────────────────────────────────────────────────────────
function QuickAddScreen({ data, setData, go, userId, userName }) {
  const [selId, setSelId] = useState("");
  const [nc, setNc] = useState({ company: "", division: "", contact: "", phone: "", email: "", location: "" });
  const [note, setNote] = useState(""); const [nextFU, setNextFU] = useState("");
  const [rec, setRec] = useState(false); const [mr, setMr] = useState(null);
  const [audio, setAudio] = useState(""); const [audioErr, setAudioErr] = useState("");
  const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(false);
  const sel = data.clients.find(c => c.id === selId);

  const startRec = async () => {
    try { setAudioErr(""); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); const chunks = []; recorder.ondataavailable = e => e.data?.size > 0 && chunks.push(e.data); recorder.onstop = () => { const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" }); const r = new FileReader(); r.onload = () => setAudio(r.result); r.readAsDataURL(blob); stream.getTracks().forEach(t => t.stop()); }; recorder.start(); setMr(recorder); setRec(true); } catch { setAudioErr("Microphone permission blocked."); }
  };
  const stopRec = () => { if (!mr || !rec) return; mr.stop(); setRec(false); setMr(null); };
  const handleFiles = async e => { setUploading(true); const s = await filesToStored(e.target.files); setFiles(c => [...c, ...s]); e.target.value = ""; setUploading(false); };

  const save = async () => {
    if (!selId && !nc.company.trim()) { alert("Please select or add a client."); return; }
    let cid = selId;
    if (!cid) {
      const { data: inserted } = await supabase.from("clients").insert({ user_id: userId, company: nc.company.trim(), division: nc.division.trim(), contact: nc.contact.trim(), phone: nc.phone.trim(), email: nc.email.trim(), location: nc.location.trim(), notes: "" }).select().single();
      if (inserted) { cid = inserted.id; setData(c => ({ ...c, clients: [...c.clients, inserted] })); }
    }
    if (!cid) return;
    const { data: conv } = await supabase.from("conversations").insert({ user_id: userId, client_id: cid, note, audio_data_url: audio, created_by_name: userName }).select().single();
    if (conv) setData(c => ({ ...c, conversations: [conv, ...c.conversations] }));
    for (const f of files) { const { data: doc } = await supabase.from("documents").insert({ user_id: userId, client_id: cid, file_url: f.url, name: f.name }).select().single(); if (doc) setData(c => ({ ...c, documents: [...c.documents, doc] })); }
    if (nextFU) { const client = data.clients.find(c => c.id === cid); const { data: fu } = await supabase.from("follow_ups").insert({ user_id: userId, client_id: cid, client_name: client?.company || nc.company, due_date: nextFU, status: "Open", outcome: note, completed: false }).select().single(); if (fu) setData(c => ({ ...c, followUps: [...c.followUps, fu] })); }
    setSelId(""); setNc({ company: "", division: "", contact: "", phone: "", email: "", location: "" }); setNote(""); setNextFU(""); setAudio(""); setFiles([]);
    alert("Conversation saved!"); go("Clients");
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Add conversation</h1><p className="text-sm text-slate-500">Log a visit, call, or WhatsApp.</p></div>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <select value={selId} onChange={e => setSelId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-4">
            <option value="">+ New client or select existing</option>
            {data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}
          </select>
          {!selId && (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
              <Field label="Company" value={nc.company} onChange={v => setNc(c => ({ ...c, company: v }))} placeholder="Company name" />
              <Field label="Division / Site" value={nc.division} onChange={v => setNc(c => ({ ...c, division: v }))} />
              <Field label="Contact person" value={nc.contact} onChange={v => setNc(c => ({ ...c, contact: v }))} />
              <Field label="Phone" value={nc.phone} onChange={v => setNc(c => ({ ...c, phone: v }))} />
              <Field label="Email" value={nc.email} onChange={v => setNc(c => ({ ...c, email: v }))} />
              <Field label="Location" value={nc.location} onChange={v => setNc(c => ({ ...c, location: v }))} />
            </div>
          )}
          <Field label="What was discussed?" multiline value={note} onChange={setNote} placeholder="Notes…" />
          <Field label="Next follow-up date" type="date" value={nextFU} onChange={setNextFU} />
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="outline" className={`rounded-2xl py-6 ${rec ? "border-red-300 bg-red-100 text-red-700" : ""}`} onClick={rec ? stopRec : startRec}><Mic size={18} />{rec ? "Stop" : "Voice note"}</Btn>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              <Camera size={18} />{uploading ? "Uploading…" : "Add photo/video"}
              <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
            </label>
          </div>
          {audioErr && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{audioErr}</div>}
          {audio && <div className="rounded-2xl bg-slate-50 p-3"><div className="mb-2 flex justify-between"><p className="text-sm font-semibold">Voice note</p><button onClick={() => setAudio("")} className="rounded-xl bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Delete</button></div><audio controls src={audio} className="w-full" /></div>}
          {files.length > 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
              {files.map((f, i) => (
                <div key={i} className="rounded-2xl bg-white p-2">
                  {f.type.startsWith("video/") ? <video controls src={f.url} className="h-32 w-full rounded-xl object-cover" /> : <img src={f.url} alt={f.name} className="h-32 w-full rounded-xl object-cover" />}
                  <p className="mt-1 truncate text-xs text-slate-600">{f.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(f.size)}</p>
                  <button onClick={() => setFiles(c => c.filter((_, j) => j !== i))} className="mt-2 w-full rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Delete</button>
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
function ClientsScreen({ data, setData, go, userId }) {
  const [search, setSearch] = useState(""); const [selId, setSelId] = useState(null); const [edit, setEdit] = useState(false);
  const sel = data.clients.find(c => c.id === selId);
  const docs = data.documents.filter(d => d.client_id === selId);
  const convs = data.conversations.filter(c => c.client_id === selId);
  const filtered = useMemo(() => { const q = search.toLowerCase(); return data.clients.filter(c => `${c.company} ${c.division} ${c.contact} ${c.location}`.toLowerCase().includes(q)); }, [search, data.clients]);

  const addBlank = async () => { const { data: r } = await supabase.from("clients").insert({ user_id: userId, company: "New Company", division: "", contact: "", phone: "", email: "", location: "", notes: "" }).select().single(); if (r) { setData(c => ({ ...c, clients: [...c.clients, r] })); setSelId(r.id); setEdit(true); } };
  const upd = async (field, val) => { await supabase.from("clients").update({ [field]: val }).eq("id", selId).eq("user_id", userId); setData(c => ({ ...c, clients: c.clients.map(cl => cl.id === selId ? { ...cl, [field]: val } : cl) })); };
  const del = async () => { if (!sel || !confirm(`Delete ${sel.company}?`)) return; await supabase.from("clients").delete().eq("id", sel.id).eq("user_id", userId); setData(c => ({ ...c, clients: c.clients.filter(cl => cl.id !== sel.id), followUps: c.followUps.filter(f => f.client_id !== sel.id) })); setSelId(null); setEdit(false); };
  const addFU = async () => { if (!sel) return; const { data: fu } = await supabase.from("follow_ups").insert({ user_id: userId, client_id: sel.id, client_name: sel.company, due_date: todayISO(), status: "Open", outcome: "", completed: false }).select().single(); if (fu) setData(c => ({ ...c, followUps: [...c.followUps, fu] })); alert("Follow-up created."); };

  if (sel) return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => { setSelId(null); setEdit(false); }}>← Back to clients</Btn>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">{edit ? <Field label="Company" value={sel.company} onChange={v => upd("company", v)} /> : <h1 className="text-2xl font-bold">{sel.company}</h1>}{!edit && sel.division && <p className="text-sm text-slate-500">{sel.division}</p>}</div>
            <Btn variant="outline" className="rounded-2xl" onClick={() => setEdit(!edit)}>{edit ? "Done" : "Edit"}</Btn>
          </div>
          {edit && <Field label="Division / Site" value={sel.division} onChange={v => upd("division", v)} />}
          <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
            {[["contact", "Contact"], ["phone", "Phone"], ["email", "Email"], ["location", "Location"]].map(([f, l]) => (
              <div key={f}><label className="mb-1 block text-xs font-bold text-slate-500">{l}</label>{edit ? <input value={sel[f] || ""} onChange={e => upd(f, e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" /> : <p className="text-sm text-slate-700">{sel[f] || "-"}</p>}</div>
            ))}
          </div>
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-semibold">Notes</p>{edit ? <textarea rows={3} value={sel.notes || ""} onChange={e => upd("notes", e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" /> : <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{sel.notes || "No notes yet."}</p>}</div>
          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${sel.phone || ""}`}><Btn variant="outline" className="w-full rounded-2xl"><Phone size={16} /></Btn></a>
            <a href={`mailto:${sel.email || ""}`}><Btn variant="outline" className="w-full rounded-2xl"><Mail size={16} /></Btn></a>
            <Btn className="rounded-2xl" onClick={() => go("QuickAdd")}>Add entry</Btn>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="outline" className="rounded-2xl" onClick={addFU}>Add follow-up</Btn>
            <Btn variant="danger" className="rounded-2xl" onClick={del}><Trash2 size={16} />Delete</Btn>
          </div>
          <div>
            <h2 className="mb-2 text-lg font-bold">History</h2>
            {convs.length === 0 && <p className="text-sm text-slate-500">No history yet.</p>}
            {convs.map(e => (<div key={e.id} className="mb-2 rounded-2xl bg-slate-50 p-3"><div className="flex justify-between"><p className="text-xs font-bold text-slate-500">{e.created_at?.slice(0, 10)}</p><p className="text-xs text-slate-400">{e.created_by_name}</p></div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{e.note}</p>{e.audio_data_url && <audio controls src={e.audio_data_url} className="mt-2 w-full" />}</div>))}
          </div>
          <div>
            <h2 className="mb-2 text-lg font-bold">Linked files</h2>
            {docs.length === 0 && <p className="text-sm text-slate-500">No files yet.</p>}
            <div className="grid grid-cols-2 gap-3">
              {docs.map(d => { const isImg = d.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i); const isVid = d.name?.match(/\.(mp4|mov|webm)$/i); return (<div key={d.id} className="rounded-2xl bg-slate-50 p-2">{isImg ? <img src={d.file_url} alt={d.name} className="h-28 w-full rounded-xl object-cover" /> : isVid ? <video controls src={d.file_url} className="h-28 w-full rounded-xl" /> : <div className="flex h-28 items-center justify-center rounded-xl bg-white"><FileText /></div>}<p className="mt-2 truncate text-xs text-slate-600">{d.name}</p></div>); })}
            </div>
          </div>
        </CC>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">My Clients</h1><p className="text-sm text-slate-500">Your clients and contacts.</p></div><Btn className="rounded-2xl" onClick={addBlank}><Plus size={18} />Add</Btn></div>
      <div className="flex items-center gap-2 rounded-3xl bg-white p-3 shadow-sm"><Search size={20} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…" className="w-full bg-transparent p-2 text-base outline-none" /></div>
      {data.clients.length === 0 && <Empty title="No clients yet" text="Tap Add to create your first client." />}
      <div className="space-y-3">
        {filtered.map(c => (<button key={c.id} onClick={() => setSelId(c.id)} className="w-full text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{c.company}</h2><p className="text-sm text-slate-500">{c.division || "No division"}</p><p className="mt-1 text-xs text-slate-500">{c.contact || "No contact"}</p></div><ChevronRight className="text-slate-400" /></div></CC></Card></button>))}
      </div>
    </div>
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────
function ServiceScreen({ data, setData, userId }) {
  const [rep, setRep] = useState({ clientId: "", machine: "", fault: "", workDone: "", partsUsed: "", technician: "" });
  const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(false);
  const sel = data.clients.find(c => c.id === rep.clientId);
  const handleFiles = async e => { setUploading(true); const s = await filesToStored(e.target.files); setFiles(c => [...c, ...s]); e.target.value = ""; setUploading(false); };

  const save = async () => {
    const { data: r } = await supabase.from("service_reports").insert({ user_id: userId, client_id: rep.clientId || null, machine: rep.machine, fault: rep.fault, work_done: rep.workDone, parts_used: rep.partsUsed, technician: rep.technician }).select().single();
    if (r) setData(c => ({ ...c, serviceReports: [r, ...c.serviceReports] }));
    for (const f of files) { if (rep.clientId) { const { data: doc } = await supabase.from("documents").insert({ user_id: userId, client_id: rep.clientId, file_url: f.url, name: f.name }).select().single(); if (doc) setData(c => ({ ...c, documents: [...c.documents, doc] })); } }
    const pw = window.open("", "_blank");
    if (pw) { const esc = v => String(v || "").replace(/[&<>'"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[m])); pw.document.write(`<html><head><title>Service Report</title><style>body{font-family:Arial,sans-serif;padding:30px}h1{border-bottom:2px solid #000;padding-bottom:8px}.s{margin-bottom:14px}.l{font-weight:bold}img{max-width:100%;margin-top:8px;border-radius:8px}</style></head><body><h1>PowerMate Service Report</h1><div class="s"><span class="l">Client:</span> ${esc(sel?.company)}</div><div class="s"><span class="l">Machine:</span> ${esc(rep.machine)}</div><div class="s"><span class="l">Technician:</span> ${esc(rep.technician)}</div><div class="s"><span class="l">Fault:</span><br/>${esc(rep.fault).replace(/\n/g, "<br/>")}</div><div class="s"><span class="l">Work Done:</span><br/>${esc(rep.workDone).replace(/\n/g, "<br/>")}</div><div class="s"><span class="l">Parts:</span><br/>${esc(rep.partsUsed).replace(/\n/g, "<br/>")}</div><h2>Photos</h2>${files.map(f => f.type.startsWith("image/") ? `<img src="${f.url}"/>` : `<p>${esc(f.name)}</p>`).join("")}<script>window.onload=function(){window.print()}<\/script></body></html>`); pw.document.close(); }
    setRep({ clientId: "", machine: "", fault: "", workDone: "", partsUsed: "", technician: "" }); setFiles([]);
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Service report</h1><p className="text-sm text-slate-500">Complete and create a PDF.</p></div>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <select value={rep.clientId} onChange={e => setRep(r => ({ ...r, clientId: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Select client / site</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}</select>
          <Field label="Machine / Equipment" value={rep.machine} onChange={v => setRep(r => ({ ...r, machine: v }))} />
          <Field label="Technician" value={rep.technician} onChange={v => setRep(r => ({ ...r, technician: v }))} />
          <Field label="Fault found" multiline value={rep.fault} onChange={v => setRep(r => ({ ...r, fault: v }))} />
          <Field label="Work done" multiline value={rep.workDone} onChange={v => setRep(r => ({ ...r, workDone: v }))} />
          <Field label="Parts used" multiline value={rep.partsUsed} onChange={v => setRep(r => ({ ...r, partsUsed: v }))} />
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <Upload size={18} />{uploading ? "Uploading…" : "Add photos / files"}
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
          {files.map((f, i) => <div key={i} className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-semibold">{f.name}</p><p className="text-xs text-slate-400">{formatBytes(f.size)}</p>{f.type.startsWith("image/") && <img src={f.url} alt={f.name} className="mt-2 max-h-40 w-full rounded-xl object-cover" />}<Btn variant="danger" className="mt-2 w-full rounded-xl" onClick={() => setFiles(c => c.filter((_, j) => j !== i))}>Delete</Btn></div>)}
          <Btn className="w-full rounded-2xl py-6 text-base" onClick={save}>Save & create PDF</Btn>
        </CC>
      </Card>
    </div>
  );
}

// ─── Documents ────────────────────────────────────────────────────────────────
function DocumentsScreen({ data, setData, userId }) {
  const [clientId, setClientId] = useState(""); const [uploading, setUploading] = useState(false);

  const handle = async e => {
    setUploading(true);
    const stored = await filesToStored(e.target.files);
    for (const f of stored) { const { data: doc } = await supabase.from("documents").insert({ user_id: userId, client_id: clientId || null, file_url: f.url, name: f.name }).select().single(); if (doc) setData(c => ({ ...c, documents: [...c.documents, doc] })); }
    e.target.value = ""; setUploading(false);
  };

  const del = async id => { await supabase.from("documents").delete().eq("id", id).eq("user_id", userId); setData(c => ({ ...c, documents: c.documents.filter(d => d.id !== id) })); };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Documents</h1><p className="text-sm text-slate-500">Your uploaded files.</p></div>

      {/* Storage info banner */}
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-bold">Storage info</p>
        <p className="mt-1">You have {data.documents.length} file{data.documents.length !== 1 ? "s" : ""} stored. For 20GB+ storage, ensure your Supabase project is on the Pro plan (100GB included).</p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Global document</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}</select>
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-6 font-semibold text-white ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <Upload size={18} />{uploading ? "Uploading…" : "Upload photo, video or document"}
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handle} disabled={uploading} />
          </label>
        </CC>
      </Card>

      {data.documents.length === 0 && <Empty title="No documents" text="Upload your first file above." />}
      <div className="space-y-3">
        {data.documents.map(doc => {
          const client = data.clients.find(c => c.id === doc.client_id);
          const isImg = doc.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
          const isVid = doc.name?.match(/\.(mp4|mov|webm)$/i);
          return (
            <Card key={doc.id} className="rounded-3xl shadow-sm">
              <CC className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><FileText size={22} /></div>
                  <div className="flex-1 min-w-0"><p className="truncate font-bold">{doc.name}</p><p className="text-sm text-slate-500">{client ? client.company : "Global"}</p></div>
                  <button onClick={() => del(doc.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><X size={18} /></button>
                </div>
                {isImg && <img src={doc.file_url} alt={doc.name} className="max-h-64 w-full rounded-2xl object-cover" />}
                {isVid && <video controls src={doc.file_url} className="max-h-64 w-full rounded-2xl" />}
                {!isImg && !isVid && <a href={doc.file_url} target="_blank" rel="noreferrer"><Btn className="w-full rounded-2xl">Open document</Btn></a>}
              </CC>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── More ─────────────────────────────────────────────────────────────────────
function MoreScreen({ go, data, setData, currentUser, onSignOut }) {
  const [sub, setSub] = useState("main");
  const [sr, setSr] = useState({ week: "", visits: "", quotes: "", followUps: "", newLeads: "", summary: "" });
  const isAdmin = currentUser?.role === "admin";

  const saveSR = async () => {
    const { data: r } = await supabase.from("sales_reports").insert({ user_id: currentUser.id, week: sr.week, visits: sr.visits, quotes: sr.quotes, follow_ups: sr.followUps, new_leads: sr.newLeads, summary: sr.summary }).select().single();
    if (r) setData(c => ({ ...c, salesReports: [r, ...c.salesReports] }));
    setSr({ week: "", visits: "", quotes: "", followUps: "", newLeads: "", summary: "" });
    alert("Sales report saved.");
  };

  if (sub === "sales") return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => setSub("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">My Sales Reports</h1>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <Field label="Week / Date" value={sr.week} onChange={v => setSr(r => ({ ...r, week: v }))} placeholder="e.g. Week 18 / 05 May 2026" />
          <Field label="Total visits" value={sr.visits} onChange={v => setSr(r => ({ ...r, visits: v }))} />
          <Field label="Quotes sent" value={sr.quotes} onChange={v => setSr(r => ({ ...r, quotes: v }))} />
          <Field label="Follow-ups completed" value={sr.followUps} onChange={v => setSr(r => ({ ...r, followUps: v }))} />
          <Field label="New leads" value={sr.newLeads} onChange={v => setSr(r => ({ ...r, newLeads: v }))} />
          <Field label="Weekly summary" multiline value={sr.summary} onChange={v => setSr(r => ({ ...r, summary: v }))} />
          <Btn className="w-full rounded-2xl py-6" onClick={saveSR}>Save sales report</Btn>
        </CC>
      </Card>
      {data.salesReports.map(r => <Card key={r.id} className="rounded-3xl shadow-sm"><CC className="p-4"><p className="font-bold">{r.week || r.created_at?.slice(0, 10)}</p><p className="mt-1 text-sm text-slate-600">{r.summary}</p></CC></Card>)}
    </div>
  );

  if (sub === "settings") return (
    <div className="space-y-5">
      <Btn variant="outline" className="rounded-2xl" onClick={() => setSub("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <div className="rounded-2xl bg-slate-50 p-4 space-y-1">
            <p className="text-sm font-bold text-slate-900">Logged in as</p>
            <p className="text-sm text-slate-700">{currentUser?.full_name || "No name set"}</p>
            <p className="text-xs text-slate-500">{currentUser?.email}</p>
            <p className="text-xs font-semibold text-slate-500 capitalize">Role: {currentUser?.role || "employee"}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-bold">Storage plan</p>
            <p className="mt-1">For 20GB+ storage, upgrade your Supabase project to the Pro plan at supabase.com. Pro gives you 100GB included.</p>
          </div>
          <Btn variant="danger" className="w-full rounded-2xl py-4" onClick={onSignOut}><LogOut size={16} />Sign out</Btn>
        </CC>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">More</h1><p className="text-sm text-slate-500">Reports and settings.</p></div>
      <div className="space-y-3">
        {isAdmin && <BigAction icon={ShieldCheck} title="Management Dashboard" subtitle="Team performance & weekly reports" onClick={() => go("Admin")} />}
        <BigAction icon={BriefcaseBusiness} title="My Sales Reports" subtitle="Log weekly visits, quotes and leads" onClick={() => setSub("sales")} />
        <BigAction icon={ClipboardList} title="Settings & Account" subtitle="View account info and sign out" onClick={() => setSub("settings")} />
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function PowerMateApp() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("Home");
  const [data, setData] = useState({ clients: [], planList: [], followUps: [], documents: [], conversations: [], serviceReports: [], salesReports: [] });
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); if (!session) setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => { setSession(s); if (!s) { setCurrentUser(null); setAuthLoading(false); } });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    const load = async () => {
      const { data: profile } = await supabase.from("users").select("*").eq("id", session.user.id).single();
      setCurrentUser(profile ? { ...session.user, ...profile } : { ...session.user, role: "employee" });
      setAuthLoading(false);
    };
    load();
  }, [session]);

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
      setData({ clients: clients.data || [], planList: plans.data || [], followUps: fus.data || [], documents: docs.data || [], conversations: convs.data || [], serviceReports: svcs.data || [], salesReports: sales.data || [] });
      setDataLoading(false);
    };
    load();
  }, [currentUser]);

  const signOut = async () => { await supabase.auth.signOut(); setScreen("Home"); };

  if (authLoading) return <Spinner />;
  if (!session || !currentUser) return <AuthScreen />;
  if (dataLoading) return <Spinner />;

  const uid = currentUser.id;
  const uname = currentUser.full_name || currentUser.email;

  const views = {
    Home: <HomeScreen go={setScreen} clients={data.clients} planList={data.planList} followUps={data.followUps} setData={setData} userId={uid} />,
    QuickAdd: <QuickAddScreen data={data} setData={setData} go={setScreen} userId={uid} userName={uname} />,
    Calendar: <CalendarScreen data={data} setData={setData} userId={uid} />,
    Clients: <ClientsScreen data={data} setData={setData} go={setScreen} userId={uid} />,
    Service: <ServiceScreen data={data} setData={setData} userId={uid} />,
    Documents: <DocumentsScreen data={data} setData={setData} userId={uid} />,
    More: <MoreScreen go={setScreen} data={data} setData={setData} currentUser={currentUser} onSignOut={signOut} />,
    Admin: <AdminDashboard currentUser={currentUser} />,
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        <header className="mb-4 flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white"><ClipboardList size={22} /></div>
            <div><p className="text-lg font-black leading-tight">PowerMate</p><p className="text-xs text-slate-500">{uname}</p></div>
          </div>
          <Btn className="rounded-2xl" onClick={() => setScreen("QuickAdd")}><Plus size={18} /></Btn>
        </header>
        <motion.main key={screen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          {views[screen]}
        </motion.main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          <NavTab icon={Home} label="Home" active={screen === "Home"} onClick={() => setScreen("Home")} />
          <NavTab icon={Users} label="Clients" active={screen === "Clients"} onClick={() => setScreen("Clients")} />
          <NavTab icon={Wrench} label="Service" active={screen === "Service"} onClick={() => setScreen("Service")} />
          <NavTab icon={FileText} label="Docs" active={screen === "Documents"} onClick={() => setScreen("Documents")} />
          <NavTab icon={Bell} label="More" active={screen === "More"} onClick={() => setScreen("More")} />
        </div>
      </nav>
    </div>
  );
}
