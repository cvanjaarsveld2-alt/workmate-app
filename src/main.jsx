import React from "react";
import { createRoot } from "react-dom/client";
// Self-hosted (CSP allows fonts from 'self' only) and cached for offline use underground.
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow/latin-800.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./index.css";
import "./darkMode.css";
import { initTheme } from "./lib/theme";
import PowerMateApp from "./App.jsx";

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
