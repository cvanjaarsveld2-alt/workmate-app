// ─── Machine Jack Confirmations ────────────────────────────────────────────
// Site-confirmed jack data (closed height / explicit jack override list /
// stand / note) for a specific machine, stored in Supabase so anyone on the
// team can fill it in from the app itself — no code change or redeploy
// needed. The Jack Selector screen fetches this table and merges it on top
// of the static catalogue in machineData.js at read time (see applyConfirmation
// below); a confirmed row always wins over the automatic estimate.
//
// Reading falls back to a small local cache so previously-confirmed fits are
// still visible offline. SAVING a confirmation does need a connection — this
// is a low-frequency admin/technician action, not a field form the app
// guarantees works offline the way vehicle checks or jobs do.
import { supabase } from "../supabase";

const CACHE_KEY = "pw_jack_confirmations_cache_v1";
const TABLE = "machine_jack_confirmations";

export const keyFor = (brand, model) => `${brand}::${model}`;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
  catch { return {}; }
}
function writeCache(map) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); }
  catch { /* storage full/unavailable — the cache is best-effort, never load-bearing */ }
}

// Fetch every confirmation visible to the current user (own + team, per RLS)
// as a { "brand::model": row } map. Falls back to the last-cached copy if the
// request fails (e.g. offline) so the screen still shows what's known.
export async function fetchJackConfirmations() {
  try {
    const { data, error } = await supabase.from(TABLE).select("*");
    if (error) throw error;
    const map = {};
    for (const row of data || []) map[keyFor(row.brand, row.model)] = row;
    writeCache(map);
    return map;
  } catch (e) {
    console.warn("[jackConfirmations] fetch failed, using cached copy:", e?.message || e);
    return readCache();
  }
}

// Insert or update the confirmation for one machine. Throws on failure (e.g.
// offline) — the caller shows that to the user rather than pretending it saved.
export async function saveJackConfirmation({ id, userId, teamId, brand, model, closedHeight, jackOverrides, jackStand, note }) {
  const payload = {
    user_id: userId,
    team_id: teamId || null,
    brand, model,
    closed_height: closedHeight === "" || closedHeight == null ? null : Number(closedHeight),
    jack_overrides: Array.isArray(jackOverrides) && jackOverrides.length ? jackOverrides : null,
    jack_stand: jackStand?.trim() || null,
    note: note?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase.from(TABLE).update(payload).eq("id", id)
    : supabase.from(TABLE).insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Remove a confirmation, reverting that machine to the automatic estimate.
export async function deleteJackConfirmation(id) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// Merge a confirmed row onto a static catalogue machine. Anything the crew
// hasn't confirmed yet is left exactly as machineData.js defines it — this
// only ever ADDS certainty, never removes the site-measured/none-guessed
// fields that are already there.
export function applyConfirmation(machine, confirmation) {
  if (!confirmation) return machine;
  return {
    ...machine,
    closedHeight: confirmation.closed_height ?? machine.closedHeight,
    jackOverrides: confirmation.jack_overrides?.length ? confirmation.jack_overrides : machine.jackOverrides,
    jackStand: confirmation.jack_stand ?? machine.jackStand,
    note: confirmation.note ?? machine.note,
    _confirmation: confirmation,
  };
}
