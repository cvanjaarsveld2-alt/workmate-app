// ─── Team Screen ──────────────────────────────────────────────────────────────
// Manage the Power Works team.
// - Admin: invite code, member list with activity, view member dashboard,
//   promote/demote roles, remove members
// - Member: view invite code, see teammates, leave team
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Copy, Check, Crown, UserMinus, Plus,
  RefreshCw, LogOut, Shield, AlertTriangle, X,
  ChevronRight, ChevronDown, ChevronUp, ArrowLeft, Calendar, TrendingUp,
  Receipt, Clipboard, Wrench, Send,
} from "lucide-react";
import { supabase } from "../supabase";
import { Card, Btn, Field, Toast, PageHeader, useConfirm } from "../components/ui";
import { MemberSelector } from "../components/MemberSelector";
import { sendAssignmentNotification } from "../lib/teamNotifications";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function money(n) {
  return "R\u00a0" + Math.round(n || 0).toLocaleString("en-ZA");
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end   = now.toISOString().slice(0, 10);
  return { start, end };
}

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const isAdmin = role === "admin";
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
      style={isAdmin
        ? { background: "#FEF9C3", color: "#A16207" }
        : { background: "#F1F5F9", color: "#64748B" }}>
      {isAdmin ? <Crown size={10} /> : <Shield size={10} />}
      {isAdmin ? "Admin" : "Member"}
    </span>
  );
}

// ─── Member Dashboard ─────────────────────────────────────────────────────────
function MemberDashboard({ member, data, members, currentUserId, userEmail, teamId, onBack }) {
  const { start, end } = getMonthRange();
  const today = todayISO();

  const allFollowups = data.followups || [];
  const allLeads     = data.leads     || [];
  const allNotes     = data.notes     || [];
  const allExpenses  = data.expenses  || [];
  const allClients   = data.clients   || [];
  const allContacts  = data.contacts  || [];

  // Filter by owned OR assigned to this member
  const memberFollowups = allFollowups.filter(f => f.user_id === member.user_id || f.assigned_to_user_id === member.user_id);
  const memberLeads     = allLeads.filter(l => l.user_id === member.user_id || l.assigned_to_user_id === member.user_id);
  const memberNotes     = allNotes.filter(n => n.user_id === member.user_id);
  const memberExpenses  = allExpenses.filter(e => e.user_id === member.user_id);
  // Clients and contacts assigned to this member
  const assignedClients  = allClients.filter(c => c.assigned_to_user_id === member.user_id);
  const assignedContacts = allContacts.filter(c => c.assigned_to_user_id === member.user_id);

  const todayFU        = memberFollowups.filter(f => !f.completed && f.date === today);
  const overdueFU      = memberFollowups.filter(f => !f.completed && f.date < today);
  const completedFU    = memberFollowups.filter(f => f.completed);
  const openLeads      = memberLeads.filter(l => !["Won","Lost"].includes(l.stage || "New"));
  const wonLeads       = memberLeads.filter(l => l.stage === "Won");
  const monthExpenses  = memberExpenses.filter(e => e.expense_date >= start && e.expense_date <= end);
  const monthExpTotal  = monthExpenses.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);
  const openNotes      = memberNotes.filter(n => !n.resolved);

  // Recent follow-ups
  const recentFU = memberFollowups
    .filter(f => !f.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Recent leads
  const recentLeads = memberLeads
    .filter(l => !["Won","Lost"].includes(l.stage || "New"))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5);

  const [drillSection, setDrillSection] = useState(null); // null | "leads" | "followups" | "clients" | "contacts"

  // ── Reassign a record to another member ────────────────────────────────────
  async function reassignRecord(table, recordId, recordTitle, recordType, newUserId, newEmail) {
    if (!newUserId) return;
    const { error } = await supabase
      .from(table)
      .update({ assigned_to_user_id: newUserId, assigned_to: newEmail?.split("@")[0] || newEmail })
      .eq("id", recordId);
    if (error) { console.warn("Reassign failed:", error); return; }

    if (newUserId !== currentUserId) {
      await sendAssignmentNotification({
        fromUserId: currentUserId,
        toUserId: newUserId,
        teamId,
        recordType,
        recordId,
        recordTitle,
        fromEmail: userEmail,
      });
    }
  }

  // ── Drill-through view ─────────────────────────────────────────────────────
  if (drillSection) {
    const sectionData = {
      leads:     memberLeads.filter(l => !["Won","Lost"].includes(l.stage || "New")),
      followups: memberFollowups.filter(f => !f.completed),
      clients:   assignedClients,
      contacts:  assignedContacts,
    }[drillSection] || [];

    const sectionLabel = { leads: "Leads", followups: "Follow-ups", clients: "Clients", contacts: "Contacts" }[drillSection];

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

        {sectionData.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm font-bold text-slate-500">No {sectionLabel.toLowerCase()} for this member yet.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-slate-50 overflow-hidden">
            {sectionData.map(item => {
              if (drillSection === "leads") return (
                <div key={item.id} className="px-4 py-3.5 space-y-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
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
                      members={members}
                      currentUserId={currentUserId}
                      placeholder="Assign to a member"
                    />
                  )}
                </div>
              );
              if (drillSection === "followups") return (
                <div key={item.id} className="px-4 py-3.5 space-y-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 leading-tight">{item.title}</p>
                      {item.client && <p className="text-xs text-slate-400 mt-0.5">{item.client}</p>}
                    </div>
                    <span className="text-xs font-bold shrink-0 rounded-full px-2.5 py-1"
                      style={item.date < todayISO()
                        ? { background: "#FEE2E2", color: "#991B1B" }
                        : { background: "#F1F5F9", color: "#64748B" }}>
                      {smartDate(item.date)}
                    </span>
                  </div>
                  {members.length > 0 && (
                    <MemberSelector
                      value={item.assigned_to_user_id}
                      onChange={(uid, email) => reassignRecord("followups", item.id, item.title, "followup", uid, email)}
                      members={members}
                      currentUserId={currentUserId}
                      placeholder="Assign to a member"
                    />
                  )}
                </div>
              );
              if (drillSection === "clients") return (
                <div key={item.id} className="px-4 py-3.5 border-b border-slate-50 last:border-0">
                  <p className="text-sm font-bold text-slate-800">{item.company}</p>
                  {item.branch && <p className="text-xs text-slate-400 mt-0.5">{item.branch}</p>}
                  <span className="text-xs font-bold rounded-full px-2 py-0.5 mt-1 inline-block"
                    style={{ background: "#DBEAFE", color: "#1E40AF" }}>{item.stage || "New Lead"}</span>
                </div>
              );
              if (drillSection === "contacts") return (
                <div key={item.id} className="px-4 py-3.5 border-b border-slate-50 last:border-0">
                  <p className="text-sm font-bold text-slate-800">{item.name}</p>
                  {item.company && <p className="text-xs text-slate-400 mt-0.5">{item.company}</p>}
                  {item.phone && <p className="text-xs text-slate-400">{item.phone}</p>}
                </div>
              );
              return null;
            })}
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-slate-900 truncate">{member.email}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <RoleBadge role={member.role} />
            <p className="text-xs text-slate-400">Joined {member.joined_at ? smartDate(member.joined_at.slice(0,10)) : "—"}</p>
          </div>
        </div>
      </div>

      {/* Tappable stats grid — each card drills into the full list */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setDrillSection("followups")} className="text-left">
          <Card className="p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Tasks</p>
            <p className="text-2xl font-black mt-1" style={{ color: todayFU.length > 0 ? BRAND.primary : "#16A34A" }}>
              {todayFU.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              {todayFU.length === 0 ? "all clear" : "follow-ups due"}
              <ChevronRight size={11} className="text-slate-300" />
            </p>
          </Card>
        </button>
        <button onClick={() => setDrillSection("leads")} className="text-left">
          <Card className="p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Leads</p>
            <p className="text-2xl font-black mt-1" style={{ color: "#0E7490" }}>{openLeads.length}</p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              {wonLeads.length} won
              <ChevronRight size={11} className="text-slate-300" />
            </p>
          </Card>
        </button>
        <button onClick={() => setDrillSection("clients")} className="text-left">
          <Card className="p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Clients</p>
            <p className="text-2xl font-black mt-1" style={{ color: "#5B21B6" }}>
              {assignedClients.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              shared to them <ChevronRight size={11} className="text-slate-300" />
            </p>
          </Card>
        </button>
        <button onClick={() => setDrillSection("contacts")} className="text-left">
          <Card className="p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Contacts</p>
            <p className="text-2xl font-black mt-1" style={{ color: "#A16207" }}>
              {assignedContacts.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              shared to them <ChevronRight size={11} className="text-slate-300" />
            </p>
          </Card>
        </button>
      </div>

      {/* Completion rate */}
      {memberFollowups.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Follow-up Completion</p>
            <p className="text-sm font-black" style={{ color: BRAND.primary }}>
              {Math.round((completedFU.length / memberFollowups.length) * 100)}%
            </p>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <motion.div className="h-full rounded-full"
              style={{ background: BRAND.primary }}
              initial={{ width: 0 }}
              animate={{ width: `${(completedFU.length / memberFollowups.length) * 100}%` }}
              transition={{ duration: 0.5 }} />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {completedFU.length} of {memberFollowups.length} completed
          </p>
        </Card>
      )}

      {/* Open follow-ups */}
      {recentFU.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">
            Open Follow-ups
          </p>
          <Card className="divide-y divide-slate-50 overflow-hidden">
            {recentFU.map(fu => {
              const isOverdue = fu.date < today;
              return (
                <div key={fu.id} className="px-4 py-3.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 leading-tight">{fu.title}</p>
                    {fu.client && <p className="text-xs text-slate-400 mt-0.5">{fu.client}</p>}
                  </div>
                  <span className="text-xs font-bold shrink-0 rounded-full px-2 py-0.5"
                    style={isOverdue
                      ? { background: "#FEE2E2", color: "#991B1B" }
                      : { background: "#F1F5F9", color: "#64748B" }}>
                    {isOverdue ? "Overdue" : smartDate(fu.date)}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* Active leads */}
      {recentLeads.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">
            Active Leads
          </p>
          <Card className="divide-y divide-slate-50 overflow-hidden">
            {recentLeads.map(lead => (
              <div key={lead.id} className="px-4 py-3.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 leading-tight">{lead.title}</p>
                  {lead.client_name && <p className="text-xs text-slate-400 mt-0.5">{lead.client_name}</p>}
                </div>
                <span className="text-xs font-bold shrink-0 rounded-full px-2 py-0.5"
                  style={{ background: "#EDE9FE", color: "#5B21B6" }}>
                  {lead.stage || "New"}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Open notes */}
      {openNotes.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">
            Open Field Notes
          </p>
          <Card className="divide-y divide-slate-50 overflow-hidden">
            {openNotes.slice(0, 5).map(note => (
              <div key={note.id} className="px-4 py-3.5">
                <p className="text-sm font-bold text-slate-800 leading-tight truncate">{note.client || "No client"}</p>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{note.note}</p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Expense breakdown */}
      {monthExpenses.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">
            This Month's Expenses
          </p>
          <Card className="divide-y divide-slate-50 overflow-hidden">
            {monthExpenses.slice(0, 8).map(exp => (
              <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{exp.vendor || "Unknown vendor"}</p>
                  <p className="text-xs text-slate-400">{exp.category} · {smartDate(exp.expense_date)}</p>
                </div>
                <p className="text-sm font-black shrink-0" style={{ color: "#7C2D12" }}>
                  {money(exp.amount_zar || exp.amount)}
                </p>
              </div>
            ))}
            {monthExpenses.length > 8 && (
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-slate-400">+{monthExpenses.length - 8} more expenses this month</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {memberFollowups.length === 0 && memberLeads.length === 0 && memberExpenses.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold text-slate-500">No activity recorded yet for this member.</p>
          <p className="text-xs text-slate-400 mt-1">Data will appear here once they start using the app.</p>
        </Card>
      )}
    </div>
  );
}

// ─── Main TeamScreen ──────────────────────────────────────────────────────────
export function TeamScreen({ userId, userEmail, data, onTeamChange }) {
  const [loading, setLoading]         = useState(true);
  const [team, setTeam]               = useState(null);
  const [members, setMembers]         = useState([]);
  const [myRole, setMyRole]           = useState(null);
  const [toast, setToast]             = useState("");
  const [copied, setCopied]           = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [showJoin, setShowJoin]       = useState(false);
  const [showManage, setShowManage]   = useState(false);
  const [teamName, setTeamName]       = useState("Power Works (Pty) Ltd");
  const [inviteInput, setInviteInput] = useState("");
  const [saving, setSaving]           = useState(false);
  const [viewingMember, setViewingMember] = useState(null);
  const { confirm, dialog }           = useConfirm();

  useEffect(() => { loadTeam(); }, [userId]);

  async function loadTeam() {
    setLoading(true);
    try {
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!membership) { setTeam(null); setLoading(false); return; }
      setMyRole(membership.role);

      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name, invite_code")
        .eq("id", membership.team_id)
        .maybeSingle();

      setTeam(teamData);

      // Load members with emails via security definer function
      const { data: memberRows, error } = await supabase
        .rpc("get_team_member_emails", { p_team_id: membership.team_id });

      if (!error && memberRows) {
        setMembers(memberRows);
      } else {
        // Fallback: load without emails
        const { data: basicRows } = await supabase
          .from("team_members")
          .select("id, user_id, role, joined_at")
          .eq("team_id", membership.team_id)
          .order("joined_at");
        setMembers((basicRows || []).map(r => ({ ...r, email: r.user_id === userId ? userEmail : `Member ${r.user_id.slice(0,8)}…` })));
      }
    } catch (e) {
      console.error("loadTeam failed:", e);
    }
    setLoading(false);
  }

  async function createTeam() {
    if (!teamName.trim()) return;
    setSaving(true);
    try {
      const { data: newTeamJson, error: te } = await supabase
        .rpc("create_team_for_user", { p_name: teamName.trim(), p_user_id: userId });
      if (te) throw te;
      const newTeam = typeof newTeamJson === "string" ? JSON.parse(newTeamJson) : newTeamJson;
      await migrateToTeam(newTeam.id);
      setToast("Team created!");
      onTeamChange?.(newTeam.id);
      await loadTeam();
      setShowCreate(false);
    } catch (e) {
      setToast("Error: " + (e.message || "could not create team"));
    }
    setSaving(false);
  }

  async function joinTeam() {
    const code = inviteInput.trim().toUpperCase();
    if (!code) return;
    setSaving(true);
    try {
      const { data: teamJson, error: je } = await supabase
        .rpc("join_team_by_code", { p_invite_code: code, p_user_id: userId });
      if (je) {
        const msg = je.message || "";
        if (msg.includes("Invalid invite code")) throw new Error("Invalid invite code — check it and try again");
        if (msg.includes("Already a member")) throw new Error("You are already in this team");
        throw new Error(msg || "Could not join team");
      }
      const joinedTeam = typeof teamJson === "string" ? JSON.parse(teamJson) : teamJson;
      await migrateToTeam(joinedTeam.id);
      setToast(`Joined ${joinedTeam.name}!`);
      onTeamChange?.(joinedTeam.id);
      await loadTeam();
      setShowJoin(false);
      setInviteInput("");
    } catch (e) {
      setToast(e.message || "Could not join team");
    }
    setSaving(false);
  }

  async function migrateToTeam(teamId) {
    try {
      await supabase.rpc("migrate_user_data_to_team", {
        p_user_id: userId,
        p_team_id: teamId,
      });
    } catch (e) {
      console.warn("Migration warning:", e);
    }
  }

  async function regenerateInviteCode() {
    if (myRole !== "admin") return;
    const ok = await confirm("Generate a new invite code? The old one will stop working.", { confirmLabel: "Regenerate" });
    if (!ok) return;
    const newCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error } = await supabase.from("teams").update({ invite_code: newCode }).eq("id", team.id);
    if (error) { setToast("Failed to regenerate code"); return; }
    setTeam(t => ({ ...t, invite_code: newCode }));
    setToast("New invite code generated");
  }

  async function removeMember(member) {
    const isMe = member.user_id === userId;
    const msg = isMe
      ? "Leave this team? Your data will remain shared with the team."
      : `Remove ${member.email} from the team?`;
    const ok = await confirm(msg, { confirmLabel: isMe ? "Leave team" : "Remove" });
    if (!ok) return;
    const { error } = await supabase.from("team_members").delete().eq("user_id", member.user_id).eq("team_id", team.id);
    if (error) { setToast("Could not remove member"); return; }
    if (isMe) {
      setTeam(null); setMembers([]); setMyRole(null);
      onTeamChange?.(null);
      setToast("You have left the team");
    } else {
      setMembers(m => m.filter(x => x.user_id !== member.user_id));
      setToast("Member removed");
    }
  }

  async function toggleRole(member) {
    if (myRole !== "admin") return;
    if (member.user_id === userId) { setToast("You cannot change your own role"); return; }
    const newRole = member.role === "admin" ? "member" : "admin";
    const ok = await confirm(
      `${newRole === "admin" ? "Promote" : "Demote"} ${member.email} to ${newRole}?`,
      { confirmLabel: newRole === "admin" ? "Promote" : "Demote", confirmVariant: newRole === "admin" ? "success" : "danger" }
    );
    if (!ok) return;
    const { error } = await supabase.from("team_members").update({ role: newRole }).eq("user_id", member.user_id).eq("team_id", team.id);
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

  // ── Member activity summary (derived from shared data) ────────────────────
  function getMemberSummary(memberId) {
    const today = todayISO();
    const { start } = getMonthRange();
    const fus    = (data?.followups || []).filter(f => f.user_id === memberId);
    const leads  = (data?.leads     || []).filter(l => l.user_id === memberId);
    const exps   = (data?.expenses  || []).filter(e => e.user_id === memberId && e.expense_date >= start);
    return {
      todayFU:   fus.filter(f => !f.completed && f.date === today).length,
      overdueFU: fus.filter(f => !f.completed && f.date < today).length,
      openLeads: leads.filter(l => !["Won","Lost"].includes(l.stage || "New")).length,
      monthExp:  exps.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0),
    };
  }

  // ── Team-wide stats (must be before all early returns — React hooks rule) ──
  const teamStats = useMemo(() => {
    const today       = todayISO();
    const { start }   = getMonthRange();
    const leads       = data?.leads     || [];
    const followups   = data?.followups || [];
    const clients     = data?.clients   || [];
    const quotes      = data?.quotes    || [];

    const activeLeads     = leads.filter(l => !["Won","Lost"].includes(l.stage || "New")).length;
    const wonLeads        = leads.filter(l => l.stage === "Won").length;
    const openFU          = followups.filter(f => !f.completed).length;
    const overdueFU       = followups.filter(f => !f.completed && f.date < today).length;
    const todayFU         = followups.filter(f => !f.completed && f.date === today).length;
    const pendingQuotes   = quotes.filter(q => q.status === "Pending").length;
    const wonRevenue      = quotes.filter(q => q.status === "Accepted").reduce((s, q) => s + parseFloat(q.value || 0), 0);

    const pipeline = {
      "New Lead":  clients.filter(c => (c.stage || "New Lead") === "New Lead").length,
      "Contacted": clients.filter(c => c.stage === "Contacted").length,
      "Quoted":    clients.filter(c => c.stage === "Quoted").length,
      "Active":    clients.filter(c => c.stage === "Active").length,
      "Won":       clients.filter(c => c.stage === "Won").length,
      "Lost":      clients.filter(c => c.stage === "Lost").length,
    };
    const totalInPipeline = Object.values(pipeline).reduce((s, v) => s + v, 0);

    const memberActivity = members.map(m => ({
      ...m,
      // Owned by this member
      openLeads:    leads.filter(l => l.user_id === m.user_id && !["Won","Lost"].includes(l.stage || "New")).length,
      todayFU:      followups.filter(f => f.user_id === m.user_id && !f.completed && f.date === today).length,
      overdueFU:    followups.filter(f => f.user_id === m.user_id && !f.completed && f.date < today).length,
      // Assigned to this member by others
      assignedLeads:   leads.filter(l => l.assigned_to_user_id === m.user_id && l.user_id !== m.user_id && !["Won","Lost"].includes(l.stage || "New")).length,
      assignedClients: clients.filter(c => c.assigned_to_user_id === m.user_id && c.user_id !== m.user_id).length,
      assignedFU:      followups.filter(f => f.assigned_to_user_id === m.user_id && f.user_id !== m.user_id && !f.completed).length,
    }));

    return { activeLeads, wonLeads, openFU, overdueFU, todayFU, pendingQuotes, wonRevenue, pipeline, totalInPipeline, memberActivity };
  }, [data, members]);

  // ── Viewing a member's dashboard ─────────────────────────────────────────
  if (viewingMember) {
    return (
      <MemberDashboard
        member={viewingMember}
        data={data || {}}
        members={members}
        currentUserId={userId}
        userEmail={userEmail}
        teamId={team?.id}
        onBack={() => setViewingMember(null)}
      />
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── No team yet ────────────────────────────────────────────────────────────
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
            Create a team to share clients, contacts, leads, quotes, notes and follow-ups. Expenses always stay private.
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
                <Field label="Team name" value={teamName} onChange={setTeamName} placeholder="e.g. Power Works (Pty) Ltd" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  You will be the admin. An invite code is generated automatically.
                </p>
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

  // ── Has a team ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <PageHeader
        title={team.name}
        subtitle={`${members.length} member${members.length !== 1 ? "s" : ""} · ${myRole === "admin" ? "You are admin" : "Member"}`}
      />

      {/* ── Team Dashboard ── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Tasks</p>
          <p className="text-2xl font-black mt-1" style={{ color: teamStats.todayFU > 0 ? BRAND.primary : "#16A34A" }}>
            {teamStats.todayFU}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {teamStats.overdueFU > 0 ? `${teamStats.overdueFU} overdue` : "follow-ups due"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Leads</p>
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

      {/* ── Sales Pipeline ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Sales Pipeline</p>
          <p className="text-xs text-slate-400">{teamStats.totalInPipeline} total</p>
        </div>
        <div className="space-y-2">
          {[
            { label: "New Lead",  color: "#92400E", bg: "#FEF3C7" },
            { label: "Contacted", color: "#1E40AF", bg: "#DBEAFE" },
            { label: "Quoted",    color: "#5B21B6", bg: "#EDE9FE" },
            { label: "Active",    color: "#0E7490", bg: "#CFFAFE" },
            { label: "Won",       color: "#16A34A", bg: "#DCFCE7" },
          ].map(({ label, color }) => {
            const count = teamStats.pipeline[label] || 0;
            const pct   = teamStats.totalInPipeline > 0 ? (count / teamStats.totalInPipeline) * 100 : 0;
            return (
              <div key={label} className="flex items-center gap-3">
                <p className="w-20 text-sm font-bold shrink-0" style={{ color }}>{label}</p>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5 }} />
                </div>
                <span className="text-sm font-black text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Per-member breakdown ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1">Team Members</p>
        <div className="space-y-3">
          {teamStats.memberActivity.map(m => {
            const name = m.email?.split("@")[0] || "Member";
            const displayName = name.charAt(0).toUpperCase() + name.slice(1);
            const isMe = m.user_id === userId;

            // Count everything belonging to this member
            const allClients  = data?.clients   || [];
            const allContacts = data?.contacts  || [];
            const allLeads    = data?.leads     || [];
            const allFU       = data?.followups || [];
            const allNotes    = data?.notes     || [];

            const myClients  = allClients.filter(c => c.user_id === m.user_id);
            const myContacts = allContacts.filter(c => c.user_id === m.user_id);
            const myLeads    = allLeads.filter(l => l.user_id === m.user_id);
            const myOpenFU   = allFU.filter(f => f.user_id === m.user_id && !f.completed);
            const myNotes    = allNotes.filter(n => n.user_id === m.user_id);
            const wonLeads   = myLeads.filter(l => l.stage === "Won").length;
            const activeLeads = myLeads.filter(l => !["Won","Lost"].includes(l.stage || "New")).length;

            return (
              <Card key={m.user_id} className="overflow-hidden">
                {/* Member header — tappable for admin */}
                <button
                  onClick={() => myRole === "admin" ? setViewingMember(m) : null}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50"
                  style={{ cursor: myRole === "admin" ? "pointer" : "default" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                    style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                    {(m.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-900">
                        {displayName}{isMe ? " (me)" : ""}
                      </p>
                      <RoleBadge role={m.role} />
                    </div>
                    <p className="text-xs text-slate-400 truncate">{m.email}</p>
                  </div>
                  {myRole === "admin" && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                </button>

                {/* Stats grid */}
                <div className="grid grid-cols-4 divide-x divide-slate-50">
                  {[
                    { label: "Clients",   value: myClients.length,  color: BRAND.primary },
                    { label: "Contacts",  value: myContacts.length, color: "#0E7490" },
                    { label: "Open FU",   value: myOpenFU.length,   color: myOpenFU.length > 0 ? "#DC2626" : "#16A34A" },
                    { label: "Leads",     value: activeLeads,        color: "#5B21B6" },
                  ].map(stat => (
                    <div key={stat.label} className="flex flex-col items-center py-3 px-2">
                      <p className="text-lg font-black leading-none" style={{ color: stat.color }}>{stat.value}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5 text-center leading-tight">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Recent clients captured by this member */}
                {myClients.length > 0 && (
                  <div className="border-t border-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-4 pt-2.5 pb-1">Recent clients</p>
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
                              style={{
                                background: c.stage === "Won" ? "#DCFCE7" : c.stage === "Contacted" ? "#DBEAFE" : "#FEF3C7",
                                color: c.stage === "Won" ? "#166534" : c.stage === "Contacted" ? "#1E40AF" : "#92400E",
                              }}>
                              {c.stage || "New Lead"}
                            </span>
                          </div>
                        ))}
                      {myClients.length > 3 && (
                        <p className="text-[10px] text-slate-400 text-center py-2">
                          +{myClients.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {myClients.length === 0 && (
                  <div className="border-t border-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-400">No clients captured yet</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Manage toggle — collapses invite code + shared sections */}
      <button onClick={() => setShowManage(s => !s)}
        className="w-full flex items-center justify-between px-1">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
          Team Settings
        </p>
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 min-h-[36px]"
          style={{ background: "#F7F3F3" }}>
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

            {/* Invite code card */}
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

      {/* Members list */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Members</p>
          {myRole === "admin" && (
            <p className="text-xs text-slate-400">Tap member to view their dashboard</p>
          )}
        </div>
        <div className="divide-y divide-slate-50">
          {members.map(m => {
            const isMe = m.user_id === userId;
            const summary = getMemberSummary(m.user_id);
            return (
              <div key={m.user_id}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors min-h-[72px]"
                  onClick={() => myRole === "admin" ? setViewingMember(m) : null}
                  style={{ cursor: myRole === "admin" ? "pointer" : "default" }}>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
                    style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                    {(m.email || "?").slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate max-w-[160px]">
                        {isMe ? `${m.email} (you)` : m.email}
                      </p>
                      <RoleBadge role={m.role} />
                    </div>
                    {/* Activity mini-summary */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {summary.todayFU > 0 && (
                        <span className="text-[10px] font-bold text-blue-600">
                          {summary.todayFU} task{summary.todayFU !== 1 ? "s" : ""} today
                        </span>
                      )}
                      {summary.overdueFU > 0 && (
                        <span className="text-[10px] font-bold text-red-600">
                          {summary.overdueFU} overdue
                        </span>
                      )}
                      {summary.openLeads > 0 && (
                        <span className="text-[10px] font-bold text-purple-600">
                          {summary.openLeads} lead{summary.openLeads !== 1 ? "s" : ""}
                        </span>
                      )}
                      {summary.todayFU === 0 && summary.overdueFU === 0 && summary.openLeads === 0 && (
                        <span className="text-[10px] text-slate-400">No activity today</span>
                      )}
                    </div>
                  </div>

                  {/* Admin actions or chevron */}
                  {myRole === "admin" ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); toggleRole(m); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center"
                        title={m.role === "admin" ? "Demote to member" : "Promote to admin"}>
                        <Crown size={14} style={{ color: m.role === "admin" ? "#A16207" : "#CBD5E1" }} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); removeMember(m); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 min-w-[36px] min-h-[36px] flex items-center justify-center"
                        title={isMe ? "Leave team" : "Remove member"}>
                        {isMe ? <LogOut size={14} /> : <UserMinus size={14} />}
                      </button>
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  ) : isMe ? (
                    <button
                      onClick={e => { e.stopPropagation(); removeMember(m); }}
                      className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0">
                      <LogOut size={14} />
                    </button>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

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
