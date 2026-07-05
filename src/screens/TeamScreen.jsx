// ─── Team Screen ──────────────────────────────────────────────────────────────
// Manage the Power Works team. Admin can view invite code, see members,
// change roles. Any user can join via invite code or create a new team.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Copy, Check, Crown, UserMinus, Plus,
  RefreshCw, LogOut, Shield, AlertTriangle, X,
} from "lucide-react";
import { supabase } from "../supabase";
import { Card, Btn, Field, Toast, PageHeader, useConfirm } from "../components/ui";
import { BRAND } from "../lib/constants";

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

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TeamScreen({ userId, userEmail, onTeamChange }) {
  const [loading, setLoading]       = useState(true);
  const [team, setTeam]             = useState(null);       // { id, name, invite_code }
  const [members, setMembers]       = useState([]);         // [{id, user_id, role, email}]
  const [myRole, setMyRole]         = useState(null);       // "admin" | "member"
  const [toast, setToast]           = useState("");
  const [copied, setCopied]         = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin]     = useState(false);
  const [teamName, setTeamName]     = useState("Power Works (Pty) Ltd");
  const [inviteInput, setInviteInput] = useState("");
  const [saving, setSaving]         = useState(false);
  const { confirm, dialog }         = useConfirm();

  useEffect(() => { loadTeam(); }, [userId]);

  async function loadTeam() {
    setLoading(true);
    try {
      // Check if user is in a team
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!membership) { setTeam(null); setLoading(false); return; }

      setMyRole(membership.role);

      // Load team details
      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name, invite_code")
        .eq("id", membership.team_id)
        .maybeSingle();

      setTeam(teamData);

      // Load members — join with auth.users via RPC or just get user_ids
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("id, user_id, role, joined_at")
        .eq("team_id", membership.team_id)
        .order("joined_at");

      setMembers(memberRows || []);
    } catch (e) {
      console.error("loadTeam failed:", e);
    }
    setLoading(false);
  }

  async function createTeam() {
    if (!teamName.trim()) return;
    setSaving(true);
    try {
      // Use security definer function to bypass RLS chicken-and-egg
      const { data: newTeamJson, error: te } = await supabase
        .rpc("create_team_for_user", {
          p_name: teamName.trim(),
          p_user_id: userId,
        });
      if (te) throw te;

      const newTeam = typeof newTeamJson === "string"
        ? JSON.parse(newTeamJson)
        : newTeamJson;

      // Migrate existing data to this team
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
      // Use security definer function — handles lookup, dupe check, and insert atomically
      const { data: teamJson, error: je } = await supabase
        .rpc("join_team_by_code", {
          p_invite_code: code,
          p_user_id: userId,
        });

      if (je) {
        // Surface the database error message directly
        const msg = je.message || "";
        if (msg.includes("Invalid invite code")) throw new Error("Invalid invite code — check it and try again");
        if (msg.includes("Already a member")) throw new Error("You are already in this team");
        throw new Error(msg || "Could not join team");
      }

      const joinedTeam = typeof teamJson === "string" ? JSON.parse(teamJson) : teamJson;

      // Migrate existing data to this team
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

  // Migrate user's existing solo data to the team
  async function migrateToTeam(teamId) {
    const tables = ["clients", "contacts", "quotes", "followups"];
    for (const table of tables) {
      await supabase
        .from(table)
        .update({ team_id: teamId })
        .eq("user_id", userId)
        .is("team_id", null);
    }
  }

  async function regenerateInviteCode() {
    if (myRole !== "admin") return;
    const ok = await confirm("Generate a new invite code? The old one will stop working.", { confirmLabel: "Regenerate" });
    if (!ok) return;
    // Generate new code
    const newCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error } = await supabase
      .from("teams")
      .update({ invite_code: newCode })
      .eq("id", team.id);
    if (error) { setToast("Failed to regenerate code"); return; }
    setTeam(t => ({ ...t, invite_code: newCode }));
    setToast("New invite code generated");
  }

  async function removeMember(memberId, targetUserId) {
    if (targetUserId === userId) {
      const ok = await confirm("Leave this team? Your data will remain shared.", { confirmLabel: "Leave team" });
      if (!ok) return;
    } else {
      const ok = await confirm("Remove this member from the team?", { confirmLabel: "Remove" });
      if (!ok) return;
    }
    const { error } = await supabase.from("team_members").delete().eq("id", memberId);
    if (error) { setToast("Could not remove member"); return; }
    if (targetUserId === userId) {
      setTeam(null); setMembers([]); setMyRole(null);
      onTeamChange?.(null);
      setToast("You have left the team");
    } else {
      setMembers(m => m.filter(x => x.id !== memberId));
      setToast("Member removed");
    }
  }

  async function toggleRole(member) {
    if (myRole !== "admin") return;
    if (member.user_id === userId) { setToast("You can't change your own role"); return; }
    const newRole = member.role === "admin" ? "member" : "admin";
    const { error } = await supabase
      .from("team_members")
      .update({ role: newRole })
      .eq("id", member.id);
    if (error) { setToast("Could not update role"); return; }
    setMembers(m => m.map(x => x.id === member.id ? { ...x, role: newRole } : x));
    setToast(`Role updated to ${newRole}`);
  }

  function copyCode() {
    navigator.clipboard?.writeText(team?.invite_code || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inviteLink = team
    ? `${window.location.origin}/?join=${team.invite_code}`
    : "";

  async function shareInviteLink() {
    if (!team) return;
    const text = `Join the ${team.name} team on PowerMate.\n\nInvite code: ${team.invite_code}\nOr open: ${inviteLink}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join PowerMate team", text }); } catch {}
    } else {
      navigator.clipboard?.writeText(text).catch(() => {});
      setToast("Invite text copied to clipboard");
    }
  }

  // ── Auto-join from URL param ────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");
    if (joinCode && !team) {
      setInviteInput(joinCode.toUpperCase());
      setShowJoin(true);
    }
  }, []);

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

  // ── No team yet ──────────────────────────────────────────────────────────────
  if (!team) {
    return (
      <div className="space-y-4">
        {dialog}
        <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>
        <PageHeader title="Team" subtitle="Set up team sharing for Power Works" />

        <Card className="p-5 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: BRAND.light }}>
            <Users size={28} style={{ color: BRAND.primary }} />
          </div>
          <p className="text-base font-black text-slate-800">No team set up yet</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            Create a team to share clients, contacts, quotes and follow-ups with your colleagues. Your expenses always stay private.
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

        {/* Create form */}
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
                  You will be the admin. An invite code is generated automatically — share it with colleagues to add them.
                </p>
                <Btn className="w-full" onClick={createTeam} disabled={saving}>
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
                  {saving ? "Creating…" : "Create team"}
                </Btn>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Join form */}
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
                  onChange={v => setInviteInput(v.toUpperCase())}
                  placeholder="e.g. AB12CD34" />
                <p className="text-xs text-slate-400">Ask your admin for the invite code from the Team screen.</p>
                <Btn className="w-full" onClick={joinTeam} disabled={saving || !inviteInput.trim()}>
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : null}
                  {saving ? "Joining…" : "Join team"}
                </Btn>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Has a team ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <PageHeader title={team.name} subtitle={`${members.length} member${members.length !== 1 ? "s" : ""} · ${myRole === "admin" ? "You are admin" : "Member"}`} />

      {/* Invite code card — admin only */}
      {myRole === "admin" && (
        <Card className="p-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Invite Code</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 rounded-xl bg-slate-50 border-2 border-slate-100 px-4 py-3 min-h-[52px] flex items-center">
              <p className="text-2xl font-black tracking-[0.25em] text-slate-900">{team.invite_code}</p>
            </div>
            <button onClick={copyCode}
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors"
              style={{ background: copied ? "#DCFCE7" : BRAND.light }}>
              {copied
                ? <Check size={20} className="text-green-600" />
                : <Copy size={20} style={{ color: BRAND.primary }} />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={shareInviteLink} size="sm">
              Share invite link
            </Btn>
            <Btn variant="ghost" size="sm" onClick={regenerateInviteCode}>
              <RefreshCw size={13} /> New code
            </Btn>
          </div>
          <p className="text-xs text-slate-400 mt-2.5 leading-relaxed text-center">
            Share this code or link with colleagues. They enter it in the Team screen to join.
          </p>
        </Card>
      )}

      {/* Member if not admin — show code to copy for others */}
      {myRole !== "admin" && (
        <Card className="p-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Team Invite Code</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-xl bg-slate-50 border-2 border-slate-100 px-4 py-3 min-h-[52px] flex items-center">
              <p className="text-2xl font-black tracking-[0.25em] text-slate-900">{team.invite_code}</p>
            </div>
            <button onClick={copyCode}
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: copied ? "#DCFCE7" : BRAND.light }}>
              {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} style={{ color: BRAND.primary }} />}
            </button>
          </div>
        </Card>
      )}

      {/* What's shared */}
      <Card className="p-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Shared across team</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Clients",     shared: true },
            { label: "Contacts",    shared: true },
            { label: "Quotes",      shared: true },
            { label: "Follow-ups",  shared: true },
            { label: "Field Notes", shared: false, note: "Stage 2" },
            { label: "Equipment",   shared: false, note: "Stage 2" },
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
                {item.note && <p className="text-[10px] text-slate-400 leading-tight">{item.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Members list */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Members</p>
        </div>
        <div className="divide-y divide-slate-50">
          {members.map(m => {
            const isMe = m.user_id === userId;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5 min-h-[60px]">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
                  style={{ background: m.role === "admin" ? "#A16207" : BRAND.primary }}>
                  {isMe ? "Me" : m.role === "admin" ? "A" : "M"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800">
                      {isMe ? `${userEmail} (you)` : `Member ${m.user_id.slice(0, 8)}…`}
                    </p>
                    <RoleBadge role={m.role} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Joined {m.joined_at ? new Date(m.joined_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {myRole === "admin" && !isMe && (
                    <button onClick={() => toggleRole(m)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title="Toggle admin">
                      <Crown size={14} />
                    </button>
                  )}
                  {(isMe || myRole === "admin") && (
                    <button onClick={() => removeMember(m.id, m.user_id)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title={isMe ? "Leave team" : "Remove"}>
                      {isMe ? <LogOut size={14} /> : <UserMinus size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Warning about data */}
      <Card className="p-4 border-2" style={{ borderColor: "#FED7AA", background: "#FFF7ED" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            All team members can view and edit shared data (clients, contacts, quotes, follow-ups). Expenses are always private — no one else can see yours.
          </p>
        </div>
      </Card>
    </div>
  );
}
