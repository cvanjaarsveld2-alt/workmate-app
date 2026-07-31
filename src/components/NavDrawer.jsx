// ─── Navigation Drawer ────────────────────────────────────────────────────────
// Slide-out drawer — grouped navigation, brand identity, sign out.
// UPDATED: Added Calendar + Team Dashboard entries.
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Home,
  Users,
  UserPlus,
  Calendar as CalendarIcon,
  Clipboard,
  Wrench,
  File as FileIcon,
  Receipt,
  Mic,
  Settings,
  LogOut,
  Car,
  BarChart2,
  TrendingUp,
  Inbox,
  Bell,
  LayoutDashboard,
  AlertTriangle,
  CheckCircle2, // NEW: for Team Dashboard
} from "lucide-react";
import { BRAND } from "../lib/constants";

const SECTIONS = [
  {
    title: "MAIN",
    items: [
      { key: "Home",      label: "Dashboard",     icon: Home },
      { key: "Analytics", label: "Analytics",      icon: BarChart2 },
      { key: "Leads",     label: "Opportunities",  icon: TrendingUp },
      { key: "Clients",   label: "Clients",        icon: Users },
      { key: "Contacts",  label: "Contacts",       icon: UserPlus,     badgeKey: "leads" },
      { key: "Followups", label: "Follow-ups",     icon: CalendarIcon, badgeKey: "overdueFU" },
      { key: "Calendar",  label: "Calendar",       icon: CalendarIcon }, // NEW
    ],
  },
  {
    title: "FIELD",
    items: [
      { key: "Notes",        label: "Field Notes",       icon: Clipboard, badgeKey: "criticalNotes" },
      { key: "Equipment",    label: "Equipment",         icon: Wrench,    badgeKey: "overdueEquip" },
      { key: "Meeting",      label: "Meeting Recorder", icon: Mic },
      { key: "VehicleCheck", label: "Vehicle Checklist",  icon: Car },
      { key: "Breakdown",    label: "Breakdown Reports", icon: AlertTriangle, badgeKey: "openBreakdowns" },
      { key: "Repair",       label: "Repair Reports",    icon: CheckCircle2 },
    ],
  },
  {
    title: "FINANCE",
    items: [
      { key: "Quotes",    label: "Quotes",      icon: FileIcon,  badgeKey: "pendingQ" },
      { key: "Expenses",  label: "Expenses",    icon: Receipt,   badgeKey: "unsubmittedExp" },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { key: "TeamDashboard", label: "Team Overview",    icon: LayoutDashboard },
      { key: "SharedInbox",   label: "Shared with me",   icon: Inbox,    badgeKey: "sharedInbox" },
      { key: "Notifications", label: "Notifications",    icon: Bell,     badgeKey: "unread" },
      { key: "More",          label: "Settings & More",  icon: Settings, badgeKey: "pending" },
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
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed top-0 left-0 bottom-0 z-[71] w-[82%] max-w-[320px] bg-white shadow-2xl flex flex-col">

            {/* Brand header */}
            <div className="px-5 pt-12 pb-4 flex items-end justify-between"
              style={{ background: "linear-gradient(135deg, #8B1A1A 0%, #6B1414 100%)" }}>
              <img
                src={BRAND.logo}
                alt="Power Works"
                className="h-9 w-auto object-contain object-left"
                style={{ maxWidth: 180 }}
                onError={e => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "block";
                }}
              />
              <p className="text-lg font-black text-white tracking-wide hidden">PowerMate</p>
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-0.5"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <X size={16} className="text-white" />
              </button>
            </div>

            {/* Scrollable nav */}
            <div className="flex-1 overflow-y-auto py-2">
              {SECTIONS.map(section => (
                <div key={section.title} className="mb-0.5">
                  <p className="px-5 pt-4 pb-1 text-[10px] font-black text-slate-400 tracking-widest">
                    {section.title}
                  </p>
                  {section.items.map(item => {
                    const active = currentScreen === item.key;
                    const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                    return (
                      <button
                        key={item.key}
                        onClick={() => go(item.key)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-h-[52px] mx-1 rounded-xl ${
                          active ? "bg-red-50" : "hover:bg-slate-50"
                        }`}
                        style={{ width: "calc(100% - 8px)" }}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0`}
                          style={{ background: active ? "#F7F3F3" : "#F8FAFC" }}>
                          <item.icon size={16} style={{ color: active ? BRAND.primary : "#94A3B8" }} />
                        </div>
                        <span
                          className={`flex-1 text-[14px] font-bold leading-tight ${active ? "" : "text-slate-700"}`}
                          style={active ? { color: BRAND.primary } : {}}>
                          {item.label}
                        </span>
                        {badge > 0 && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black text-white min-w-[20px] text-center" style={{ background: BRAND.primary }}>
                            {badge}
                          </span>
                        )}
                        {active && (
                          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: BRAND.primary }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Sign out */}
              <div className="mt-3 mx-4 pt-3 border-t border-slate-100">
                <button
                  onClick={() => { onClose(); onLogout?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 active:bg-red-100 transition-colors min-h-[52px] rounded-xl">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                    <LogOut size={16} className="text-red-500" />
                  </div>
                  <span className="text-[14px] font-bold text-red-600 flex-1">Sign Out</span>
                </button>
              </div>
            </div>

            {/* User footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                style={{ background: BRAND.primary }}>
                {(userEmail || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">Signed in</p>
                <p className="text-xs text-slate-400 truncate">{userEmail || ""}</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
