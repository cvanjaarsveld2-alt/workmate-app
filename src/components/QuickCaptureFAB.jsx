// ─── Quick Capture FAB ────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Clipboard, Calendar, Users, File as FileIcon, Wrench, UserPlus, Receipt } from "lucide-react";
import { BRAND } from "../lib/constants";

const OPTIONS = [
  { key: "Notes",     label: "Note",      icon: Clipboard, color: "#92400E", bg: "#FEF3C7" },
  { key: "Followups", label: "Follow-up", icon: Calendar,  color: "#0E7490", bg: "#CFFAFE" },
  { key: "Contacts",  label: "Contact",   icon: UserPlus,  color: "#7C2D12", bg: "#FFE4D9" },
  { key: "Expenses",  label: "Expense",   icon: Receipt,   color: "#7C2D12", bg: "#FFE4D9" },
  { key: "Clients",   label: "Client",    icon: Users,     color: "#5B21B6", bg: "#EDE9FE" },
  { key: "Quotes",    label: "Quote",     icon: FileIcon,  color: "#15803D", bg: "#DCFCE7" },
  { key: "Equipment", label: "Equipment", icon: Wrench,    color: "#9F1239", bg: "#FFE4E6" },
];

export function QuickCaptureFAB({ currentScreen, onTrigger }) {
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [currentScreen]);

  if (currentScreen === "More") return null;

  const primary    = OPTIONS.find(o => o.key === currentScreen);
  const secondary  = OPTIONS.filter(o => o.key !== currentScreen);

  function handleSelect(key) {
    setOpen(false);
    onTrigger(key);
  }

  return (
    <>
      <motion.button
        initial={false}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close quick capture" : "Quick capture"}
        className="fixed z-40 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        style={{
          background: BRAND.primary,
          color: "white",
          width: 48,
          height: 48,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
          right: 18,
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.12), 0 1px 2px rgba(15, 23, 42, 0.08)",
          opacity: 0.94,
        }}>
        <Plus size={22} strokeWidth={2.25} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed z-50 rounded-2xl bg-white overflow-hidden"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 156px)",
                right: 18,
                width: 236,
                boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)",
              }}>

              <div className="px-4 py-2.5 border-b border-slate-100" style={{ background: "#F7F3F3" }}>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Quick Add</p>
              </div>

              {primary && (
                <button
                  onClick={() => handleSelect(primary.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100"
                  style={{ background: primary.bg }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "white", color: primary.color }}>
                    <primary.icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black" style={{ color: primary.color }}>+ Add {primary.label}</p>
                    <p className="text-xs" style={{ color: primary.color, opacity: 0.7 }}>This screen</p>
                  </div>
                </button>
              )}

              <div className="divide-y divide-slate-50">
                {secondary.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => handleSelect(opt.key)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left min-h-[48px]">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: opt.bg, color: opt.color }}>
                      <opt.icon size={14} />
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
