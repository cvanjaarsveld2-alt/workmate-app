// ─── ShareSheet ───────────────────────────────────────────────────────────────
// Bottom sheet for sharing/assigning a record to a team member.
// Shows all team members, lets you pick one, then:
//   1. Assigns the record to them
//   2. Sends them an in-app notification
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Check } from "lucide-react";
import { BRAND } from "../lib/constants";
import { sendAssignmentNotification } from "../lib/teamNotifications";

export function ShareSheet({
  open,
  onClose,
  record,          // { id, title, type } — type: "lead"|"followup"|"client"|"contact"
  members = [],    // [{ user_id, email, role }]
  currentUserId,
  userEmail,
  teamId,
  onAssign,        // (userId, email) => void — called after selection
}) {
  const [selected, setSelected]   = useState(null);
  const [sending, setSending]     = useState(false);
  const [done, setDone]           = useState(false);

  function displayName(m) {
    if (m.user_id === currentUserId) return "Me";
    const name = m.email?.split("@")[0] || m.user_id.slice(0, 8);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  async function handleShare() {
    if (!selected) return;
    setSending(true);
    try {
      // 1. Assign the record
      onAssign?.(selected.user_id, selected.email);

      // 2. Send in-app notification
      if (selected.user_id !== currentUserId) {
        await sendAssignmentNotification({
          fromUserId:   currentUserId,
          toUserId:     selected.user_id,
          teamId,
          recordType:   record.type,
          recordId:     record.id,
          recordTitle:  record.title,
          fromEmail:    userEmail,
        });
      }

      setDone(true);
      setTimeout(() => {
        setDone(false);
        setSelected(null);
        onClose();
      }, 1200);
    } catch (e) {
      console.warn("Share failed:", e);
    }
    setSending(false);
  }

  function avatarLetters(m) { return (m.email || "?").slice(0, 2).toUpperCase(); }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto">

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1 rounded-full bg-slate-200" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-base font-black text-slate-900">Share with teammate</p>
                {record?.title && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">{record.title}</p>
                )}
              </div>
              <button onClick={onClose}
                className="p-2 rounded-lg text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            {/* Member list */}
            <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  No team members yet. Set up your team first.
                </p>
              ) : (
                members.map(m => {
                  const isSel = selected?.user_id === m.user_id;
                  return (
                    <button key={m.user_id}
                      onClick={() => setSelected(isSel ? null : m)}
                      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 border-2 transition-all min-h-[60px]"
                      style={isSel
                        ? { background: "#F7F3F3", borderColor: BRAND.primary }
                        : { background: "white", borderColor: "#E2E8F0" }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                        style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                        {avatarLetters(m)}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-bold text-slate-800">{displayName(m)}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                      <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                        style={isSel
                          ? { background: BRAND.primary, borderColor: BRAND.primary }
                          : { borderColor: "#CBD5E1" }}>
                        {isSel && <Check size={12} className="text-white" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Share button */}
            <div className="px-4 pb-10 pt-2">
              <button
                onClick={handleShare}
                disabled={!selected || sending}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white min-h-[56px] transition-all disabled:opacity-40"
                style={{ background: done ? "#16A34A" : BRAND.primary }}>
                {done
                  ? <><Check size={18} /> Shared!</>
                  : sending
                    ? "Sharing…"
                    : <><Send size={16} /> Share with {selected ? displayName(selected) : "…"}</>}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
