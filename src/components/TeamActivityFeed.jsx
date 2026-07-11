// ─── Team Activity Feed ───────────────────────────────────────────────────────
// Real-time team activity stream: "Jaco added client Kumba", "Pieter closed
// lead R45,000 — Won 🎉". Renders as a scrollable feed component.
//
// Two options for data source:
// A) Read from team_notifications (already populated by sharing)
// B) Add a Postgres trigger that writes to an activity_log table on
//    insert/update of key tables — see SUPABASE_ACTIVITY_LOG.sql
//
// This component supports both: if data.teamActivity exists, use it;
// otherwise fall back to team_notifications filtered by team_id.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, TrendingUp, Calendar, UserPlus, FileText, RefreshCw, Zap } from "lucide-react";
import { supabase } from "../supabase";
import { Card } from "../components/ui";
import { BRAND } from "../lib/constants";

const TYPE_ICON = {
  client:   { icon: Users,      bg: "#DCFCE7", color: "#166534" },
  contact:  { icon: UserPlus,   bg: "#FEF3C7", color: "#92400E" },
  lead:     { icon: TrendingUp, bg: "#EDE9FE", color: "#5B21B6" },
  followup: { icon: Calendar,   bg: "#DBEAFE", color: "#1E40AF" },
  quote:    { icon: FileText,   bg: "#CFFAFE", color: "#0E7490" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000), hours = Math.floor(ms / 3600000), days = Math.floor(ms / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function TeamActivityFeed({ teamId, userId, limit = 20 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (teamId) loadFeed(); }, [teamId]);

  async function loadFeed() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("team_notifications")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && data) setItems(data);
    } catch (e) {
      console.warn("Feed load failed:", e);
    }
    setLoading(false);
  }

  if (!teamId) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: BRAND.primary }} />
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Team Activity</p>
        </div>
        <button onClick={loadFeed} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-6"><div className="h-4 bg-slate-100 rounded animate-pulse" /></div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center"><p className="text-xs text-slate-400">No team activity yet</p></div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
          {items.map(item => {
            const meta = TYPE_ICON[item.record_type] || TYPE_ICON.client;
            const Icon = meta.icon;
            const fromName = item.from_email?.split("@")[0] || item.message?.split(" ")[0] || "Teammate";

            // Parse the message to build a nicer display
            let actionText = item.message || "";
            const isAccepted = actionText.includes("✅") || actionText.includes("accepted");
            const isDeclined = actionText.includes("❌") || actionText.includes("declined");

            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: meta.bg }}>
                  <Icon size={12} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 break-words leading-relaxed">
                    {actionText}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(item.created_at)}</p>
                </div>
                {isAccepted && <span className="text-green-500 text-xs shrink-0">✅</span>}
                {isDeclined && <span className="text-red-500 text-xs shrink-0">❌</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
