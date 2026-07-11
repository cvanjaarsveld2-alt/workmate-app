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
    console.log("[Photo] Starting upload to path:", path);

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

    console.log("[Photo] Blob created:", blob.size, "bytes,", mimeType);

    const { error } = await supabase.storage
      .from("powermate-media")
      .upload(path, blob, { upsert: true, contentType: mimeType });

    if (error) {
      console.error("[Photo] Upload error:", error.message, error.statusCode, error);
      return null;
    }

    const { data } = supabase.storage.from("powermate-media").getPublicUrl(path);
    console.log("[Photo] Upload success! URL:", data.publicUrl);
    return data.publicUrl;
  } catch (e) {
    console.error("[Photo] Upload exception:", e?.message || e);
    return null;
  }
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
export async function logEvent(name, data = {}) {
  console.log("[PowerMate]", name, data);
  if (!navigator.onLine) return;
  try {
    await supabase.from("events").insert({
      name,
      data,
      timestamp:  new Date().toISOString(),
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    console.warn("[PowerMate] Telemetry failed:", e?.message);
  }
}
