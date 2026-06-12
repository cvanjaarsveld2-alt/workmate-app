// ─── Sync Status Badge ────────────────────────────────────────────────────────
// Minimal connection/sync indicator. Philosophy: invisible when all is well.
//   · Online + synced      → nothing (briefly shows "Back online" after reconnect)
//   · Syncing / pending    → tiny pill with spinner and count
//   · Offline              → tiny persistent pill
// Sits bottom-center, just above the nav bar, clear of the FAB stack.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, CloudOff, Check } from "lucide-react";

export default function SyncStatusBadge({ isOnline, pendingCount, syncing }) {
  const [justReconnected, setJustReconnected] = useState(false);
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    const wasOffline = !prevOnline.current;
    prevOnline.current = isOnline;
    if (isOnline && wasOffline) {
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  let content = null;

  if (!isOnline) {
    content = (
      <span key="offline" className="flex items-center gap-1.5">
        <CloudOff size={11} className="text-amber-600" />
        <span>Offline · saving locally</span>
      </span>
    );
  } else if (syncing || pendingCount > 0) {
    content = (
      <span key="syncing" className="flex items-center gap-1.5">
        <RefreshCw size={11} className="animate-spin text-slate-400" />
        <span>Syncing{pendingCount > 0 ? ` ${pendingCount}` : ""}…</span>
      </span>
    );
  } else if (justReconnected) {
    content = (
      <span key="reconnected" className="flex items-center gap-1.5">
        <Check size={11} className="text-green-600" />
        <span>Back online</span>
      </span>
    );
  }

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="fixed left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)" }}>
          <div
            className="rounded-full bg-white/95 backdrop-blur px-3 py-1 text-[11px] font-bold text-slate-500"
            style={{
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
            }}>
            {content}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
