import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import PowerMateApp from "./App.jsx";

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
