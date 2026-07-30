// ─── PullToRefresh ───────────────────────────────────────────────────────────
// The universal mobile gesture: drag down from the top of a list to sync.
// Wraps screen content. Only activates when the page is scrolled to the top,
// so it never fights normal scrolling.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { BRAND } from "../lib/constants";
import { haptic } from "../lib/haptics";

const THRESHOLD = 70;   // px of pull needed to trigger
const MAX_PULL  = 110;  // resistance cap

export function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull]           = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY   = useRef(null);
  const armed    = useRef(false); // only start tracking if touch began at scrollTop 0

  function onTouchStart(e) {
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
      armed.current = true;
    } else {
      armed.current = false;
    }
  }

  function onTouchMove(e) {
    if (!armed.current || refreshing || startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPull(0); return; }
    // Resistance curve — gets harder the further you pull
    const eased = Math.min(MAX_PULL, dy * 0.5);
    setPull(eased);
    if (eased >= THRESHOLD && pull < THRESHOLD) haptic.tick();
  }

  async function onTouchEnd() {
    if (!armed.current) return;
    armed.current = false;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      haptic.medium();
      setPull(THRESHOLD * 0.75); // hold indicator while refreshing
      try { await onRefresh?.(); } catch {}
      setRefreshing(false);
    }
    setPull(0);
    startY.current = null;
  }

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull indicator */}
      <div className="flex justify-center overflow-hidden transition-all"
        style={{ height: pull, marginTop: pull > 0 ? 0 : 0 }}>
        <motion.div
          animate={refreshing ? { rotate: 360 } : { rotate: progress * 270 }}
          transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { duration: 0 }}
          className="self-center rounded-full p-2"
          style={{
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            opacity: Math.max(0.3, progress),
          }}>
          <RefreshCw size={18} style={{ color: progress >= 1 ? BRAND.primary : "#94A3B8" }} />
        </motion.div>
      </div>
      {children}
    </div>
  );
}
