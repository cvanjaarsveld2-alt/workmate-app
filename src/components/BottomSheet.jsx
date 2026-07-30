// ─── BottomSheet ─────────────────────────────────────────────────────────────
// One consistent slide-up sheet used across the app, so every modal feels the
// same. Handles the overlay, the spring, the grab handle, and scroll.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { haptic } from "../lib/haptics";

export function BottomSheet({ open, onClose, title, subtitle, children, maxHeight = "85vh" }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { haptic.light(); onClose(); }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white"
            style={{ maxWidth: 480, margin: "0 auto", maxHeight }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            {title && (
              <div className="flex items-start justify-between px-5 pt-1 pb-2">
                <div className="min-w-0">
                  <p className="text-lg font-black text-slate-900 truncate">{title}</p>
                  {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
                </div>
                <button onClick={() => { haptic.light(); onClose(); }}
                  className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 ml-3">
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-5 pb-8 pt-1" style={{ maxHeight: `calc(${maxHeight} - 80px)` }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
