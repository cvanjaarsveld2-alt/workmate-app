// ─── MemberSelector ───────────────────────────────────────────────────────────
// Reusable dropdown to pick a team member.
// Reads team members from the teamMembers prop (loaded by TeamScreen/App).
// Shows avatar + email/name, "Unassigned" as first option.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, UserCheck, X } from "lucide-react";
import { BRAND } from "../lib/constants";

export function MemberSelector({
  label,
  value,          // user_id of selected member
  onChange,       // (user_id, email) => void
  members = [],   // [{ user_id, email, role }]
  placeholder = "Unassigned",
  currentUserId,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) &&
          menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = members.find(m => m.user_id === value);
  const displayName = m => {
    if (m.user_id === currentUserId) return "Me";
    const name = m.email?.split("@")[0] || m.user_id.slice(0, 8);
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const avatarLetters = m => (m.email || "?").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="mb-2 block text-sm font-bold text-slate-500">{label}</label>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setOpen(!open); }}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base text-left flex items-center gap-3 outline-none focus:border-red-300 min-h-[56px] transition-colors cursor-pointer">
        {selected ? (
          <>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
              style={{ background: selected.role === "admin" ? "#A16207" : BRAND.primary }}>
              {avatarLetters(selected)}
            </div>
            <span className="flex-1 font-medium text-slate-900">{displayName(selected)}</span>
            <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onChange(null, null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); onChange(null, null); }}}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
              <X size={14} />
            </span>
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center shrink-0">
              <UserCheck size={13} className="text-slate-300" />
            </div>
            <span className="flex-1 text-slate-400">{placeholder}</span>
            <ChevronDown size={16} className="text-slate-400 shrink-0" />
          </>
        )}
      </div>

      {open && ReactDOM.createPortal(
        <AnimatePresence>
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden overflow-y-auto"
            style={{ position: "fixed", zIndex: 9999, maxHeight: 280, width: ref.current?.offsetWidth || 280, left: ref.current?.getBoundingClientRect().left || 0, top: Math.min((ref.current?.getBoundingClientRect().bottom || 0) + 4, window.innerHeight - 290) }}>
            {/* Unassigned option */}
            <button type="button"
              onClick={() => { onChange(null, null); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 border-b border-slate-50 min-h-[52px]">
              <div className="w-7 h-7 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center shrink-0">
                <UserCheck size={12} className="text-slate-300" />
              </div>
              <span className="text-sm text-slate-400">Unassigned</span>
            </button>

            {members.map(m => (
              <button key={m.user_id} type="button"
                onClick={() => { onChange(m.user_id, m.email); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors min-h-[56px] ${m.user_id === value ? "bg-red-50" : ""}`}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                  style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                  {avatarLetters(m)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold leading-tight ${m.user_id === value ? "text-red-700" : "text-slate-800"}`}>
                    {displayName(m)}
                    {m.user_id === currentUserId && " (me)"}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{m.email}</p>
                </div>
                {m.role === "admin" && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">Admin</span>
                )}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
