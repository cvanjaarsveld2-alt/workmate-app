// ─── Haptics ─────────────────────────────────────────────────────────────────
// Tiny, tasteful vibration feedback. Makes the app feel physical on mobile.
// Silently no-ops on devices/browsers without vibration (e.g. desktop, iOS Safari
// in some contexts) — never throws.
// ─────────────────────────────────────────────────────────────────────────────

function canVibrate() {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

// Respect a user opt-out stored in localStorage
function enabled() {
  try { return localStorage.getItem("pm_haptics_off") !== "1"; }
  catch { return true; }
}

function buzz(pattern) {
  if (!canVibrate() || !enabled()) return;
  try { navigator.vibrate(pattern); } catch {}
}

export const haptic = {
  // Light tap — selection, toggle, tab change
  light:   () => buzz(10),
  // Medium — button press, item added
  medium:  () => buzz(20),
  // Success — save complete, follow-up done
  success: () => buzz([15, 40, 25]),
  // Warning — validation error, needs attention
  warning: () => buzz([30, 50, 30]),
  // Error — action failed
  error:   () => buzz([50, 60, 50, 60]),
  // Selection tick — picker / stepper
  tick:    () => buzz(8),
};

export function setHapticsEnabled(on) {
  try {
    if (on) localStorage.removeItem("pm_haptics_off");
    else    localStorage.setItem("pm_haptics_off", "1");
  } catch {}
}

export function hapticsEnabled() {
  return enabled();
}
