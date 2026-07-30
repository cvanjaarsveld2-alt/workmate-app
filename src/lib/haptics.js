// ─── Haptics ─────────────────────────────────────────────────────────────────
// Tasteful vibration feedback so the app feels physical on mobile.
// No-ops silently where unsupported. Respects a per-user opt-out.
// ─────────────────────────────────────────────────────────────────────────────
function canVibrate() { return typeof navigator !== "undefined" && "vibrate" in navigator; }
function enabled() { try { return localStorage.getItem("pm_haptics_off") !== "1"; } catch { return true; } }
function buzz(p) { if (!canVibrate() || !enabled()) return; try { navigator.vibrate(p); } catch {} }

export const haptic = {
  light:   () => buzz(10),
  medium:  () => buzz(20),
  success: () => buzz([15, 40, 25]),
  warning: () => buzz([30, 50, 30]),
  error:   () => buzz([50, 60, 50, 60]),
  tick:    () => buzz(8),
};
export function setHapticsEnabled(on) {
  try { on ? localStorage.removeItem("pm_haptics_off") : localStorage.setItem("pm_haptics_off","1"); } catch {}
}
export function hapticsEnabled() { return enabled(); }
