// ─── Design tokens (single source of truth) ─────────────────────────────────
export { COLORS, TYPE, RADIUS, TAP, TAP_LG, SHEET_SPRING, SHEET_ANIM, statusColor } from "./tokens";

// ─── Brand ────────────────────────────────────────────────────────────────────
export const BRAND = {
  primary: "#8B1A1A",
  primaryDark: "#6B1414",
  light: "#F7F3F3",
  logo: "https://powerstart.eu/wp-content/uploads/2021/10/Power-Works-Logo.png",
};

// ─── Pipeline ─────────────────────────────────────────────────────────────────
export const PIPELINE_STAGES = [
  "New Lead",
  "Contacted",
  "Quoted",
  "Active",
  "Won",
  "Lost",
];

export const STAGE_COLORS = {
  "New Lead": { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
  Contacted:  { bg: "#F0FDF4", text: "#15803D", dot: "#22C55E" },
  Quoted:     { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
  Active:     { bg: "#FAF5FF", text: "#7E22CE", dot: "#A855F7" },
  Won:        { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
  Lost:       { bg: "#FFF1F2", text: "#BE123C", dot: "#F43F5E" },
};

// ─── Quotes ───────────────────────────────────────────────────────────────────
export const QUOTE_STATUS_COLORS = {
  Pending:  { bg: "#FFFBEB", text: "#B45309" },
  Accepted: { bg: "#F0FDF4", text: "#15803D" },
  Rejected: { bg: "#FFF1F2", text: "#BE123C" },
  Expired:  { bg: "#F8FAFC", text: "#64748B" },
};

// ─── Notes ────────────────────────────────────────────────────────────────────
export const NOTE_URGENCY = {
  Normal:   { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC", dot: "#22C55E" },
  Urgent:   { bg: "#FFFBEB", text: "#B45309", border: "#FCD34D", dot: "#F59E0B" },
  Critical: { bg: "#FFF1F2", text: "#BE123C", border: "#FCA5A5", dot: "#F43F5E" },
};

export const URGENCY_ESCALATION = {
  Normal: "Urgent",
  Urgent: "Critical",
  Critical: "Critical",
};

// ─── Reminders ────────────────────────────────────────────────────────────────
export const REMINDER_OPTIONS = [
  { value: "on_time",   label: "At time of follow-up" },
  { value: "15_before", label: "15 minutes before" },
  { value: "30_before", label: "30 minutes before" },
  { value: "1h_before", label: "1 hour before" },
  { value: "1d_before", label: "1 day before (9am)" },
  { value: "morning",   label: "Day-of morning (7am)" },
  { value: "none",      label: "No reminder" },
];

// ─── PIN ──────────────────────────────────────────────────────────────────────
// FIX #1 — These must match the keys PINScreens.jsx actually writes to storage.
// Previous values ("powermate_pin_hash" / "powermate_pin_unlocked") did not
// match what PINScreens.jsx used ("pm_pin_hash" / "pm_session_unlocked"),
// which meant logout() cleared the *wrong* keys — leaving the PIN and the
// unlocked session marker in storage. On the next page load the PIN screen
// was silently bypassed, giving access to the previous user's data.
export const PIN_KEY          = "pm_pin_hash";        // was "powermate_pin_hash"
export const PIN_UNLOCKED_KEY = "pm_session_unlocked"; // was "powermate_pin_unlocked"
export const PIN_ATTEMPTS_KEY = "pm_pin_attempts";
export const PIN_LOCKOUT_KEY  = "pm_pin_lockout_until";
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS   = 5 * 60 * 1000; // 5 minutes

// ─── Storage ──────────────────────────────────────────────────────────────────
// FIX: User-scoped storage key — prevents cross-account data bleed
export function localStorageKey(userId) {
  return userId ? `powermate_v2_data_${userId}` : "powermate_v2_data";
}
// Legacy constant kept for backward compat during migration
export const LOCAL_STORAGE_KEY = "powermate_v2_data";
export const MAX_FILE_SIZE_MB  = 50;
