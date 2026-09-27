// ─── Timesheets ───────────────────────────────────────────────────────────────
// Clocking in and out (supabase/migrations/*_timesheets.sql). Entries are made
// on the phone and synced like jobs, so they work with no signal. Pure helpers
// here; tests in tests/timesheets.test.mjs.
import { neutralizeFormula } from "./csv.js";

const MAX_MS = 24 * 60 * 60 * 1000;

export function newEntry({ id, userId, teamId = null, job = null, kind = "work", now = new Date() }) {
  return {
    id: id || crypto.randomUUID(),
    user_id: userId,
    team_id: teamId,
    job_id: job?.id || null,
    client_id: job?.client_id || null,
    kind,
    started_at: now.toISOString(),
    ended_at: null,
    note: null,
    billable: kind === "work",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

// Ending an entry: never before it started, never longer than 24 hours
// (someone forgot to clock out).
export function stopEntry(entry, now = new Date()) {
  const start = new Date(entry.started_at).getTime();
  const end = Math.min(Math.max(now.getTime(), start), start + MAX_MS);
  return { ...entry, ended_at: new Date(end).toISOString(), updated_at: now.toISOString() };
}

export function entryMinutes(e, now = new Date()) {
  const start = new Date(e.started_at).getTime();
  const end = e.ended_at ? new Date(e.ended_at).getTime() : Math.min(now.getTime(), start + MAX_MS);
  return Number.isFinite(start) && end > start ? Math.round((end - start) / 60000) : 0;
}

export const runningEntry = (entries, userId) =>
  (entries || [])
    .filter(e => e.user_id === userId && !e.ended_at)
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0] || null;

export function totals(entries, now = new Date()) {
  const t = { work: 0, travel: 0, billable: 0, all: 0 };
  for (const e of entries || []) {
    const m = entryMinutes(e, now);
    t.all += m;
    if (e.kind === "travel") t.travel += m;
    else t.work += m;
    if (e.billable !== false && e.kind !== "travel") t.billable += m;
  }
  return t;
}

export const fmtMinutes = m => {
  const h = Math.floor((m || 0) / 60),
    mm = String((m || 0) % 60).padStart(2, "0");
  return `${h} h ${mm}`;
};
export const hours = m => Math.round(((m || 0) / 60) * 100) / 100;

// Billable time on a job → one invoice line at the labour rate (excl. VAT).
export function labourLines(entries, jobId, rate) {
  const m = totals((entries || []).filter(e => e.job_id === jobId && e.ended_at)).billable;
  if (!m || !(Number(rate) > 0)) return [];
  return [{ description: `Labour (${hours(m)} h)`, qty: hours(m), unitPrice: Number(rate), kind: "labour" }];
}

// Monday 00:00 of the week containing d, local time.
export function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const localDay = iso => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function inRange(entries, from, to) {
  return (entries || []).filter(e => {
    const t = new Date(e.started_at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
}

export function byDay(entries) {
  const out = new Map();
  for (const e of [...(entries || [])].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))) {
    const k = localDay(e.started_at);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
  }
  return out;
}

const time = iso => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// For payroll: one row per entry.
export function timesheetCsv(entries, { people = new Map(), jobs = new Map() } = {}) {
  const cell = v => {
    const s = neutralizeFormula(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Person", "Date", "Start", "End", "Hours", "Type", "Job", "Billable", "Note"]];
  for (const e of [...(entries || [])].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))))
    rows.push([
      people.get(e.user_id) || e.user_id,
      localDay(e.started_at),
      time(e.started_at),
      e.ended_at ? time(e.ended_at) : "",
      hours(entryMinutes(e)),
      e.kind === "travel" ? "Travel" : "Work",
      jobs.get(e.job_id) || "",
      e.billable === false || e.kind === "travel" ? "No" : "Yes",
      e.note || "",
    ]);
  return rows.map(r => r.map(cell).join(",")).join("\r\n");
}
