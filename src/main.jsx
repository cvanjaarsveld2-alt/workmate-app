import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./darkMode.css";
import { initTheme } from "./lib/theme";
import PowerMateApp from "./App.jsx";

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
    navigator.serviceWorker.register("/service-worker.js").catch(console.error);
  });
}
