// ─── EmptyState ──────────────────────────────────────────────────────────────
// A friendly, guiding empty state instead of a dead blank screen.
// Turns "there's nothing here" into "here's how to add your first one".
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion } from "framer-motion";
import { BRAND } from "../lib/constants";
import { haptic } from "../lib/haptics";

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction, tint = BRAND.primary }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center text-center px-8 py-14">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: `${tint}14` }}>
          <Icon size={28} style={{ color: tint }} />
        </div>
      )}
      <p className="text-base font-black text-slate-900 mb-1.5">{title}</p>
      {subtitle && (
        <p className="text-sm text-slate-400 leading-relaxed max-w-xs mb-5">{subtitle}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={() => { haptic.medium(); onAction(); }}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-black min-h-[48px]"
          style={{ background: tint }}>
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}
