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

// Vite emits a preloadError when a lazy screen's file can't be loaded: either
// a long-lived tab asking for a chunk from an older deployment, or the device
// is offline and the file isn't cached. When online, reload once so the
// browser gets the current HTML and chunk names; the session guard prevents a
// reload loop. Only cancel the event when actually reloading: a cancelled
// preloadError makes Vite resolve the import with undefined, which surfaced as
// "undefined is not an object (evaluating 'm.QuotesScreen')" offline. Left
// alone, the error reaches the screen's error boundary with a clear message.
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (!navigator.onLine) return;
    const key = "powermate_chunk_reload_at";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
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
