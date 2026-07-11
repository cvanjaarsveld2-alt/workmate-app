// ─── Shared Inbox Screen ──────────────────────────────────────────────────────
// Shows records shared with the current user.
// Accept → record appears on their dashboard, sender notified ✅
// Decline → item removed, sender notified ❌
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Check, X, Users, TrendingUp,
  Calendar, UserPlus, RefreshCw, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { supabase } from "../supabase";
import { triggerImmediateSync } from "../lib/sync";
import { sendResponseNotification } from "../lib/teamNotifications";
import { Card, PageHeader, Empty, Toast, Btn } from "../components/ui";
import { BRAND } from "../lib/constants";
import { smartDate } from "../lib/helpers";

const TYPE_CONFIG = {
  client:   { icon: Users,      bg: "#DCFCE7", color: "#166534", label: "Client"    },
  contact:  { icon: UserPlus,   bg: "#FEF3C7", color: "#92400E", label: "Contact"   },
  lead:     { icon: TrendingUp, bg: "#EDE9FE", color: "#5B21B6", label: "Lead"      },
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

// Single inbox item card
function InboxItem({ notif, onAccept, onDecline, accepting, declining }) {
  const meta     = TYPE_CONFIG[notif.record_type] || TYPE_CONFIG.client;
  const TypeIcon = meta.icon;
  const fromName = notif.from_email?.split("@")[0] || notif.from_user_id?.slice(0, 8) || "Teammate";
  const busy     = accepting || declining;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}>
      <Card className="overflow-hidden">
        {/* Type strip */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-50"
          style={{ background: meta.bg + "55" }}>
          <TypeIcon size={13} style={{ color: meta.color }} />
          <span className="text-xs font-black uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="ml-auto text-[10px] text-slate-400">{timeAgo(notif.created_at)}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3.5 space-y-1">
          <p className="text-sm font-black text-slate-900 leading-snug">
            {notif.record_title || "Unnamed record"}
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            {notif.message || `Shared by ${fromName}`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          {/* Decline */}
          <button
            onClick={() => !busy && onDecline(notif)}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 border-2 border-slate-200 bg-white text-slate-600 text-sm font-bold min-h-[48px] disabled:opacity-40 transition-opacity">
            {declining ? (
              <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
            ) : (
              <><X size={15} className="text-red-500" /> Decline</>
            )}
          </button>

          {/* Accept */}
          <button
            onClick={() => !busy && onAccept(notif)}
            disabled={busy}
            className="flex-[2] flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white min-h-[48px] disabled:opacity-40 transition-opacity"
            style={{ background: BRAND.primary }}>
            {accepting ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <><Check size={15} /> Accept — add to my dashboard</>
            )}
          </button>
        </div>
      </Card>
    </motion.div>
  );
}

export function SharedInboxScreen({ userId, userEmail, teamId, onBack, onAccepted }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [actionId, setActionId]   = useState(null);   // { id, action: "accept"|"decline" }
  const [toast, setToast]         = useState("");

  useEffect(() => { loadInbox(); }, [userId]);

  async function loadInbox() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("team_notifications")
        .select("*")
        .eq("to_user_id", userId)
        .eq("accepted", false)
        .is("declined", null)         // null = pending (not yet declined)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error) setItems(data || []);
    } catch (e) {
      console.error("Inbox load failed:", e);
    }
    setLoading(false);
  }

  async function acceptItem(notif) {
    setActionId({ id: notif.id, action: "accept" });
    try {
      const { error } = await supabase.rpc("accept_shared_record", {
        p_notification_id: notif.id,
        p_to_user_id:      userId,
      });
      if (error) throw error;

      // Notify the original sender of acceptance
      await sendResponseNotification({
        fromUserId:      notif.from_user_id,
        responderUserId: userId,
        responderEmail:  userEmail,
        teamId:          teamId || notif.team_id,
        recordType:      notif.record_type,
        recordTitle:     notif.record_title,
        accepted:        true,
      }).catch(() => {}); // best-effort

      setItems(prev => prev.filter(i => i.id !== notif.id));
      triggerImmediateSync();
      onAccepted?.();
      setToast(`${TYPE_CONFIG[notif.record_type]?.label || "Record"} added to your dashboard ✅`);
    } catch (e) {
      console.error("Accept failed:", e);
      setToast(
        e.message?.includes("Already accepted")
          ? "Already on your dashboard"
          : "Could not accept — try again"
      );
    }
    setActionId(null);
  }

  async function declineItem(notif) {
    setActionId({ id: notif.id, action: "decline" });
    try {
      // Mark as declined in the notifications table
      await supabase
        .from("team_notifications")
        .update({
          declined:    true,
          declined_at: new Date().toISOString(),
          read:        true,
        })
        .eq("id", notif.id);

      // Notify the original sender of the decline
      await sendResponseNotification({
        fromUserId:      notif.from_user_id,
        responderUserId: userId,
        responderEmail:  userEmail,
        teamId:          teamId || notif.team_id,
        recordType:      notif.record_type,
        recordTitle:     notif.record_title,
        accepted:        false,
      }).catch(() => {}); // best-effort

      setItems(prev => prev.filter(i => i.id !== notif.id));
      setToast("Declined ❌ — the sender has been notified");
    } catch (e) {
      console.error("Decline failed:", e);
      setToast("Could not decline — try again");
    }
    setActionId(null);
  }

  const pending = items.filter(i => !i.accepted && !i.declined);

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack}
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <p className="text-xl font-black text-slate-900">Shared with me</p>
          <p className="text-sm text-slate-400">
            {loading
              ? "Loading…"
              : pending.length > 0
                ? `${pending.length} item${pending.length !== 1 ? "s" : ""} waiting`
                : "All caught up"}
          </p>
        </div>
        <button onClick={loadInbox}
          className="ml-auto p-2.5 rounded-xl bg-slate-100 text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map(i => (
            <div key={i} className="rounded-2xl bg-white border border-slate-100 h-32 animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-3xl bg-white border border-slate-100 p-10 flex flex-col items-center gap-3">
          <CheckCircle2 size={32} className="text-green-500" />
          <p className="text-base font-black text-slate-900">All caught up</p>
          <p className="text-sm text-slate-400 text-center">
            Nothing waiting in your inbox. When a teammate shares something with you, it'll appear here.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {pending.map(notif => (
            <InboxItem
              key={notif.id}
              notif={notif}
              onAccept={acceptItem}
              onDecline={declineItem}
              accepting={actionId?.id === notif.id && actionId.action === "accept"}
              declining={actionId?.id === notif.id && actionId.action === "decline"}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
