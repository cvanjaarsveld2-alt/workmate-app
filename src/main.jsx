import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./darkMode.css";
import { initTheme } from "./lib/theme";
import PowerMateApp from "./App.jsx";

// One-time cache migration for users who still have an older PowerMate service worker.
// The dashboard identity/count fixes are code-level changes, but an older service
// worker can keep an old index/chunk alive. Clear that old shell once, online only,
// then reload so the browser starts from the current production build.
if ("serviceWorker" in navigator && navigator.onLine) {
  try {
    const key = "powermate_cache_migration_v16";
    if (localStorage.getItem(key) !== "1") {
      localStorage.setItem(key, "1");
      Promise.all([
        navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))),
        caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("powermate-")).map(k => caches.delete(k))))
      ]).finally(() => window.location.reload());
    }
  } catch {
    // Continue normally if cache APIs are unavailable.
  }
}

// Vite emits a preloadError when a long-lived tab asks for a lazy chunk from
// an older deployment. Reload once so the browser receives the current HTML
// and its current hashed chunk names instead of leaving the user on a broken
// lazy route. The session guard prevents an infinite reload loop.
window.addEventListener("vite:preloadError", (event) => {
  try {
    event.preventDefault();
    if (!navigator.onLine) return;
    const key = "powermate_chunk_reload_at";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  } catch {
    // Let the normal React error boundary handle unexpected failures.
  }
});

// Apply the saved theme (and start following the system for "auto") before the
// first paint, so there's no flash of the wrong theme on load.
initTheme();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PowerMateApp />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", {
      updateViaCache: "none",
    }).catch(console.error);
  });
}
