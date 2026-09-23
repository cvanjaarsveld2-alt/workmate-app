// ─── Reminder planning (pure, no I/O) ────────────────────────────────────────
// Works out which reminders fall due and when, in each person's own timezone.
// Kept free of Deno/Supabase APIs so it can be unit-tested with Node
// (tests/reminders-schedule.test.mjs).
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TZ = "Africa/Johannesburg";

export type Kind = "followup" | "digest" | "equipment" | "note";

export interface Reminder {
  key: string; // unique per delivery; claimed before sending so it goes out once
  kind: Kind;
  userId: string;
  fireAt: Date;
  title: string;
  body: string;
  url: string;
  tag: string; // same tag the app uses for on-device reminders, so a phone never shows both
  ttl: number; // seconds Apple/Google keep trying if the phone is offline
}

export interface FollowupRow {
  id: string;
  user_id: string | null;
  assigned_to_user_id: string | null;
  title: string | null;
  client: string | null;
  date: string | null;
  time: string | null;
  reminder: string | null;
  completed: boolean | null;
}
export interface EquipmentRow {
  id: string;
  user_id: string | null;
  assigned_to_user_id: string | null;
  name: string | null;
  make: string | null;
  model: string | null;
  service_due: string | null;
}
export interface NoteRow {
  id: string;
  user_id: string | null;
  assigned_to_user_id: string | null;
  client: string | null;
  note: string | null;
  urgency: string | null;
  resolve_by: string | null;
  resolved: boolean | null;
}

export function validTz(tz: string | null | undefined): string {
  try {
    if (tz) {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_TZ;
}

function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at.getTime();
}

// Local wall-clock time in `tz` -> UTC instant (second pass settles DST changes).
export function localToUtc(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - tzOffsetMs(tz, new Date(guess));
  ts = guess - tzOffsetMs(tz, new Date(ts));
  return new Date(ts);
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The calendar date it currently is for someone in `tz`.
export function localDate(tz: string, at: Date): string {
  return new Date(at.getTime() + tzOffsetMs(tz, at)).toISOString().slice(0, 10);
}

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);

// Codes the app offers (src/lib/constants.js REMINDER_OPTIONS) plus legacy codes found in data.
export function followupFireAt(date: string, time: string | null, reminder: string, tz: string): Date | null {
  const hhmm = /^\d{2}:\d{2}/.test(time || "") ? (time as string).slice(0, 5) : "09:00";
  const due = localToUtc(date, hhmm, tz);
  const minus = (mins: number) => new Date(due.getTime() - mins * 60_000);
  switch (reminder) {
    case "on_time": return due;
    case "15_before": case "15_min": return minus(15);
    case "30_before": case "30_min": return minus(30);
    case "1h_before": case "1_hour": return minus(60);
    case "2_hours": return minus(120);
    case "1d_before": case "1_day": return localToUtc(shiftDate(date, -1), "09:00", tz);
    case "2_days": return localToUtc(shiftDate(date, -2), "09:00", tz);
    case "morning": return localToUtc(date, "07:00", tz);
    default: return null; // "none" or unknown
  }
}

const target = (r: { assigned_to_user_id: string | null; user_id: string | null }) => r.assigned_to_user_id || r.user_id;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Every reminder whose fire time falls in (from, to]. The caller picks the window:
// a cron run looks back a few minutes, a preview looks ahead.
export function planReminders(
  input: { followups: FollowupRow[]; equipment: EquipmentRow[]; notes: NoteRow[] },
  tzOf: (userId: string) => string,
  from: Date,
  to: Date,
): Reminder[] {
  const out: Reminder[] = [];
  const inWindow = (t: Date) => t.getTime() > from.getTime() && t.getTime() <= to.getTime();

  // Follow-ups (calendar entries are follow-ups too) at their chosen reminder time.
  const openFollowups = input.followups.filter(f => !f.completed && isDate(f.date));
  for (const f of openFollowups) {
    const userId = target(f);
    if (!userId || !f.reminder || f.reminder === "none") continue;
    const fireAt = followupFireAt(f.date!.slice(0, 10), f.time, f.reminder, tzOf(userId));
    if (!fireAt || !inWindow(fireAt)) continue;
    const time = /^\d{2}:\d{2}/.test(f.time || "") ? f.time!.slice(0, 5) : null;
    out.push({
      key: `fu:${f.id}:${fireAt.toISOString()}`,
      kind: "followup",
      userId,
      fireAt,
      title: `⏰ Reminder: ${f.title || "Follow-up"}`,
      body: `${time ? `Due at ${time}` : "Due today"}${f.client ? ` — ${f.client}` : ""}`,
      url: "/?screen=Followups",
      tag: `fu_${f.id}`,
      ttl: 3600,
    });
  }

  // 07:00 local summary of today's follow-ups (was only scheduled on the device).
  const byUser = new Map<string, FollowupRow[]>();
  for (const f of openFollowups) {
    const userId = target(f);
    if (!userId) continue;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(f);
  }
  for (const [userId, list] of byUser) {
    const tz = tzOf(userId);
    // Every local date the window touches (a preview can span several days).
    const last = localDate(tz, to);
    for (let day = localDate(tz, from); day <= last; day = shiftDate(day, 1)) {
      const today = list.filter(f => f.date!.slice(0, 10) === day);
      if (!today.length) continue;
      const fireAt = localToUtc(day, "07:00", tz);
      if (!inWindow(fireAt)) continue;
      out.push({
        key: `digest:${userId}:${day}`,
        kind: "digest",
        userId,
        fireAt,
        title: "📋 PowerMate — Today's Follow-ups",
        body: `You have ${plural(today.length, "follow-up")} today.`,
        url: "/?screen=Followups",
        tag: "morning_summary",
        ttl: 4 * 3600,
      });
    }
  }

  // Equipment service: 3 days before and on the day, 09:00 local.
  for (const e of input.equipment) {
    const userId = target(e);
    if (!userId || !isDate(e.service_due)) continue;
    const due = e.service_due.slice(0, 10);
    const tz = tzOf(userId);
    const name = e.name || "Equipment";
    const warnAt = localToUtc(shiftDate(due, -3), "09:00", tz);
    if (inWindow(warnAt))
      out.push({
        key: `eq-warn:${e.id}:${due}`, kind: "equipment", userId, fireAt: warnAt,
        title: `⚠️ Service Due Soon: ${name}`, body: "Service due in 3 days.",
        url: "/?screen=Equipment", tag: `ew_${e.id}`, ttl: 4 * 3600,
      });
    const dueAt = localToUtc(due, "09:00", tz);
    if (inWindow(dueAt))
      out.push({
        key: `eq-due:${e.id}:${due}`, kind: "equipment", userId, fireAt: dueAt,
        title: `🔧 Service Due Today: ${name}`, body: `${e.make || ""} ${e.model || ""}`.trim() || "Service is due today.",
        url: "/?screen=Equipment", tag: `ed_${e.id}`, ttl: 4 * 3600,
      });
  }

  // Unresolved notes on their resolve-by date, 09:00 local.
  for (const n of input.notes) {
    const userId = target(n);
    if (!userId || n.resolved || !isDate(n.resolve_by)) continue;
    const day = n.resolve_by.slice(0, 10);
    const fireAt = localToUtc(day, "09:00", tzOf(userId));
    if (!inWindow(fireAt)) continue;
    const urg = n.urgency || "Normal";
    const emoji = urg === "Critical" ? "🚨" : urg === "Urgent" ? "⚠️" : "📌";
    out.push({
      key: `note:${n.id}:${day}`, kind: "note", userId, fireAt,
      title: `${emoji} Unresolved Note: ${n.client || "General"}`,
      body: (n.note || "").slice(0, 80) || "Due for resolution today.",
      url: "/?screen=Notes", tag: `note_${n.id}`, ttl: 4 * 3600,
    });
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

// How late a reminder may still go out when a cron run was missed or slow.
// Timed follow-ups stop mattering quickly; date-based ones are still useful later.
export const LOOKBACK_MINUTES: Record<Kind, number> = { followup: 10, digest: 120, equipment: 120, note: 120 };
export const MAX_LOOKBACK_MINUTES = Math.max(...Object.values(LOOKBACK_MINUTES));

export function dueNow(all: Reminder[], now: Date): Reminder[] {
  return all.filter(r => {
    const lateBy = (now.getTime() - r.fireAt.getTime()) / 60_000;
    return lateBy >= 0 && lateBy <= LOOKBACK_MINUTES[r.kind];
  });
}
