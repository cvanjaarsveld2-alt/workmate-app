// ─── Notifications Screen ─────────────────────────────────────────────────────
// Shows all in-app team notifications for the current user.
// Notifications are created when a record is assigned/shared to them.
// Tapping a notification marks it read and navigates to the record.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Users, TrendingUp, Calendar, UserPlus, Inbox } from "lucide-react";
import { supabase } from "../supabase";
import { markNotificationsRead } from "../lib/teamNotifications";
import { Card, PageHeader, Empty, Toast, Btn } from "../components/ui";
import { BRAND } from "../lib/constants";
import { smartDate } from "../lib/helpers";

const TYPE_ICON = {
  lead:     { icon: TrendingUp, bg: "#EDE9FE", color: "#5B21B6" },
  followup: { icon: Calendar,   bg: "#DBEAFE", color: "#1E40AF" },
  client:   { icon: Users,      bg: "#DCFCE7", color: "#166534" },
  contact:  { icon: UserPlus,   bg: "#FEF3C7", color: "#92400E" },
};

export function NotificationsScreen({ userId, onNavigate, onMarkRead }) {
      const [pendingShares, setPendingShares] = useState(0);

      useEffect(() => {
        // Check for pending shares (notifications not yet accepted)
        supabase
          .from("team_notifications")
          .select("id", { count: "exact", head: true })
          .eq("to_user_id", userId)
          .eq("accepted", false)
          .then(({ count }) => setPendingShares(count || 0))
          .catch(() => {});
      }, [userId]);  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [toast, setToast]                 = useState("");

  useEffect(() => {
    loadNotifications();
    // Mark all as read when screen opens
    markNotificationsRead(userId).then(() => {
      onMarkRead?.();
    });
  }, [userId]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("team_notifications")
        .select("*")
        .eq("to_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications(data || []);
    } catch (e) {
      console.error("Failed to load notifications:", e);
    }
    setLoading(false);
  }

  function handleNotifTap(notif) {
    // Navigate to the relevant screen
    const screenMap = {
      lead:     "Leads",
      followup: "Followups",
      client:   "Clients",
      contact:  "Contacts",
    };
    const screen = screenMap[notif.record_type];
    if (screen && onNavigate) onNavigate(screen);
  }

  function timeAgo(isoDate) {
    if (!isoDate) return "";
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  async function clearAll() {
    try {
      await supabase
        .from("team_notifications")
        .delete()
        .eq("to_user_id", userId);
      setNotifications([]);
      setToast("Activity cleared");
    } catch (e) {
      setToast("Could not clear — try again");
    }
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <PageHeader title="Notifications" subtitle="Records shared with you by your team" />

      {/* Shared Inbox entry point */}
      <button onClick={() => onNavigate?.("SharedInbox")}
        className="w-full text-left">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: pendingShares > 0 ? "#DCFCE7" : "#F7F3F3" }}>
              <Inbox size={22} style={{ color: pendingShares > 0 ? "#16A34A" : BRAND.primary }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-900">Shared with me</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {pendingShares > 0
                  ? `${pendingShares} item${pendingShares !== 1 ? "s" : ""} waiting — tap to accept`
                  : "Nothing pending — all caught up"}
              </p>
            </div>
            {pendingShares > 0 && (
              <span className="rounded-full px-2.5 py-1 text-xs font-black text-white shrink-0"
                style={{ background: "#16A34A" }}>
                {pendingShares}
              </span>
            )}
          </div>
        </Card>
      </button>

      {/* Activity header with Clear All */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Activity</p>
        {notifications.length > 0 && (
          <button onClick={clearAll}
            className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors py-1 px-2 min-h-[36px]">
            Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-3 w-1/2 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Empty
          title="No notifications yet"
          text="When a teammate assigns or shares a record with you, it will appear here."
          icon={Bell}
        />
      ) : (
        <Card className="overflow-hidden divide-y divide-slate-50">
          {notifications.map(notif => {
            const typeInfo = TYPE_ICON[notif.record_type] || TYPE_ICON.lead;
            const Icon = typeInfo.icon;
            return (
              <motion.button
                key={notif.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => handleNotifTap(notif)}
                className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors min-h-[72px]"
                style={{ background: notif.read ? "white" : "#FEFAF5" }}>

                {/* Icon */}
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: typeInfo.bg }}>
                  <Icon size={18} style={{ color: typeInfo.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 leading-snug">
                    {notif.message || `A ${notif.record_type} was shared with you`}
                  </p>
                  {notif.record_title && (
                    <p className="text-xs font-bold mt-0.5 truncate" style={{ color: typeInfo.color }}>
                      {notif.record_title}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{timeAgo(notif.created_at)}</p>
                </div>

                {/* Unread dot */}
                {!notif.read && (
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                    style={{ background: BRAND.primary }} />
                )}
              </motion.button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
