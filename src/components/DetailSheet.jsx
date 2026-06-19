// ─── Detail Sheet ────────────────────────────────────────────────────────────
// Reusable bottom-sheet shell. Slides up from the bottom. Swipe-down to dismiss.
// Each screen (Expenses, Contacts, etc.) passes its own header/body/actions.
// Designed for one-handed thumb use in the field.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

/**
 * @param {boolean}  open
 * @param {Function} onClose
 * @param {string}   title - Big header text (e.g. "Engen Garage", "John Smith")
 * @param {string}   subtitle - Smaller text below the title (e.g. "Fuel · R 850 · Yesterday")
 * @param {ReactNode} primaryActions - Big action buttons up top (Call, WhatsApp, Open slip…)
 * @param {ReactNode} children - The detail rows (the meat of the sheet)
 * @param {ReactNode} secondaryActions - Edit / Delete at the bottom
 */
export function DetailSheet({ open, onClose, title, subtitle, primaryActions, children, secondaryActions }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              // Drag down by more than 100px → close.
              if (info.offset.y > 100) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">

            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
              <div className="flex-1 min-w-0">
                <p className="text-xl font-black text-slate-900 leading-tight break-words">{title}</p>
                {subtitle && <p className="text-sm text-slate-500 mt-0.5 break-words">{subtitle}</p>}
              </div>
              <button onClick={onClose}
                className="shrink-0 p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            {/* Primary actions (Call / WhatsApp / Open slip etc) — lead with these */}
            {primaryActions && (
              <div className="px-4 py-3 border-b border-slate-100" style={{ background: "#F7F3F3" }}>
                {primaryActions}
              </div>
            )}

            {/* Body — scrollable details */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {children}
            </div>

            {/* Edit / Delete at the bottom — out of the way until needed */}
            {secondaryActions && (
              <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                {secondaryActions}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Building block: a row in the detail body ──────────────────────────────
// label on the left, value on the right (or stacked on small screens).
export function DetailRow({ label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex flex-col">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-slate-800 ${mono ? "font-mono" : "font-medium"} break-words mt-0.5`}>
        {value}
      </span>
    </div>
  );
}
