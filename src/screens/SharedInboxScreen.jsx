// ─── Shared Inbox Screen ──────────────────────────────────────────────────────
// Shows all records that have been shared/assigned to the current user.
// User can accept (copy to their personal dashboard) or dismiss each one.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Check, X, Users, TrendingUp,
  Calendar, UserPlus, RefreshCw, ArrowLeft,
} from "lucide-react";
import { supabase } from "../supabase";
import { triggerImmediateSync } from "../lib/sync";
import { Card, PageHeader, Empty, Toast, Btn } from "../components/ui";
import { BRAND } from "../lib/constants";
import { smartDate } from "../lib/helpers";

const TYPE_CONFIG = {
  client:   { icon: Users,      bg: "#DCFCE7", color: "#166534", label: "Client" },
  contact:  { icon: UserPlus,   bg: "#FEF3C7", color: "#92400E", label: "Contact" },
  lead:     { icon: TrendingUp, bg: "#EDE9FE", color: "#5B21B6", label: "Lead" },
  followup: { icon: Calendar,   bg: "#DBEAFE", color: "#1E40AF", label: "Follow-up" },
};

function timeAgo(isoDate) {
  if (!isoDate) return "";
  const diff  = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function SharedInboxScreen({ userId, onBack, onAccepted }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [accepting, setAccepting] = useState(null);
  const [toast, setToast]       = useState("");

  useEffect(() => { loadInbox(); }, [userId]);

  async function loadInbox() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("team_notifications")
        .select("*")
        .eq("to_user_id", userId)
        .eq("accepted", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error) setItems(data || []);
    } catch (e) {
      console.error("Inbox load failed:", e);
    }
    setLoading(false);
  }

  async function acceptItem(notif) {
    setAccepting(notif.id);
    try {
      const { data, error } = await supabase
        .rpc("accept_shared_record", {
          p_notification_id: notif.id,
          p_to_user_id: userId,
        });

      if (error) throw error;

      // Remove from inbox
      setItems(prev => prev.filter(i => i.id !== notif.id));

      // Trigger sync so the new record appears immediately
      triggerImmediateSync();
      onAccepted?.();

      const result = typeof data === "string" ? JSON.parse(data) : data;
      setToast(`${TYPE_CONFIG[notif.record_type]?.label || "Record"} added to your dashboard!`);
    } catch (e) {
      console.error("Accept failed:", e);
      setToast(e.message?.includes("Already accepted")
        ? "Already added to your dashboard"
        : "Could not accept — try again");
    }
    setAccepting(null);
  }

  async function dismissItem(notifId) {
    try {
      await supabase
        .from("team_notifications")
        .update({ read: true, accepted: true, accepted_at: new Date().toISOString() })
        .eq("id", notifId);
      setItems(prev => prev.filter(i => i.id !== notifId));
    } catch (e) {
      console.error("Dismiss failed:", e);
    }
  }

  const pending = items.filter(i => !i.accepted);

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* Header with back button */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack}
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ArrowLeft size={18} />
          </button>
        )}
        <PageHeader
          title="Shared with me"
          subtitle={pending.length > 0
            ? `${pending.length} item${pending.length !== 1 ? "s" : ""} waiting`
            : "All caught up"}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-3 w-1/2 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : pending.length === 0 ? (
        <Empty
          title="Nothing shared with you yet"
          text="When a teammate shares a client, lead, contact or follow-up with you it will appear here."
          icon={Inbox}
        />
      ) : (
        <div className="space-y-3">
          {pending.map(notif => {
            const cfg  = TYPE_CONFIG[notif.record_type] || TYPE_CONFIG.client;
            const Icon = cfg.icon;
            const isAccepting = accepting === notif.id;

            return (
              <motion.div key={notif.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                layout>
                <Card className="overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      {/* Type icon */}
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: cfg.bg }}>
                        <Icon size={22} style={{ color: cfg.color }} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-bold rounded-full px-2 py-0.5"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-slate-400">{timeAgo(notif.created_at)}</span>
                        </div>
                        <p className="text-sm font-black text-slate-900 leading-tight">
                          {notif.record_title || "Shared record"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                          {notif.message || "A record was shared with you"}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => acceptItem(notif)}
                        disabled={isAccepting}
                        className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white min-h-[48px] transition-all disabled:opacity-60"
                        style={{ background: isAccepting ? "#94A3B8" : "#16A34A" }}>
                        {isAccepting
                          ? <RefreshCw size={15} className="animate-spin" />
                          : <Check size={15} />}
                        {isAccepting ? "Adding…" : "Add to my dashboard"}
                      </button>
                      <button
                        onClick={() => dismissItem(notif.id)}
                        disabled={isAccepting}
                        className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 text-slate-500 min-h-[48px] transition-all">
                        <X size={15} /> Dismiss
                      </button>
                    </div>
                  </div>

                  {/* Bottom hint */}
                  <div className="px-4 pb-3">
                    <p className="text-[10px] text-slate-400 text-center leading-snug">
                      "Add to my dashboard" copies this {cfg.label.toLowerCase()} to your personal screens.
                      The original stays with your teammate.
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Refresh button */}
      <button onClick={loadInbox}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-slate-400 min-h-[44px]">
        <RefreshCw size={14} /> Refresh
      </button>
    </div>
  );
}
