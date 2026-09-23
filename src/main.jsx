import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./darkMode.css";
import { initTheme } from "./lib/theme";
import PowerMateApp from "./App.jsx";
import { installGlobalErrorReporting, logEvent } from "./lib/helpers";
import { requestPersistentStorage } from "./offline/offlineDb";

// Uncaught errors and promise rejections go to the events table (buffered offline).
installGlobalErrorReporting();

// Keep the offline queue safe from browser storage eviction; report devices
// where the browser refuses, since their unsynced changes are at risk.
requestPersistentStorage().then(status => {
  if (status.supported && !status.persisted) setTimeout(() => logEvent("storage_not_persistent", status), 10000);
});

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
