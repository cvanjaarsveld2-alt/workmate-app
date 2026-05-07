import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, Check } from "lucide-react";

export default function SyncStatusBadge({ isOnline, pendingCount = 0, syncing = false }) {
  let bg = "#15803D";
  let text = "Online";
  let Icon = Wifi;

  if (syncing) {
    bg = "#7C3AED";
    text = "Syncing…";
    Icon = RefreshCw;
  } else if (!isOnline) {
    bg = "#B91C1C";
    text = "Offline";
    Icon = WifiOff;
  } else if (pendingCount > 0) {
    bg = "#B45309";
    text = `${pendingCount} pending`;
    Icon = RefreshCw;
  } else {
    Icon = Check;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, y: -8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 9999,
          background: bg,
          color: "white",
          padding: "6px 12px",
          borderRadius: "999px",
          fontSize: 11,
          fontWeight: 700,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          letterSpacing: "0.02em",
        }}
      >
        <Icon size={12} style={syncing ? { animation: "spin 1s linear infinite" } : {}} />
        {text}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    </AnimatePresence>
  );
}
