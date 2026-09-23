// ─── Date Helpers ─────────────────────────────────────────────────────────────

// FIX #5 — Previously used new Date().toISOString().slice(0,10) which returns
// the UTC date. For South African users (UTC+2) this meant the function
// returned *yesterday's* date from 22:00–00:00 local time every night,
// causing follow-up and escalation checks to be wrong for 2 hours per day.
// Now uses the local calendar date so it matches what the user sees on screen.
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function niceDate(d) {
  if (!d) d = new Date();
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function smartDate(ds) {
  if (!ds) return "";
  const d = new Date(ds + "T12:00:00");
  const t = new Date(todayISO() + "T12:00:00");
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0)  return "Today";
  if (diff === 1)  return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1  && diff <= 7)  return d.toLocaleDateString("en-GB", { weekday: "long" });
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} days ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysDiff(ds) {
  if (!ds) return null;
  return Math.round(
    (new Date(ds + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000
  );
}

// ─── Currency ─────────────────────────────────────────────────────────────────
export function formatCurrency(v) {
  return "R " + parseFloat(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 });
}

// ─── ID Generation ────────────────────────────────────────────────────────────
export function genId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Image Helpers ────────────────────────────────────────────────────────────
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file, maxWidth = 1600, quality = 0.78) {
  // FIX #14 — Videos must NOT be base64-encoded here; they can be 100MB+.
  // Callers that need to upload video should use uploadPhotoToSupabase directly
  // with the raw File object (the storage SDK accepts Blob/File).
  // We still fall back for non-image types other than video so nothing breaks.
  if (file.type.startsWith("video/")) {
    console.warn("[compress] Video passed to compressImage — return null so caller uploads raw.");
    return null; // caller must handle null and upload the File directly
  }
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(fileToBase64(file)); };
    img.src = url;
  });
}

// ─── Supabase Storage Upload ──────────────────────────────────────────────────
import { supabase } from "../supabase";

export async function uploadPhotoToSupabase(base64OrFile, path) {
  try {
    if (import.meta.env.DEV) console.log("[Photo] Starting upload to path:", path);

    // powermate-media policies require the first path segment to be the
    // authenticated user's UUID. Normalize legacy caller paths here so every
    // media upload follows the same secure layout.
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId || !path) return null;
    const cleanPath = String(path).replace(/^\/+/, "");
    const storagePath = cleanPath === userId || cleanPath.startsWith(`${userId}/`)
      ? cleanPath
      : `${userId}/${cleanPath}`;

    let blob;
    let mimeType = "image/jpeg";

    if (base64OrFile instanceof File || base64OrFile instanceof Blob) {
      // Direct file upload (e.g. video) — no base64 conversion needed
      blob = base64OrFile;
      mimeType = base64OrFile.type || mimeType;
    } else {
      // base64 data URL
      const base64 = base64OrFile;
      if (!base64 || !base64.startsWith("data:")) {
        console.warn("[Photo] Invalid base64 data — skipping upload");
        return null;
      }
      const parts      = base64.split(",");
      const mimeMatch  = parts[0].match(/:(.*?);/);
      mimeType         = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const byteString = atob(parts[1]);
      const byteArray  = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([byteArray], { type: mimeType });
    }

    if (import.meta.env.DEV) console.log("[Photo] Blob created:", blob.size, "bytes,", mimeType);

    const { error } = await supabase.storage
      .from("powermate-media")
      .upload(storagePath, blob, { upsert: true, contentType: mimeType });

    if (error) {
      console.error("[Photo] Upload error:", error.message, error.statusCode, error);
      return null;
    }

    const { data, error: urlError } = await supabase.storage
      .from("powermate-media")
      .createSignedUrl(storagePath, 7 * 24 * 60 * 60);
    if (urlError || !data?.signedUrl) {
      console.error("[Photo] Signed URL error:", urlError);
      return null;
    }
    if (import.meta.env.DEV) console.log("[Photo] Upload success; signed URL created");
    return data.signedUrl;
  } catch (e) {
    console.error("[Photo] Upload exception:", e?.message || e);
    return null;
  }
}

// Durable media helpers. Private Storage URLs are intentionally short-lived;
// persisted records retain the object path so a fresh signed URL can be generated on display.
export function storagePathFromSignedUrl(value, bucket = "powermate-media") {
  if (!value || typeof value !== "string" || !value.includes("/storage/v1/object/")) return null;
  try {
    const u = new URL(value);
    for (const kind of ["sign", "authenticated"]) {
      const marker = `/storage/v1/object/${kind}/${bucket}/`;
      const i = u.pathname.indexOf(marker);
      if (i >= 0) return decodeURIComponent(u.pathname.slice(i + marker.length));
    }
  } catch {}
  return null;
}
export async function createFreshMediaUrl(stored, bucket = "powermate-media") {
  const path = typeof stored === "string"
    ? storagePathFromSignedUrl(stored, bucket) || (stored.includes("/") && !stored.startsWith("http") ? stored : null)
    : stored?.storage_path || stored?.path || storagePathFromSignedUrl(stored?.url, bucket);
  if (!path) return typeof stored === "string" ? stored : stored?.url || null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
export async function uploadPhotoToSupabaseWithPath(base64OrFile, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  const { data: { session } = {} } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId || !cleanPath) return null;
  const durablePath = cleanPath === userId || cleanPath.startsWith(`${userId}/`)
    ? cleanPath
    : `${userId}/${cleanPath}`;

  // Upload once and return both the durable object path and the temporary
  // display URL. Callers MUST persist storage_path, never the signed URL.
  const url = await uploadPhotoToSupabase(base64OrFile, durablePath);
  if (!url) return null;
  return { url, path: durablePath };
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
// Events that can't be sent (offline, network error) are kept in a small
// localStorage buffer and flushed on the next successful send or when the
// device comes back online, so crashes in the field still reach the events
// table. Each buffered event remembers its user and is only sent under that
// user's session, because the insert trigger stamps user_id from auth.uid().
const EVENT_BUFFER_KEY = "powermate_event_buffer";
const EVENT_BUFFER_MAX = 50;
const EVENT_DATA_MAX = 15000; // events_set_owner_and_validate rejects > 20000

function readEventBuffer() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENT_BUFFER_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeEventBuffer(list) {
  try {
    if (list.length) localStorage.setItem(EVENT_BUFFER_KEY, JSON.stringify(list.slice(-EVENT_BUFFER_MAX)));
    else localStorage.removeItem(EVENT_BUFFER_KEY);
  } catch {}
}

function buildEventRow(name, data, userId) {
  let payload = { ...data, build: import.meta.env.VITE_BUILD_SHA || "dev" };
  if (JSON.stringify(payload).length > EVENT_DATA_MAX)
    payload = { truncated: true, build: payload.build, message: String(data?.message || "").slice(0, 1000) };
  return {
    name: String(name).slice(0, 200),
    data: payload,
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    user_id: userId || null,
  };
}

async function currentUserId() {
  const { data: { session } = {} } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

let flushing = false;
export async function flushEventBuffer() {
  if (flushing || !navigator.onLine) return;
  const buffered = readEventBuffer();
  if (!buffered.length) return;
  flushing = true;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const mine = buffered.filter(e => e.user_id === userId);
    if (!mine.length) return;
    const { error } = await supabase.from("events").insert(mine);
    if (error) return;
    const sentKeys = new Set(mine.map(e => `${e.timestamp}|${e.name}`));
    writeEventBuffer(readEventBuffer().filter(e => !sentKeys.has(`${e.timestamp}|${e.name}`)));
  } catch {
    // stays buffered for the next attempt
  } finally {
    flushing = false;
  }
}

export async function logEvent(name, data = {}) {
  if (import.meta.env.DEV) console.log("[PowerMate]", name, data);
  let row = null;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    row = buildEventRow(name, data, userId);
    if (!navigator.onLine) throw new Error("offline");
    const { error } = await supabase.from("events").insert(row);
    if (error) throw error;
    flushEventBuffer();
  } catch (e) {
    if (row) writeEventBuffer([...readEventBuffer(), row]);
    if (e?.message !== "offline") console.warn("[PowerMate] Telemetry failed:", e?.message);
  }
}

// Error reporting: same pipeline as logEvent, deduplicated and capped per page
// load so a render loop or a repeating rejection can't flood the table.
const reportedErrors = new Set();
const MAX_ERROR_REPORTS = 20;
export function reportError(name, error, extra = {}) {
  try {
    const message = String(error?.message || error || "unknown").slice(0, 1000);
    const signature = `${name}|${message}`;
    if (reportedErrors.has(signature) || reportedErrors.size >= MAX_ERROR_REPORTS) return;
    reportedErrors.add(signature);
    logEvent(name, {
      message,
      stack: String(error?.stack || "").slice(0, 2000),
      path: typeof location !== "undefined" ? location.pathname + location.hash : "",
      online: navigator.onLine,
      ...extra,
    });
  } catch {}
}

let globalHandlersInstalled = false;
export function installGlobalErrorReporting() {
  if (globalHandlersInstalled || typeof window === "undefined") return;
  globalHandlersInstalled = true;
  window.addEventListener("error", event => {
    // Resource load failures (img/script) have no error object; skip those.
    if (!event.error && !event.message) return;
    reportError("window_error", event.error || event.message, {
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
  });
  window.addEventListener("unhandledrejection", event => {
    reportError("unhandled_rejection", event.reason);
  });
  window.addEventListener("online", () => flushEventBuffer());
  // Send anything captured during the previous session.
  setTimeout(() => flushEventBuffer(), 5000);
}
