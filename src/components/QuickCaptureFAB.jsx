// ─── Quick Capture FAB ────────────────────────────────────────────────────────
// Floating action button with quick-add menu.
// Camera-first screens (Expenses, Contacts) show a camera icon on their item.
// The FAB itself also shows camera icon when on a camera-first screen.
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Clipboard,
  Calendar,
  Users,
  File as FileIcon,
  Wrench,
  Camera,
  Scan,
} from "lucide-react";
import { BRAND } from "../lib/constants";

// Screens where + immediately opens a camera
const CAMERA_FIRST = new Set(["Expenses", "Contacts"]);

const OPTIONS = [
  { key: "Notes",     label: "Note",      icon: Clipboard, camIcon: false, color: "#92400E", bg: "#FEF3C7" },
  { key: "Followups", label: "Follow-up", icon: Calendar,  camIcon: false, color: "#0E7490", bg: "#CFFAFE" },
  { key: "Contacts",  label: "Contact",   icon: Camera,    camIcon: true,  color: "#7C2D12", bg: "#FFE4D9",
    sub: "Scan business card" },
  { key: "Expenses",  label: "Expense",   icon: Camera,    camIcon: true,  color: "#8B1A1A", bg: "#FEE2E2",
    sub: "Scan a receipt" },
  { key: "Clients",   label: "Client",    icon: Users,     camIcon: false, color: "#5B21B6", bg: "#EDE9FE" },
  { key: "Quotes",    label: "Quote",     icon: FileIcon,  camIcon: false, color: "#15803D", bg: "#DCFCE7" },
  { key: "Equipment", label: "Equipment", icon: Wrench,    camIcon: false, color: "#9F1239", bg: "#FFE4E6" },
];

export function QuickCaptureFAB({ currentScreen, onTrigger }) {
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [currentScreen]);

  if (currentScreen === "More") return null;

  const primary   = OPTIONS.find(o => o.key === currentScreen);
  const secondary = OPTIONS.filter(o => o.key !== currentScreen);
  const isCameraFirst = CAMERA_FIRST.has(currentScreen);

  function handleSelect(key) {
    setOpen(false);
    onTrigger(key);
  }

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Quick-add menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed z-50 rounded-2xl bg-white overflow-hidden"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
              right: 18,
              width: 248,
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.20), 0 2px 8px rgba(15, 23, 42, 0.08)",
            }}>

            {/* Header */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2" style={{ background: "#F7F3F3" }}>
              <Scan size={13} style={{ color: BRAND.primary }} />
              <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Quick Add</p>
            </div>

            {/* Primary item (current screen — highlighted) */}
            {primary && (
              <button
                onClick={() => handleSelect(primary.key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-slate-100 active:opacity-80 transition-opacity"
                style={{ background: primary.bg }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: "white" }}>
                  <primary.icon size={17} style={{ color: primary.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black leading-tight" style={{ color: primary.color }}>
                    {primary.camIcon ? "📷 " : "+ "}{primary.label}
                  </p>
                  <p className="text-xs mt-0.5 leading-tight" style={{ color: primary.color, opacity: 0.65 }}>
                    {primary.sub || "This screen"}
                  </p>
                </div>
              </button>
            )}

            {/* Secondary items */}
            <div className="divide-y divide-slate-50">
              {secondary.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleSelect(opt.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left min-h-[50px]">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: opt.bg, color: opt.color }}>
                    <opt.icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 leading-tight">
                      {opt.camIcon ? "📷 " : ""}{opt.label}
                    </p>
                    {opt.sub && <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{opt.sub}</p>}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB itself — 64px: comfortable thumb target on iPhone */}
      <motion.button
        initial={false}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        onClick={() => {
          if (!open && isCameraFirst && primary) {
            handleSelect(primary.key);
          } else {
            setOpen(o => !o);
          }
        }}
        aria-label={open ? "Close quick capture" : isCameraFirst ? "Open camera" : "Quick capture"}
        className="fixed z-40 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        style={{
          background: BRAND.primary,
          color: "white",
          width: 64,
          height: 64,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          right: 16,
          boxShadow: "0 6px 16px rgba(139,26,26,0.45), 0 2px 4px rgba(0,0,0,0.15)",
        }}>
        {isCameraFirst && !open
          ? <Camera size={26} strokeWidth={2} />
          : <Plus size={26} strokeWidth={2.25} />}
      </motion.button>
    </>
  );
}
