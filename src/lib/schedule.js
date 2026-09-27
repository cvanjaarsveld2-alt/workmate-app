// ─── Scheduling & dispatch ────────────────────────────────────────────────────
// Who does which job when: lanes per technician for a day, a week grid, and
// the jobs still waiting for a date. Pure helpers; tests in
// tests/schedule.test.mjs.

export const isOpen = j => !["completed", "cancelled"].includes(j?.status);

export const dayKey = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export function addDays(key, n) {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// Monday of the week containing the day.
export function mondayOf(key) {
  const d = new Date(key + "T12:00:00");
  return addDays(key, -((d.getDay() + 6) % 7));
}

export const weekDays = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const byTime = (a, b) =>
  String(a.scheduled_time || "99").localeCompare(String(b.scheduled_time || "99")) ||
  String(a.job_number || "").localeCompare(String(b.job_number || ""));

export const unscheduled = jobs => (jobs || []).filter(j => isOpen(j) && !j.scheduled_date);

// Open jobs whose date has passed.
export const overdue = (jobs, today) =>
  (jobs || []).filter(j => isOpen(j) && j.scheduled_date && j.scheduled_date < today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

// One lane per technician (plus "Not assigned") with that day's jobs.
export function lanes(jobs, members, day) {
  const today = (jobs || []).filter(j => j.scheduled_date === day && j.status !== "cancelled").sort(byTime);
  const known = new Set(members.map(m => m.user_id));
  const out = [
    { user_id: null, name: "Not assigned", jobs: today.filter(j => !j.assigned_to_user_id || !known.has(j.assigned_to_user_id)) },
    ...members.map(m => ({ user_id: m.user_id, name: m.full_name || m.email || "Technician", jobs: today.filter(j => j.assigned_to_user_id === m.user_id) })),
  ];
  return out;
}

// Week grid: jobs per technician per day.
export function weekGrid(jobs, members, monday) {
  const days = weekDays(monday);
  return lanes([], members, "").map(l => ({
    ...l,
    days: days.map(day =>
      (jobs || [])
        .filter(j => j.scheduled_date === day && j.status !== "cancelled")
        .filter(j => (l.user_id ? j.assigned_to_user_id === l.user_id : !j.assigned_to_user_id || !members.some(m => m.user_id === j.assigned_to_user_id)))
        .sort(byTime),
    ),
  }));
}

// What changes on a job when it's dispatched.
export function assignment(job, { date, time, userId, members }) {
  const m = members.find(x => x.user_id === userId);
  return {
    ...job,
    scheduled_date: date || null,
    scheduled_time: date && time ? (time.length === 5 ? `${time}:00` : time) : null,
    assigned_to_user_id: userId || null,
    assigned_to: m ? m.full_name || m.email || "" : "",
    status: job.status === "draft" && date ? "scheduled" : job.status,
  };
}

export function onMyWayMessage({ contact, company, technician, job, minutes }) {
  const eta = Number(minutes) > 0 ? ` I should be there in about ${minutes} minutes.` : "";
  const what = job?.title ? ` for ${job.title}` : "";
  return `Hi ${contact || "there"}, this is ${technician || "your technician"} from ${company || "us"}. I'm on my way${what}.${eta}`;
}
