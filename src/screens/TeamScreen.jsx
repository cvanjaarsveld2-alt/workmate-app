// ─── Team Screen ──────────────────────────────────────────────────────────────
// ADMIN view:
//   - Team-wide stats + pipeline (all members combined)
//   - Per-member cards (other members only, not self) — drill into each
//   - Members list with promote/demote/remove controls
//   - Team settings (invite code, shared items)
//
// MEMBER view:
//   - Team-wide stats + pipeline (context only)
//   - "Shared with me" section — accept/dismiss records shared to them
//   - Members list (read-only)
//   - Team settings (invite code to share with others)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Copy, Check, Crown, UserMinus, Plus,
  RefreshCw, LogOut, Shield, AlertTriangle, X,
  ChevronRight, ChevronDown, ChevronUp, ArrowLeft,
  Send, Inbox, TrendingUp, Calendar, UserPlus,
} from "lucide-react";
import { supabase } from "../supabase";
import { Card, Btn, Field, Toast, PageHeader, useConfirm } from "../components/ui";
import { MemberSelector } from "../components/MemberSelector";
import { sendAssignmentNotification } from "../lib/teamNotifications";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { triggerImmediateSync } from "../lib/sync";
import { offlineSave } from "../offline/offlineDb";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function money(n) {
  return "R\u00a0" + Math.round(n || 0).toLocaleString("en-ZA");
}
function getMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end:   now.toISOString().slice(0, 10),
  };
}

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const isAdmin = role === "admin";
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
      style={isAdmin ? { background: "#FEF9C3", color: "#A16207" } : { background: "#F1F5F9", color: "#64748B" }}>
      {isAdmin ? <Crown size={10} /> : <Shield size={10} />}
      {isAdmin ? "Admin" : "Member"}
    </span>
  );
}

// ─── Time ago ─────────────────────────────────────────────────────────────────
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

// ─── Member Dashboard (Admin only) ────────────────────────────────────────────
function MemberDashboard({ member, data, setData, members, currentUserId, userEmail, teamId, onBack }) {
  const today = todayISO();
  const { start, end } = getMonthRange();

  const allClients  = data.clients   || [];
  const allContacts = data.contacts  || [];
  const allLeads    = data.leads     || [];
  const allFU       = data.followups || [];
  const allExpenses = data.expenses  || [];

  const myClients  = allClients.filter(c => c.user_id === member.user_id);
  const myContacts = allContacts.filter(c => c.user_id === member.user_id);
  const myLeads    = allLeads.filter(l => l.user_id === member.user_id || l.assigned_to_user_id === member.user_id);
  const myFU       = allFU.filter(f => f.user_id === member.user_id || f.assigned_to_user_id === member.user_id);
  const myExpenses = allExpenses.filter(e => e.user_id === member.user_id);

  const openFU     = myFU.filter(f => !f.completed);
  const overdueFU  = openFU.filter(f => f.date < today);
  const openLeads  = myLeads.filter(l => !["Won","Lost"].includes(l.stage || "New"));
  const wonLeads   = myLeads.filter(l => l.stage === "Won");
  const monthExp   = myExpenses.filter(e => e.expense_date >= start && e.expense_date <= end);
  const monthTotal = monthExp.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);

  const [drillSection, setDrillSection] = useState(member._openSection || null);
  const [assignmentStatus, setAssignmentStatus] = useState("");

  async function reassignRecord(table, recordId, recordTitle, recordType, newUserId, newEmail) {
    const records = data[table] || [];
    const previous = records.find(record => record.id === recordId);
    if (!previous) return;

    const assignedName = newUserId ? (newEmail?.split("@")[0] || newEmail || "") : "";
    const updated = {
      ...previous,
      assigned_to_user_id: newUserId || null,
      assigned_to: assignedName,
      sync_status: "pending",
    };

    // Update the dashboard immediately while the server request is running.
    setData(current => ({
      ...current,
      [table]: (current[table] || []).map(record => record.id === recordId ? updated : record),
    }));

    const { error } = await supabase
      .from(table)
      .update({
        assigned_to_user_id: newUserId || null,
        assigned_to: assignedName || null,
        sync_status: "synced",
      })
      .eq("id", recordId);

    if (error) {
      // Restore the previous value if Supabase rejected the change.
      setData(current => ({
        ...current,
        [table]: (current[table] || []).map(record => record.id === recordId ? previous : record),
      }));
      setAssignmentStatus("Could not change the assignment. Please try again.");
      setTimeout(() => setAssignmentStatus(""), 3000);
      return;
    }

    const saved = { ...updated, sync_status: "synced" };
    setData(current => ({
      ...current,
      [table]: (current[table] || []).map(record => record.id === recordId ? saved : record),
    }));
    await offlineSave(table, saved);

    if (newUserId && newUserId !== currentUserId) {
      try {
        await sendAssignmentNotification({
          fromUserId: currentUserId, toUserId: newUserId, teamId,
          recordType, recordId, recordTitle, fromEmail: userEmail,
        });
      } catch (notificationError) {
        console.warn("Assignment saved, but notification failed:", notificationError);
      }
    }

    setAssignmentStatus(newUserId ? `Assigned to ${assignedName || "teammate"}` : "Assignment removed");
    setTimeout(() => setAssignmentStatus(""), 2500);
    triggerImmediateSync();
  }

  // ── Drill view ──────────────────────────────────────────────────────────────
  if (drillSection) {
    const sectionMap = {
      clients:  { data: myClients,  label: "Clients" },
      contacts: { data: myContacts, label: "Contacts" },
      followups:{ data: openFU,     label: "Follow-ups" },
      leads:    { data: openLeads,  label: "Opportunities" },
      expenses: { data: monthExp,   label: "Expenses (this month)" },
    };
    const { data: sectionData, label: sectionLabel } = sectionMap[drillSection] || { data: [], label: "" };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrillSection(null)}
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-slate-900">{sectionLabel}</p>
            <p className="text-xs text-slate-400 truncate">{member.email}</p>
          </div>
        </div>

        {assignmentStatus && (
          <div className={`rounded-xl px-4 py-3 text-sm font-bold ${assignmentStatus.startsWith("Could not") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {assignmentStatus}
          </div>
        )}

        {sectionData.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm font-bold text-slate-500">No {sectionLabel.toLowerCase()} yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden divide-y divide-slate-50">
            {sectionData.map(item => {
              if (drillSection === "clients") return (
                <div key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 leading-tight">{item.company}</p>
                      {item.branch && <p className="text-xs text-slate-400 mt-0.5">{item.branch}</p>}
                      {item.contact && <p className="text-xs text-slate-500 mt-0.5">{item.contact}</p>}
                    </div>
                    <span className="text-xs font-bold rounded-full px-2.5 py-1 shrink-0"
                      style={{ background: "#FEF3C7", color: "#92400E" }}>{item.stage || "New Lead"}</span>
                  </div>
                </div>
              );
              if (drillSection === "contacts") return (
                <div key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{item.name}</p>
                      {item.title && <p className="text-xs text-slate-500 mt-0.5">{item.title}</p>}
                      {item.company && <p className="text-xs text-slate-400">{item.company}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {item.phone && <p className="text-xs font-bold text-slate-600">{item.phone}</p>}
                      {item.email && <p className="text-xs text-slate-400 truncate max-w-[130px]">{item.email}</p>}
                    </div>
                  </div>
                </div>
              );
              if (drillSection === "followups") return (
                <div key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 leading-tight">{item.title}</p>
                      {item.client && <p className="text-xs text-slate-400 mt-0.5">{item.client}</p>}
                    </div>
                    <span className="text-xs font-bold shrink-0 rounded-full px-2.5 py-1"
                      style={item.date < today
                        ? { background: "#FEE2E2", color: "#991B1B" }
                        : { background: "#F1F5F9", color: "#64748B" }}>
                      {item.date < today ? "Overdue" : smartDate(item.date)}
                    </span>
                  </div>
                  {members.length > 0 && (
                    <MemberSelector
                      value={item.assigned_to_user_id}
                      onChange={(uid, email) => reassignRecord("followups", item.id, item.title, "followup", uid, email)}
                      members={members} currentUserId={currentUserId} placeholder="Reassign to…"
                    />
                  )}
                </div>
              );
              if (drillSection === "leads") return (
                <div key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 leading-tight">{item.title}</p>
                      {item.client_name && <p className="text-xs text-slate-400 mt-0.5">{item.client_name}</p>}
                    </div>
                    <span className="text-xs font-bold shrink-0 rounded-full px-2.5 py-1"
                      style={{ background: "#EDE9FE", color: "#5B21B6" }}>{item.stage || "New"}</span>
                  </div>
                  {members.length > 0 && (
                    <MemberSelector
                      value={item.assigned_to_user_id}
                      onChange={(uid, email) => reassignRecord("leads", item.id, item.title, "lead", uid, email)}
                      members={members} currentUserId={currentUserId} placeholder="Reassign to…"
                    />
                  )}
                </div>
              );
              if (drillSection === "expenses") return (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{item.vendor || "Unknown"}</p>
                    <p className="text-xs text-slate-400">{item.category} · {smartDate(item.expense_date)}</p>
                  </div>
                  <p className="text-sm font-black shrink-0" style={{ color: "#7C2D12" }}>
                    {money(item.amount_zar || item.amount)}
                  </p>
                </div>
              );
              return null;
            })}
          </Card>
        )}
      </div>
    );
  }

  // ── Member summary view ─────────────────────────────────────────────────────
  const name = member.email?.split("@")[0] || "Member";
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-slate-900">{displayName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <RoleBadge role={member.role} />
            <p className="text-xs text-slate-400 truncate">{member.email}</p>
          </div>
        </div>
      </div>

      {/* Tappable stat tiles — each drills into that section */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Clients",     value: myClients.length,  color: BRAND.primary, section: "clients" },
          { label: "Contacts",    value: myContacts.length, color: "#0E7490",     section: "contacts" },
          { label: "Open FU",     value: openFU.length,     color: openFU.length > 0 ? (overdueFU.length > 0 ? "#DC2626" : BRAND.primary) : "#16A34A", section: "followups" },
          { label: "Opportunities", value: openLeads.length, color: "#5B21B6",   section: "leads" },
          { label: "Expenses (month)", value: money(monthTotal), color: "#7C2D12", section: "expenses", wide: true },
        ].map(stat => (
          <button key={stat.label}
            onClick={() => setDrillSection(stat.section)}
            className={`text-left ${stat.wide ? "col-span-2" : ""}`}>
            <Card className="p-4 active:bg-slate-50 transition-colors">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-black mt-1 leading-none" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                Tap to view <ChevronRight size={11} className="text-slate-300" />
              </p>
            </Card>
          </button>
        ))}
      </div>

      {/* Recent clients preview */}
      {myClients.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">Recent Clients</p>
          <Card className="overflow-hidden divide-y divide-slate-50">
            {myClients
              .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
              .slice(0, 5)
              .map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{c.company}</p>
                    {c.branch && <p className="text-xs text-slate-400 truncate">{c.branch}</p>}
                  </div>
                  <span className="text-xs font-bold rounded-full px-2.5 py-1 shrink-0"
                    style={{ background: "#FEF3C7", color: "#92400E" }}>{c.stage || "New Lead"}</span>
                </div>
              ))}
            {myClients.length > 5 && (
              <button onClick={() => setDrillSection("clients")}
                className="w-full text-center py-3 text-xs font-bold min-h-[44px]"
                style={{ color: BRAND.primary }}>
                View all {myClients.length} clients
              </button>
            )}
          </Card>
        </div>
      )}

      {/* Overdue follow-ups alert */}
      {overdueFU.length > 0 && (
        <Card className="p-4 border-2" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-red-700">{overdueFU.length} overdue follow-up{overdueFU.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-red-500 mt-0.5">Need attention</p>
            </div>
            <button onClick={() => setDrillSection("followups")}
              className="text-xs font-bold text-red-600 px-3 py-2 rounded-xl min-h-[40px]"
              style={{ background: "#FEE2E2" }}>
              View all
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Shared With Me (Member view) ─────────────────────────────────────────────
function SharedWithMe({ userId, data, setData, onRefresh }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [accepting, setAccepting] = useState(null);
  const [toast, setToast]       = useState("");

  useEffect(() => { loadItems(); }, [userId]);

  async function loadItems() {
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from("team_notifications")
        .select("*")
        .eq("to_user_id", userId)
        .eq("accepted", false)
        .order("created_at", { ascending: false })
        .limit(30);
      setItems(rows || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function acceptItem(notif) {
    setAccepting(notif.id);
    try {
      const { data: result, error } = await supabase
        .rpc("accept_shared_record", {
          p_notification_id: notif.id,
          p_to_user_id: userId,
        });
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== notif.id));
      triggerImmediateSync();
      onRefresh?.();
      setToast("Added to your dashboard!");
    } catch (e) {
      setToast(e.message?.includes("Already") ? "Already added" : "Could not add — try again");
    }
    setAccepting(null);
  }

  async function dismissItem(notifId) {
    await supabase
      .from("team_notifications")
      .update({ read: true, accepted: true, accepted_at: new Date().toISOString() })
      .eq("id", notifId);
    setItems(prev => prev.filter(i => i.id !== notifId));
  }

  const TYPE_CONFIG = {
    client:   { icon: Users,      bg: "#DCFCE7", color: "#166534", label: "Client" },
    contact:  { icon: UserPlus,   bg: "#FEF3C7", color: "#92400E", label: "Contact" },
    lead:     { icon: TrendingUp, bg: "#EDE9FE", color: "#5B21B6", label: "Opportunity" },
    followup: { icon: Calendar,   bg: "#DBEAFE", color: "#1E40AF", label: "Follow-up" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw size={18} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "#F7F3F3" }}>
          <Inbox size={22} style={{ color: BRAND.primary }} />
        </div>
        <p className="text-sm font-bold text-slate-700">Nothing shared with you</p>
        <p className="text-xs text-slate-400 mt-1">When a teammate shares a record with you, it appears here.</p>
      </Card>
    );
  }

  return (
    <>
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>
      <div className="space-y-3">
        {items.map(notif => {
          const cfg  = TYPE_CONFIG[notif.record_type] || TYPE_CONFIG.client;
          const Icon = cfg.icon;
          const isAccepting = accepting === notif.id;
          return (
            <Card key={notif.id} className="overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: cfg.bg }}>
                    <Icon size={20} style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-xs font-bold rounded-full px-2 py-0.5"
                        style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      <span className="text-xs text-slate-400">{timeAgo(notif.created_at)}</span>
                    </div>
                    <p className="text-sm font-black text-slate-900">{notif.record_title || "Shared record"}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{notif.message}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => acceptItem(notif)} disabled={isAccepting}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px] disabled:opacity-60"
                    style={{ background: isAccepting ? "#94A3B8" : "#16A34A" }}>
                    {isAccepting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    {isAccepting ? "Adding…" : "Add to my dashboard"}
                  </button>
                  <button onClick={() => dismissItem(notif.id)} disabled={isAccepting}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 text-slate-500 min-h-[48px]">
                    <X size={14} /> Dismiss
                  </button>
                </div>
              </div>
              <div className="px-4 pb-3 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 text-center">
                  "Add to my dashboard" copies this {cfg.label.toLowerCase()} to your personal screens only.
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ─── Main TeamScreen ──────────────────────────────────────────────────────────
export function TeamScreen({ userId, userEmail, data, setData, onTeamChange }) {
  const [loading, setLoading]         = useState(true);
  const [team, setTeam]               = useState(null);
  const [members, setMembers]         = useState([]);
  const [myRole, setMyRole]           = useState(null);
  const [toast, setToast]             = useState("");
  const [copied, setCopied]           = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [showJoin, setShowJoin]       = useState(false);
  const [teamName, setTeamName]       = useState("Power Works (Pty) Ltd");
  const [inviteInput, setInviteInput] = useState("");
  const [saving, setSaving]           = useState(false);
  const [viewingMember, setViewingMember] = useState(null);
  const [showManage, setShowManage]   = useState(false);
  const { confirm, dialog }           = useConfirm();

  useEffect(() => { loadTeam(); }, [userId]);

  async function loadTeam() {
    setLoading(true);
    try {
      const { data: membership } = await supabase
        .from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
      if (!membership) { setTeam(null); setLoading(false); return; }
      setMyRole(membership.role);

      const { data: teamData } = await supabase
        .from("teams").select("id, name, invite_code").eq("id", membership.team_id).maybeSingle();
      setTeam(teamData);

      const { data: memberRows, error } = await supabase
        .rpc("get_team_member_emails", { p_team_id: membership.team_id });
      if (!error && memberRows) {
        setMembers(memberRows);
      } else {
        const { data: basicRows } = await supabase
          .from("team_members").select("user_id, role, joined_at").eq("team_id", membership.team_id);
        setMembers((basicRows || []).map(r => ({
          ...r,
          email: r.user_id === userId ? userEmail : `Member ${r.user_id.slice(0, 8)}`,
        })));
      }
    } catch (e) { console.error("loadTeam:", e); }
    setLoading(false);
  }

  async function createTeam() {
    if (!teamName.trim()) return;
    setSaving(true);
    try {
      const { data: newTeamJson, error } = await supabase
        .rpc("create_team_for_user", { p_name: teamName.trim(), p_user_id: userId });
      if (error) throw error;
      const newTeam = typeof newTeamJson === "string" ? JSON.parse(newTeamJson) : newTeamJson;
      await migrateToTeam(newTeam.id);
      setToast("Team created!");
      onTeamChange?.(newTeam.id);
      await loadTeam();
      setShowCreate(false);
    } catch (e) { setToast("Error: " + (e.message || "could not create team")); }
    setSaving(false);
  }

  async function joinTeam() {
    const code = inviteInput.trim().toUpperCase();
    if (!code) return;
    setSaving(true);
    try {
      const { data: teamJson, error } = await supabase
        .rpc("join_team_by_code", { p_invite_code: code, p_user_id: userId });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("Invalid")) throw new Error("Invalid invite code — check it and try again");
        if (msg.includes("Already")) throw new Error("You are already in this team");
        throw new Error(msg || "Could not join team");
      }
      const joinedTeam = typeof teamJson === "string" ? JSON.parse(teamJson) : teamJson;
      await migrateToTeam(joinedTeam.id);
      setToast(`Joined ${joinedTeam.name}!`);
      onTeamChange?.(joinedTeam.id);
      await loadTeam();
      setShowJoin(false);
      setInviteInput("");
    } catch (e) { setToast(e.message || "Could not join team"); }
    setSaving(false);
  }

  async function migrateToTeam(teamId) {
    try {
      await supabase.rpc("migrate_user_data_to_team", { p_user_id: userId, p_team_id: teamId });
    } catch (e) { console.warn("Migration:", e); }
  }

  async function regenerateInviteCode() {
    if (myRole !== "admin") return;
    const ok = await confirm("Generate a new invite code? The old one will stop working.", { confirmLabel: "Regenerate" });
    if (!ok) return;
    const newCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error } = await supabase.from("teams").update({ invite_code: newCode }).eq("id", team.id);
    if (error) { setToast("Failed to regenerate"); return; }
    setTeam(t => ({ ...t, invite_code: newCode }));
    setToast("New invite code generated");
  }

  async function removeMember(member) {
    const isMe = member.user_id === userId;
    const ok = await confirm(
      isMe ? "Leave this team? Your data will remain." : `Remove ${member.email} from the team?`,
      { confirmLabel: isMe ? "Leave" : "Remove" }
    );
    if (!ok) return;
    const { error } = await supabase.from("team_members")
      .delete().eq("user_id", member.user_id).eq("team_id", team.id);
    if (error) { setToast("Could not remove"); return; }
    if (isMe) { setTeam(null); setMembers([]); setMyRole(null); onTeamChange?.(null); }
    else { setMembers(m => m.filter(x => x.user_id !== member.user_id)); setToast("Member removed"); }
  }

  async function toggleRole(member) {
    if (myRole !== "admin" || member.user_id === userId) { setToast("Cannot change your own role"); return; }
    const newRole = member.role === "admin" ? "member" : "admin";
    const ok = await confirm(
      `${newRole === "admin" ? "Promote" : "Demote"} ${member.email} to ${newRole}?`,
      { confirmLabel: newRole === "admin" ? "Promote" : "Demote", confirmVariant: newRole === "admin" ? "success" : "danger" }
    );
    if (!ok) return;
    const { error } = await supabase.from("team_members")
      .update({ role: newRole }).eq("user_id", member.user_id).eq("team_id", team.id);
    if (error) { setToast("Could not update role"); return; }
    setMembers(m => m.map(x => x.user_id === member.user_id ? { ...x, role: newRole } : x));
    setToast(`${member.email} is now ${newRole}`);
  }

  function copyCode() {
    navigator.clipboard?.writeText(team?.invite_code || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareInviteLink() {
    if (!team) return;
    const link = `${window.location.origin}/?join=${team.invite_code}`;
    const text = `Join the ${team.name} team on PowerMate.\n\nInvite code: ${team.invite_code}\nOr open: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join PowerMate team", text }); } catch {}
    } else {
      navigator.clipboard?.writeText(text).catch(() => {});
      setToast("Invite text copied to clipboard");
    }
  }

  // ── Team-wide stats (before all early returns — React rules of hooks) ───────
  const teamStats = useMemo(() => {
    const today     = todayISO();
    const leads     = data?.leads     || [];
    const followups = data?.followups || [];
    const clients   = data?.clients   || [];
    const quotes    = data?.quotes    || [];

    const activeLeads   = leads.filter(l => !["Won","Lost"].includes(l.stage || "New")).length;
    const wonLeads      = leads.filter(l => l.stage === "Won").length;
    const todayFU       = followups.filter(f => !f.completed && f.date === today).length;
    const overdueFU     = followups.filter(f => !f.completed && f.date < today).length;
    const pendingQuotes = quotes.filter(q => q.status === "Pending").length;
    const wonRevenue    = quotes.filter(q => q.status === "Accepted")
      .reduce((s, q) => s + parseFloat(q.value || 0), 0);

    const pipeline = {
      "New Lead":  clients.filter(c => (c.stage || "New Lead") === "New Lead").length,
      "Contacted": clients.filter(c => c.stage === "Contacted").length,
      "Quoted":    clients.filter(c => c.stage === "Quoted").length,
      "Active":    clients.filter(c => c.stage === "Active").length,
      "Won":       clients.filter(c => c.stage === "Won").length,
    };
    const totalInPipeline = Object.values(pipeline).reduce((s, v) => s + v, 0);

    return { activeLeads, wonLeads, todayFU, overdueFU, pendingQuotes, wonRevenue, pipeline, totalInPipeline };
  }, [data]);

  // ── Admin drill into member ──────────────────────────────────────────────────
  if (viewingMember) {
    return (
      <MemberDashboard
        member={viewingMember}
        data={data || {}}
        setData={setData}
        members={members}
        currentUserId={userId}
        userEmail={userEmail}
        teamId={team?.id}
        onBack={() => setViewingMember(null)}
      />
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Team" subtitle="Loading…" />
        <Card className="p-6 flex items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-slate-300" />
        </Card>
      </div>
    );
  }

  // ── No team ─────────────────────────────────────────────────────────────────
  if (!team) {
    return (
      <div className="space-y-4">
        {dialog}
        <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>
        <PageHeader title="Team" subtitle="Set up team sharing for Power Works" />
        <Card className="p-5 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: "#F7F3F3" }}>
            <Users size={28} style={{ color: BRAND.primary }} />
          </div>
          <p className="text-base font-black text-slate-800">No team set up yet</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            Create a team to share clients, contacts, leads and follow-ups. Expenses always stay private.
          </p>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={() => { setShowCreate(true); setShowJoin(false); }}>
            <Plus size={16} /> Create team
          </Btn>
          <Btn variant="ghost" onClick={() => { setShowJoin(true); setShowCreate(false); }}>
            Join with code
          </Btn>
        </div>
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-base font-black text-slate-800">Create team</p>
                  <button onClick={() => setShowCreate(false)}><X size={18} className="text-slate-400" /></button>
                </div>
                <Field label="Team name" value={teamName} onChange={setTeamName} placeholder="Power Works (Pty) Ltd" />
                <Btn className="w-full" onClick={createTeam} disabled={saving}>
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
                  {saving ? "Creating…" : "Create team"}
                </Btn>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showJoin && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-base font-black text-slate-800">Join a team</p>
                  <button onClick={() => setShowJoin(false)}><X size={18} className="text-slate-400" /></button>
                </div>
                <Field label="Invite code" value={inviteInput}
                  onChange={v => setInviteInput(v.toUpperCase())} placeholder="e.g. AB12CD34" />
                <Btn className="w-full" onClick={joinTeam} disabled={saving || !inviteInput.trim()}>
                  {saving ? "Joining…" : "Join team"}
                </Btn>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Has a team ──────────────────────────────────────────────────────────────
  const otherMembers = members.filter(m => m.user_id !== userId);

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <PageHeader
        title={team.name}
        subtitle={`${members.length} member${members.length !== 1 ? "s" : ""} · ${myRole === "admin" ? "You are admin" : "Member"}`}
      />

      {/* ── Team-wide stats (everyone sees this) ── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Team Tasks Today</p>
          <p className="text-2xl font-black mt-1" style={{ color: teamStats.todayFU > 0 ? BRAND.primary : "#16A34A" }}>
            {teamStats.todayFU}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {teamStats.overdueFU > 0 ? `${teamStats.overdueFU} overdue` : "all on track"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Opportunities</p>
          <p className="text-2xl font-black mt-1" style={{ color: "#5B21B6" }}>{teamStats.activeLeads}</p>
          <p className="text-xs text-slate-400 mt-0.5">{teamStats.wonLeads} won</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Quotes</p>
          <p className="text-2xl font-black mt-1" style={{ color: "#B45309" }}>{teamStats.pendingQuotes}</p>
          <p className="text-xs text-slate-400 mt-0.5">awaiting response</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Won Revenue</p>
          <p className="text-xl font-black mt-1 leading-tight" style={{ color: "#16A34A" }}>{money(teamStats.wonRevenue)}</p>
          <p className="text-xs text-slate-400 mt-0.5">accepted quotes</p>
        </Card>
      </div>

      {/* ── Sales Pipeline (everyone sees this) ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Team Pipeline</p>
          <p className="text-xs text-slate-400">{teamStats.totalInPipeline} total</p>
        </div>
        <div className="space-y-2">
          {[
            { label: "New Lead",  color: "#92400E" },
            { label: "Contacted", color: "#1E40AF" },
            { label: "Quoted",    color: "#5B21B6" },
            { label: "Active",    color: "#0E7490" },
            { label: "Won",       color: "#16A34A" },
          ].map(({ label, color }) => {
            const count = teamStats.pipeline[label] || 0;
            const pct   = teamStats.totalInPipeline > 0 ? (count / teamStats.totalInPipeline) * 100 : 0;
            return (
              <div key={label} className="flex items-center gap-3">
                <p className="w-20 text-sm font-bold shrink-0" style={{ color }}>{label}</p>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: color }}
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                </div>
                <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ADMIN ONLY: Per-member breakdown */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {myRole === "admin" && otherMembers.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">
            Team Members
          </p>
          <div className="space-y-3">
            {otherMembers.map(m => {
              const allClients  = data?.clients   || [];
              const allContacts = data?.contacts  || [];
              const allLeads    = data?.leads     || [];
              const allFU       = data?.followups || [];

              const myClients  = allClients.filter(c => c.user_id === m.user_id);
              const myContacts = allContacts.filter(c => c.user_id === m.user_id);
              const myLeads    = allLeads.filter(l => l.user_id === m.user_id);
              const myOpenFU   = allFU.filter(f => f.user_id === m.user_id && !f.completed);
              const myOverdue  = myOpenFU.filter(f => f.date < todayISO());
              const activeLeads = myLeads.filter(l => !["Won","Lost"].includes(l.stage || "New")).length;

              const name = m.email?.split("@")[0] || "Member";
              const displayName = name.charAt(0).toUpperCase() + name.slice(1);

              return (
                <Card key={m.user_id} className="overflow-hidden">
                  {/* Header row */}
                  <button
                    onClick={() => setViewingMember(m)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                      style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                      {(m.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-slate-900">{displayName}</p>
                        <RoleBadge role={m.role} />
                      </div>
                      <p className="text-xs text-slate-400 truncate">{m.email}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  </button>

                  {/* Tappable stat cells */}
                  <div className="grid grid-cols-4 divide-x divide-slate-50">
                    {[
                      { label: "Clients",  value: myClients.length,  color: BRAND.primary, section: "clients" },
                      { label: "Contacts", value: myContacts.length, color: "#0E7490",     section: "contacts" },
                      { label: "Open FU",  value: myOpenFU.length,   color: myOpenFU.length > 0 ? (myOverdue.length > 0 ? "#DC2626" : BRAND.primary) : "#16A34A", section: "followups" },
                      { label: "Leads",    value: activeLeads,        color: "#5B21B6",    section: "leads" },
                    ].map(stat => (
                      <button key={stat.label}
                        onClick={() => setViewingMember({ ...m, _openSection: stat.section })}
                        className="flex flex-col items-center py-3 px-2 w-full active:bg-slate-50 transition-colors">
                        <p className="text-lg font-black leading-none" style={{ color: stat.color }}>{stat.value}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 text-center leading-tight">{stat.label}</p>
                      </button>
                    ))}
                  </div>

                  {/* Recent clients preview */}
                  {myClients.length > 0 && (
                    <div className="border-t border-slate-50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-4 pt-2.5 pb-1">
                        Recent clients
                      </p>
                      <div className="divide-y divide-slate-50">
                        {myClients
                          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
                          .slice(0, 3)
                          .map(c => (
                            <div key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{c.company}</p>
                                {c.branch && <p className="text-[10px] text-slate-400 truncate">{c.branch}</p>}
                              </div>
                              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0"
                                style={{ background: "#FEF3C7", color: "#92400E" }}>
                                {c.stage || "New Lead"}
                              </span>
                            </div>
                          ))}
                        {myClients.length > 3 && (
                          <button
                            onClick={() => setViewingMember({ ...m, _openSection: "clients" })}
                            className="w-full text-center py-2.5 text-[10px] font-bold min-h-[40px]"
                            style={{ color: BRAND.primary }}>
                            +{myClients.length - 3} more — tap to see all
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {myOverdue.length > 0 && (
                    <button
                      onClick={() => setViewingMember({ ...m, _openSection: "followups" })}
                      className="w-full flex items-center gap-2 px-4 py-3 border-t border-slate-50 text-left"
                      style={{ background: "#FEF2F2" }}>
                      <p className="text-xs font-bold text-red-600 flex-1">
                        ⚠ {myOverdue.length} overdue follow-up{myOverdue.length !== 1 ? "s" : ""}
                      </p>
                      <ChevronRight size={12} className="text-red-400 shrink-0" />
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MEMBER ONLY: Shared with me section */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {myRole !== "admin" && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">
            Shared with me
          </p>
          <SharedWithMe
            userId={userId}
            data={data}
            setData={setData}
            onRefresh={() => {}}
          />
        </div>
      )}

      {/* ── Members list (everyone sees) ── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Members</p>
          {myRole === "admin" && (
            <p className="text-xs text-slate-400">Tap name to view dashboard</p>
          )}
        </div>
        <div className="divide-y divide-slate-50">
          {members.map(m => {
            const isMe = m.user_id === userId;
            const name = m.email?.split("@")[0] || "Member";
            return (
              <div key={m.user_id}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-4 text-left min-h-[64px]"
                  onClick={() => myRole === "admin" && !isMe ? setViewingMember(m) : null}
                  style={{ cursor: myRole === "admin" && !isMe ? "pointer" : "default" }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
                    style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                    {(m.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate max-w-[160px]">
                        {name.charAt(0).toUpperCase() + name.slice(1)}{isMe ? " (you)" : ""}
                      </p>
                      <RoleBadge role={m.role} />
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {myRole === "admin" && !isMe && (
                      <button onClick={e => { e.stopPropagation(); toggleRole(m); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center">
                        <Crown size={14} style={{ color: m.role === "admin" ? "#A16207" : "#CBD5E1" }} />
                      </button>
                    )}
                    {(isMe || (myRole === "admin" && !isMe)) && (
                      <button onClick={e => { e.stopPropagation(); removeMember(m); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 min-w-[36px] min-h-[36px] flex items-center justify-center">
                        {isMe ? <LogOut size={14} /> : <UserMinus size={14} />}
                      </button>
                    )}
                    {myRole === "admin" && !isMe && <ChevronRight size={14} className="text-slate-300" />}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Team Settings (collapsible, everyone sees) ── */}
      <button onClick={() => setShowManage(s => !s)}
        className="w-full flex items-center justify-between px-1">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Team Settings</p>
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 min-h-[36px]" style={{ background: "#F7F3F3" }}>
          <p className="text-xs font-bold" style={{ color: BRAND.primary }}>
            {showManage ? "Hide" : "Invite code & settings"}
          </p>
          {showManage
            ? <ChevronUp size={13} style={{ color: BRAND.primary }} />
            : <ChevronDown size={13} style={{ color: BRAND.primary }} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {showManage && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-4">

            {/* Invite code */}
            <Card className="p-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Invite Code</p>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 rounded-xl bg-slate-50 border-2 border-slate-100 px-4 py-3 min-h-[52px] flex items-center">
                  <p className="text-2xl font-black tracking-[0.25em] text-slate-900">{team.invite_code}</p>
                </div>
                <button onClick={copyCode}
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                  style={{ background: copied ? "#DCFCE7" : "#F7F3F3" }}>
                  {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} style={{ color: BRAND.primary }} />}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Btn onClick={shareInviteLink} size="sm">
                  <Send size={13} /> Share invite
                </Btn>
                {myRole === "admin" && (
                  <Btn variant="ghost" size="sm" onClick={regenerateInviteCode}>
                    <RefreshCw size={13} /> New code
                  </Btn>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2.5 text-center leading-relaxed">
                Share this code with colleagues. They enter it in Team to join.
              </p>
            </Card>

            {/* What's shared */}
            <Card className="p-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Shared across team</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Clients",     shared: true },
                  { label: "Contacts",    shared: true },
                  { label: "Quotes",      shared: true },
                  { label: "Follow-ups",  shared: true },
                  { label: "Leads",       shared: true },
                  { label: "Field Notes", shared: true },
                  { label: "Equipment",   shared: true },
                  { label: "Expenses",    shared: false, note: "Always private" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: item.shared ? "#DCFCE7" : "#F1F5F9" }}>
                      {item.shared
                        ? <Check size={10} className="text-green-600" />
                        : <X size={8} className="text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700 leading-tight">{item.label}</p>
                      {item.note && <p className="text-[10px] text-slate-400">{item.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warning */}
      <Card className="p-4 border-2" style={{ borderColor: "#FED7AA", background: "#FFF7ED" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            All team members can view and edit shared data. Expenses are always private — no one else can see yours.
          </p>
        </div>
      </Card>
    </div>
  );
}
