// ─── Technician locations ─────────────────────────────────────────────────────
// Shares where a technician is while they're clocked in, if their company
// switched it on (supabase/migrations/*_technician_locations.sql). A position
// is sent every few minutes, or sooner when they've moved. Nothing is shared
// when they're clocked out, and nothing is kept on the phone.
// Tests: tests/location.test.mjs.
import { useEffect, useState } from "react";

const CLOCK = "pm_running_clock";
const EVENT = "pm:clock";

// Called by useTimeEntries whenever the running clock changes.
export function publishClock(entry) {
  try {
    if (entry) localStorage.setItem(CLOCK, JSON.stringify({ id: entry.id, job_id: entry.job_id || null, started_at: entry.started_at }));
    else localStorage.removeItem(CLOCK);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // Not in a browser (tests), or storage off.
  }
}
export function readClock() {
  try {
    return JSON.parse(localStorage.getItem(CLOCK) || "null");
  } catch {
    return null;
  }
}

// Metres between two points.
export function distanceM(a, b) {
  const R = 6371000,
    rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Send this position? First one, every 3 minutes, or after moving 150 m
// (but not more than every 30 seconds). Rough fixes (> 1 km) are skipped.
export function shouldSend(last, pos, { everyMs = 180000, moveM = 150, minGapMs = 30000 } = {}) {
  if (!pos || !(pos.accuracy <= 1000)) return false;
  if (!last) return true;
  const gap = pos.at - last.at;
  if (gap >= everyMs) return true;
  return gap >= minGapMs && distanceM(last, pos) >= moveM;
}

export function useLocationSharing(supabase, { teamId, userId, allowed }) {
  const [clock, setClock] = useState(readClock);
  const [status, setStatus] = useState("off"); // off | sharing | denied
  useEffect(() => {
    const on = () => setClock(readClock());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const jobId = clock?.job_id || null;
  const clockedIn = !!clock;
  useEffect(() => {
    if (!allowed || !clockedIn || !teamId || !userId || !navigator.geolocation) {
      setStatus("off");
      return;
    }
    let last = null;
    setStatus("sharing");
    const watch = navigator.geolocation.watchPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp || Date.now() };
        if (!navigator.onLine || !shouldSend(last, pos)) return;
        last = pos;
        supabase
          .from("tech_locations")
          .insert({
            team_id: teamId,
            user_id: userId,
            lat: Math.round(pos.lat * 1e6) / 1e6,
            lng: Math.round(pos.lng * 1e6) / 1e6,
            accuracy_m: Math.round(pos.accuracy),
            job_id: jobId,
            recorded_at: new Date(pos.at).toISOString(),
          })
          .then(
            () => {},
            () => {},
          );
      },
      err => setStatus(err?.code === 1 ? "denied" : "sharing"),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 60000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [supabase, allowed, clockedIn, jobId, teamId, userId]);
  return status;
}

export function minutesAgo(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}
