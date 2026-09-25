// ─── Navigation Drawer ────────────────────────────────────────────────────────
import React, { useState } from "react";
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
  PhoneCall,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { ALWAYS_SHOWN } from "../lib/menuPrefs";
import { Wordmark } from "./Wordmark";

const SECTIONS = [
  {
    title: "MAIN",
    items: [
      { key: "Home", label: "Dashboard", icon: Home },
      { key: "Planner", label: "Weekly Planner", icon: LayoutDashboard },
      { key: "Clients", label: "Clients", icon: Users },
      { key: "Contacts", label: "Contacts", icon: UserPlus, badgeKey: "leads" },
      { key: "Leads", label: "Opportunities", icon: TrendingUp },
      { key: "Calendar", label: "Calendar", icon: CalendarIcon },
      { key: "ColdCall", label: "Log a Call", icon: PhoneCall },
      { key: "Analytics", label: "Analytics", icon: BarChart2 },
    ],
  },
  {
    title: "FIELD",
    items: [
      { key: "Notes", label: "Field Notes", icon: Clipboard, badgeKey: "criticalNotes" },
      { key: "JackSelector", label: "Jack Selector", icon: Wrench },
      { key: "VehicleCheck", label: "Vehicle Checklist", icon: Car },
      { key: "Breakdown", label: "Breakdown Reports", icon: AlertTriangle, badgeKey: "openBreakdowns" },
      { key: "Repair", label: "Repair Reports", icon: CheckCircle2 },
      { key: "Equipment", label: "Equipment", icon: Wrench },
      { key: "Meeting", label: "Meeting Recorder", icon: Mic },
      { key: "Jobs", label: "Jobs", icon: CheckCircle2 },
    ],
  },
  {
    title: "FINANCE",
    items: [
      { key: "Quotes", label: "Quotes", icon: FileIcon, badgeKey: "pendingQ" },
      { key: "Expenses", label: "Expenses", icon: Receipt, badgeKey: "unsubmittedExp" },
      { key: "Invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { key: "Notifications", label: "Notifications", icon: Bell, badgeKey: "unread" },
      { key: "SharedInbox", label: "Shared with me", icon: Inbox, badgeKey: "sharedInbox" },
      { key: "TeamDashboard", label: "Team Overview", icon: LayoutDashboard },
      { key: "More", label: "Settings & More", icon: Settings, badgeKey: "pending" },
    ],
  },
];

export function NavDrawer({
  open,
  onClose,
  currentScreen,
  onNavigate,
  badges = {},
  userEmail,
  onLogout,
  hiddenScreens = [],
  unavailableScreens = [],
  onSaveHidden,
}) {
  // Editing the menu: a draft set of hidden screens, saved on Done.
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const hidden = new Set(hiddenScreens);
  // Modules the company switched off aren't offered at all.
  const off = new Set(unavailableScreens);
  const available = SECTIONS.map(s => ({ ...s, items: s.items.filter(i => !off.has(i.key)) })).filter(s => s.items.length);
  const sections = available.map(s => ({
    ...s,
    items: s.items.filter(i => ALWAYS_SHOWN.has(i.key) || !hidden.has(i.key)),
  })).filter(s => s.items.length);

  function go(key) {
    onNavigate(key);
    onClose();
  }
  function close() {
    setDraft(null);
    onClose();
  }
  function toggle(key) {
    setDraft(d => {
      const next = new Set(d);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function done() {
    onSaveHidden?.([...draft]);
    setDraft(null);
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-70 bg-black/40 backdrop-blur-xs"
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed top-0 left-0 bottom-0 z-71 w-[82%] max-w-[320px] bg-white shadow-2xl flex flex-col"
          >
            <div
              className="px-5 pt-12 pb-4 flex items-end justify-between"
              style={{ background: "linear-gradient(135deg, #8B1A1A 0%, #6B1414 100%)" }}
            >
              <Wordmark variant="light" size="md" />
              <button
                onClick={close}
                aria-label="Close menu"
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              >
                <X size={16} className="text-white" />
              </button>
            </div>
            {editing ? (
              <div className="flex-1 overflow-y-auto py-2">
                <p className="px-5 pt-3 pb-1 text-sm font-bold text-slate-700 leading-snug">
                  Choose what shows in your menu
                </p>
                <p className="px-5 pb-2 text-xs text-slate-500 leading-snug">
                  Only changes your own menu. Hidden screens still open from links and notifications.
                </p>
                {available.map(section => (
                  <div key={section.title} className="mb-0.5">
                    <p className="px-5 pt-4 pb-1 text-[10px] font-black text-slate-400 tracking-widest">
                      {section.title}
                    </p>
                    {section.items.map(item => {
                      const locked = ALWAYS_SHOWN.has(item.key);
                      const shown = locked || !draft.has(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-center gap-3 px-5 py-2.5 min-h-[48px] ${locked ? "opacity-60" : "cursor-pointer"}`}
                        >
                          <item.icon size={16} className="text-slate-400 shrink-0" />
                          <span className="flex-1 text-[14px] font-bold text-slate-700 leading-tight">
                            {item.label}
                            {locked && (
                              <span className="block text-[11px] font-medium text-slate-400">
                                Always shown
                              </span>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            checked={shown}
                            disabled={locked}
                            onChange={() => toggle(item.key)}
                            aria-label={`Show ${item.label}`}
                            className="h-5 w-5 shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto py-2">
                {sections.map(section => (
                  <div key={section.title} className="mb-0.5">
                    <p className="px-5 pt-4 pb-1 text-[10px] font-black text-slate-400 tracking-widest">
                      {section.title}
                    </p>
                    {section.items.map(item => {
                      const active = currentScreen === item.key,
                        badge = item.badgeKey ? badges[item.badgeKey] : 0;
                      return (
                        <button
                          key={item.key}
                          onClick={() => go(item.key)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-h-[52px] mx-1 rounded-xl ${active ? "bg-red-50" : "hover:bg-slate-50"}`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: active ? "#F7F3F3" : "#F8FAFC" }}
                          >
                            <item.icon size={16} style={{ color: active ? BRAND.primary : "#737F92" }} />
                          </div>
                          <span
                            className={`flex-1 text-[14px] font-bold leading-tight ${active ? "" : "text-slate-700"}`}
                            style={active ? { color: BRAND.primary } : {}}
                          >
                            {item.label}
                          </span>
                          {badge > 0 && (
                            <span className="min-w-5 h-5 px-1 rounded-full bg-red-100 text-red-600 text-[10px] font-black flex items-center justify-center">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                          {active && (
                            <div
                              className="w-1 h-5 rounded-full shrink-0"
                              style={{ background: BRAND.primary }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {editing ? (
              <div className="mt-3 mx-4 pt-3 pb-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDraft(null)}
                  className="rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-600 min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  onClick={done}
                  className="rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                  style={{ background: BRAND.primary }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="mt-3 mx-4 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setDraft(new Set(hiddenScreens))}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 min-h-[52px] rounded-xl"
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-50">
                    <SlidersHorizontal size={16} className="text-slate-500" />
                  </div>
                  <span className="text-[14px] font-bold text-slate-700 flex-1">Customise menu</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onLogout?.();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 min-h-[52px] rounded-xl"
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                    <LogOut size={16} className="text-red-500" />
                  </div>
                  <span className="text-[14px] font-bold text-red-600 flex-1">Sign Out</span>
                </button>
              </div>
            )}
            <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                style={{ background: BRAND.primary }}
              >
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
