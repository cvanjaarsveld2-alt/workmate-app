// ─── Team Dashboard Screen ─────────────────────────────────────────────────────
// Combined view of all team activity with filter-by-teammate pills.
// Admin can share/assign any record to a teammate directly from here.
// Accept/decline notifications flow back to the admin automatically.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, TrendingUp, Calendar,
  CheckCircle2, Clock, Send,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";
import { Card, StagePill } from "../components/ui";
import { ShareToTeamModal } from "../components/ShareToTeamModal";

const MEMBER_COLORS = ["#8B1A1A","#1D4ED8","#15803D","#7C3AED","#B45309","#0E7490","#BE123C","#4338CA"];
function memberColor(i) { return MEMBER_COLORS[i % MEMBER_COLORS.length]; }
function displayName(email, userId) {
  if (!email) return (userId || "?").slice(0, 8);
  const name = email.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function MemberChip({ email, userId, color }) {
  return (
    <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-white text-[9px] font-black shrink-0"
      style={{ background: color }}>
      {(email || userId || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

function MiniStat({ label, value, sub, color }) {
  return (
    <div className="flex-1 min-w-0 bg-white rounded-2xl p-3.5 border border-slate-100">
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      <p className="text-xs font-bold text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHead({ icon: Icon, label, count, color, bg }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: bg }}>
        <Icon size={14} style={{ color }} />
      </div>
      <p className="text-sm font-black text-slate-700">{label}</p>
      {count > 0 && (
        <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full" style={{ background: bg, color }}>{count}</span>
      )}
    </div>
  );
}

// ── Record rows with share button ────────────────────────────────────────────
function ClientRow({ client, color, onOpen, onShare }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left" disabled={!onOpen}>
        <MemberChip email={client._ownerEmail} userId={client.user_id} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{client.company}</p>
          <p className="text-xs text-slate-400 truncate">{[client.branch, client.contact].filter(Boolean).join(" · ")}</p>
        </div>
        <StagePill stage={client.stage || "New Lead"} />
      </button>
      {onShare && (
        <button onClick={onShare} className="p-2 rounded-xl text-slate-300 hover:text-red-700 hover:bg-red-50 transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center">
          <Send size={14} />
        </button>
      )}
    </div>
  );
}

function ContactRow({ contact, color, onShare }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <MemberChip email={contact._ownerEmail} userId={contact.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{contact.name}</p>
        <p className="text-xs text-slate-400 truncate">{[contact.company, contact.title].filter(Boolean).join(" · ")}</p>
      </div>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "#EDE9FE", color: "#5B21B6" }}>
        {contact.status || "Lead"}
      </span>
      {onShare && (
        <button onClick={onShare} className="p-2 rounded-xl text-slate-300 hover:text-red-700 hover:bg-red-50 transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center">
          <Send size={14} />
        </button>
      )}
    </div>
  );
}

function LeadRow({ lead, color, onShare }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <MemberChip email={lead._ownerEmail} userId={lead.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{lead.title || lead.client_name}</p>
        <p className="text-xs text-slate-400 truncate">{lead.client_name}</p>
      </div>
      <StagePill stage={lead.stage || "New Lead"} />
      {onShare && (
        <button onClick={onShare} className="p-2 rounded-xl text-slate-300 hover:text-red-700 hover:bg-red-50 transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center">
          <Send size={14} />
        </button>
      )}
    </div>
  );
}

function FollowupRow({ fu, today, color, onShare }) {
  const overdue = fu.date < today && !fu.completed;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <MemberChip email={fu._ownerEmail} userId={fu.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{fu.title}</p>
        <p className="text-xs text-slate-400 truncate">{fu.client}</p>
      </div>
      {fu.completed ? (
        <CheckCircle2 size={14} className="text-green-500 shrink-0" />
      ) : (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${overdue ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-100"}`}>
          {overdue ? "Overdue" : smartDate(fu.date)}
        </span>
      )}
      {onShare && (
        <button onClick={onShare} className="p-2 rounded-xl text-slate-300 hover:text-red-700 hover:bg-red-50 transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center">
          <Send size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function TeamDashboardScreen({
  data,
  teamMembers = [],
  userId,
  userEmail,
  userRole,
  teamId,
  onNavigate,
}) {
  const today   = todayISO();
  const isAdmin = userRole === "admin";

  const [selectedMember, setSelectedMember] = useState(null);
  const [activeSection, setActiveSection]   = useState("clients");
  const [shareTarget, setShareTarget]       = useState(null);

  const memberMap = useMemo(() => {
    const map = {};
    teamMembers.forEach((m, i) => {
      map[m.user_id] = { email: m.email, role: m.role, color: memberColor(i) };
    });
    return map;
  }, [teamMembers]);

  function annotate(rows) {
    return (rows || []).map(r => ({
      ...r,
      _ownerEmail: memberMap[r.user_id]?.email || r.user_id,
      _ownerColor: memberMap[r.user_id]?.color || BRAND.primary,
    }));
  }

  const allClients   = annotate(data.clients);
  const allContacts  = annotate(data.contacts);
  const allLeads     = annotate(data.leads);
  const allFollowups = annotate(data.followups);

  function filterByMember(rows) {
    if (!selectedMember) return rows;
    return rows.filter(r => r.user_id === selectedMember);
  }

  const clients   = filterByMember(allClients);
  const contacts  = filterByMember(allContacts);
  const leads     = filterByMember(allLeads).filter(l => !["Won","Lost"].includes(l.stage));
  const followups = filterByMember(allFollowups).filter(f => !f.completed);
  const overdueFU = followups.filter(f => f.date < today);

  const totalClients   = allClients.length;
  const totalOpenLeads = allLeads.filter(l => !["Won","Lost"].includes(l.stage)).length;
  const totalOpenFU    = allFollowups.filter(f => !f.completed).length;
  const totalOverdueFU = allFollowups.filter(f => !f.completed && f.date < today).length;

  const SECTIONS = [
    { key: "clients",   label: "Clients",    icon: Users,      count: clients.length,   color: "#166534", bg: "#DCFCE7" },
    { key: "leads",     label: "Leads",      icon: TrendingUp, count: leads.length,     color: "#5B21B6", bg: "#EDE9FE" },
    { key: "followups", label: "Follow-ups", icon: Calendar,   count: followups.length, color: "#1E40AF", bg: "#DBEAFE" },
    { key: "contacts",  label: "Contacts",   icon: UserPlus,   count: contacts.length,  color: "#92400E", bg: "#FEF3C7" },
  ];

  const activeS    = SECTIONS.find(s => s.key === activeSection) || SECTIONS[0];
  const DISPLAY    = { clients, leads, followups, contacts };
  const rows       = DISPLAY[activeSection] || [];
  const LIMIT      = 30;
  const displayed  = rows.slice(0, LIMIT);

  // Share handler — opens the modal for any record type
  function handleShare(record) {
    setShareTarget(record);
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-0.5">Team totals</p>
        <div className="flex gap-2">
          <MiniStat label="Clients" value={totalClients} color={BRAND.primary} />
          <MiniStat label="Open leads" value={totalOpenLeads} color="#5B21B6" />
          <MiniStat label="Follow-ups" value={totalOpenFU}
            sub={totalOverdueFU > 0 ? `${totalOverdueFU} overdue` : undefined}
            color={totalOverdueFU > 0 ? "#DC2626" : "#1D4ED8"} />
        </div>
      </div>

      {/* Teammate filter */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-0.5">Filter by teammate</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button onClick={() => setSelectedMember(null)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black whitespace-nowrap border-2 transition-all shrink-0 ${
              !selectedMember ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-600"}`}
            style={!selectedMember ? { background: BRAND.primary } : {}}>
            Everyone
          </button>
          {teamMembers.map((m, i) => {
            const name = displayName(m.email, m.user_id);
            const color = memberColor(i);
            const isMe = m.user_id === userId;
            const isActive = selectedMember === m.user_id;
            return (
              <button key={m.user_id} onClick={() => setSelectedMember(isActive ? null : m.user_id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-black whitespace-nowrap border-2 transition-all shrink-0 ${
                  isActive ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700"}`}
                style={isActive ? { background: color } : {}}>
                <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-white text-[8px] font-black shrink-0"
                  style={{ background: isActive ? "rgba(255,255,255,0.35)" : color }}>
                  {(m.email || "?").slice(0, 1).toUpperCase()}
                </span>
                {isMe ? "Me" : name}
                {isAdmin && m.role === "admin" && <span className="opacity-60">★</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {SECTIONS.map(s => {
          const active = activeSection === s.key;
          return (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap border-2 transition-all shrink-0 ${
                active ? "border-transparent" : "border-slate-100 bg-white text-slate-500"}`}
              style={active ? { background: s.bg, color: s.color, borderColor: s.bg } : {}}>
              <s.icon size={12} />
              {s.label}
              {s.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${active ? "bg-white/50" : "bg-slate-100"}`}>{s.count}</span>}
            </button>
          );
        })}
      </div>

      {/* Records list */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <SectionHead icon={activeS.icon}
            label={selectedMember ? `${displayName(memberMap[selectedMember]?.email, selectedMember)}'s ${activeS.label}` : `All ${activeS.label}`}
            count={rows.length} color={activeS.color} bg={activeS.bg} />
        </div>

        {displayed.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center gap-2">
            <activeS.icon size={28} className="text-slate-200" />
            <p className="text-sm font-bold text-slate-400">
              {selectedMember ? "None for this teammate" : `No ${activeS.label.toLowerCase()} yet`}
            </p>
          </div>
        ) : (
          <div className="px-4">
            {activeSection === "clients" && displayed.map(r => (
              <ClientRow key={r.id} client={r} color={r._ownerColor}
                onOpen={isAdmin ? () => onNavigate?.("Client360", { clientId: r.id, returnTo: "TeamDashboard" }) : undefined}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.company, type: "client" }) : undefined} />
            ))}
            {activeSection === "contacts" && displayed.map(r => (
              <ContactRow key={r.id} contact={r} color={r._ownerColor}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.name, type: "contact" }) : undefined} />
            ))}
            {activeSection === "leads" && displayed.map(r => (
              <LeadRow key={r.id} lead={r} color={r._ownerColor}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.title || r.client_name, type: "lead" }) : undefined} />
            ))}
            {activeSection === "followups" && displayed.map(r => (
              <FollowupRow key={r.id} fu={r} today={today} color={r._ownerColor}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.title, type: "followup" }) : undefined} />
            ))}

            {rows.length > LIMIT && (
              <p className="text-xs text-slate-400 text-center py-3 font-bold">
                Showing {LIMIT} of {rows.length}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Admin pipeline */}
      {isAdmin && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Pipeline — admin view</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {PIPELINE_STAGES.map(stage => {
              const filtered = clients.filter(c => (c.stage || "New Lead") === stage);
              if (filtered.length === 0) return null;
              const colors = STAGE_COLORS[stage] || {};
              return (
                <div key={stage} className="flex items-center gap-3 py-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors.dot }} />
                  <span className="text-sm font-bold text-slate-700 flex-1">{stage}</span>
                  <span className="text-sm font-black" style={{ color: colors.text }}>{filtered.length}</span>
                </div>
              );
            })}
            {clients.length === 0 && <p className="text-sm text-slate-400 py-2">No clients yet</p>}
          </div>
        </Card>
      )}

      {/* Share modal */}
      <ShareToTeamModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        record={shareTarget}
        fromUserId={userId}
        fromEmail={userEmail}
        teamId={teamId}
        teamMembers={teamMembers}
      />
    </div>
  );
}
