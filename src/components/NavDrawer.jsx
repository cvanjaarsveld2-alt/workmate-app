// ─── Navigation Drawer ────────────────────────────────────────────────────────
// Slide-out drawer with grouped sections (MAIN / FINANCE / MANAGE / SYSTEM),
// business identity pinned at the bottom. Opened from the hamburger in the top bar.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Home, Users, UserPlus, Calendar, Clipboard, Wrench,
  File as FileIcon, Receipt, Settings, LogOut,
} from "lucide-react";
import { BRAND } from "../lib/constants";

const SECTIONS = [
  {
    title: "MAIN",
    items: [
      { key: "Home",      label: "Dashboard",  icon: Home },
      { key: "Clients",   label: "Clients",    icon: Users },
      { key: "Contacts",  label: "Contacts",   icon: UserPlus,  badgeKey: "leads" },
      { key: "Followups", label: "Follow-ups", icon: Calendar,  badgeKey: "overdueFU" },
    ],
  },
  {
    title: "FIELD",
    items: [
      { key: "Notes",     label: "Field Notes", icon: Clipboard, badgeKey: "criticalNotes" },
      { key: "Equipment", label: "Equipment",   icon: Wrench,    badgeKey: "overdueEquip" },
    ],
  },
  {
    title: "FINANCE",
    items: [
      { key: "Quotes",    label: "Quotes",    icon: FileIcon, badgeKey: "pendingQ" },
      { key: "Expenses",  label: "Expenses",  icon: Receipt,  badgeKey: "unsubmittedExp" },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { key: "More",      label: "Settings",  icon: Settings, badgeKey: "pending" },
    ],
  },
];

export function NavDrawer({ open, onClose, currentScreen, onNavigate, badges = {}, userEmail, onLogout }) {
  function go(key) {
    onNavigate(key);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />

          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 left-0 bottom-0 z-[71] w-[82%] max-w-[320px] bg-white shadow-2xl flex flex-col">

            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <img src={BRAND.logo} alt="PW" className="h-9 object-contain" onError={e => e.target.style.display = "none"} />
                <div>
                  <p className="text-base font-black text-slate-900 leading-tight">PowerMate</p>
                  <p className="text-xs text-slate-400 leading-tight">Power Works</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable nav */}
            <div className="flex-1 overflow-y-auto py-3">
              {SECTIONS.map(section => (
                <div key={section.title} className="mb-1">
                  <p className="px-5 pt-3 pb-1.5 text-[11px] font-black text-slate-400 tracking-wider">{section.title}</p>
                  {section.items.map(item => {
                    const active = currentScreen === item.key;
                    const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                    return (
                      <button
                        key={item.key}
                        onClick={() => go(item.key)}
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors min-h-[52px] ${
                          active ? "bg-red-50" : "hover:bg-slate-50"
                        }`}>
                        <item.icon size={19} style={{ color: active ? BRAND.primary : "#94A3B8" }} className="shrink-0" />
                        <span className={`flex-1 text-[15px] font-bold ${active ? "" : "text-slate-700"}`}
                          style={active ? { color: BRAND.primary } : {}}>
                          {item.label}
                        </span>
                        {badge > 0 && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-black text-white" style={{ background: BRAND.primary }}>
                            {badge}
                          </span>
                        )}
                        {active && <div className="w-1 h-6 rounded-full shrink-0" style={{ background: BRAND.primary }} />}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Sign out */}
              <div className="mt-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => { onClose(); onLogout && onLogout(); }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-red-50 transition-colors min-h-[52px]">
                  <LogOut size={19} className="text-red-500 shrink-0" />
                  <span className="text-[15px] font-bold text-red-600">Sign Out</span>
                </button>
              </div>
            </div>

            {/* Business identity footer */}
            <div className="px-5 py-4 border-t border-slate-100" style={{ background: "#F7F3F3" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black shrink-0" style={{ background: BRAND.primary }}>
                  PW
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">Power Works (Pty) Ltd</p>
                  <p className="text-xs text-slate-400 truncate">{userEmail || "Signed in"}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
