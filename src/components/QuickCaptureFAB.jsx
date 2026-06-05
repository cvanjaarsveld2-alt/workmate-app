// ─── Quick Capture FAB ────────────────────────────────────────────────────────
// Floating action button that appears on data screens.
// Tapping opens a sheet with context-aware quick-add options.
// The primary action (matching the current screen) is prominently displayed.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Clipboard, Calendar, Users, File as FileIcon, Wrench } from "lucide-react";
import { BRAND } from "../lib/constants";

const OPTIONS = [
  { key: "Notes",     label: "Note",      icon: Clipboard, color: "#92400E", bg: "#FEF3C7" },
  { key: "Followups", label: "Follow-up", icon: Calendar,  color: "#0E7490", bg: "#CFFAFE" },
  { key: "Clients",   label: "Client",    icon: Users,     color: "#5B21B6", bg: "#EDE9FE" },
  { key: "Quotes",    label: "Quote",     icon: FileIcon,  color: "#15803D", bg: "#DCFCE7" },
  { key: "Equipment", label: "Equipment", icon: Wrench,    color: "#9F1239", bg: "#FFE4E6" },
];

export function QuickCaptureFAB({ currentScreen, onTrigger }) {
  const [open, setOpen] = useState(false);

  // Close sheet if screen changes (e.g. user navigated away)
  useEffect(() => { setOpen(false); }, [currentScreen]);

  // Don't render on More or Home (no Add form on More; Home has its own clearer actions)
  if (currentScreen === "More") return null;

  // Determine the primary action (matches current screen) and secondary options
  const primary    = OPTIONS.find(o => o.key === currentScreen);
  const secondary  = OPTIONS.filter(o => o.key !== currentScreen);

  function handleSelect(key) {
    setOpen(false);
    onTrigger(key);
  }

  return (
    <>
      {/* The FAB button itself */}
      <motion.button
        initial={false}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close quick capture" : "Quick capture"}
        className="fixed z-40 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        style={{
          background: BRAND.primary,
          color: "white",
          width: 60,
          height: 60,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)",
          right: 20,
          boxShadow: "0 6px 16px rgba(139, 26, 26, 0.35)",
        }}>
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>

      {/* Backdrop + sheet */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — tap to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed z-50 rounded-2xl bg-white shadow-2xl overflow-hidden"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
                right: 20,
                width: 240,
              }}>

              <div className="px-4 py-3 border-b border-slate-100" style={{ background: "#F7F3F3" }}>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Quick Add</p>
              </div>

              {/* Primary action (matches current screen) — large, full row */}
              {primary && (
                <button
                  onClick={() => handleSelect(primary.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100"
                  style={{ background: primary.bg }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "white", color: primary.color }}>
                    <primary.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black" style={{ color: primary.color }}>+ Add {primary.label}</p>
                    <p className="text-xs" style={{ color: primary.color, opacity: 0.7 }}>This screen</p>
                  </div>
                </button>
              )}

              {/* Secondary options — compact rows */}
              <div className="divide-y divide-slate-50">
                {secondary.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => handleSelect(opt.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left min-h-[52px]">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: opt.bg, color: opt.color }}>
                      <opt.icon size={15} />
                    </div>
                    <p className="text-sm font-bold text-slate-700 flex-1">{opt.label}</p>
                  </button>
                ))}
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

