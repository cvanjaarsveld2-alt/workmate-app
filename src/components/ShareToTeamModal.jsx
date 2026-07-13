// ─── Share / Assign To Team Modal ─────────────────────────────────────────────
// Two modes:
//   SHARE  — Notify only. The teammate sees it in Shared Inbox.
//   ASSIGN — Transfer ownership. The record's assigned_to fields are updated
//            and the teammate gets a notification. The record now shows on
//            their personal dashboard.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Send, Users, TrendingUp, Calendar,
  UserPlus, CheckCircle2, AlertCircle, UserCheck,
} from "lucide-react";
import { supabase } from "../supabase";
import { BRAND } from "../lib/constants";

const TYPE_META = {
  client:   { label: "Client",    icon: Users,      bg: "#DCFCE7", color: "#166534" },
  contact:  { label: "Contact",   icon: UserPlus,   bg: "#FEF3C7", color: "#92400E" },
  lead:     { label: "Lead",      icon: TrendingUp, bg: "#EDE9FE", color: "#5B21B6" },
  followup: { label: "Follow-up", icon: Calendar,   bg: "#DBEAFE", color: "#1E40AF" },
};

function Avatar({ email, role }) {
  const letters = (email || "?").slice(0, 2).toUpperCase();
  const bg = role === "admin" ? "#A16207" : BRAND.primary;
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0" style={{ background: bg }}>
      {letters}
    </div>
  );
}

export function ShareToTeamModal({
  open, onClose,
  record,           // { id, title, type }
  fromUserId, fromEmail,
  teamId, teamMembers = [],
  data, setData,    // needed for assign mode to update local state
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage]       = useState("");
  const [mode, setMode]             = useState("share"); // "share" | "assign"
  const [status, setStatus]         = useState("idle");
  const [errorMsg, setErrorMsg]     = useState("");

  function reset() { setSelectedId(null); setMessage(""); setMode("share"); setStatus("idle"); setErrorMsg(""); }
  function handleClose() { reset(); onClose(); }

  const recipients = teamMembers.filter(m => m.user_id !== fromUserId);
  const typeMeta   = TYPE_META[record?.type] || TYPE_META.client;
  const TypeIcon   = typeMeta.icon;
  const fromName   = fromEmail?.split("@")[0] || "A teammate";
  const typeLabel  = typeMeta.label.toLowerCase();

  async function handleSend() {
    if (!selectedId || !record) return;
    setStatus("sending");

    const recipient = recipients.find(m => m.user_id === selectedId);
    const recipName = recipient?.email?.split("@")[0] || "teammate";
    const actionVerb = mode === "assign" ? "assigned" : "shared";
    const fullMessage = message.trim()
      ? `${fromName} ${actionVerb} a ${typeLabel} to you: ${record.title} — "${message.trim()}"`
      : `${fromName} ${actionVerb} a ${typeLabel} to you: ${record.title}`;

    try {
      // 1. If ASSIGN mode, update the record's assigned_to fields in Supabase
      if (mode === "assign" && record.type && record.id) {
        const table = {
          client: "clients", contact: "contacts",
          lead: "leads", followup: "followups",
        }[record.type];

        if (table) {
          const updateFields = {
            assigned_to_user_id: selectedId,
            assigned_to: recipName,
          };
          const { error: updateErr } = await supabase
            .from(table).update(updateFields).eq("id", record.id);

          if (updateErr) {
            console.warn("Assignment update failed:", updateErr);
            // Don't block — still send the notification
          } else if (setData) {
            // Update local state so UI reflects immediately
            setData(d => ({
              ...d,
              [table]: (d[table] || []).map(r =>
                r.id === record.id ? { ...r, ...updateFields } : r
              ),
            }));
          }
        }
      }

      // 2. Send in-app notification
      const { error } = await supabase.rpc("notify_assignment", {
        p_to_user_id:   selectedId,
        p_from_user_id: fromUserId,
        p_team_id:      teamId,
        p_record_type:  record.type,
        p_record_id:    record.id,
        p_record_title: record.title,
        p_message:      fullMessage,
      });
      if (error) throw error;

      // 3. Push notification (best-effort)
      try {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", selectedId);
        for (const sub of subs || []) {
          await supabase.functions.invoke("send-notifications", {
            body: {
              subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              title: `PowerMate — ${typeMeta.label} ${actionVerb} to you`,
              body: fullMessage,
              url: "/?screen=SharedInbox",
            },
          }).catch(() => {});
        }
      } catch {}

      setStatus("sent");
    } catch (e) {
      console.warn("Share/assign failed:", e);
      setErrorMsg(e.message || "Could not send — check your connection");
      setStatus("error");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white overflow-hidden"
            style={{ maxHeight: "85vh" }}>

            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: typeMeta.bg }}>
                  <TypeIcon size={18} style={{ color: typeMeta.color }} />
                </div>
                <div>
                  <p className="text-base font-black text-slate-900 leading-tight">
                    {mode === "assign" ? "Assign to teammate" : "Share with teammate"}
                  </p>
                  <p className="text-xs text-slate-400 truncate max-w-[220px]">{record?.title}</p>
                </div>
              </div>
              <button onClick={handleClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(85vh - 100px)" }}>
              {/* Sent state */}
              {status === "sent" ? (
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center px-6 py-12 gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-green-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-black text-slate-900">
                      {mode === "assign" ? "Assigned!" : "Sent!"}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {recipients.find(m => m.user_id === selectedId)?.email?.split("@")[0] || "Your teammate"} will
                      see it in their {mode === "assign" ? "dashboard and" : ""} Shared Inbox.
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      You'll be notified when they accept or decline.
                    </p>
                  </div>
                  <button onClick={handleClose}
                    className="mt-2 px-6 py-3 rounded-2xl text-sm font-bold text-white min-h-[48px]"
                    style={{ background: BRAND.primary }}>
                    Done
                  </button>
                </motion.div>
              ) : (
                <div className="px-5 py-4 space-y-5">
                  {/* Error */}
                  {status === "error" && (
                    <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3.5">
                      <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700 font-medium">{errorMsg}</p>
                    </div>
                  )}

                  {recipients.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm font-bold text-slate-500">No other team members yet</p>
                      <p className="text-xs text-slate-400 mt-1">Invite teammates from Team Settings</p>
                    </div>
                  ) : (
                    <>
                      {/* Mode toggle: Share vs Assign */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Action</p>
                        <div className="flex gap-2">
                          <button onClick={() => setMode("share")}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[48px] ${
                              mode === "share" ? "border-red-800 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-500"
                            }`}>
                            <Send size={14} />
                            Share
                          </button>
                          <button onClick={() => setMode("assign")}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[48px] ${
                              mode === "assign" ? "border-red-800 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-500"
                            }`}>
                            <UserCheck size={14} />
                            Assign
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {mode === "assign"
                            ? "The record will be assigned to this person. They become responsible for it."
                            : "They'll get a notification to view the record. Ownership stays with you."}
                        </p>
                      </div>

                      {/* Teammate picker */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Send to</p>
                        <div className="space-y-2">
                          {recipients.map(member => {
                            const name = member.email?.split("@")[0] || member.user_id.slice(0, 8);
                            const display = name.charAt(0).toUpperCase() + name.slice(1);
                            const isSelected = selectedId === member.user_id;
                            return (
                              <motion.button key={member.user_id} whileTap={{ scale: 0.98 }}
                                onClick={() => setSelectedId(isSelected ? null : member.user_id)}
                                className={`w-full flex items-center gap-3 rounded-2xl p-3.5 border-2 transition-all text-left ${
                                  isSelected ? "border-red-800 bg-red-50" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                                }`}>
                                <Avatar email={member.email} role={member.role} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-slate-900 truncate">{display}</p>
                                  <p className="text-xs text-slate-400 truncate">{member.email}</p>
                                </div>
                                {member.role === "admin" && (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                                    style={{ background: "#FEF9C3", color: "#A16207" }}>Admin</span>
                                )}
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                                    style={{ background: BRAND.primary }}>
                                    <CheckCircle2 size={12} className="text-white" />
                                  </div>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Message */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Message (optional)</p>
                        <textarea value={message} onChange={e => setMessage(e.target.value)}
                          placeholder="Add context for your teammate…" maxLength={200} rows={3}
                          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300 focus:bg-white transition-colors resize-none" />
                      </div>

                      {/* Send button */}
                      <button onClick={handleSend} disabled={!selectedId || status === "sending"}
                        className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-black text-white min-h-[56px] transition-opacity disabled:opacity-40"
                        style={{ background: BRAND.primary }}>
                        {status === "sending" ? (
                          <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Sending…</>
                        ) : mode === "assign" ? (
                          <><UserCheck size={16} /> Assign to teammate</>
                        ) : (
                          <><Send size={16} /> Share with teammate</>
                        )}
                      </button>

                      <p className="text-xs text-slate-400 text-center pb-2">
                        They'll receive a notification and can accept or decline. You'll be notified of their response.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
