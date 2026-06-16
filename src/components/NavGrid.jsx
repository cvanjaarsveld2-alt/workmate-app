// ─── Navigation Grid Pop-up ───────────────────────────────────────────────────
// Replaces the bottom tab bar. A single centre button opens a compact grid of
// every screen (icon + label + live badge). Tap a tile to navigate; it closes.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Grid3x3, X, Home, Users, UserPlus, Calendar, Clipboard,
  Wrench, File as FileIcon, Receipt, Settings,
} from "lucide-react";
import { BRAND } from "../lib/constants";

const TILES = [
  { key: "Home",      label: "Dashboard",  icon: Home,      bg: "#F7F3F3", color: "#8B1A1A" },
  { key: "Clients",   label: "Clients",    icon: Users,     bg: "#EDE9FE", color: "#5B21B6", badgeKey: "clients" },
  { key: "Contacts",  label: "Contacts",   icon: UserPlus,  bg: "#FFE4D9", color: "#7C2D12", badgeKey: "leads" },
  { key: "Followups", label: "Follow-ups", icon: Calendar,  bg: "#CFFAFE", color: "#0E7490", badgeKey: "overdueFU" },
  { key: "Notes",     label: "Notes",      icon: Clipboard, bg: "#FEF3C7", color: "#92400E", badgeKey: "criticalNotes" },
  { key: "Equipment", label: "Equipment",  icon: Wrench,    bg: "#FFE4E6", color: "#9F1239", badgeKey: "overdueEquip" },
  { key: "Quotes",    label: "Quotes",     icon: FileIcon,  bg: "#DCFCE7", color: "#15803D", badgeKey: "pendingQ" },
  { key: "Expenses",  label: "Expenses",   icon: Receipt,   bg: "#FFE4D9", color: "#7C2D12", badgeKey: "unsubmittedExp" },
  { key: "More",      label: "Settings",   icon: Settings,  bg: "#F1F5F9", color: "#475569", badgeKey: "pending" },
];

export function NavGrid({ open, onClose, onOpen, currentScreen, onNavigate, badges = {} }) {
  function go(key) {
    onNavigate(key);
    onClose();
  }

  return (
    <>
      {/* Centre launcher button (always visible, bottom-centre) */}
      <button
        onClick={onOpen}
        className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center justify-center rounded-full text-white shadow-lg active:scale-95 transition-transform"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          width: 60, height: 60,
          background: BRAND.primary,
          boxShadow: "0 4px 14px rgba(139, 26, 26, 0.4)",
        }}
        aria-label="Open menu">
        <Grid3x3 size={26} />
      </button>

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
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl">

              <div className="flex justify-center pt-2.5 pb-1">
                <div className="w-12 h-1 rounded-full bg-slate-300" />
              </div>

              <div className="px-5 pt-2 pb-3 flex items-center justify-between">
                <p className="text-base font-black text-slate-900">Go to…</p>
                <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
                  <X size={20} />
                </button>
              </div>

              <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
                <div className="grid grid-cols-3 gap-3">
                  {TILES.map(tile => {
                    const active = currentScreen === tile.key;
                    const badge = tile.badgeKey ? badges[tile.badgeKey] : 0;
                    return (
                      <button
                        key={tile.key}
                        onClick={() => go(tile.key)}
                        className={`relative flex flex-col items-center gap-2 rounded-2xl py-4 transition-all min-h-[92px] ${
                          active ? "ring-2 ring-offset-1" : "hover:bg-slate-50"
                        }`}
                        style={active ? { background: tile.bg, ringColor: tile.color } : {}}>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: tile.bg, color: tile.color }}>
                          <tile.icon size={22} />
                        </div>
                        <span className={`text-xs font-bold ${active ? "" : "text-slate-600"}`} style={active ? { color: tile.color } : {}}>
                          {tile.label}
                        </span>
                        {badge > 0 && (
                          <span className="absolute top-2 right-3 rounded-full px-1.5 py-0.5 text-[10px] font-black text-white min-w-[18px] text-center" style={{ background: BRAND.primary }}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
