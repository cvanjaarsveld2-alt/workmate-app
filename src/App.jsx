import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "./supabase";
import {
  Bell, Briefcase, Calendar, Camera, ChevronRight, ChevronLeft,
  Clipboard, File as FileIcon, Home, LogOut, Mail, Mic, Phone,
  Plus, Search, Shield, Trash2, Upload, Users, Wrench,
  Eye, EyeOff, BarChart2, RefreshCw, WifiOff, Wifi,
  Check, AlertTriangle, Settings, X,
} from "lucide-react";

// ─── Brand colours ────────────────────────────────────────────────────────────
const BRAND = {
  primary:   "#8B1A1A",   // Power Works deep red
  primaryDark: "#6B1414", // darker red for hover
  charcoal:  "#1C1C1C",   // charcoal
  light:     "#F5F0F0",   // warm off-white background
  accent:    "#B22222",   // mid red accent
  logo:      "https://powerstart.eu/wp-content/uploads/2021/10/Power-Works-Logo.png",
};

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
const QUOTE_STATUSES = ["Pending", "Accepted", "Rejected", "Expired"];
const QUOTE_STATUS_COLORS = {
  "Pending":  "bg-amber-100 text-amber-800",
  "Accepted": "bg-green-100 text-green-800",
  "Rejected": "bg-red-100 text-red-800",
  "Expired":  "bg-slate-100 text-slate-600",
};
const OFFLINE_KEY = "powerworks_offline_queue";

// ─── Push Notification Config ─────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = "BMntC_yC4nVCfpLiAZAl-DclOBugaSqneMdcUqFu9km4GrhDkEiUKi_ve9ANnN6d2Rc5etlP4cgFgGU1vLjbljo";

// Register service worker and subscribe to push notifications
async function registerPushNotifications(userId) {
  // Push notifications need a real /public/service-worker.js file.
  // This safe version prevents the whole app from failing when that file is missing.
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return false;
    }

    const swUrl = "/service-worker.js";
    try {
      const check = await fetch(swUrl, { method: "HEAD", cache: "no-store" });
      if (!check.ok) {
        console.warn("Push disabled: /service-worker.js not found in public folder.");
        return false;
      }
    } catch (e) {
      console.warn("Push disabled: could not check service worker.");
      return false;
    }

    const reg = await navigator.serviceWorker.register(swUrl);
    await navigator.serviceWorker.ready;

    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = Uint8Array.from(
        atob(VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/")),
        c => c.charCodeAt(0)
      );
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }

    const subJson = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: (subJson.keys && subJson.keys.p256dh) || "",
      auth: (subJson.keys && subJson.keys.auth) || "",
      user_agent: navigator.userAgent.slice(0, 200)
    }, { onConflict: "user_id,endpoint" });

    if (error) console.error("Push sub save error:", error);
    return !error;
  } catch (e) {
    console.warn("Push registration skipped:", e);
    return false;
  }
}




// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }
function niceDate(d) { if (!d) d = new Date(); return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
function daysSince(ds) { if (!ds) return 999; return Math.max(0, Math.floor((new Date(todayISO() + "T12:00:00") - new Date(ds + "T12:00:00")) / 86400000)); }
function workingDaysSince(ds) { if (!ds) return 0; var count = 0; var d = new Date(ds + "T12:00:00"); var today = new Date(todayISO() + "T12:00:00"); while (d < today) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++; } return count; }

// ─── Smart date display ───────────────────────────────────────────────────────
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
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: diff < -365 || diff > 365 ? "numeric" : undefined });
}

function weekStart() { var d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); }
function weekEnd() { var d = new Date(); d.setDate(d.getDate() - d.getDay() + 7); return d.toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function addDays(ds, days) { var d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function formatBytes(b) { if (!b) return "0 B"; var k = 1024, s = ["B","KB","MB","GB"], i = Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(1) + " " + s[i]; }
function formatCurrency(v) { return "R " + parseFloat(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 }); }

// ─── Offline Queue ─────────────────────────────────────────────────────────────
function getQueue() { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch(e) { return []; } }
function addToQueue(op) { var q = getQueue(); q.push(Object.assign({}, op, { id: Date.now() })); localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); }
async function processOfflineQueue() { var queue = getQueue(); if (!queue.length) return; var failed = []; for (var i = 0; i < queue.length; i++) { var op = queue[i]; try { if (op.type === "insert") await supabase.from(op.table).insert(op.data); else if (op.type === "update") await supabase.from(op.table).update(op.data).eq("id", op.id); else if (op.type === "delete") await supabase.from(op.table).delete().eq("id", op.id); } catch(e) { failed.push(op); } } if (failed.length) localStorage.setItem(OFFLINE_KEY, JSON.stringify(failed)); else localStorage.removeItem(OFFLINE_KEY); }

// ─── Notifications ─────────────────────────────────────────────────────────────
async function requestNotifPermission() { if (!("Notification" in window)) return false; if (Notification.permission === "granted") return true; try { return (await Notification.requestPermission()) === "granted"; } catch(e) { return false; } }
function scheduleNotif(title, body, fireAt) { const delay = fireAt - Date.now(); if (delay <= 0) return null; return setTimeout(() => { if (Notification.permission === "granted") new Notification(title, { body, icon: "/icons/icon-192.png" }); }, delay); };
function scheduleItemNotifs(item, mins) { if (!item.date || !item.time) return []; const mt = new Date(`${item.date}T${item.time}:00`).getTime(); return mins.map(m => scheduleNotif("⏰ Power Works Reminder", `${item.title}${item.client ? ` — ${item.client}` : ""} in ${m === 60 ? "1 hour" : `${m} min`}`, mt - m * 60000)).filter(Boolean); };

// ─── Upload ────────────────────────────────────────────────────────────────────
async function uploadFile(file) { try { const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_"); const name = `${Date.now()}-${clean}`; const { error } = await supabase.storage.from("powermate-files").upload(name, file, { cacheControl: "3600", upsert: false }); if (error) { alert("Upload error: " + error.message); return null; } return supabase.storage.from("powermate-files").getPublicUrl(name).data.publicUrl; } catch (e) { alert("Upload failed: " + e.message); return null; } };

// ─── Image Compression ────────────────────────────────────────────────────────
async function compressImage(file, maxWidthPx = 1920, qualityVal = 0.75) {
  // Only compress images
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidthPx) {
        height = Math.round((height * maxWidthPx) / width);
        width = maxWidthPx;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
          console.log(`Compressed: ${(file.size/1024).toFixed(0)}KB → ${(compressed.size/1024).toFixed(0)}KB`);
          resolve(compressed);
        },
        'image/jpeg',
        qualityVal
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function filesToStored(fileList) {
  var out = [];
  var files = Array.from(fileList || []);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.type && f.type.startsWith('image/')) { f = await compressImage(f); }
    var url = await uploadFile(f);
    if (url) out.push({ name: f.name, type: f.type || "File", size: f.size, url: url });
  }
  return out;
}

// ─── IndexedDB for offline photo storage ──────────────────────────────────────
const IDB_NAME = 'powerworks-offline';
const IDB_VERSION = 1;

function openIDB() {
  return new Promise(function(resolve, reject) {
    try {
      if (!window.indexedDB) { reject(new Error('IDB not supported')); return; }
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('offline_photos')) {
          db.createObjectStore('offline_photos', { keyPath: 'id' });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    } catch(e) { reject(e); }
  });
}

async function savePhotoOffline(id, file, metadata) {
  try {
    var db = await openIDB();
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var tx = db.transaction('offline_photos', 'readwrite');
        tx.objectStore('offline_photos').put({
          id: id, dataUrl: reader.result, name: file.name,
          type: file.type, size: file.size, metadata: metadata, savedAt: Date.now()
        });
        tx.oncomplete = function() { resolve(reader.result); };
        tx.onerror = function() { reject(tx.error); };
      };
      reader.readAsDataURL(file);
    });
  } catch(e) { console.error('savePhotoOffline error:', e); return null; }
}

async function getOfflinePhotos() {
  try {
    var db = await openIDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('offline_photos', 'readonly');
      var req = tx.objectStore('offline_photos').getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch(e) { return []; }
}

async function deleteOfflinePhoto(id) {
  try {
    var db = await openIDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('offline_photos', 'readwrite');
      tx.objectStore('offline_photos').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = function() { reject(tx.error); };
    });
  } catch(e) { console.error('deleteOfflinePhoto error:', e); }
}

async function syncOfflinePhotos(userId, setData) {
  try {
    var photos = await getOfflinePhotos();
    if (!photos || photos.length === 0) return;
    for (var i = 0; i < photos.length; i++) {
      var photo = photos[i];
      try {
        var res = await fetch(photo.dataUrl);
        var blob = await res.blob();
        var file = new File([blob], photo.name, { type: photo.type });
        var url = await uploadFile(file);
        if (url) {
          await supabase.from('documents').insert({
            user_id: userId,
            client_id: (photo.metadata && photo.metadata.clientId) || null,
            file_url: url, name: photo.name
          });
          await deleteOfflinePhoto(photo.id);
        }
      } catch(photoErr) { console.error('Photo sync error:', photoErr); }
    }
  } catch(e) { console.error('syncOfflinePhotos error:', e); }
}

async function uploadFileWithOfflineFallback(file, clientId, userId) {
  var online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (online) {
    var url = await uploadFile(file);
    return url ? { url: url, offline: false } : null;
  } else {
    var id = 'offline_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var dataUrl = await savePhotoOffline(id, file, { clientId: clientId, userId: userId });
    return dataUrl ? { url: dataUrl, offline: true, offlineId: id } : null;
  }
}

async function filesToStoredOffline(fileList, clientId, userId) {
  var out = [];
  var files = Array.from(fileList || []);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.type.startsWith('image/')) { f = await compressImage(f); }
    var result = await uploadFileWithOfflineFallback(f, clientId, userId);
    if (result) out.push({ name: f.name, type: f.type || 'File', size: f.size, url: result.url, offline: result.offline || false });
  }
  return out;
}

// ─── Local Data Cache ─────────────────────────────────────────────────────────
const DATA_CACHE_KEY = 'powerworks_data_cache';

function saveDataCache(data) {
  try {
    if (typeof localStorage === "undefined") return;
    const cacheable = {
      ...data,
      conversations: (data.conversations || []).map(c => ({ ...c, audio_data_url: null })),
      documents: (data.documents || []).slice(0, 100), // limit to 100 docs to save space
    };
    const str = JSON.stringify(cacheable);
    // Only cache if under 4MB (iOS localStorage limit)
    if (str.length < 4 * 1024 * 1024) {
      localStorage.setItem(DATA_CACHE_KEY, str);
    }
  } catch (e) {
    console.log('Cache save failed:', e);
  }
}

function loadDataCache() {
  try {
    if (typeof localStorage === "undefined") return null;
    const cached = localStorage.getItem(DATA_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // Validate it has the expected structure
    if (!parsed || !Array.isArray(parsed.clients)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}


// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BRAND.light }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid #e2e8f0", borderTopColor: BRAND.primary, animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('PowerMate error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: BRAND.light }}>
          <div className="rounded-3xl bg-white p-8 shadow-sm max-w-sm w-full space-y-4">
            <div className="rounded-2xl p-4 text-white text-2xl" style={{ background: BRAND.primary }}>⚠️</div>
            <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
            <p className="text-sm text-slate-500">The app encountered an error. Please refresh and try again.</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="w-full rounded-2xl py-3 font-bold text-white"
              style={{ background: BRAND.primary }}>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Pull to Refresh ──────────────────────────────────────────────────────────
function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef(0);
  const currentY = React.useRef(0);
  const threshold = 80;

  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    if (diff > 20 && window.scrollY === 0) setPulling(true);
    else setPulling(false);
  };
  const onTouchEnd = async () => {
    const diff = currentY.current - startY.current;
    if (diff > threshold && window.scrollY === 0) {
      setRefreshing(true);
      setPulling(false);
      await onRefresh();
      setRefreshing(false);
    }
    setPulling(false);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {(pulling || refreshing) && (
        <div className="flex items-center justify-center py-3 text-sm font-semibold" style={{ color: BRAND.primary }}>
          {refreshing ? (
            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />Refreshing…</>
          ) : (
            '↓ Pull to refresh'
          )}
        </div>
      )}
      {children}
    </div>
  );
}


// ─── Biometric / App Lock ─────────────────────────────────────────────────────
const LOCK_KEY = "powerworks_last_active";
const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function updateLastActive() {
  localStorage.setItem(LOCK_KEY, Date.now().toString());
}

function isLockRequired() {
  const last = parseInt(localStorage.getItem(LOCK_KEY) || "0");
  return Date.now() - last > LOCK_TIMEOUT;
}

async function authenticateBiometric() {
  try {
    // Use WebAuthn / device biometric - with full iOS Safari support
    if (
      window.PublicKeyCredential &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
    ) {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available) {
        const credential = await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rpId: window.location.hostname,
            allowCredentials: [],
            userVerification: "required",
            timeout: 60000,
          }
        });
        return !!credential;
      }
    }
    return true; // Biometric not available - allow through
  } catch (e) {
    if (e.name === "NotAllowedError") return false; // User cancelled
    return true; // Any other error - allow through
  }
}

function LockScreen({ onUnlock }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unlock = async () => {
    setLoading(true);
    setError("");
    const ok = await authenticateBiometric();
    if (ok) {
      updateLastActive();
      onUnlock();
    } else {
      setError("Authentication failed. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isiOS) unlock();
}, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: BRAND.primary }}>
      <div className="w-full max-w-sm text-center space-y-6">
        <img src={BRAND.logo} alt="Power Works" className="h-12 object-contain mx-auto" onError={e => { e.target.style.display = "none"; }} />
        <div>
          <h1 className="text-2xl font-black text-white">PowerMate</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>Power Works Field Service App</p>
        </div>
        <div className="rounded-3xl bg-white p-8 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full p-5" style={{ background: BRAND.light }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={BRAND.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <p className="text-slate-700 font-semibold">App Locked</p>
            <p className="text-sm text-slate-500 text-center">Use your fingerprint or Face ID to unlock</p>
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button onClick={unlock} disabled={loading}
            className="w-full rounded-2xl py-4 font-bold text-white disabled:opacity-60"
            style={{ background: BRAND.primary }}>
            {loading ? "Verifying…" : "🔓 Unlock with Biometric"}
          </button>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>© 2026 Power Works (Pty) Ltd</p>
      </div>
    </div>
  );
}


// ─── Basic UI Components (added fix) ─────────────────────────────────────────
function Card({ children, className = "" }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CC({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function Btn({ children, onClick, disabled, variant = "solid", className = "", type = "button" }) {
  const styles = {
    solid: { background: BRAND.primary, color: "#fff" },
    outline: { background: "#fff", color: BRAND.primary, border: `1px solid ${BRAND.primary}` },
    danger: { background: "#dc2626", color: "#fff" },
    secondary: { background: BRAND.light, color: BRAND.primary },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${className}`}
      style={styles[variant] || styles.solid}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false }) {
  return (
    <div>
      {label && <label className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>}
      {multiline ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none" />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none" />
      )}
    </div>
  );
}

function Empty({ title, text }) {
  return <div className="rounded-3xl bg-white p-8 text-center shadow-sm"><p className="text-lg font-bold text-slate-900">{title}</p><p className="mt-2 text-sm text-slate-500">{text}</p></div>;
}

function ProgressBar({ value = 0, max = 100, color = BRAND.primary }) {
  const pct = max > 0 ? Math.min(100, Math.round((Number(value || 0) / Number(max || 1)) * 100)) : 0;
  return <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>;
}

function ShareModal({ title, text, onClose }) {
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, text });
      else { await navigator.clipboard.writeText(text || ""); alert("Copied to clipboard"); }
    } catch (e) {}
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-lg">
        <h2 className="text-lg font-bold">{title || "Share"}</h2>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{text}</pre>
        <div className="mt-4 grid grid-cols-2 gap-2"><Btn variant="outline" onClick={onClose}>Close</Btn><Btn onClick={share}>Share</Btn></div>
      </div>
    </div>
  );
}

function NavTab({ icon: Icon, label, active, onClick, badge }) {
  return <button onClick={onClick} className="relative flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-xs font-bold"><Icon size={20} style={{ color: active ? BRAND.primary : "#64748b" }} /><span style={{ color: active ? BRAND.primary : "#64748b" }}>{label}</span>{!!badge && <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{badge}</span>}</button>;
}

function BigAction({ icon: Icon, title, text, onClick }) {
  return <button onClick={onClick} className="w-full text-left"><Card className="rounded-3xl shadow-sm"><CC className="flex items-center gap-4 p-4"><div className="rounded-2xl p-3 text-white" style={{ background: BRAND.primary }}><Icon size={22} /></div><div className="flex-1"><p className="font-bold text-slate-900">{title}</p>{text && <p className="text-sm text-slate-500">{text}</p>}</div><ChevronRight size={18} className="text-slate-400" /></CC></Card></button>;
}

function SignaturePad({ onSave, onCancel, onChange }) {
  const [name, setName] = useState("");
  const save = () => { if (onSave) onSave(name); if (onChange) onChange(name); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-lg"><h2 className="text-lg font-bold">Client Signature</h2><p className="mt-1 text-sm text-slate-500">Type the client name as signature.</p><input value={name} onChange={e=>setName(e.target.value)} className="mt-4 w-full rounded-2xl border border-slate-200 p-4" placeholder="Client name" /><div className="mt-4 grid grid-cols-2 gap-2"><Btn variant="outline" onClick={onCancel}>Cancel</Btn><Btn onClick={save}>Save</Btn></div></div></div>;
}

function PhotoAnnotator({ src, file, onSave, onDone, onCancel }) {
  const imageSrc = src || (file ? URL.createObjectURL(file) : "");
  const save = () => { if (onSave) onSave(imageSrc); if (onDone) onDone(file); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-lg"><h2 className="mb-3 text-lg font-bold">Photo Preview</h2>{imageSrc && <img src={imageSrc} alt="Preview" className="max-h-80 w-full rounded-2xl object-contain" />}<p className="mt-3 text-xs text-slate-500">Annotation tools can be added later. This preview keeps the app loading correctly.</p><div className="mt-4 grid grid-cols-2 gap-2"><Btn variant="outline" onClick={onCancel}>Cancel</Btn><Btn onClick={save}>Use photo</Btn></div></div></div>;
}


// ─── Auth ──────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [newPw, setNewPw] = useState(""); const [confirmPw, setConfirmPw] = useState(""); const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false); const [loading, setLoading] = useState(false); const [msg, setMsg] = useState({ text: "", type: "error" });

  useEffect(() => { if (window.location.hash.includes("type=recovery")) setMode("resetpw"); }, []);
  const showMsg = (text, type = "error") => setMsg({ text, type });
  const login = async () => { if (!email || !password) { showMsg("Please enter email and password."); return; } setLoading(true); setMsg({ text: "" }); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) showMsg(error.message); setLoading(false); };
  const signup = async () => { if (!email || !password || !name) { showMsg("Please fill in all fields."); return; } if (password.length < 6) { showMsg("Password must be at least 6 characters."); return; } setLoading(true); setMsg({ text: "" }); const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } }); if (error) { showMsg(error.message); setLoading(false); return; } if (data.user) await supabase.from("users").upsert({ id: data.user.id, email, full_name: name, role: "employee" }); showMsg("Account created! You can now log in.", "success"); setMode("login"); setLoading(false); };
  const forgotPw = async () => { if (!email) { showMsg("Please enter your email."); return; } setLoading(true); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://workmate-app-pez6.vercel.app" }); if (error) showMsg(error.message); else showMsg("Reset email sent! Check your inbox.", "success"); setLoading(false); };
  const resetPw = async () => { if (!newPw || !confirmPw) { showMsg("Please fill in both fields."); return; } if (newPw !== confirmPw) { showMsg("Passwords do not match."); return; } setLoading(true); const { error } = await supabase.auth.updateUser({ password: newPw }); if (error) showMsg(error.message); else { showMsg("Password updated! Please log in.", "success"); setTimeout(() => { setMode("login"); window.location.hash = ""; }, 2000); } setLoading(false); };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src={BRAND.logo} alt="Power Works" className="h-16 object-contain mb-4" onError={e => { e.target.style.display = "none"; }} />
          <h1 className="text-2xl font-black" style={{ color: BRAND.primary }}>PowerMate</h1>
          <p className="mt-1 text-sm text-slate-500">Power Works Field Service App</p>
        </div>
        <Card className="rounded-3xl shadow-sm">
          <CC className="space-y-4 p-6">
            {mode === "resetpw" && (<><h2 className="text-xl font-bold">Set new password</h2><div><label className="mb-1 block text-sm font-semibold text-slate-800">New password</label><div className="relative"><input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none pr-12" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div><Field label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />{msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}<Btn className="w-full py-4" onClick={resetPw} disabled={loading}>{loading ? "Updating…" : "Set new password"}</Btn></>)}
            {mode === "forgot" && (<><div><h2 className="text-xl font-bold">Reset password</h2><p className="mt-1 text-sm text-slate-500">We'll send you a reset link.</p></div><Field label="Email" value={email} onChange={setEmail} placeholder="you@pwrstart.com" type="email" />{msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}<Btn className="w-full py-4" onClick={forgotPw} disabled={loading}>{loading ? "Sending…" : "Send reset email"}</Btn><button onClick={() => { setMode("login"); setMsg({ text: "" }); }} className="w-full text-center text-sm text-slate-500 underline">← Back to login</button></>)}
            {(mode === "login" || mode === "signup") && (<>
              <div className="flex rounded-2xl p-1" style={{ background: BRAND.light }}>
                {["login", "signup"].map(m => (<button key={m} onClick={() => { setMode(m); setMsg({ text: "" }); }} className="flex-1 rounded-xl py-2 text-sm font-semibold transition" style={{ background: mode === m ? "#fff" : "transparent", color: mode === m ? BRAND.primary : "#64748b", boxShadow: mode === m ? "0 1px 4px #0001" : "none" }}>{m === "login" ? "Log in" : "Sign up"}</button>))}
              </div>
              {mode === "signup" && <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />}
              <Field label="Email" value={email} onChange={setEmail} placeholder="you@pwrstart.com" type="email" />
              <div><label className="mb-1 block text-sm font-semibold text-slate-800">Password</label><div className="relative"><input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none pr-12" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
              {mode === "login" && <button onClick={() => { setMode("forgot"); setMsg({ text: "" }); }} className="text-sm underline text-left" style={{ color: BRAND.primary }}>Forgot password?</button>}
              {msg.text && <div className={`rounded-2xl p-3 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
              <Btn className="w-full py-4 text-base" onClick={mode === "login" ? login : signup} disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</Btn>
            </>)}
          </CC>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Power Works (Pty) Ltd</p>
      </motion.div>
    </div>
  );
}

// ─── Equipment Register ────────────────────────────────────────────────────────
function EquipmentScreen({ data, setData, userId, isOnline }) {
  const [view, setView] = useState("list"); // list | add | detail
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ clientId: "", name: "", model: "", serial_number: "", install_date: "", last_service_date: "", next_service_date: "", warranty_expiry: "", notes: "" });
  const [shareModal, setShareModal] = useState(null);

  const equipment = data.equipment || [];
  const sel = equipment.find(e => e.id === selected);

  const save = async () => {
    if (!form.name.trim()) { alert("Please enter equipment name."); return; }
    const payload = { user_id: userId, client_id: form.clientId || null, ...form };
    if (isOnline) {
      const { data: r } = await supabase.from("equipment").insert(payload).select().single();
      if (r) setData(c => ({ ...c, equipment: [...(c.equipment || []), r] }));
    } else {
      const item = { ...payload, id: `offline_${Date.now()}` };
      addToQueue({ type: "insert", table: "equipment", data: payload });
      setData(c => ({ ...c, equipment: [...(c.equipment || []), item] }));
    }
    setForm({ clientId: "", name: "", model: "", serial_number: "", install_date: "", last_service_date: "", next_service_date: "", warranty_expiry: "", notes: "" });
    setView("list");
  };

  const del = async (id) => {
    if (!confirm("Delete this equipment record?")) return;
    if (isOnline) await supabase.from("equipment").delete().eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "delete", table: "equipment", id });
    setData(c => ({ ...c, equipment: (c.equipment || []).filter(e => e.id !== id) }));
    setSelected(null); setView("list");
  };

  const updateField = async (id, field, val) => {
    if (isOnline) await supabase.from("equipment").update({ [field]: val }).eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "update", table: "equipment", id, data: { [field]: val } });
    setData(c => ({ ...c, equipment: (c.equipment || []).map(e => e.id === id ? { ...e, [field]: val } : e) }));
  };

  // Service due warning — within 30 days
  const isDueSoon = (e) => { if (!e.next_service_date) return false; const days = Math.floor((new Date(e.next_service_date + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000); return days >= 0 && days <= 30; };
  const isOverdue = (e) => { if (!e.next_service_date) return false; return e.next_service_date < todayISO(); };

  if (view === "add") return (
    <div className="space-y-5">
      <Btn variant="outline" onClick={() => setView("list")}>← Back</Btn>
      <h1 className="text-2xl font-bold">Add Equipment</h1>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4">
            <option value="">Select client / site</option>
            {data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}
          </select>
          <Field label="Equipment name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Hydraulic Starter HS-200" />
          <Field label="Model" value={form.model} onChange={v => setForm(f => ({ ...f, model: v }))} placeholder="Model number" />
          <Field label="Serial number" value={form.serial_number} onChange={v => setForm(f => ({ ...f, serial_number: v }))} placeholder="Serial number" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Install date" type="date" value={form.install_date} onChange={v => setForm(f => ({ ...f, install_date: v }))} />
            <Field label="Warranty expiry" type="date" value={form.warranty_expiry} onChange={v => setForm(f => ({ ...f, warranty_expiry: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Last service" type="date" value={form.last_service_date} onChange={v => setForm(f => ({ ...f, last_service_date: v }))} />
            <Field label="Next service" type="date" value={form.next_service_date} onChange={v => setForm(f => ({ ...f, next_service_date: v }))} />
          </div>
          <Field label="Notes" multiline value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          <Btn className="w-full py-6" onClick={save}>Save equipment</Btn>
        </CC>
      </Card>
    </div>
  );

  if (sel) return (
    <div className="space-y-5">
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
      <Btn variant="outline" onClick={() => { setSelected(null); setView("list"); }}>← Back</Btn>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{sel.name}</h1>
              {sel.model && <p className="text-sm text-slate-500">Model: {sel.model}</p>}
              {sel.serial_number && <p className="text-sm text-slate-500">S/N: {sel.serial_number}</p>}
            </div>
            <div className="flex gap-2">
              {isOverdue(sel) && <span className="rounded-xl bg-red-100 px-2 py-1 text-xs font-bold text-red-700">OVERDUE</span>}
              {isDueSoon(sel) && !isOverdue(sel) && <span className="rounded-xl bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">DUE SOON</span>}
            </div>
          </div>

          {/* Client */}
          {sel.client_id && (() => { const client = data.clients.find(c => c.id === sel.client_id); return client ? <div className="rounded-2xl p-3 text-sm font-semibold text-white" style={{ background: BRAND.primary }}>{client.company}{client.division ? ` — ${client.division}` : ""}</div> : null; })()}

          {/* Dates */}
          <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
            <Field label="Install date" type="date" value={sel.install_date} onChange={v => updateField(sel.id, "install_date", v)} />
            <Field label="Warranty expiry" type="date" value={sel.warranty_expiry} onChange={v => updateField(sel.id, "warranty_expiry", v)} />
            <Field label="Last service date" type="date" value={sel.last_service_date} onChange={v => updateField(sel.id, "last_service_date", v)} />
            <Field label="Next service date" type="date" value={sel.next_service_date} onChange={v => updateField(sel.id, "next_service_date", v)} />
          </div>
          <Field label="Notes" multiline value={sel.notes} onChange={v => updateField(sel.id, "notes", v)} />

          {/* Service history from service reports */}
          <div>
            <h2 className="mb-2 text-lg font-bold">Service history</h2>
            {(() => {
              const reports = (data.serviceReports || []).filter(r => r.machine && r.machine.toLowerCase().includes(sel.name.toLowerCase()));
              return reports.length === 0 ? <p className="text-sm text-slate-500">No linked service reports yet.</p> : reports.map(r => (
                <div key={r.id} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-500">{r.created_at && r.created_at.slice(0, 10)}</p>
                  <p className="text-sm text-slate-700 mt-1">{r.fault}</p>
                  <p className="text-xs text-slate-400">{r.technician}</p>
                </div>
              ));
            })()}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Btn variant="outline" onClick={() => setShareModal({ title: sel.name, text: `Equipment: ${sel.name}\nModel: ${sel.model || "-"}\nSerial: ${sel.serial_number || "-"}\nNext Service: ${sel.next_service_date || "Not set"}\nWarranty: ${sel.warranty_expiry || "Not set"}` })}><Upload size={16} />Share</Btn>
            <Btn variant="danger" onClick={() => del(sel.id)}><Trash2 size={16} />Delete</Btn>
          </div>
        </CC>
      </Card>
    </div>
  );

  const overdueCount = equipment.filter(isOverdue).length;
  const dueSoonCount = equipment.filter(e => isDueSoon(e) && !isOverdue(e)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Equipment Register</h1><p className="text-sm text-slate-500">{equipment.length} items registered</p></div>
        <Btn onClick={() => setView("add")}><Plus size={18} />Add</Btn>
      </div>
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "#fff3f3", border: `1px solid ${BRAND.primary}20` }}>
          {overdueCount > 0 && <p className="text-sm font-bold text-red-700">⚠️ {overdueCount} equipment overdue for service</p>}
          {dueSoonCount > 0 && <p className="text-sm font-semibold text-amber-700">🔔 {dueSoonCount} equipment due for service within 30 days</p>}
        </div>
      )}
      {equipment.length === 0 && <Empty title="No equipment registered" text="Tap Add to register your first piece of equipment." />}
      <div className="space-y-3">
        {equipment.map(e => {
          const client = data.clients.find(c => c.id === e.client_id);
          return (
            <button key={e.id} onClick={() => { setSelected(e.id); setView("detail"); }} className="w-full text-left">
              <Card className="rounded-3xl shadow-sm">
                <CC className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl p-3 text-white" style={{ background: isOverdue(e) ? "#dc2626" : isDueSoon(e) ? "#d97706" : BRAND.primary }}><Settings size={22} /></div>
                      <div>
                        <p className="font-bold text-slate-900">{e.name}</p>
                        {e.model && <p className="text-xs text-slate-500">{e.model}</p>}
                        {client && <p className="text-xs text-slate-400">{client.company}</p>}
                        {e.next_service_date && <p className={`text-xs font-semibold mt-1 ${isOverdue(e) ? "text-red-600" : isDueSoon(e) ? "text-amber-600" : "text-slate-400"}`}>Next service: {e.next_service_date}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isOverdue(e) && <span className="rounded-xl bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">OVERDUE</span>}
                      {isDueSoon(e) && !isOverdue(e) && <span className="rounded-xl bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">DUE SOON</span>}
                      <ChevronRight size={18} className="text-slate-400" />
                    </div>
                  </div>
                </CC>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Target Tracker ────────────────────────────────────────────────────────────
function TargetScreen({ data, setData, userId, isOnline }) {
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ visits_target: "", quotes_target: "", new_clients_target: "", service_reports_target: "" });
  const [actuals, setActuals] = useState(null);
  const [loading, setLoading] = useState(true);

  const targets = useMemo(() => (data.targets || []).find(t => t.month === month), [data.targets, month]);

  useEffect(() => { loadActuals(); }, [month]);

  const loadActuals = async () => {
    setLoading(true);
    const from = `${month}-01`; const to = `${month}-31`;
    const [convs, quotes, clients, svcs] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from).lte("created_at", to + "T23:59:59"),
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from).lte("created_at", to + "T23:59:59"),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from).lte("created_at", to + "T23:59:59"),
      supabase.from("service_reports").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from).lte("created_at", to + "T23:59:59"),
    ]);
    setActuals({ visits: convs.count || 0, quotes: quotes.count || 0, newClients: clients.count || 0, serviceReports: svcs.count || 0 });
    setLoading(false);
  };

  const saveTargets = async () => {
    const payload = { user_id: userId, month, visits_target: parseInt(form.visits_target) || 0, quotes_target: parseInt(form.quotes_target) || 0, new_clients_target: parseInt(form.new_clients_target) || 0, service_reports_target: parseInt(form.service_reports_target) || 0 };
    if (targets) {
      if (isOnline) await supabase.from("targets").update(payload).eq("id", targets.id);
      setData(c => ({ ...c, targets: (c.targets || []).map(t => t.month === month ? { ...t, ...payload } : t) }));
    } else {
      if (isOnline) { const { data: r } = await supabase.from("targets").insert(payload).select().single(); if (r) setData(c => ({ ...c, targets: [...(c.targets || []), r] })); }
      else { setData(c => ({ ...c, targets: [...(c.targets || []), { ...payload, id: `offline_${Date.now()}` }] })); }
    }
    setEditing(false);
  };

  useEffect(() => {
    if (targets) setForm({ visits_target: targets.visits_target || "", quotes_target: targets.quotes_target || "", new_clients_target: targets.new_clients_target || "", service_reports_target: targets.service_reports_target || "" });
  }, [targets]);

  const metrics = [
    { label: "Visits / Conversations", actual: (actuals && actuals.visits), target: (targets && targets.visits_target), color: "#3b82f6", icon: Users },
    { label: "Quotes Sent", actual: (actuals && actuals.quotes), target: (targets && targets.quotes_target), color: BRAND.primary, icon: FileIcon },
    { label: "New Clients", actual: (actuals && actuals.newClients), target: (targets && targets.new_clients_target), color: "#10b981", icon: Plus },
    { label: "Service Reports", actual: (actuals && actuals.serviceReports), target: (targets && targets.service_reports_target), color: "#8b5cf6", icon: Wrench },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Target Tracker</h1><p className="text-sm text-slate-500">Monthly performance vs targets.</p></div>
        <Btn variant={editing ? "secondary" : "solid"} onClick={() => { setEditing(!editing); }}>{editing ? "Cancel" : "Set targets"}</Btn>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <label className="text-sm font-bold text-slate-700">Month</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="flex-1 rounded-xl border border-slate-200 p-2 text-sm" />
      </div>

      {/* Set targets form */}
      {editing && (
        <Card className="rounded-3xl shadow-sm">
          <CC className="space-y-4 p-4">
            <h2 className="font-bold text-slate-900">Set targets for {month}</h2>
            <Field label="Visits / Conversations target" type="number" value={form.visits_target} onChange={v => setForm(f => ({ ...f, visits_target: v }))} placeholder="e.g. 20" />
            <Field label="Quotes target" type="number" value={form.quotes_target} onChange={v => setForm(f => ({ ...f, quotes_target: v }))} placeholder="e.g. 10" />
            <Field label="New clients target" type="number" value={form.new_clients_target} onChange={v => setForm(f => ({ ...f, new_clients_target: v }))} placeholder="e.g. 5" />
            <Field label="Service reports target" type="number" value={form.service_reports_target} onChange={v => setForm(f => ({ ...f, service_reports_target: v }))} placeholder="e.g. 8" />
            <Btn className="w-full py-4" onClick={saveTargets}>Save targets</Btn>
          </CC>
        </Card>
      )}

      {/* Metrics */}
      {loading ? <div className="text-center text-slate-500 py-8">Loading…</div> : (
        <div className="space-y-4">
          {metrics.map(({ label, actual, target, color, icon: Icon }) => {
            const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
            const achieved = target > 0 && actual >= target;
            return (
              <Card key={label} className="rounded-3xl shadow-sm">
                <CC className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl p-2 text-white" style={{ background: color }}><Icon size={18} /></div>
                      <p className="font-bold text-slate-900">{label}</p>
                    </div>
                    {achieved && <span className="rounded-xl bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">✓ Achieved!</span>}
                  </div>
                  <div className="mb-2 flex items-end justify-between">
                    <p className="text-3xl font-black" style={{ color }}>{actual ?? 0}</p>
                    <p className="text-sm text-slate-500">Target: <span className="font-bold text-slate-700">{target ?? "—"}</span></p>
                  </div>
                  {target > 0 && <>
                    <ProgressBar value={actual ?? 0} max={target} color={color} />
                    <p className="mt-1 text-right text-xs text-slate-400">{pct}% of target</p>
                  </>}
                  {!target && <p className="text-xs text-slate-400 mt-1">No target set for this month</p>}
                </CC>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Quote Tracker ─────────────────────────────────────────────────────────────
function QuoteScreen({ data, setData, userId, isOnline }) {
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ clientId: "", client_name: "", quote_number: "", description: "", value: "", sent_date: todayISO(), follow_up_date: "", notes: "" });
  const [shareModal, setShareModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState("All");

  const quotes = data.quotes || [];
  const sel = quotes.find(q => q.id === selected);

  // Auto-flag quotes after 7 working days
  useEffect(() => {
    quotes.filter(q => q.status === "Pending" && !q.flagged && q.sent_date).forEach(async q => {
      if (workingDaysSince(q.sent_date) >= 7) {
        if (isOnline) await supabase.from("quotes").update({ flagged: true }).eq("id", q.id);
        setData(c => ({ ...c, quotes: (c.quotes || []).map(x => x.id === q.id ? { ...x, flagged: true } : x) }));
      }
    });
  }, [quotes]);

  const save = async () => {
    if (!form.description.trim()) { alert("Please enter a description."); return; }
    const client = data.clients.find(c => c.id === form.clientId);
    const payload = { user_id: userId, client_id: form.clientId || null, client_name: (client && client.company) || form.client_name, quote_number: form.quote_number, description: form.description, value: parseFloat(form.value) || 0, status: "Pending", sent_date: form.sent_date, follow_up_date: form.follow_up_date, flagged: false, notes: form.notes };
    if (isOnline) { const { data: r } = await supabase.from("quotes").insert(payload).select().single(); if (r) setData(c => ({ ...c, quotes: [r, ...(c.quotes || [])] })); }
    else { addToQueue({ type: "insert", table: "quotes", data: payload }); setData(c => ({ ...c, quotes: [{ ...payload, id: `offline_${Date.now()}`, created_at: new Date().toISOString() }, ...(c.quotes || [])] })); }
    setForm({ clientId: "", client_name: "", quote_number: "", description: "", value: "", sent_date: todayISO(), follow_up_date: "", notes: "" });
    setView("list");
  };

  const updateStatus = async (id, status) => {
    if (isOnline) await supabase.from("quotes").update({ status, flagged: false }).eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "update", table: "quotes", id, data: { status, flagged: false } });
    setData(c => ({ ...c, quotes: (c.quotes || []).map(q => q.id === id ? { ...q, status, flagged: false } : q) }));
  };

  const del = async (id) => {
    if (!confirm("Delete this quote?")) return;
    if (isOnline) await supabase.from("quotes").delete().eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "delete", table: "quotes", id });
    setData(c => ({ ...c, quotes: (c.quotes || []).filter(q => q.id !== id) }));
    setSelected(null); setView("list");
  };

  const flaggedCount = quotes.filter(q => q.flagged && q.status === "Pending").length;
  const pendingValue = quotes.filter(q => q.status === "Pending").reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const acceptedValue = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);

  const filtered = filterStatus === "All" ? quotes : filterStatus === "Flagged" ? quotes.filter(q => q.flagged && q.status === "Pending") : quotes.filter(q => q.status === filterStatus);

  if (view === "add") return (
    <div className="space-y-5">
      <Btn variant="outline" onClick={() => setView("list")}>← Back</Btn>
      <h1 className="text-2xl font-bold">Add Quote</h1>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4">
            <option value="">Select client</option>
            {data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division ? ` - ${c.division}` : ""}</option>)}
          </select>
          {!form.clientId && <Field label="Client name (if not in list)" value={form.client_name} onChange={v => setForm(f => ({ ...f, client_name: v }))} placeholder="Client name" />}
          <Field label="Quote number" value={form.quote_number} onChange={v => setForm(f => ({ ...f, quote_number: v }))} placeholder="e.g. Q-2026-001" />
          <Field label="Description *" multiline value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="What the quote covers…" />
          <Field label="Value (R)" type="number" value={form.value} onChange={v => setForm(f => ({ ...f, value: v }))} placeholder="0.00" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date sent" type="date" value={form.sent_date} onChange={v => setForm(f => ({ ...f, sent_date: v }))} />
            <Field label="Follow-up date" type="date" value={form.follow_up_date} onChange={v => setForm(f => ({ ...f, follow_up_date: v }))} />
          </div>
          <Field label="Notes" multiline value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          <Btn className="w-full py-6" onClick={save}>Save quote</Btn>
        </CC>
      </Card>
    </div>
  );

  if (sel) return (
    <div className="space-y-5">
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
      <Btn variant="outline" onClick={() => { setSelected(null); setView("list"); }}>← Back</Btn>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{sel.client_name || "Quote"}</h1>
              {sel.quote_number && <p className="text-sm font-semibold" style={{ color: BRAND.primary }}>{sel.quote_number}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${QUOTE_STATUS_COLORS[sel.status]}`}>{sel.status}</span>
              {sel.flagged && sel.status === "Pending" && <span className="rounded-xl bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={10} />7+ working days</span>}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">{sel.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
            <div><p className="text-xs text-slate-500">Value</p><p className="font-bold text-lg" style={{ color: BRAND.primary }}>{formatCurrency(sel.value)}</p></div>
            <div><p className="text-xs text-slate-500">Sent</p><p className="font-semibold">{sel.sent_date}</p></div>
            <div><p className="text-xs text-slate-500">Working days waiting</p><p className="font-bold">{workingDaysSince(sel.sent_date)} days</p></div>
            <div><p className="text-xs text-slate-500">Follow-up</p><p className="font-semibold">{sel.follow_up_date || "—"}</p></div>
          </div>

          {sel.notes && <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500 mb-1">NOTES</p><p className="text-sm text-slate-700">{sel.notes}</p></div>}

          {/* Status update */}
          {sel.status === "Pending" && (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">Update status:</p>
              <div className="grid grid-cols-3 gap-2">
                {["Accepted", "Rejected", "Expired"].map(s => (
                  <button key={s} onClick={() => updateStatus(sel.id, s)}
                    className={`rounded-2xl py-3 text-sm font-bold ${QUOTE_STATUS_COLORS[s]}`}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Btn variant="outline" onClick={() => setShareModal({ title: `Quote ${sel.quote_number || ""} — ${sel.client_name}`, text: `Quote: ${sel.quote_number || "—"}\nClient: ${sel.client_name}\nDescription: ${sel.description}\nValue: ${formatCurrency(sel.value)}\nStatus: ${sel.status}\nSent: ${sel.sent_date}\nWaiting: ${workingDaysSince(sel.sent_date)} working days` })}><Upload size={16} />Share</Btn>
            <Btn variant="danger" onClick={() => del(sel.id)}><Trash2 size={16} />Delete</Btn>
          </div>
        </CC>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Quote Tracker</h1><p className="text-sm text-slate-500">{quotes.length} quotes tracked</p></div>
        <Btn onClick={() => setView("add")}><Plus size={18} />Add</Btn>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-xs text-slate-500">Pending value</p><p className="text-2xl font-black" style={{ color: BRAND.primary }}>{formatCurrency(pendingValue)}</p></CC></Card>
        <Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-xs text-slate-500">Accepted value</p><p className="text-2xl font-black text-green-600">{formatCurrency(acceptedValue)}</p></CC></Card>
      </div>

      {/* Flagged warning */}
      {flaggedCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: "#fff3f3", border: `1px solid ${BRAND.primary}30` }}>
          <AlertTriangle size={18} style={{ color: BRAND.primary }} />
          <div className="flex-1"><p className="text-sm font-bold" style={{ color: BRAND.primary }}>{flaggedCount} quote{flaggedCount !== 1 ? "s" : ""} waiting 7+ working days</p><p className="text-xs text-slate-500">Consider following up</p></div>
          <button onClick={() => setFilterStatus("Flagged")} className="text-xs font-bold underline" style={{ color: BRAND.primary }}>View</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", "Pending", "Flagged", "Accepted", "Rejected", "Expired"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="flex-shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition"
            style={{ background: filterStatus === s ? BRAND.primary : "#f1f5f9", color: filterStatus === s ? "#fff" : "#64748b" }}>
            {s} {s === "Flagged" && flaggedCount > 0 ? `(${flaggedCount})` : ""}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <Empty title="No quotes" text={filterStatus === "All" ? "Tap Add to log your first quote." : `No ${filterStatus.toLowerCase()} quotes.`} />}

      <div className="space-y-3">
        {filtered.map(q => (
          <button key={q.id} onClick={() => { setSelected(q.id); setView("detail"); }} className="w-full text-left">
            <Card className="rounded-3xl shadow-sm">
              <CC className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{q.client_name || "Unknown client"}</p>
                      {q.flagged && q.status === "Pending" && <AlertTriangle size={14} style={{ color: BRAND.primary }} />}
                    </div>
                    {q.quote_number && <p className="text-xs font-semibold" style={{ color: BRAND.primary }}>{q.quote_number}</p>}
                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">{q.description}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <p className="text-sm font-bold" style={{ color: BRAND.primary }}>{formatCurrency(q.value)}</p>
                      <p className="text-xs text-slate-400">{workingDaysSince(q.sent_date)} working days</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${QUOTE_STATUS_COLORS[q.status]}`}>{q.status}</span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                </div>
              </CC>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}


// ─── Global Search ────────────────────────────────────────────────────────────
function GlobalSearchScreen({ data, go, setScreen }) {
  const [query, setQuery] = useState("");
  const inputRef = React.useRef(null);

  useEffect(() => { setTimeout(() => (inputRef.current && inputRef.current.focus)(), 100); }, []);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || q.length < 2) return { clients: [], quotes: [], equipment: [], serviceReports: [], notes: [] };
    return {
      clients: data.clients.filter(c => `${c.company} ${c.division} ${c.contact} ${c.phone} ${c.email} ${c.location}`.toLowerCase().includes(q)).slice(0, 5),
      quotes: (data.quotes || []).filter(q2 => `${q2.client_name} ${q2.quote_number} ${q2.description}`.toLowerCase().includes(q)).slice(0, 5),
      equipment: (data.equipment || []).filter(e => `${e.name} ${e.model} ${e.serial_number}`.toLowerCase().includes(q)).slice(0, 5),
      serviceReports: (data.serviceReports || []).filter(r => `${r.client_name} ${r.machine} ${r.fault} ${r.technician}`.toLowerCase().includes(q)).slice(0, 5),
      notes: (data.notes || []).filter(n => `${n.title} ${n.body}`.toLowerCase().includes(q)).slice(0, 5),
    };
  }, [query, data]);

  const total = Object.values(results).reduce((s, arr) => s + arr.length, 0);

  const Section = ({ title, icon, items, renderItem }) => {
    if (!items.length) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 px-1">{icon} {title}</p>
        {items.map(renderItem)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-3xl bg-white px-4 py-3 shadow-sm">
          <Search size={20} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search everything…"
            className="flex-1 bg-transparent text-base outline-none"
          />
          {query && <button onClick={() => setQuery("")} className="text-slate-400"><X size={18} /></button>}
        </div>
        <Btn variant="outline" onClick={() => setScreen("Home")}>Cancel</Btn>
      </div>

      {query.length < 2 && (
        <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="text-2xl mb-2">🔍</p>
          <p className="font-bold text-slate-900">Search everything</p>
          <p className="text-sm text-slate-500 mt-1">Clients, quotes, equipment, service reports and notes</p>
        </div>
      )}

      {query.length >= 2 && total === 0 && (
        <Empty title="No results found" text={`Nothing matched "${query}"`} />
      )}

      {total > 0 && (
        <div className="space-y-5">
          <Section title="Clients" icon="👥" items={results.clients} renderItem={c => (
            <button key={c.id} onClick={() => { setScreen("Clients"); }} className="w-full text-left">
              <Card className="rounded-2xl shadow-sm"><CC className="p-3">
                <p className="font-bold text-slate-900">{c.company}</p>
                <p className="text-xs text-slate-500">{c.division || ""} {c.contact ? `· ${c.contact}` : ""}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-xl ${STAGE_COLORS[c.pipeline_status || "New Lead"]}`}>{c.pipeline_status || "New Lead"}</span>
              </CC></Card>
            </button>
          )} />

          <Section title="Quotes" icon="📄" items={results.quotes} renderItem={q => (
            <button key={q.id} onClick={() => setScreen("Quotes")} className="w-full text-left">
              <Card className="rounded-2xl shadow-sm"><CC className="p-3">
                <p className="font-bold text-slate-900">{q.client_name}</p>
                <p className="text-xs text-slate-500">{q.quote_number} · {(q.description && q.description.slice)(0, 60)}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-xl ${QUOTE_STATUS_COLORS[q.status]}`}>{q.status}</span>
              </CC></Card>
            </button>
          )} />

          <Section title="Equipment" icon="⚙️" items={results.equipment} renderItem={e => (
            <button key={e.id} onClick={() => setScreen("Equipment")} className="w-full text-left">
              <Card className="rounded-2xl shadow-sm"><CC className="p-3">
                <p className="font-bold text-slate-900">{e.name}</p>
                <p className="text-xs text-slate-500">{e.model ? `Model: ${e.model}` : ""} {e.serial_number ? `· S/N: ${e.serial_number}` : ""}</p>
                {e.next_service_date && <p className="text-xs font-semibold mt-1" style={{ color: BRAND.primary }}>Next service: {smartDate(e.next_service_date)}</p>}
              </CC></Card>
            </button>
          )} />

          <Section title="Service Reports" icon="🔧" items={results.serviceReports} renderItem={r => (
            <button key={r.id} onClick={() => setScreen("Service")} className="w-full text-left">
              <Card className="rounded-2xl shadow-sm"><CC className="p-3">
                <p className="font-bold text-slate-900">{r.client_name || "No client"}</p>
                <p className="text-xs text-slate-500">{r.machine} · {(r.fault && r.fault.slice)(0, 60)}</p>
                <p className="text-xs text-slate-400">{smartDate(r.created_at && r.created_at.slice(0, 10))}</p>
              </CC></Card>
            </button>
          )} />

          <Section title="Notes" icon="📝" items={results.notes} renderItem={n => (
            <button key={n.id} onClick={() => setScreen("Notes")} className="w-full text-left">
              <Card className="rounded-2xl shadow-sm"><CC className="p-3">
                <p className="font-bold text-slate-900">{n.title}</p>
                {n.body && <p className="text-xs text-slate-500">{n.body.slice(0, 80)}</p>}
                {n.reminder_date && <p className="text-xs font-semibold mt-1" style={{ color: BRAND.primary }}>Reminder: {smartDate(n.reminder_date)}</p>}
              </CC></Card>
            </button>
          )} />
        </div>
      )}
    </div>
  );
}

// ─── Pipeline ──────────────────────────────────────────────────────────────────
function PipelineScreen({ data, setData, userId, isOnline }) {
  const [shareModal, setShareModal] = useState(null);
  const [dragging, setDragging] = useState(null);
  const grouped = useMemo(() => { const g = {}; PIPELINE_STAGES.forEach(s => g[s] = []); data.clients.forEach(c => { const s = c.pipeline_status || "New Lead"; (g[s] || g["New Lead"]).push(c); }); return g; }, [data.clients]);
  const move = async (clientId, stage) => { if (isOnline) await supabase.from("clients").update({ pipeline_status: stage }).eq("id", clientId).eq("user_id", userId); else addToQueue({ type: "update", table: "clients", id: clientId, data: { pipeline_status: stage } }); setData(c => ({ ...c, clients: c.clients.map(cl => cl.id === clientId ? { ...cl, pipeline_status: stage } : cl) })); };
  return (
    <div className="space-y-5">
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
      <div><h1 className="text-2xl font-bold">Sales Pipeline</h1><p className="text-sm text-slate-500">Drag clients between stages.</p></div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map(stage => (
          <div key={stage} className="min-w-[190px] rounded-3xl bg-slate-100 p-3 flex-shrink-0" onDrop={e => { e.preventDefault(); if (dragging) { move(dragging.id, stage); setDragging(null); } }} onDragOver={e => e.preventDefault()}>
            <div className="mb-3 flex items-center justify-between"><span className={`rounded-xl px-3 py-1 text-xs font-bold ${STAGE_COLORS[stage]}`}>{stage}</span><span className="rounded-xl bg-white px-2 py-1 text-xs font-bold text-slate-500">{grouped[stage]?.length || 0}</span></div>
            <div className="space-y-2">
              {(grouped[stage] || []).map(client => (
                <div key={client.id} draggable onDragStart={e => { setDragging(client); e.dataTransfer.effectAllowed = "move"; }} className="rounded-2xl bg-white p-3 shadow-sm cursor-grab">
                  <p className="font-bold text-sm">{client.company}</p>
                  {client.division && <p className="text-xs text-slate-500">{client.division}</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PIPELINE_STAGES.filter(s => s !== stage).map(s => (<button key={s} onClick={() => move(client.id, s)} className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${STAGE_COLORS[s]}`}>→ {s}</button>))}
                  </div>
                </div>
              ))}
              {!grouped[stage]?.length && <p className="text-xs text-slate-400 text-center py-3">Drop here</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardScreen({ data, userId }) {
  const [stats, setStats] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); return { label: d.toLocaleDateString("en-GB", { month: "short" }), from: `${y}-${m}-01`, to: `${y}-${m}-31` }; });
    const ms = await Promise.all(months.map(async m => { const [co,fu,sv,cl] = await Promise.all([supabase.from("conversations").select("id",{count:"exact",head:true}).eq("user_id",userId).gte("created_at",m.from).lte("created_at",m.to+"T23:59:59"),supabase.from("follow_ups").select("id",{count:"exact",head:true}).eq("user_id",userId).gte("due_date",m.from).lte("due_date",m.to),supabase.from("service_reports").select("id",{count:"exact",head:true}).eq("user_id",userId).gte("created_at",m.from).lte("created_at",m.to+"T23:59:59"),supabase.from("clients").select("id",{count:"exact",head:true}).eq("user_id",userId).gte("created_at",m.from).lte("created_at",m.to+"T23:59:59")]); return { label: m.label, visits: co.count||0, followUps: fu.count||0, serviceReports: sv.count||0, newClients: cl.count||0 }; }));
    const pipeline = {}; PIPELINE_STAGES.forEach(s => pipeline[s] = data.clients.filter(c => (c.pipeline_status||"New Lead") === s).length);
    setStats({ months: ms, pipeline }); setLoading(false);
  };
  const Bar = ({ data: d, key2, color, label }) => { const max = Math.max(...d.map(x => x[key2]), 1); return (<Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="mb-3 text-sm font-bold text-slate-700">{label}</p><div className="flex items-end gap-2 h-28">{d.map((x,i) => (<div key={i} className="flex-1 flex flex-col items-center gap-1"><p className="text-xs font-bold text-slate-700">{x[key2]||""}</p><div className="w-full rounded-t-xl transition-all" style={{ height: `${(x[key2]/max)*100}%`, minHeight: x[key2]>0?"8px":"2px", background: color }} /><p className="text-xs text-slate-400">{x.label}</p></div>))}</div></CC></Card>); };
  if (loading) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const totals = stats.months.reduce((a,m) => ({ visits: a.visits+m.visits, followUps: a.followUps+m.followUps, serviceReports: a.serviceReports+m.serviceReports, newClients: a.newClients+m.newClients }), { visits:0, followUps:0, serviceReports:0, newClients:0 });
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">My Dashboard</h1><p className="text-sm text-slate-500">Last 6 months performance.</p></div>
      <div className="grid grid-cols-2 gap-3">
        {[["Visits", totals.visits, "#3b82f6"], ["New Clients", totals.newClients, "#10b981"], ["Follow-ups", totals.followUps, "#f59e0b"], ["Service Reports", totals.serviceReports, BRAND.primary]].map(([l,v,c]) => (<Card key={l} className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-sm text-slate-500">{l}</p><p className="text-3xl font-black" style={{ color: c }}>{v}</p></CC></Card>))}
      </div>
      <Bar data={stats.months} key2="visits" color="#3b82f6" label="Monthly Visits" />
      <Bar data={stats.months} key2="newClients" color="#10b981" label="New Clients per Month" />
      <Bar data={stats.months} key2="serviceReports" color={BRAND.primary} label="Service Reports per Month" />
      <Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="mb-3 text-sm font-bold text-slate-700">Pipeline Summary</p><div className="space-y-2">{PIPELINE_STAGES.map(s => (<div key={s} className="flex items-center gap-3"><span className={`w-24 rounded-xl px-2 py-1 text-xs font-bold text-center ${STAGE_COLORS[s]}`}>{s}</span><div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${((stats.pipeline[s]||0)/Math.max(data.clients.length,1))*100}%`, background: BRAND.primary }} /></div><span className="text-sm font-bold">{stats.pipeline[s]||0}</span></div>))}</div></CC></Card>
    </div>
  );
}

// ─── Home ──────────────────────────────────────────────────────────────────────
function HomeScreen({ go, clients, planList, followUps, quotes, setData, userId, isOnline }) {
  const [view, setView] = useState("main");
  const due = followUps.filter(f => !f.completed && f.due_date && f.due_date <= todayISO());
  const flagged = (quotes || []).filter(q => q.flagged && q.status === "Pending");

  const delPlan = async id => { if (isOnline) await supabase.from("plan_items").delete().eq("id", id).eq("user_id", userId); else addToQueue({ type: "delete", table: "plan_items", id }); setData(c => ({ ...c, planList: c.planList.filter(i => i.id !== id) })); };
  const updFU = async (id, field, val) => { if (isOnline) await supabase.from("follow_ups").update({ [field]: val }).eq("id", id).eq("user_id", userId); else addToQueue({ type: "update", table: "follow_ups", id, data: { [field]: val } }); setData(c => ({ ...c, followUps: c.followUps.map(f => f.id === id ? { ...f, [field]: val } : f) })); };

  if (view === "followups") return (
    <div className="space-y-5">
      <Btn variant="outline" onClick={() => setView("main")}>← Back</Btn>
      <h1 className="text-2xl font-bold">My Follow-ups</h1>
      {followUps.length === 0 && <Empty title="No follow-ups yet" text="Create one from a client profile." />}
      {followUps.map(f => (<Card key={f.id} className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4"><h2 className="text-lg font-bold">{f.client_name||"Follow-up"}</h2><Field label="Due date" type="date" value={f.due_date} onChange={v => updFU(f.id, "due_date", v)} /><Field label="Status" value={f.status} onChange={v => updFU(f.id, "status", v)} /><Field label="Outcome" multiline value={f.outcome} onChange={v => updFU(f.id, "outcome", v)} />{f.recurring&&<div className="rounded-2xl p-3 text-xs font-semibold text-white" style={{background:BRAND.primary}}>🔄 Recurring every {f.recurring_days} days</div>}<label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-semibold">Completed<input type="checkbox" checked={!!f.completed} onChange={e => updFU(f.id, "completed", e.target.checked)} className="h-5 w-5" /></label></CC></Card>))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-3xl p-5 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryDark})` }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={BRAND.logo} alt="Power Works" className="h-8 object-contain" onError={e => { e.target.style.display = "none"; }} />
        </div>
        <p className="text-sm opacity-80">Today, {niceDate()}</p>
        <h1 className="mt-1 text-3xl font-bold">Your day is ready</h1>
        <p className="mt-2 opacity-80">{planList.length} planned · {due.length} follow-ups due{flagged.length > 0 ? ` · ${flagged.length} quote${flagged.length !== 1 ? "s" : ""} need follow-up` : ""}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setView("followups")} className="text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-xs text-slate-500">Follow-ups</p><p className="text-3xl font-bold" style={{ color: BRAND.primary }}>{due.length}</p><p className="text-xs text-slate-500">due now</p></CC></Card></button>
        <button onClick={() => go("Quotes")} className="text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-xs text-slate-500">Quotes</p><p className="text-3xl font-bold" style={{ color: flagged.length > 0 ? "#dc2626" : BRAND.primary }}>{flagged.length}</p><p className="text-xs text-slate-500">need follow-up</p></CC></Card></button>
        <button onClick={() => go("Calendar")} className="text-left"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="text-xs text-slate-500">Today</p><p className="text-3xl font-bold" style={{ color: BRAND.primary }}>{planList.length}</p><p className="text-xs text-slate-500">calendar items</p></CC></Card></button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold">Quick actions</h2>
        <BigAction icon={Calendar} title="Calendar" subtitle="Manage your schedule" onClick={() => go("Calendar")} />
        <BigAction icon={Plus} title="Add conversation" subtitle="Log a visit, call or WhatsApp" onClick={() => go("QuickAdd")} />
        <BigAction icon={Wrench} title="Service report" subtitle="Fault, work done, parts and PDF" onClick={() => go("Service")} />
        <BigAction icon={FileIcon} title="Quote tracker" subtitle="Log and track sent quotes" onClick={() => go("Quotes")} badge={flagged.length > 0 ? `${flagged.length} flagged` : null} />
        <BigAction icon={Settings} title="Equipment register" subtitle="Track machinery and service dates" onClick={() => go("Equipment")} />
      </div>
    </div>
  );
}

// ─── Calendar ──────────────────────────────────────────────────────────────────
function CalendarScreen({ data, setData, userId, isOnline }) {
  const [ni, setNi] = useState({ date: todayISO(), time: "", title: "", client: "", location: "", type: "Follow-up", reminder: "30" });
  const [notifGranted, setNotifGranted] = useState(Notification && Notification.permission === "granted");
  const timers = useRef([]);
  const enableNotifs = async () => { const g = await requestNotifPermission(); setNotifGranted(g); };
  const add = async () => { if (!ni.date||!ni.time||!ni.title) { alert("Please add a date, time and title."); return; } const payload = { user_id: userId, ...ni }; let item; if (isOnline) { const { data: r } = await supabase.from("plan_items").insert(payload).select().single(); item = r; } else { item = { ...payload, id: `offline_${Date.now()}` }; addToQueue({ type: "insert", table: "plan_items", data: payload }); } if (item) { setData(c => ({ ...c, planList: [...c.planList, item] })); if (notifGranted) { const t = scheduleItemNotifs(item, [parseInt(ni.reminder)]); timers.current.push(...t); } } setNi({ date: todayISO(), time: "", title: "", client: "", location: "", type: "Follow-up", reminder: "30" }); };
  const upd = async (id, field, val) => {
    // If time or date is changed, reset reminder_sent so notification fires again
    const extra = (field === "time" || field === "date") ? { reminder_sent: false } : {};
    if (isOnline) await supabase.from("plan_items").update({ [field]: val, ...extra }).eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "update", table: "plan_items", id, data: { [field]: val, ...extra } });
    setData(c => ({ ...c, planList: c.planList.map(i => i.id === id ? { ...i, [field]: val, ...extra } : i) }));
  };
  const del = async id => { if (isOnline) await supabase.from("plan_items").delete().eq("id", id).eq("user_id", userId); else addToQueue({ type: "delete", table: "plan_items", id }); setData(c => ({ ...c, planList: c.planList.filter(i => i.id !== id) })); };
  const grouped = useMemo(() => { const g = {}; [...data.planList].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).forEach(item => { const d = item.date||"No date"; if (!g[d]) g[d]=[]; g[d].push(item); }); return g; }, [data.planList]);
  const gcal = item => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title||"")}&location=${encodeURIComponent(item.location||"")}&details=${encodeURIComponent(item.client||"")}`;

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Calendar</h1><p className="text-sm text-slate-500">Your schedule with reminders.</p></div>
      {!notifGranted && (<div className="flex items-center justify-between rounded-2xl p-4" style={{ background: "#fffbeb", border: `1px solid #fcd34d` }}><div className="flex items-center gap-2"><Bell size={18} className="text-amber-600" /><p className="text-sm font-semibold text-amber-800">Enable notifications for meeting reminders</p></div><Btn className="text-sm py-2 px-3" onClick={enableNotifs}>Enable</Btn></div>)}
      <Card className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4">
        <h2 className="font-bold">Add new item</h2>
        <div className="grid grid-cols-2 gap-3"><Field label="Date" type="date" value={ni.date} onChange={v => setNi(i => ({ ...i, date: v }))} /><Field label="Time" type="time" value={ni.time} onChange={v => setNi(i => ({ ...i, time: v }))} /></div>
        <Field label="Title" value={ni.title} onChange={v => setNi(i => ({ ...i, title: v }))} placeholder="Meeting title" />
        <select value={ni.client} onChange={e => setNi(i => ({ ...i, client: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Select client (optional)</option>{data.clients.map(c => <option key={c.id} value={`${c.company}${c.division?` - ${c.division}`:""}`}>{c.company}{c.division?` - ${c.division}`:""}</option>)}</select>
        <Field label="Location" value={ni.location} onChange={v => setNi(i => ({ ...i, location: v }))} placeholder="Location (optional)" />
        <select value={ni.type} onChange={e => setNi(i => ({ ...i, type: e.target.value }))} className="w-full rounded-2xl border border-slate-200 p-4"><option>Follow-up</option><option>Service</option><option>Sales</option><option>Meeting</option><option>Site visit</option></select>
        <div><label className="mb-1 block text-sm font-semibold text-slate-800">Remind me before</label><div className="grid grid-cols-3 gap-2">{[["15","15 min"],["30","30 min"],["60","1 hour"]].map(([val, label]) => (<button key={val} onClick={() => setNi(i => ({ ...i, reminder: val }))} className="rounded-2xl border py-3 text-sm font-semibold transition" style={{ background: ni.reminder === val ? BRAND.primary : "#fff", color: ni.reminder === val ? "#fff" : "#374151", border: ni.reminder === val ? "none" : "1px solid #e2e8f0" }}>{label}</button>))}</div></div>
        <Btn className="w-full py-6" onClick={add}>Add calendar item</Btn>
      </CC></Card>
      {Object.keys(grouped).length === 0 && <Empty title="No calendar items" text="Add your first item above." />}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs font-bold text-slate-500 uppercase">{date === todayISO() ? "Today" : new Date(date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short"})}</span><div className="h-px flex-1 bg-slate-200" /></div>
          {items.map(item => (<Card key={item.id} className="rounded-3xl shadow-sm"><CC className="p-4">
            <div className="mb-3 flex items-center gap-3"><div className="rounded-2xl p-3 text-center min-w-[60px]" style={{ background: BRAND.light }}><p className="text-sm font-black" style={{ color: BRAND.primary }}>{item.time||"--:--"}</p><p className="text-xs text-slate-500">{item.type}</p></div><div className="flex-1"><p className="font-bold">{item.title}</p>{item.client&&<p className="text-sm text-slate-500">{item.client}</p>}{item.reminder&&<p className="mt-1 text-xs font-semibold" style={{ color: BRAND.accent }}>⏰ {item.reminder==="60"?"1 hour":`${item.reminder} min`} reminder</p>}</div></div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2"><Field label="Date" type="date" value={item.date} onChange={v => upd(item.id, "date", v)} /><Field label="Time" type="time" value={item.time} onChange={v => upd(item.id, "time", v)} /></div>
              <a href={gcal(item)} target="_blank" rel="noreferrer"><Btn className="w-full"><Calendar size={18} />Google Calendar</Btn></a>
              <Btn variant="danger" className="w-full" onClick={() => del(item.id)}>Delete</Btn>
            </div>
          </CC></Card>))}
        </div>
      ))}
    </div>
  );
}

// ─── QuickAdd ──────────────────────────────────────────────────────────────────
function QuickAddScreen({ data, setData, go, userId, userName, isOnline }) {
  const [selId, setSelId] = useState(""); const [nc, setNc] = useState({ company:"",division:"",contact:"",phone:"",email:"",location:"" });
  const [note, setNote] = useState(""); const [nextFU, setNextFU] = useState(""); const [recurring, setRecurring] = useState(false); const [recurringDays, setRecurringDays] = useState("7");
  const [rec, setRec] = useState(false); const [mr, setMr] = useState(null); const [audio, setAudio] = useState(""); const [audioErr, setAudioErr] = useState("");
  const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(false); const [annotating, setAnnotating] = useState(null);
  const sel = data.clients.find(c => c.id === selId);
  const startRec = async () => { try { setAudioErr(""); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); const chunks = []; recorder.ondataavailable = e => e.data && e.data.size>0&&chunks.push(e.data); recorder.onstop = () => { const blob = new Blob(chunks,{type:recorder.mimeType||"audio/webm"}); const r = new FileReader(); r.onload = () => setAudio(r.result); r.readAsDataURL(blob); stream.getTracks().forEach(t=>t.stop()); }; recorder.start(); setMr(recorder); setRec(true); } catch { setAudioErr("Microphone permission blocked."); } };
  const stopRec = () => { if (!mr||!rec) return; mr.stop(); setRec(false); setMr(null); };
  const handleFiles = async e => { setUploading(true); const s = await filesToStored(e.target.files); setFiles(c => [...c,...s]); e.target.value=""; setUploading(false); };
  const save = async () => {
    if (!selId&&!nc.company.trim()) { alert("Please select or add a client."); return; }
    let cid = selId;
    if (!cid) { const payload = { user_id:userId, company:nc.company.trim(), division:nc.division.trim(), contact:nc.contact.trim(), phone:nc.phone.trim(), email:nc.email.trim(), location:nc.location.trim(), notes:"", pipeline_status:"New Lead" }; if (isOnline) { const { data:r } = await supabase.from("clients").insert(payload).select().single(); if (r) { cid=r.id; setData(c=>({...c,clients:[...c.clients,r]})); } } else { cid=`offline_${Date.now()}`; addToQueue({type:"insert",table:"clients",data:{...payload,id:cid}}); setData(c=>({...c,clients:[...c.clients,{...payload,id:cid}]})); } }
    if (!cid) return;
    const convPayload = { user_id:userId, client_id:cid, note, audio_data_url:audio, created_by_name:userName };
    if (isOnline) { const {data:conv} = await supabase.from("conversations").insert(convPayload).select().single(); if (conv) setData(c=>({...c,conversations:[conv,...c.conversations]})); } else { addToQueue({type:"insert",table:"conversations",data:convPayload}); setData(c=>({...c,conversations:[{...convPayload,id:`offline_${Date.now()}`,created_at:new Date().toISOString()},...c.conversations]})); }
    for (const f of files) { if (isOnline) { const {data:doc} = await supabase.from("documents").insert({user_id:userId,client_id:cid,file_url:f.url,name:f.name}).select().single(); if (doc) setData(c=>({...c,documents:[...c.documents,doc]})); } }
    if (nextFU) { const client = data.clients.find(c=>c.id===cid); const fuPayload = { user_id:userId, client_id:cid, client_name:(client && client.company)||nc.company, due_date:nextFU, status:"Open", outcome:note, completed:false, recurring, recurring_days:parseInt(recurringDays) }; if (isOnline) { const {data:fu} = await supabase.from("follow_ups").insert(fuPayload).select().single(); if (fu) setData(c=>({...c,followUps:[...c.followUps,fu]})); } else { addToQueue({type:"insert",table:"follow_ups",data:fuPayload}); setData(c=>({...c,followUps:[...c.followUps,{...fuPayload,id:`offline_${Date.now()}`}]})); } }
    setSelId(""); setNc({company:"",division:"",contact:"",phone:"",email:"",location:""}); setNote(""); setNextFU(""); setAudio(""); setFiles([]); setRecurring(false);
    alert("Conversation saved!"); go("Clients");
  };

  return (
    <div className="space-y-5">
      {annotating && <PhotoAnnotator src={annotating.url} onSave={annotated => { setFiles(f => f.map((x,i) => i===annotating.idx?{...x,url:annotated}:x)); setAnnotating(null); }} onCancel={() => setAnnotating(null)} />}
      <div><h1 className="text-2xl font-bold">Add conversation</h1><p className="text-sm text-slate-500">Log a visit, call, or WhatsApp.</p></div>
      <Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4">
        <select value={selId} onChange={e => setSelId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">+ New client or select existing</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.division?` - ${c.division}`:""}</option>)}</select>
        {!selId&&(<div className="space-y-3 rounded-2xl bg-slate-50 p-3"><Field label="Company" value={nc.company} onChange={v=>setNc(c=>({...c,company:v}))} placeholder="Company name" /><Field label="Division / Site" value={nc.division} onChange={v=>setNc(c=>({...c,division:v}))} /><Field label="Contact" value={nc.contact} onChange={v=>setNc(c=>({...c,contact:v}))} /><Field label="Phone" value={nc.phone} onChange={v=>setNc(c=>({...c,phone:v}))} /><Field label="Email" value={nc.email} onChange={v=>setNc(c=>({...c,email:v}))} /><Field label="Location" value={nc.location} onChange={v=>setNc(c=>({...c,location:v}))} /></div>)}
        <Field label="What was discussed?" multiline value={note} onChange={setNote} placeholder="Notes…" />
        <Field label="Next follow-up date" type="date" value={nextFU} onChange={setNextFU} />
        {nextFU&&(<div className="rounded-2xl bg-slate-50 p-3 space-y-3"><label className="flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><RefreshCw size={15} />Recurring follow-up</span><input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} className="h-5 w-5" /></label>{recurring&&(<div><label className="mb-1 block text-sm font-semibold">Repeat every</label><div className="grid grid-cols-3 gap-2">{[["7","7 days"],["14","14 days"],["30","30 days"]].map(([val,label])=>(<button key={val} onClick={()=>setRecurringDays(val)} className="rounded-2xl border py-2 text-sm font-semibold" style={{background:recurringDays===val?BRAND.primary:"#fff",color:recurringDays===val?"#fff":"#374151"}}>{label}</button>))}</div></div>)}</div>)}
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="outline" className={rec?"border-red-300 bg-red-100 text-red-700":""} onClick={rec?stopRec:startRec}><Mic size={18} />{rec?"Stop":"Voice note"}</Btn>
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 font-semibold ${uploading?"opacity-60 pointer-events-none":""}`}><Camera size={18} />{uploading?"Uploading…":"Add photo/video"}<input type="file" accept="image/*,video/*" multiple capture="environment" className="hidden" onChange={handleFiles} disabled={uploading} /></label>
        </div>
        {audioErr&&<div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{audioErr}</div>}
        {audio&&<div className="rounded-2xl bg-slate-50 p-3"><div className="mb-2 flex justify-between"><p className="text-sm font-semibold">Voice note</p><button onClick={()=>setAudio("")} className="rounded-xl bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Delete</button></div><audio controls src={audio} className="w-full" /></div>}
        {files.length>0&&(<div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">{files.map((f,i)=>(<div key={i} className="rounded-2xl bg-white p-2">{f.type.startsWith("video/")?<video controls src={f.url} className="h-32 w-full rounded-xl object-cover" />:<img src={f.url} alt={f.name} className="h-32 w-full rounded-xl object-cover" />}<p className="mt-1 truncate text-xs text-slate-600">{f.name}</p><div className="mt-2 flex gap-1">{f.type.startsWith("image/")&&<button onClick={()=>setAnnotating({url:f.url,idx:i})} className="flex-1 rounded-xl py-1 text-xs font-semibold" style={{background:"#fffbeb",color:"#92400e"}}><FileIcon size={12} className="inline mr-1" />Annotate</button>}<button onClick={()=>setFiles(c=>c.filter((_,j)=>j!==i))} className="flex-1 rounded-xl bg-red-50 py-1 text-xs font-semibold text-red-700">Delete</button></div></div>))}</div>)}
        <Btn className="w-full py-6 text-base" onClick={save}>Save conversation</Btn>
      </CC></Card>
    </div>
  );
}

// ─── Clients ───────────────────────────────────────────────────────────────────
function ClientsScreen({ data, setData, go, userId, isOnline }) {
  const [search, setSearch] = useState("");
  const [selId, setSelId] = useState(null);
  const [edit, setEdit] = useState(false);
  const [shareModal, setShareModal] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newClient, setNewClient] = useState({ company: "", division: "", contact: "", phone: "", email: "", location: "", notes: "" });

  const sel = data.clients.find(c => c.id === selId);
  const docs = data.documents.filter(d => d.client_id === selId);
  const convs = data.conversations.filter(c => c.client_id === selId);
  const clientEquipment = (data.equipment || []).filter(e => e.client_id === selId);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.clients.filter(c => `${c.company} ${c.division} ${c.contact} ${c.location}`.toLowerCase().includes(q));
  }, [search, data.clients]);

  const saveNewClient = async () => {
    if (!newClient.company.trim()) { alert("Please enter a company name."); return; }
    setSaving(true);
    const payload = {
      user_id: userId,
      company: newClient.company.trim(),
      division: newClient.division.trim(),
      contact: newClient.contact.trim(),
      phone: newClient.phone.trim(),
      email: newClient.email.trim(),
      location: newClient.location.trim(),
      notes: newClient.notes.trim(),
      pipeline_status: "New Lead"
    };
    try {
      if (isOnline) {
        const { data: r, error } = await supabase.from("clients").insert(payload).select().single();
        if (error) { alert("Error saving client: " + error.message); setSaving(false); return; }
        if (r) { setData(c => ({ ...c, clients: [...c.clients, r] })); setSelId(r.id); }
      } else {
        const id = `offline_${Date.now()}`;
        addToQueue({ type: "insert", table: "clients", data: { ...payload, id } });
        setData(c => ({ ...c, clients: [...c.clients, { ...payload, id }] }));
        setSelId(`offline_${Date.now() - 1}`);
      }
      setShowAddForm(false);
      setNewClient({ company: "", division: "", contact: "", phone: "", email: "", location: "", notes: "" });
    } catch (e) {
      alert("Failed to save: " + e.message);
    }
    setSaving(false);
  };

  const upd = async (field, val) => {
    if (isOnline) await supabase.from("clients").update({ [field]: val }).eq("id", selId).eq("user_id", userId);
    else addToQueue({ type: "update", table: "clients", id: selId, data: { [field]: val } });
    setData(c => ({ ...c, clients: c.clients.map(cl => cl.id === selId ? { ...cl, [field]: val } : cl) }));
  };
  const del = async () => {
    if (!sel || !confirm(`Delete ${sel.company}?`)) return;
    if (isOnline) await supabase.from("clients").delete().eq("id", sel.id).eq("user_id", userId);
    else addToQueue({ type: "delete", table: "clients", id: sel.id });
    setData(c => ({ ...c, clients: c.clients.filter(cl => cl.id !== sel.id), followUps: c.followUps.filter(f => f.client_id !== sel.id) }));
    setSelId(null); setEdit(false);
  };
  const addFU = async () => {
    if (!sel) return;
    const payload = { user_id: userId, client_id: sel.id, client_name: sel.company, due_date: todayISO(), status: "Open", outcome: "", completed: false, recurring: false, recurring_days: 7 };
    if (isOnline) { const { data: fu } = await supabase.from("follow_ups").insert(payload).select().single(); if (fu) setData(c => ({ ...c, followUps: [...c.followUps, fu] })); }
    else { addToQueue({ type: "insert", table: "follow_ups", data: payload }); setData(c => ({ ...c, followUps: [...c.followUps, { ...payload, id: `offline_${Date.now()}` }] })); }
    alert("Follow-up created.");
  };

  // Add client form
  if (showAddForm) return (
    <div className="space-y-5">
      <Btn variant="outline" onClick={() => setShowAddForm(false)}>← Back to clients</Btn>
      <h1 className="text-2xl font-bold">Add new client</h1>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <Field label="Company name *" value={newClient.company} onChange={v => setNewClient(c => ({ ...c, company: v }))} placeholder="e.g. Harmony Gold Mine" />
          <Field label="Division / Site" value={newClient.division} onChange={v => setNewClient(c => ({ ...c, division: v }))} placeholder="e.g. Shaft 3 Workshop" />
          <Field label="Contact person" value={newClient.contact} onChange={v => setNewClient(c => ({ ...c, contact: v }))} placeholder="Full name" />
          <Field label="Phone number" value={newClient.phone} onChange={v => setNewClient(c => ({ ...c, phone: v }))} placeholder="+27 11 000 0000" type="tel" />
          <Field label="Email address" value={newClient.email} onChange={v => setNewClient(c => ({ ...c, email: v }))} placeholder="contact@company.co.za" type="email" />
          <Field label="Location / Address" value={newClient.location} onChange={v => setNewClient(c => ({ ...c, location: v }))} placeholder="City or address" />
          <Field label="Notes" multiline value={newClient.notes} onChange={v => setNewClient(c => ({ ...c, notes: v }))} placeholder="Any additional notes…" />
          <Btn className="w-full py-5 text-base" onClick={saveNewClient} disabled={saving}>
            {saving ? "Saving…" : "Save client"}
          </Btn>
        </CC>
      </Card>
    </div>
  );

  if (sel) return (
    <div className="space-y-5">
      {shareModal && <ShareModal {...shareModal} onClose={() => setShareModal(null)} />}
      <Btn variant="outline" onClick={() => { setSelId(null); setEdit(false); }}>← Back to clients</Btn>
      <Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">{edit ? <Field label="Company" value={sel.company} onChange={v => upd("company", v)} /> : <h1 className="text-2xl font-bold">{sel.company}</h1>}
          {!edit && sel.division && <p className="text-sm text-slate-500">{sel.division}</p>}</div>
          <Btn variant="outline" onClick={() => setEdit(!edit)}>{edit ? "Done" : "Edit"}</Btn>
        </div>
        {edit && <Field label="Division / Site" value={sel.division} onChange={v => upd("division", v)} />}
        <div><label className="mb-2 block text-sm font-semibold">Pipeline stage</label>
          <div className="flex flex-wrap gap-2">{PIPELINE_STAGES.map(s => (<button key={s} onClick={() => upd("pipeline_status", s)} className={`rounded-2xl px-3 py-1.5 text-xs font-bold transition ${(sel.pipeline_status || "New Lead") === s ? "ring-2 " : ""} ${STAGE_COLORS[s]}`}>{s}</button>))}</div>
        </div>
        <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
          {[["contact","Contact"],["phone","Phone"],["email","Email"],["location","Location"]].map(([f,l]) => (
            <div key={f}><label className="mb-1 block text-xs font-bold text-slate-500">{l}</label>
              {edit ? <input value={sel[f] || ""} onChange={e => upd(f, e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" />
              : <p className="text-sm text-slate-700">{sel[f] || "-"}</p>}
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-semibold">Notes</p>
          {edit ? <textarea rows={3} value={sel.notes || ""} onChange={e => upd("notes", e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" />
          : <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{sel.notes || "No notes yet."}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a href={`tel:${sel.phone || ""}`}><Btn variant="outline" className="w-full"><Phone size={16} /></Btn></a>
          <a href={`mailto:${sel.email || ""}`}><Btn variant="outline" className="w-full"><Mail size={16} /></Btn></a>
          <Btn onClick={() => go("QuickAdd")}>Add entry</Btn>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={addFU}>Add follow-up</Btn>
          <Btn variant="outline" onClick={() => setShareModal({ title: sel.company, text: `Client: ${sel.company}\nContact: ${sel.contact || "-"}\nPhone: ${sel.phone || "-"}\nEmail: ${sel.email || "-"}\nLocation: ${sel.location || "-"}\nStage: ${sel.pipeline_status || "New Lead"}` })}><Upload size={16} />Share</Btn>
        </div>
        <Btn variant="danger" className="w-full" onClick={del}><Trash2 size={16} />Delete client</Btn>
        {clientEquipment.length > 0 && (
          <div><h2 className="mb-2 text-lg font-bold">Equipment at site</h2>
            {clientEquipment.map(e => (<div key={e.id} className="mb-2 rounded-2xl bg-slate-50 p-3 flex items-center gap-3"><Settings size={18} style={{ color: BRAND.primary }} /><div className="flex-1"><p className="font-semibold">{e.name}</p>{e.next_service_date && <p className="text-xs text-slate-500">Next service: {e.next_service_date}</p>}</div></div>))}
          </div>
        )}
        <div><h2 className="mb-2 text-lg font-bold">History</h2>
          {convs.length === 0 && <p className="text-sm text-slate-500">No history yet.</p>}
          {convs.map(e => (<div key={e.id} className="mb-2 rounded-2xl bg-slate-50 p-3"><div className="flex justify-between"><p className="text-xs font-bold text-slate-500">{e.created_at && e.created_at.slice(0, 10)}</p><p className="text-xs text-slate-400">{e.created_by_name}</p></div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{e.note}</p>{e.audio_data_url && <audio controls src={e.audio_data_url} className="mt-2 w-full" />}</div>))}
        </div>
        <div><h2 className="mb-2 text-lg font-bold">Linked files</h2>
          {docs.length === 0 && <p className="text-sm text-slate-500">No files yet.</p>}
          <div className="grid grid-cols-2 gap-3">
            {docs.map(d => { const isImg = (d.name && d.name.match)(/\.(jpg|jpeg|png|gif|webp)$/i); const isVid = (d.name && d.name.match)(/\.(mp4|mov|webm)$/i); return (<div key={d.id} className="rounded-2xl bg-slate-50 p-2">{isImg ? <img src={d.file_url} alt={d.name} className="h-28 w-full rounded-xl object-cover" /> : isVid ? <video controls src={d.file_url} className="h-28 w-full rounded-xl" /> : <div className="flex h-28 items-center justify-center rounded-xl bg-white"><FileIcon /></div>}<p className="mt-2 truncate text-xs text-slate-600">{d.name}</p></div>); })}
          </div>
        </div>
      </CC></Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">My Clients</h1><p className="text-sm text-slate-500">{data.clients.length} client{data.clients.length !== 1 ? "s" : ""}</p></div>
        <Btn onClick={() => setShowAddForm(true)}><Plus size={18} />Add client</Btn>
      </div>
      <div className="flex items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        <Search size={20} className="text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…" className="w-full bg-transparent p-2 text-base outline-none" />
      </div>
      {data.clients.length === 0 && <Empty title="No clients yet" text="Tap Add client to create your first client." />}
      <div className="space-y-3">
        {filtered.map(c => (
          <button key={c.id} onClick={() => setSelId(c.id)} className="w-full text-left">
            <Card className="rounded-3xl shadow-sm"><CC className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{c.company}</h2>
                  <p className="text-sm text-slate-500">{c.division || "No division"}</p>
                  <p className="mt-1 text-xs text-slate-500">{c.contact || "No contact"}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ChevronRight className="text-slate-400" />
                  <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STAGE_COLORS[c.pipeline_status || "New Lead"]}`}>{c.pipeline_status || "New Lead"}</span>
                </div>
              </div>
            </CC></Card>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Service ───────────────────────────────────────────────────────────────────
function ServiceScreen({ data, setData, userId, isOnline }) {
  const [rep, setRep] = useState({ clientId:"", machine:"", fault:"", workDone:"", partsUsed:"", technician:"" });
  const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(false);
  const [showSig, setShowSig] = useState(false); const [signature, setSignature] = useState(null);
  const [annotating, setAnnotating] = useState(null); const [shareModal, setShareModal] = useState(null);
  const sel = data.clients.find(c => c.id === rep.clientId);
  const handleFiles = async e => { setUploading(true); const s = await filesToStored(e.target.files); setFiles(c=>[...c,...s]); e.target.value=""; setUploading(false); };

  const save = async () => {
    const payload = { user_id:userId, client_id:rep.clientId||null, machine:rep.machine, fault:rep.fault, work_done:rep.workDone, parts_used:rep.partsUsed, technician:rep.technician, signature_data_url:signature };
    if (isOnline) { const {data:r} = await supabase.from("service_reports").insert(payload).select().single(); if (r) setData(c=>({...c,serviceReports:[r,...c.serviceReports]})); } else { addToQueue({type:"insert",table:"service_reports",data:payload}); setData(c=>({...c,serviceReports:[{...payload,id:`offline_${Date.now()}`,created_at:new Date().toISOString()},...c.serviceReports]})); }
    for (const f of files) { if (isOnline&&rep.clientId) { const {data:doc} = await supabase.from("documents").insert({user_id:userId,client_id:rep.clientId,file_url:f.url,name:f.name}).select().single(); if (doc) setData(c=>({...c,documents:[...c.documents,doc]})); } }
    const pw = window.open("","_blank");
    if (pw) { const esc=v=>String(v||"").replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[m])); pw.document.write(`<html><head><title>Power Works Service Report</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#1C1C1C}h1{border-bottom:3px solid #8B1A1A;padding-bottom:8px;color:#8B1A1A}.logo{max-height:60px;margin-bottom:16px}.s{margin-bottom:14px}.l{font-weight:bold;color:#8B1A1A}img{max-width:100%;margin-top:8px;border-radius:8px}.sig{border:1px solid #ccc;border-radius:8px;margin-top:8px}.footer{margin-top:40px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:16px}</style></head><body><img src="${BRAND.logo}" class="logo" alt="Power Works"/><h1>Service Report</h1><div class="s"><span class="l">Client:</span> ${esc((sel && sel.company))}</div><div class="s"><span class="l">Machine:</span> ${esc(rep.machine)}</div><div class="s"><span class="l">Technician:</span> ${esc(rep.technician)}</div><div class="s"><span class="l">Date:</span> ${new Date().toLocaleDateString("en-GB")}</div><div class="s"><span class="l">Fault Found:</span><br/>${esc(rep.fault).replace(/\n/g,"<br/>")}</div><div class="s"><span class="l">Work Done:</span><br/>${esc(rep.workDone).replace(/\n/g,"<br/>")}</div><div class="s"><span class="l">Parts Used:</span><br/>${esc(rep.partsUsed).replace(/\n/g,"<br/>")}</div><h2>Photos</h2>${files.map(f=>f.type.startsWith("image/")?`<img src="${f.url}"/>`:`<p>${esc(f.name)}</p>`).join("")}${signature?`<h2>Client Signature</h2><img src="${signature}" class="sig" style="max-width:300px"/>`:""}  <div class="footer">Power Works (Pty) Ltd · power-works.co.za</div><script>window.onload=function(){window.print()}<\/script></body></html>`); pw.document.close(); }
    setShareModal({ title: `Service Report — ${(sel && sel.company) || ""}`, text: `Power Works Service Report\nClient: ${(sel && sel.company)||"—"}\nMachine: ${rep.machine}\nTechnician: ${rep.technician}\nFault: ${rep.fault}\nWork Done: ${rep.workDone}` });
    setRep({clientId:"",machine:"",fault:"",workDone:"",partsUsed:"",technician:""}); setFiles([]); setSignature(null);
  };

  return (
    <div className="space-y-5">
      {showSig&&<SignaturePad onSave={sig=>{setSignature(sig);setShowSig(false);}} onCancel={()=>setShowSig(false)} />}
      {annotating&&<PhotoAnnotator src={annotating.url} onSave={annotated=>{setFiles(f=>f.map((x,i)=>i===annotating.idx?{...x,url:annotated}:x));setAnnotating(null);}} onCancel={()=>setAnnotating(null)} />}
      {shareModal&&<ShareModal {...shareModal} onClose={()=>setShareModal(null)} />}
      <div><h1 className="text-2xl font-bold">Service report</h1><p className="text-sm text-slate-500">Complete and create a PDF.</p></div>
      <Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4">
        <select value={rep.clientId} onChange={e=>setRep(r=>({...r,clientId:e.target.value}))} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Select client / site</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.company}{c.division?` - ${c.division}`:""}</option>)}</select>
        <Field label="Machine / Equipment" value={rep.machine} onChange={v=>setRep(r=>({...r,machine:v}))} />
        <Field label="Technician" value={rep.technician} onChange={v=>setRep(r=>({...r,technician:v}))} />
        <Field label="Fault found" multiline value={rep.fault} onChange={v=>setRep(r=>({...r,fault:v}))} />
        <Field label="Work done" multiline value={rep.workDone} onChange={v=>setRep(r=>({...r,workDone:v}))} />
        <Field label="Parts used" multiline value={rep.partsUsed} onChange={v=>setRep(r=>({...r,partsUsed:v}))} />
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold ${uploading?"opacity-60 pointer-events-none":""}`}><Upload size={18} />{uploading?"Uploading…":"Add photos / files"}<input type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple className="hidden" onChange={handleFiles} disabled={uploading} /></label>
        {files.map((f,i)=>(<div key={i} className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-semibold">{f.name}</p>{f.type.startsWith("image/")&&<img src={f.url} alt={f.name} className="mt-2 max-h-40 w-full rounded-xl object-cover" />}<div className="mt-2 flex gap-2">{f.type.startsWith("image/")&&<Btn variant="outline" className="flex-1 text-sm py-2" onClick={()=>setAnnotating({url:f.url,idx:i})}><FileIcon size={14} />Annotate</Btn>}<Btn variant="danger" className="flex-1 text-sm py-2" onClick={()=>setFiles(c=>c.filter((_,j)=>j!==i))}>Delete</Btn></div></div>))}
        <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Client signature</p><Btn variant="outline" className="text-sm py-2" onClick={()=>setShowSig(true)}>{signature?"Re-sign":"Get signature"}</Btn></div>{signature&&<img src={signature} alt="Signature" className="mt-3 h-20 w-full rounded-xl border border-slate-200 object-contain bg-white" />}</div>
        <Btn className="w-full py-6 text-base" onClick={save}>Save & create PDF</Btn>
      </CC></Card>
    </div>
  );
}

// ─── Documents ─────────────────────────────────────────────────────────────────
function DocumentsScreen({ data, setData, userId, isOnline }) {
  const [clientId, setClientId] = useState(""); const [uploading, setUploading] = useState(false);
  const handle = async e => { setUploading(true); const stored = await filesToStored(e.target.files); for (const f of stored) { if (isOnline) { const {data:doc} = await supabase.from("documents").insert({user_id:userId,client_id:clientId||null,file_url:f.url,name:f.name}).select().single(); if (doc) setData(c=>({...c,documents:[...c.documents,doc]})); } } e.target.value=""; setUploading(false); };
  const del = async id => { if (isOnline) await supabase.from("documents").delete().eq("id",id).eq("user_id",userId); else addToQueue({type:"delete",table:"documents",id}); setData(c=>({...c,documents:c.documents.filter(d=>d.id!==id)})); };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Documents</h1><p className="text-sm text-slate-500">Your uploaded files.</p></div>
      <Card className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4">
        <select value={clientId} onChange={e=>setClientId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-4"><option value="">Global document</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.company}{c.division?` - ${c.division}`:""}</option>)}</select>
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-6 font-semibold text-white ${uploading?"opacity-60 pointer-events-none":""}`} style={{background:BRAND.primary}}><Upload size={18} />{uploading?"Uploading…":"Upload photo, video or document"}<input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handle} disabled={uploading} /></label>
      </CC></Card>
      {data.documents.length===0&&<Empty title="No documents" text="Upload your first file above." />}
      <div className="space-y-3">{data.documents.map(doc=>{const client=data.clients.find(c=>c.id===doc.client_id);const isImg=(doc.name && doc.name.match)(/\.(jpg|jpeg|png|gif|webp)$/i);const isVid=(doc.name && doc.name.match)(/\.(mp4|mov|webm)$/i);return(<Card key={doc.id} className="rounded-3xl shadow-sm"><CC className="space-y-3 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><FileIcon size={22} /></div><div className="flex-1 min-w-0"><p className="truncate font-bold">{doc.name}</p><p className="text-sm text-slate-500">{client?client.company:"Global"}</p></div><button onClick={()=>del(doc.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><X size={18} /></button></div>{isImg&&<img src={doc.file_url} alt={doc.name} className="max-h-64 w-full rounded-2xl object-cover" />}{isVid&&<video controls src={doc.file_url} className="max-h-64 w-full rounded-2xl" />}{!isImg&&!isVid&&<a href={doc.file_url} target="_blank" rel="noreferrer"><Btn className="w-full">Open document</Btn></a>}</CC></Card>);})}</div>
    </div>
  );
}

// ─── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard() {
  const [users, setUsers] = useState([]); const [stats, setStats] = useState({}); const [range, setRange] = useState({ from: weekStart(), to: weekEnd() }); const [loading, setLoading] = useState(true); const [tab, setTab] = useState("dashboard");
  useEffect(() => { loadAll(); }, [range]);
  const loadAll = async () => { setLoading(true); const {data:allUsers} = await supabase.from("users").select("*").order("full_name"); setUsers(allUsers||[]); const es = {}; for (const u of allUsers||[]) { const [cl,co,fu,sv,sa] = await Promise.all([supabase.from("clients").select("id",{count:"exact",head:true}).eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59"),supabase.from("conversations").select("id",{count:"exact",head:true}).eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59"),supabase.from("follow_ups").select("id,completed").eq("user_id",u.id).gte("due_date",range.from).lte("due_date",range.to),supabase.from("service_reports").select("id",{count:"exact",head:true}).eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59"),supabase.from("sales_reports").select("quotes,new_leads").eq("user_id",u.id).gte("created_at",range.from).lte("created_at",range.to+"T23:59:59")]); es[u.id]={newClients:cl.count||0,conversations:co.count||0,followUpsTotal:(fu.data||[]).length,followUpsDone:(fu.data||[]).filter(f=>f.completed).length,serviceReports:sv.count||0,quotes:(sa.data||[]).reduce((s,r)=>s+parseInt(r.quotes||0),0),newLeads:(sa.data||[]).reduce((s,r)=>s+parseInt(r.new_leads||0),0)}; } setStats(es); setLoading(false); };
  const changeRole = async (id, r) => { await supabase.from("users").update({role:r}).eq("id",id); loadAll(); };
  const totals = users.reduce((a,u)=>{const s=stats[u.id]||{};return{conversations:(a.conversations||0)+(s.conversations||0),newClients:(a.newClients||0)+(s.newClients||0),quotes:(a.quotes||0)+(s.quotes||0),newLeads:(a.newLeads||0)+(s.newLeads||0),followUpsDone:(a.followUpsDone||0)+(s.followUpsDone||0),serviceReports:(a.serviceReports||0)+(s.serviceReports||0)}},{});
  const exportPDF = () => { const w=window.open("","_blank"); if(!w){alert("Allow popups.");return;} const esc=v=>String(v||"").replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[m])); const rows=users.map(u=>{const s=stats[u.id]||{};return`<tr><td>${esc(u.full_name||u.email)}</td><td>${s.conversations||0}</td><td>${s.newClients||0}</td><td>${s.quotes||0}</td><td>${s.newLeads||0}</td><td>${s.followUpsDone||0}/${s.followUpsTotal||0}</td><td>${s.serviceReports||0}</td></tr>`;}).join(""); w.document.write(`<html><head><title>Power Works Weekly Report</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#1C1C1C}h1{border-bottom:3px solid #8B1A1A;padding-bottom:8px;color:#8B1A1A}.logo{max-height:50px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#8B1A1A;color:#fff}tr.total{font-weight:bold;background:#f5f0f0}</style></head><body><img src="${BRAND.logo}" class="logo"/><h1>Weekly Report</h1><p><strong>Period:</strong> ${range.from} to ${range.to}</p><table><thead><tr><th>Employee</th><th>Visits</th><th>New Clients</th><th>Quotes</th><th>New Leads</th><th>Follow-ups</th><th>Svc Reports</th></tr></thead><tbody>${rows}<tr class="total"><td>TOTAL</td><td>${totals.conversations||0}</td><td>${totals.newClients||0}</td><td>${totals.quotes||0}</td><td>${totals.newLeads||0}</td><td>${totals.followUpsDone||0}</td><td>${totals.serviceReports||0}</td></tr></tbody></table><div style="margin-top:40px;font-size:12px;color:#888">Power Works (Pty) Ltd · power-works.co.za</div><script>window.onload=function(){window.print()}<\/script></body></html>`); w.document.close(); };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Management</h1><p className="text-sm text-slate-500">Team performance & weekly reports.</p></div>
      <div className="flex rounded-2xl p-1 gap-1" style={{background:"#f1f1f1"}}>{[["dashboard","Dashboard"],["weekly","Weekly"],["team","Team"]].map(([k,l])=>(<button key={k} onClick={()=>setTab(k)} className="flex-1 rounded-xl py-2 text-sm font-semibold transition" style={{background:tab===k?"#fff":"transparent",color:tab===k?BRAND.primary:"#64748b"}}>{l}</button>))}</div>
      {(tab==="dashboard"||tab==="weekly")&&(<div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3"><label className="text-xs font-bold text-slate-500">From</label><input type="date" value={range.from} onChange={e=>setRange(r=>({...r,from:e.target.value}))} className="rounded-xl border border-slate-200 p-2 text-sm" /><label className="text-xs font-bold text-slate-500">To</label><input type="date" value={range.to} onChange={e=>setRange(r=>({...r,to:e.target.value}))} className="rounded-xl border border-slate-200 p-2 text-sm" />{tab==="weekly"&&<Btn className="ml-auto" onClick={exportPDF}>Export PDF</Btn>}</div>)}
      {loading&&<div className="p-6 text-center text-slate-500">Loading…</div>}
      {!loading&&tab==="dashboard"&&(<div className="space-y-4"><Card className="rounded-3xl shadow-sm"><CC className="p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Team totals</p><div className="grid grid-cols-3 gap-3">{[["Visits",totals.conversations],["New Clients",totals.newClients],["Quotes",totals.quotes],["New Leads",totals.newLeads],["Follow-ups",totals.followUpsDone],["Svc Reports",totals.serviceReports]].map(([l,v])=>(<div key={l} className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black" style={{color:BRAND.primary}}>{v||0}</p><p className="text-xs text-slate-500">{l}</p></div>))}</div></CC></Card>{users.map(u=>{const s=stats[u.id]||{};return(<Card key={u.id} className="rounded-3xl shadow-sm"><CC className="p-4"><div className="mb-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl text-white font-bold" style={{background:BRAND.primary}}>{(u.full_name||u.email||"?")[0].toUpperCase()}</div><div><p className="font-bold">{u.full_name||u.email}</p><span className="text-xs font-semibold px-2 py-0.5 rounded-xl" style={{background:u.role==="admin"?BRAND.primary:"#f1f5f9",color:u.role==="admin"?"#fff":"#64748b"}}>{u.role||"employee"}</span></div></div><div className="grid grid-cols-3 gap-2">{[["Visits",s.conversations],["New Clients",s.newClients],["Quotes",s.quotes],["New Leads",s.newLeads],["FU",`${s.followUpsDone||0}/${s.followUpsTotal||0}`],["Svc",s.serviceReports]].map(([l,v])=>(<div key={l} className="rounded-2xl bg-slate-50 p-2 text-center"><p className="text-xl font-black" style={{color:BRAND.primary}}>{v??0}</p><p className="text-xs text-slate-500">{l}</p></div>))}</div></CC></Card>);})}</div>)}
      {!loading&&tab==="weekly"&&(<div className="overflow-x-auto rounded-3xl shadow-sm"><table className="w-full bg-white text-sm"><thead><tr style={{background:BRAND.primary,color:"#fff"}}><th className="p-3 text-left">Employee</th><th className="p-3 text-center">Visits</th><th className="p-3 text-center">New Clients</th><th className="p-3 text-center">Quotes</th><th className="p-3 text-center">New Leads</th><th className="p-3 text-center">Follow-ups</th><th className="p-3 text-center">Svc Reports</th></tr></thead><tbody>{users.map((u,i)=>{const s=stats[u.id]||{};return(<tr key={u.id} style={{background:i%2===0?"#fff":"#fdf8f8"}}><td className="p-3 font-semibold">{u.full_name||u.email}</td><td className="p-3 text-center">{s.conversations||0}</td><td className="p-3 text-center">{s.newClients||0}</td><td className="p-3 text-center">{s.quotes||0}</td><td className="p-3 text-center">{s.newLeads||0}</td><td className="p-3 text-center">{s.followUpsDone||0}/{s.followUpsTotal||0}</td><td className="p-3 text-center">{s.serviceReports||0}</td></tr>);})}<tr style={{background:BRAND.primary,color:"#fff",fontWeight:"bold"}}><td className="p-3">TOTAL</td><td className="p-3 text-center">{totals.conversations||0}</td><td className="p-3 text-center">{totals.newClients||0}</td><td className="p-3 text-center">{totals.quotes||0}</td><td className="p-3 text-center">{totals.newLeads||0}</td><td className="p-3 text-center">{totals.followUpsDone||0}</td><td className="p-3 text-center">{totals.serviceReports||0}</td></tr></tbody></table></div>)}
      {tab==="team"&&(<div className="space-y-3"><div className="rounded-2xl p-4 text-sm" style={{background:"#fff3f3",color:BRAND.primary}}>Ask employees to sign up. You can promote them to admin here.</div>{users.map(u=>(<Card key={u.id} className="rounded-3xl shadow-sm"><CC className="flex items-center gap-3 p-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white font-bold text-lg" style={{background:BRAND.primary}}>{(u.full_name||u.email||"?")[0].toUpperCase()}</div><div className="flex-1 min-w-0"><p className="font-bold truncate">{u.full_name||"No name"}</p><p className="text-xs text-slate-500 truncate">{u.email}</p><span className="mt-1 inline-block rounded-xl px-2 py-0.5 text-xs font-semibold" style={{background:u.role==="admin"?BRAND.primary:"#f1f5f9",color:u.role==="admin"?"#fff":"#64748b"}}>{u.role||"employee"}</span></div><button onClick={()=>changeRole(u.id,u.role==="admin"?"employee":"admin")} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{background:BRAND.light,color:BRAND.charcoal}}>{u.role==="admin"?"Make employee":"Make admin"}</button></CC></Card>))}</div>)}
    </div>
  );
}

// ─── More ──────────────────────────────────────────────────────────────────────
function MoreScreen({ go, data, setData, currentUser, onSignOut }) {
  const [sub, setSub] = useState("main"); const [sr, setSr] = useState({ week:"",visits:"",quotes:"",followUps:"",newLeads:"",summary:"" });
  const isAdmin = (currentUser && currentUser.role) === "admin";
  const saveSR = async () => { const {data:r} = await supabase.from("sales_reports").insert({user_id:currentUser.id,week:sr.week,visits:sr.visits,quotes:sr.quotes,follow_ups:sr.followUps,new_leads:sr.newLeads,summary:sr.summary}).select().single(); if (r) setData(c=>({...c,salesReports:[r,...c.salesReports]})); setSr({week:"",visits:"",quotes:"",followUps:"",newLeads:"",summary:""}); alert("Sales report saved."); };
  if (sub==="sales") return (<div className="space-y-5"><Btn variant="outline" onClick={()=>setSub("main")}>← Back</Btn><h1 className="text-2xl font-bold">My Sales Reports</h1><Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4"><Field label="Week / Date" value={sr.week} onChange={v=>setSr(r=>({...r,week:v}))} placeholder="e.g. Week 18 / 05 May 2026" /><Field label="Total visits" value={sr.visits} onChange={v=>setSr(r=>({...r,visits:v}))} /><Field label="Quotes sent" value={sr.quotes} onChange={v=>setSr(r=>({...r,quotes:v}))} /><Field label="Follow-ups completed" value={sr.followUps} onChange={v=>setSr(r=>({...r,followUps:v}))} /><Field label="New leads" value={sr.newLeads} onChange={v=>setSr(r=>({...r,newLeads:v}))} /><Field label="Weekly summary" multiline value={sr.summary} onChange={v=>setSr(r=>({...r,summary:v}))} /><Btn className="w-full py-6" onClick={saveSR}>Save sales report</Btn></CC></Card>{data.salesReports.map(r=><Card key={r.id} className="rounded-3xl shadow-sm"><CC className="p-4"><p className="font-bold">{r.week||r.created_at && r.created_at.slice(0,10)}</p><p className="mt-1 text-sm text-slate-600">{r.summary}</p></CC></Card>)}</div>);
  if (sub==="settings") return (<div className="space-y-5"><Btn variant="outline" onClick={()=>setSub("main")}>← Back</Btn><h1 className="text-2xl font-bold">Settings</h1><Card className="rounded-3xl shadow-sm"><CC className="space-y-4 p-4"><div className="flex items-center gap-3 mb-2"><img src={BRAND.logo} alt="Power Works" className="h-10 object-contain" onError={e=>{e.target.style.display="none";}} /><div><p className="font-bold" style={{color:BRAND.primary}}>Power Works (Pty) Ltd</p><p className="text-xs text-slate-500">power-works.co.za</p></div></div><div className="rounded-2xl p-4 space-y-1" style={{background:BRAND.light}}><p className="text-sm font-bold">Logged in as</p><p className="text-sm text-slate-700">{(currentUser && currentUser.full_name)||"No name"}</p><p className="text-xs text-slate-500">{(currentUser && currentUser.email)}</p><p className="text-xs font-semibold capitalize" style={{color:BRAND.primary}}>Role: {(currentUser && currentUser.role)||"employee"}</p></div><Btn variant="danger" className="w-full py-4" onClick={onSignOut}><LogOut size={16} />Sign out</Btn></CC></Card></div>);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">More</h1><p className="text-sm text-slate-500">Reports and settings.</p></div>
      <div className="space-y-3">
        {isAdmin&&<BigAction icon={Shield} title="Management Dashboard" subtitle="Team performance & weekly reports" onClick={()=>go("Admin")} />}
        <BigAction icon={BarChart2} title="My Dashboard" subtitle="Charts and performance overview" onClick={()=>go("Dashboard")} />
        <BigAction icon={FileIcon} title="Export Data" subtitle="Download clients, quotes and reports to Excel" onClick={()=>go("Export")} />
        <BigAction icon={BarChart2} title="Target Tracker" subtitle="Monthly targets and progress" onClick={()=>go("Targets")} />
        <BigAction icon={Briefcase} title="My Sales Reports" subtitle="Log weekly visits, quotes and leads" onClick={()=>setSub("sales")} />
        <BigAction icon={Clipboard} title="Settings & Account" subtitle="Account info and sign out" onClick={()=>setSub("settings")} />
      </div>
    </div>
  );
}


// ─── Notes & Reminders ─────────────────────────────────────────────────────────
function NotesScreen({ data, setData, userId, isOnline }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", reminder_date: "", reminder_time: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("active"); // active | done
  const timers = useRef([]);

  const notes = (data.notes || []);
  const activeNotes = notes.filter(n => !n.completed);
  const doneNotes = notes.filter(n => n.completed);
  const displayed = filter === "active" ? activeNotes : doneNotes;

  // Schedule notifications for notes with reminders on load
  useEffect(() => {
    if (Notification && Notification.permission !== "granted") return;
    activeNotes.forEach(note => {
      if (note.reminder_date && note.reminder_time) {
        const fireAt = new Date(`${note.reminder_date}T${note.reminder_time}:00`).getTime();
        const delay = fireAt - Date.now();
        if (delay > 0) {
          const t = setTimeout(() => {
            new Notification("📝 Power Works Reminder", { body: note.title, icon: "/icons/icon-192.png" });
          }, delay);
          timers.current.push(t);
        }
      }
    });
    return () => timers.current.forEach(t => clearTimeout(t));
  }, []);

  const save = async () => {
    if (!form.title.trim()) { alert("Please enter a title."); return; }
    setSaving(true);
    const payload = { user_id: userId, title: form.title.trim(), body: form.body.trim(), reminder_date: form.reminder_date || null, reminder_time: form.reminder_time || null, completed: false };
    try {
      if (isOnline) {
        const { data: r, error } = await supabase.from("notes").insert(payload).select().single();
        if (error) { alert("Error saving note: " + error.message); setSaving(false); return; }
        if (r) {
          setData(c => ({ ...c, notes: [r, ...(c.notes || [])] }));
          // Schedule notification
          if (r.reminder_date && r.reminder_time && Notification && Notification.permission === "granted") {
            const fireAt = new Date(`${r.reminder_date}T${r.reminder_time}:00`).getTime();
            const delay = fireAt - Date.now();
            if (delay > 0) setTimeout(() => new Notification("📝 Power Works Reminder", { body: r.title, icon: "/icons/icon-192.png" }), delay);
          }
        }
      } else {
        const id = `offline_${Date.now()}`;
        addToQueue({ type: "insert", table: "notes", data: { ...payload, id } });
        setData(c => ({ ...c, notes: [{ ...payload, id, created_at: new Date().toISOString() }, ...(c.notes || [])] }));
      }
      setForm({ title: "", body: "", reminder_date: "", reminder_time: "" });
      setShowForm(false);
    } catch (e) { alert("Failed: " + e.message); }
    setSaving(false);
  };

  const markDone = async (id) => {
    if (isOnline) await supabase.from("notes").update({ completed: true }).eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "update", table: "notes", id, data: { completed: true } });
    setData(c => ({ ...c, notes: (c.notes || []).map(n => n.id === id ? { ...n, completed: true } : n) }));
  };

  const deleteNote = async (id) => {
    if (!confirm("Delete this note?")) return;
    if (isOnline) await supabase.from("notes").delete().eq("id", id).eq("user_id", userId);
    else addToQueue({ type: "delete", table: "notes", id });
    setData(c => ({ ...c, notes: (c.notes || []).filter(n => n.id !== id) }));
  };

  const isOverdue = (note) => {
    if (!note.reminder_date) return false;
    return note.reminder_date < todayISO();
  };

  const isDueToday = (note) => note.reminder_date === todayISO();

  if (showForm) return (
    <div className="space-y-5">
      <Btn variant="outline" onClick={() => setShowForm(false)}>← Back to notes</Btn>
      <h1 className="text-2xl font-bold">New note</h1>
      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-4 p-4">
          <Field label="Title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="What do you need to remember?" />
          <Field label="Details" multiline value={form.body} onChange={v => setForm(f => ({ ...f, body: v }))} placeholder="Any additional details…" />
          <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-bold text-slate-700">⏰ Set a reminder (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reminder date" type="date" value={form.reminder_date} onChange={v => setForm(f => ({ ...f, reminder_date: v }))} />
              <Field label="Reminder time" type="time" value={form.reminder_time} onChange={v => setForm(f => ({ ...f, reminder_time: v }))} />
            </div>
          </div>
          <Btn className="w-full py-5 text-base" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save note"}
          </Btn>
        </CC>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notes & Reminders</h1>
          <p className="text-sm text-slate-500">{activeNotes.length} active · {doneNotes.length} done</p>
        </div>
        <Btn onClick={() => setShowForm(true)}><Plus size={18} />Add note</Btn>
      </div>

      {/* Notification prompt */}
      {Notification && Notification.permission !== "granted" && (
        <div className="flex items-center justify-between rounded-2xl p-4" style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Enable notifications for reminders</p>
          </div>
          <Btn className="text-sm py-2 px-3" onClick={async () => { await requestNotifPermission(); }}>Enable</Btn>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex rounded-2xl p-1 gap-1" style={{ background: "#f1f1f1" }}>
        {[["active", `Active (${activeNotes.length})`], ["done", `Done (${doneNotes.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className="flex-1 rounded-xl py-2 text-sm font-semibold transition"
            style={{ background: filter === k ? "#fff" : "transparent", color: filter === k ? BRAND.primary : "#64748b" }}>{l}</button>
        ))}
      </div>

      {displayed.length === 0 && (
        <Empty
          title={filter === "active" ? "No active notes" : "No completed notes"}
          text={filter === "active" ? "Tap Add note to create your first note or reminder." : "Completed notes will appear here."}
        />
      )}

      <div className="space-y-3">
        {displayed.map(note => (
          <Card key={note.id} className="rounded-3xl shadow-sm" style={{ borderLeft: isOverdue(note) && !note.completed ? `4px solid #dc2626` : isDueToday(note) && !note.completed ? `4px solid #f59e0b` : `4px solid transparent` }}>
            <CC className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className={`font-bold text-slate-900 ${note.completed ? "line-through text-slate-400" : ""}`}>{note.title}</p>
                  {note.body && <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{note.body}</p>}
                  {note.reminder_date && (
                    <div className="mt-2 flex items-center gap-1">
                      <Bell size={13} style={{ color: isOverdue(note) ? "#dc2626" : isDueToday(note) ? "#f59e0b" : BRAND.primary }} />
                      <p className="text-xs font-semibold" style={{ color: isOverdue(note) ? "#dc2626" : isDueToday(note) ? "#f59e0b" : BRAND.primary }}>
                        {isOverdue(note) && !note.completed ? "OVERDUE · " : isDueToday(note) ? "TODAY · " : ""}
                        {note.reminder_date}{note.reminder_time ? ` at ${note.reminder_time}` : ""}
                      </p>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-400">{note.created_at && e.created_at.slice(0, 10)}</p>
                </div>
                <button onClick={() => deleteNote(note.id)} className="rounded-xl bg-red-50 p-2 text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
              {!note.completed && (
                <button onClick={() => markDone(note.id)}
                  className="mt-3 w-full rounded-2xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: BRAND.primary }}>
                  <Check size={16} /> Mark as done
                </button>
              )}
            </CC>
          </Card>
        ))}
      </div>
    </div>
  );
}


// ─── Export to Excel ─────────────────────────────────────────────────────────
function exportToCSV(rows, headers, filename) {
  const escape = v => {
    const s = String(v || "").replace(/"/g, '""');
    return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
  };
  const csv = [
    headers.map(escape).join(","),
    ...rows.map(row => row.map(escape).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportScreen({ data, currentUser }) {
  const [exporting, setExporting] = useState(null);

  const doExport = (type) => {
    setExporting(type);
    try {
      if (type === "clients") {
        exportToCSV(
          data.clients.map(c => [c.company, c.division, c.contact, c.phone, c.email, c.location, c.pipeline_status || "New Lead", c.notes]),
          ["Company", "Division", "Contact", "Phone", "Email", "Location", "Pipeline Stage", "Notes"],
          "powerworks-clients"
        );
      }
      if (type === "quotes") {
        exportToCSV(
          (data.quotes || []).map(q => [q.client_name, q.quote_number, q.description, q.value, q.status, q.sent_date, q.follow_up_date, workingDaysSince(q.sent_date) + " working days", q.notes]),
          ["Client", "Quote Number", "Description", "Value (R)", "Status", "Date Sent", "Follow-up Date", "Days Waiting", "Notes"],
          "powerworks-quotes"
        );
      }
      if (type === "equipment") {
        exportToCSV(
          (data.equipment || []).map(e => {
            const client = data.clients.find(c => c.id === e.client_id);
            return [e.name, e.model, e.serial_number, (client && client.company) || "", e.install_date, e.last_service_date, e.next_service_date, e.warranty_expiry, e.notes];
          }),
          ["Equipment Name", "Model", "Serial Number", "Client", "Install Date", "Last Service", "Next Service", "Warranty Expiry", "Notes"],
          "powerworks-equipment"
        );
      }
      if (type === "service_reports") {
        exportToCSV(
          (data.serviceReports || []).map(r => [r.client_name, r.machine, r.technician, r.fault, r.work_done, r.parts_used, r.created_at && r.created_at.slice(0, 10)]),
          ["Client", "Machine", "Technician", "Fault", "Work Done", "Parts Used", "Date"],
          "powerworks-service-reports"
        );
      }
      if (type === "follow_ups") {
        exportToCSV(
          data.followUps.map(f => [f.client_name, f.due_date, f.status, f.completed ? "Yes" : "No", f.outcome]),
          ["Client", "Due Date", "Status", "Completed", "Outcome"],
          "powerworks-follow-ups"
        );
      }
    } catch(e) {
      alert("Export failed: " + e.message);
    }
    setTimeout(() => setExporting(null), 1000);
  };

  const exports = [
    { key: "clients", label: "Clients", icon: "👥", desc: `${data.clients.length} clients` },
    { key: "quotes", label: "Quotes", icon: "📄", desc: `${(data.quotes||[]).length} quotes` },
    { key: "equipment", label: "Equipment", icon: "⚙️", desc: `${(data.equipment||[]).length} items` },
    { key: "service_reports", label: "Service Reports", icon: "🔧", desc: `${(data.serviceReports||[]).length} reports` },
    { key: "follow_ups", label: "Follow-ups", icon: "📅", desc: `${data.followUps.length} follow-ups` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Export Data</h1>
        <p className="text-sm text-slate-500">Download your data as CSV (opens in Excel)</p>
      </div>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Files download as CSV which opens directly in Excel or Google Sheets.
      </div>
      <div className="space-y-3">
        {exports.map(({ key, label, icon, desc }) => (
          <Card key={key} className="rounded-3xl shadow-sm">
            <CC className="flex items-center gap-4 p-4">
              <div className="rounded-2xl p-3 text-2xl" style={{ background: BRAND.light }}>{icon}</div>
              <div className="flex-1">
                <p className="font-bold text-slate-900">{label}</p>
                <p className="text-sm text-slate-500">{desc}</p>
              </div>
              <Btn onClick={() => doExport(key)} disabled={exporting === key} className="rounded-2xl">
                {exporting === key ? "Exporting…" : "Export"}
              </Btn>
            </CC>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const [session, setSession] = useState(null); const [currentUser, setCurrentUser] = useState(null); const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("Home");
  const [data, setData] = useState({ clients:[], planList:[], followUps:[], documents:[], conversations:[], serviceReports:[], salesReports:[], equipment:[], targets:[], quotes:[], notes:[] });
  const [dataLoading, setDataLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [queueCount, setQueueCount] = useState(getQueue().length);
  const [refreshing, setRefreshing] = useState(false);
  const [locked, setLocked] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const lastActiveRef = useRef(Date.now());

  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      await processOfflineQueue();
      setQueueCount(getQueue().length);
      // Sync offline photos
      if (currentUser) await syncOfflinePhotos(currentUser.id, setData);
      // Register background sync
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        try { await reg.sync.register('sync-offline-data'); } catch(e) {}
      }
    };
    const goOffline = () => { setIsOnline(false); setQueueCount(getQueue().length); };
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({data:{session}}) => { setSession(session); if (!session) setAuthLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_,s) => { setSession(s); if (!s) { setCurrentUser(null); setAuthLoading(false); } });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!(session && session.user)) return;
    const load = async () => { const {data:profile} = await supabase.from("users").select("*").eq("id",session.user.id).single(); const user = profile?{...session.user,...profile}:{...session.user,role:"employee"}; setCurrentUser(user); setAuthLoading(false); registerPushNotifications(session.user.id); };
    load();
  }, [session]);

  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.id;
    const load = async () => {
      setDataLoading(true);

      // Load from local cache first so app shows data immediately
      const cached = loadDataCache();
      if (cached) {
        setData(cached);
        setDataLoading(false); // Show cached data right away
      }

      // Then fetch fresh data from Supabase (if online)
      if (!navigator.onLine) {
        console.log('Offline: using cached data');
        setDataLoading(false);
        return;
      }

      const [clients,plans,fus,docs,convs,svcs,sales,equip,targets,quotes,noteRows] = await Promise.all([
        supabase.from("clients").select("*").eq("user_id",uid).order("company"),
        supabase.from("plan_items").select("*").eq("user_id",uid).order("date").order("time"),
        supabase.from("follow_ups").select("*").eq("user_id",uid).order("due_date"),
        supabase.from("documents").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("conversations").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("service_reports").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("sales_reports").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("equipment").select("*").eq("user_id",uid).order("name"),
        supabase.from("targets").select("*").eq("user_id",uid),
        supabase.from("quotes").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("notes").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
      ]);
      const freshData = { clients:clients.data||[], planList:plans.data||[], followUps:fus.data||[], documents:docs.data||[], conversations:convs.data||[], serviceReports:svcs.data||[], salesReports:sales.data||[], equipment:equip.data||[], targets:targets.data||[], quotes:quotes.data||[], notes:noteRows.data||[] };
      setData(freshData);
      saveDataCache(freshData); // Update local cache
      setDataLoading(false);
    };
    load();
  }, [currentUser]);

  // ─── Real-time subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.id;

    // Subscribe to changes in clients table
    const clientsSub = supabase.channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${uid}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setData(c => ({ ...c, clients: [...c.clients.filter(x => x.id !== payload.new.id), payload.new].sort((a,b) => (a.company && a.company.localeCompare)(b.company)) }));
          if (payload.eventType === 'UPDATE') setData(c => ({ ...c, clients: c.clients.map(x => x.id === payload.new.id ? { ...x, ...payload.new } : x) }));
          if (payload.eventType === 'DELETE') setData(c => ({ ...c, clients: c.clients.filter(x => x.id !== payload.old.id) }));
        })
      .subscribe();

    // Subscribe to follow_ups
    const fuSub = supabase.channel('followups-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follow_ups', filter: `user_id=eq.${uid}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setData(c => ({ ...c, followUps: [...c.followUps.filter(x => x.id !== payload.new.id), payload.new] }));
          if (payload.eventType === 'UPDATE') setData(c => ({ ...c, followUps: c.followUps.map(x => x.id === payload.new.id ? { ...x, ...payload.new } : x) }));
          if (payload.eventType === 'DELETE') setData(c => ({ ...c, followUps: c.followUps.filter(x => x.id !== payload.old.id) }));
        })
      .subscribe();

    return () => {
      supabase.removeChannel(clientsSub);
      supabase.removeChannel(fuSub);
    };
  }, [currentUser]);

  // ─── Session refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.log('Session expired, refreshing...');
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.log('Session refresh failed, logging out');
          await supabase.auth.signOut();
        }
      }
    }, 10 * 60 * 1000); // Check every 10 minutes
    return () => clearInterval(interval);
  }, []);

  // ─── Pull to refresh handler ─────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!currentUser) return;
    const uid = currentUser.id;
    const [clients, plans, fus, docs, convs, svcs, sales, equip, targets, quotes, noteRows] = await Promise.all([
      supabase.from("clients").select("*").eq("user_id", uid).order("company"),
      supabase.from("plan_items").select("*").eq("user_id", uid).order("date").order("time"),
      supabase.from("follow_ups").select("*").eq("user_id", uid).order("due_date"),
      supabase.from("documents").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("conversations").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("service_reports").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("sales_reports").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("equipment").select("*").eq("user_id", uid).order("name"),
      supabase.from("targets").select("*").eq("user_id", uid),
      supabase.from("quotes").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("notes").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);
    setData({ clients: clients.data||[], planList: plans.data||[], followUps: fus.data||[], documents: docs.data||[], conversations: convs.data||[], serviceReports: svcs.data||[], salesReports: sales.data||[], equipment: equip.data||[], targets: targets.data||[], quotes: quotes.data||[], notes: noteRows.data||[] });
    // Process offline queue if online
    if (isOnline) { await processOfflineQueue(); setQueueCount(getQueue().length); }
  };

  // ─── Swipe back gesture ──────────────────────────────────────────────────────
  const NAV_SCREENS_SET = new Set(["Home", "Clients", "Pipeline", "Equipment", "Quotes", "Notes", "More"]);
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // Swipe right (>80px horizontal, less than 50px vertical) to go back
    if (dx > 80 && dy < 50 && !NAV_SCREENS_SET.has(screen)) {
      goBack();
    }
  };

  // ─── Auto-create recurring follow-ups
  useEffect(() => {
    if (!currentUser||!isOnline) return;
    data.followUps.filter(f=>f.completed&&f.recurring&&f.due_date).forEach(async fu => {
      const nextDate = addDays(fu.due_date, fu.recurring_days||7);
      const exists = data.followUps.some(f=>f.client_id===fu.client_id&&f.due_date===nextDate&&!f.completed);
      if (!exists&&nextDate>=todayISO()) { const payload={user_id:currentUser.id,client_id:fu.client_id,client_name:fu.client_name,due_date:nextDate,status:"Open",outcome:"",completed:false,recurring:true,recurring_days:fu.recurring_days}; const {data:newFu} = await supabase.from("follow_ups").insert(payload).select().single(); if (newFu) setData(c=>({...c,followUps:[...c.followUps,newFu]})); }
    });
  }, [data.followUps, currentUser, isOnline]);

  // Save cache whenever data changes
  useEffect(() => {
    if (data.clients.length > 0 || data.serviceReports.length > 0) {
      saveDataCache(data);
    }
  }, [data]);

  const signOut = async () => {
    localStorage.removeItem(DATA_CACHE_KEY);
    await supabase.auth.signOut();
    setScreen("Home");
  };

  // ─── App lock on visibility change (when app is fully closed/reopened) ───────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastActiveRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed > 30 * 60 * 1000 && currentUser) { // 30 minutes
          setLocked(true);
        }
      }
    };
    // Track user activity to reset inactivity timer
    const resetTimer = () => { lastActiveRef.current = Date.now(); if (locked) {} };
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("touchstart", resetTimer);
    document.addEventListener("click", resetTimer);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("touchstart", resetTimer);
      document.removeEventListener("click", resetTimer);
    };
  }, [currentUser, locked]);

  if (authLoading) return <Spinner />;
  if (!session||!currentUser) return <AuthScreen />;
  if (dataLoading) return <Spinner />;
  if (locked) return <LockScreen onUnlock={() => { setLocked(false); updateLastActive(); }} />;

  const uid = currentUser.id;
  const uname = currentUser.full_name || currentUser.email;
  const props = { data, setData, userId: uid, isOnline };
  const flaggedQuotes = (data.quotes||[]).filter(q=>q.flagged&&q.status==="Pending").length;

  // Screen history for back button
  const NAV_SCREENS = ["Home", "Clients", "Pipeline", "Equipment", "Quotes", "Notes", "More"];
  const canGoBack = !NAV_SCREENS.includes(screen);
  const backMap = {
    QuickAdd: "Home", Calendar: "Home", Service: "Home", Documents: "Home",
    Pipeline: "Home", Equipment: "Home", Quotes: "Home", Targets: "More",
    Dashboard: "More", Admin: "More", Notes: "Home", Search: "Home", Export: "More",
  };
  const goBack = () => setScreen(backMap[screen] || "Home");

  const views = {
    Home: <HomeScreen go={setScreen} clients={data.clients} planList={data.planList} followUps={data.followUps} quotes={data.quotes} setData={setData} userId={uid} isOnline={isOnline} />,
    QuickAdd: <QuickAddScreen {...props} go={setScreen} userName={uname} />,
    Calendar: <CalendarScreen {...props} />,
    Clients: <ClientsScreen {...props} go={setScreen} />,
    Service: <ServiceScreen {...props} />,
    Documents: <DocumentsScreen {...props} />,
    Pipeline: <PipelineScreen {...props} />,
    Equipment: <EquipmentScreen {...props} />,
    Quotes: <QuoteScreen {...props} />,
    Targets: <TargetScreen {...props} />,
    Dashboard: <DashboardScreen data={data} userId={uid} />,
    Notes: <NotesScreen {...props} />,
    More: <MoreScreen go={setScreen} data={data} setData={setData} currentUser={currentUser} onSignOut={signOut} />,
    Admin: <AdminDashboard />,
    Search: <GlobalSearchScreen data={data} go={goBack} setScreen={setScreen} />,
    Export: <ExportScreen data={data} currentUser={currentUser} />,
  };

  return (
    <ErrorBoundary>
    <div className="min-h-screen text-slate-900" style={{ background: BRAND.light }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Offline banner */}
      {(!isOnline||queueCount>0)&&(
        <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white"
          style={{background:isOnline?BRAND.primary:"#d97706"}}>
          {isOnline
            ? <><Wifi size={16} />Back online — syncing {queueCount} item{queueCount!==1?"s":""}…</>
            : <><WifiOff size={16} />Offline mode — all data available, changes saved locally</>
          }
        </div>
      )}

      <div className={`mx-auto max-w-2xl px-4 pb-28 pt-4 ${(!isOnline||queueCount>0)?"mt-8":""}`}>

        {/* Header */}
        <header className="mb-4 rounded-3xl bg-white shadow-sm overflow-hidden" style={{ borderTop: `4px solid ${BRAND.primary}` }}>
          {/* Top row — logo + actions */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <img src={BRAND.logo} alt="Power Works" className="h-9 object-contain max-w-[160px]"
              onError={e=>{e.target.style.display="none";}} />
            <div className="flex items-center gap-2">
              {!isOnline&&<WifiOff size={18} className="text-amber-500" />}
              <Btn variant="outline" onClick={() => setScreen("Search")} className="py-2 px-3"><Search size={18} /></Btn>
              <Btn onClick={() => setScreen("QuickAdd")} className="py-2 px-3"><Plus size={18} /></Btn>
            </div>
          </div>
          {/* Bottom row — back button + screen name + user */}
          <div className="flex items-center gap-2 px-4 pb-3 border-t border-slate-100 pt-2">
            {canGoBack ? (
              <button onClick={goBack} className="flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold text-white" style={{background:BRAND.primary}}>
                <ChevronLeft size={14} />Back
              </button>
            ) : (
              <div className="rounded-xl px-2 py-1 text-xs font-bold" style={{background:BRAND.light, color:BRAND.primary}}>
                {screen}
              </div>
            )}
            <div className="flex-1" />
            <p className="text-xs text-slate-500 truncate max-w-[140px]">{uname}</p>
          </div>
        </header>

        <PullToRefresh onRefresh={handleRefresh}>
          <motion.main key={screen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            {views[screen]}
          </motion.main>
        </PullToRefresh>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          <NavTab icon={Home} label="Home" active={screen==="Home"} onClick={()=>setScreen("Home")} />
          <NavTab icon={Users} label="Clients" active={screen==="Clients"} onClick={()=>setScreen("Clients")} />
          <NavTab icon={FileIcon} label="Quotes" active={screen==="Quotes"} onClick={()=>setScreen("Quotes")} badge={flaggedQuotes} />
          <NavTab icon={FileIcon} label="Notes" active={screen==="Notes"} onClick={()=>setScreen("Notes")} badge={(data.notes||[]).filter(n=>!n.completed&&n.reminder_date&&n.reminder_date<=todayISO()).length||0} />
          <NavTab icon={Settings} label="More" active={screen==="More"} onClick={()=>setScreen("More")} />
        </div>
      </nav>
    </div>
    </ErrorBoundary>
  );
}
