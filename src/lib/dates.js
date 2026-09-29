// ─── Calendar dates (YYYY-MM-DD) ──────────────────────────────────────────────
// Plain date strings in the phone's own time zone. toISOString() gives the UTC
// date, which in South Africa is still "yesterday" between 22:00 and midnight.

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(isoDate, days) {
  const d = new Date(String(isoDate || todayISO()).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Whole days from one date to another (negative if `to` is earlier).
export const daysBetween = (from, to) =>
  Math.round((new Date(String(to).slice(0, 10) + "T12:00:00") - new Date(String(from).slice(0, 10) + "T12:00:00")) / 86400000);
