// ─── Service plans (planned maintenance) ──────────────────────────────────────
// The database makes each service's job by itself (supabase/migrations/
// *_service_plans.sql, run daily). These helpers are for the screen: how
// often, what's due, and what the plans are worth. Tests in
// tests/service-plans.test.mjs.

export const FREQUENCIES = [
  { key: "1m", label: "Monthly", every_months: 1 },
  { key: "2m", label: "Every 2 months", every_months: 2 },
  { key: "3m", label: "Quarterly", every_months: 3 },
  { key: "4m", label: "Every 4 months", every_months: 4 },
  { key: "6m", label: "Every 6 months", every_months: 6 },
  { key: "12m", label: "Yearly", every_months: 12 },
  { key: "days", label: "Every … days", every_days: 30 },
];

export function frequencyKey(plan) {
  if (plan?.every_days) return "days";
  return FREQUENCIES.find(f => f.every_months === Number(plan?.every_months))?.key || "3m";
}

export function frequencyLabel(plan) {
  if (plan?.every_days) return Number(plan.every_days) === 7 ? "Weekly" : `Every ${plan.every_days} days`;
  const f = FREQUENCIES.find(x => x.every_months === Number(plan?.every_months));
  return f ? f.label : `Every ${plan?.every_months} months`;
}

export function visitsPerYear(plan) {
  if (plan?.every_days) return Math.round((365 / Number(plan.every_days)) * 10) / 10;
  return plan?.every_months ? 12 / Number(plan.every_months) : 0;
}

export function annualValue(plans) {
  return Math.round(
    (plans || []).filter(p => p.active !== false).reduce((s, p) => s + (Number(p.value) || 0) * visitsPerYear(p), 0) * 100,
  ) / 100;
}

const toDay = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const daysUntil = (date, today = new Date()) =>
  Math.round((new Date(String(date) + "T12:00:00") - new Date(toDay(today) + "T12:00:00")) / 86400000);

// "overdue", "due" (within the plan's lead time: its job exists or is about
// to), "later", or "paused".
export function dueStatus(plan, today = new Date()) {
  if (plan?.active === false) return "paused";
  const d = daysUntil(plan.next_due, today);
  if (d < 0) return "overdue";
  if (d <= Number(plan.lead_days ?? 7)) return "due";
  return "later";
}

// Form → row, with the checks the database would otherwise reject.
export function planFromForm(f, teamId) {
  const freq = FREQUENCIES.find(x => x.key === f.frequency) || FREQUENCIES[2];
  const days = Math.round(Number(f.every_days));
  const lead = Math.round(Number(f.lead_days));
  if (!String(f.title || "").trim()) return { error: "Give the plan a name, e.g. \"Quarterly service\"." };
  if (!f.client_id) return { error: "Choose the client." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.next_due || "")) return { error: "Choose the date of the next service." };
  if (freq.key === "days" && !(days >= 1 && days <= 730)) return { error: "Enter a number of days between 1 and 730." };
  if (!(lead >= 0 && lead <= 90)) return { error: "Make the job 0 to 90 days before the service." };
  if (f.ends_on && f.ends_on < f.next_due) return { error: "The end date is before the next service." };
  return {
    row: {
      team_id: teamId,
      client_id: f.client_id,
      equipment_id: f.equipment_id || null,
      title: String(f.title).trim().slice(0, 200),
      description: String(f.description || "").trim() || null,
      location: String(f.location || "").trim() || null,
      every_months: freq.key === "days" ? null : freq.every_months,
      every_days: freq.key === "days" ? days : null,
      next_due: f.next_due,
      lead_days: lead,
      assigned_to_user_id: f.assigned_to_user_id || null,
      value: Math.max(0, Math.round(Number(f.value || 0) * 100) / 100),
      ends_on: f.ends_on || null,
      active: f.active !== false,
    },
  };
}
