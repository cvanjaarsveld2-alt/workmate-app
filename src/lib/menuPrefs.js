// ─── Per-person menu ──────────────────────────────────────────────────────────
// Each teammate chooses which screens appear in their menu. The choice is kept
// on this device (so it works offline and applies instantly) and on their user
// record (users.hidden_screens via set_my_hidden_screens), so it follows them
// to any phone they sign in on. A change made offline is sent when back online.
import { supabase } from "../supabase";

// Never hideable: the way home, and the way back into settings.
export const ALWAYS_SHOWN = new Set(["Home", "More"]);

const localKey = uid => `pm_hidden_screens__${uid}`;
const pendingKey = uid => `pm_hidden_screens_pending__${uid}`;

export function readHiddenScreens(uid) {
  if (!uid) return [];
  try {
    const list = JSON.parse(localStorage.getItem(localKey(uid)) || "[]");
    return Array.isArray(list) ? list.filter(k => typeof k === "string" && !ALWAYS_SHOWN.has(k)) : [];
  } catch {
    return [];
  }
}

function writeLocal(uid, list) {
  try {
    localStorage.setItem(localKey(uid), JSON.stringify(list));
  } catch {}
}

export async function pushHiddenScreens(uid) {
  if (!uid || !navigator.onLine) return false;
  try {
    if (localStorage.getItem(pendingKey(uid)) !== "1") return true;
  } catch {}
  const { error } = await supabase.rpc("set_my_hidden_screens", { p_screens: readHiddenScreens(uid) });
  if (error) return false;
  try {
    localStorage.removeItem(pendingKey(uid));
  } catch {}
  return true;
}

export async function saveHiddenScreens(uid, list) {
  const clean = [...new Set(list)].filter(k => !ALWAYS_SHOWN.has(k)).sort();
  writeLocal(uid, clean);
  try {
    localStorage.setItem(pendingKey(uid), "1");
  } catch {}
  pushHiddenScreens(uid).catch(() => {});
  return clean;
}

// On sign-in: send a change still waiting from offline, otherwise adopt the
// choice saved on the user record (e.g. made on another phone).
export async function syncHiddenScreens(uid) {
  if (!uid) return [];
  let pending = false;
  try {
    pending = localStorage.getItem(pendingKey(uid)) === "1";
  } catch {}
  if (pending) {
    await pushHiddenScreens(uid).catch(() => {});
    return readHiddenScreens(uid);
  }
  if (!navigator.onLine) return readHiddenScreens(uid);
  const { data, error } = await supabase.from("users").select("hidden_screens").eq("id", uid).maybeSingle();
  if (error || !data) return readHiddenScreens(uid);
  const list = (Array.isArray(data.hidden_screens) ? data.hidden_screens : []).filter(
    k => !ALWAYS_SHOWN.has(k),
  );
  writeLocal(uid, list);
  return list;
}
