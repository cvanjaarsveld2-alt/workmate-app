// ─── Theme (Light / Dark / Auto) ──────────────────────────────────────────────
// Manages the app's colour theme. Adds/removes a `dark` class on <html>, which
// the dark-mode stylesheet (src/darkMode.css) uses to remap colours. The choice
// is persisted in localStorage. "auto" follows the device's system setting and
// updates live when the system flips.
//
// Kept deliberately tiny and side-effect-safe so it can't crash the app: every
// DOM/storage access is guarded.

const KEY = "pm_theme"; // "light" | "dark" | "auto"

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

// Returns whether dark should currently be active for a given mode.
export function resolveIsDark(mode) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemPrefersDark(); // auto
}

// Apply a theme mode: toggle the <html> class and persist the choice.
export function applyTheme(mode) {
  try {
    const root = document.documentElement;
    if (resolveIsDark(mode)) root.classList.add("dark");
    else root.classList.remove("dark");
  } catch {}
  try { localStorage.setItem(KEY, mode); } catch {}
}

// Call once at startup: applies the stored theme and, for "auto", keeps it in
// sync when the system setting changes. Returns a cleanup function.
export function initTheme() {
  const mode = getStoredTheme();
  applyTheme(mode);

  let mql;
  try {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      // Only react to system changes when the user is on "auto".
      if (getStoredTheme() === "auto") applyTheme("auto");
    };
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else if (mql.addListener) mql.addListener(onChange); // older Safari
    return () => {
      try {
        if (mql.removeEventListener) mql.removeEventListener("change", onChange);
        else if (mql.removeListener) mql.removeListener(onChange);
      } catch {}
    };
  } catch {
    return () => {};
  }
}
