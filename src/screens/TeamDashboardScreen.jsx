// ─── Team Dashboard Screen ─────────────────────────────────────────────────────
// Combined view of all team activity with a filter-by-teammate pill row.
// All members see this. Only admins see the per-member drill-down.
//
// Sections: Clients · Contacts · Leads · Follow-ups
// Each record is tagged with the teammate who owns it.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, TrendingUp, Calendar,
  ChevronRight, CheckCircle2, Clock,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";
import { Card, StagePill, Empty } from "../components/ui";

// ─── Colour palette for teammate avatars (cycles through these) ───────────────
const MEMBER_COLORS = [
  "#8B1A1A", "#1D4ED8", "#15803D", "#7C3AED",
  "#B45309", "#0E7490", "#BE123C", "#4338CA",
];

function memberColor(index) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

// ─── Helper: short display name ───────────────────────────────────────────────
function displayName(email, userId) {
  if (!email) return (userId || "?").slice(0, 8);
  const name = email.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── Tiny avatar chip ─────────────────────────────────────────────────────────
function MemberChip({ email, userId, color, size = "sm" }) {
  const letters = (email || userId || "?").slice(0, 2).toUpperCase();
  const dim     = size === "sm" ? "w-5 h-5 text-[9px]" : "w-7 h-7 text-xs";
  return (
    <span className={`${dim} rounded-full inline-flex items-center justify-center text-white font-black shrink-0`}
      style={{ background: color }}>
      {letters}
    </span>
  );
}

// ─── Stat summary card ────────────────────────────────────────────────────────
function MiniStat({ label, value, sub, color }) {
  return (
    <div className="flex-1 min-w-0 bg-white rounded-2xl p-3.5 border border-slate-100">
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      <p className="text-xs font-bold text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section header with count ────────────────────────────────────────────────
function SectionHead({ icon: Icon, label, count, color, bg }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: bg }}>
        <Icon size={14} style={{ color }} />
      </div>
      <p className="text-sm font-black text-slate-700">{label}</p>
      {count > 0 && (
        <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full"
          style={{ background: bg, color }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Client row ───────────────────────────────────────────────────────────────
function ClientRow({ client, memberColor: color, onOpen }) {
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 text-left hover:bg-slate-50 disabled:cursor-default" disabled={!onOpen}>
      <MemberChip email={client._ownerEmail} userId={client.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{client.company}</p>
        <p className="text-xs text-slate-400 truncate">{[client.branch, client.contact].filter(Boolean).join(" · ")}</p>
      </div>
      <StagePill stage={client.stage || "New Lead"} />
    </button>
  );
}

// ─── Contact row ──────────────────────────────────────────────────────────────
function ContactRow({ contact, memberColor: color, onOpen }) {
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 text-left hover:bg-slate-50 disabled:cursor-default" disabled={!onOpen}>
      <MemberChip email={contact._ownerEmail} userId={contact.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{contact.name}</p>
        <p className="text-xs text-slate-400 truncate">{[contact.company, contact.title].filter(Boolean).join(" · ")}</p>
      </div>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={{ background: "#EDE9FE", color: "#5B21B6" }}>
        {contact.status || "Lead"}
      </span>
    </button>
  );
}

// ─── Lead row ─────────────────────────────────────────────────────────────────
function LeadRow({ lead, memberColor: color, onOpen }) {
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 text-left hover:bg-slate-50 disabled:cursor-default" disabled={!onOpen}>
      <MemberChip email={lead._ownerEmail} userId={lead.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{lead.title || lead.client_name}</p>
        <p className="text-xs text-slate-400 truncate">{lead.client_name}</p>
      </div>
      <StagePill stage={lead.stage || "New Lead"} />
    </button>
  );
}

// ─── Follow-up row ────────────────────────────────────────────────────────────
function FollowupRow({ fu, today, memberColor: color, onOpen }) {
  const overdue = fu.date < today && !fu.completed;
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 text-left hover:bg-slate-50 disabled:cursor-default" disabled={!onOpen}>
      <MemberChip email={fu._ownerEmail} userId={fu.user_id} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{fu.title}</p>
        <p className="text-xs text-slate-400 truncate">{fu.client}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {fu.completed ? (
          <CheckCircle2 size={14} className="text-green-500" />
        ) : (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            overdue ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-100"
          }`}>
            {overdue ? "Overdue" : smartDate(fu.date)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function TeamDashboardScreen({
  data,
  teamMembers = [],  // [{ user_id, email, role }]
  userId,
  userRole,          // "admin" | "member"
  onNavigate,
}) {
  const today    = todayISO();
  const isAdmin  = userRole === "admin";

  // Build a lookup: user_id → { email, color, index }
  const memberMap = useMemo(() => {
    const map = {};
    teamMembers.forEach((m, i) => {
      map[m.user_id] = { email: m.email, role: m.role, color: memberColor(i), index: i };
    });
    return map;
  }, [teamMembers]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [selectedMember, setSelectedMember] = useState(null); // null = All
  const [activeSection, setActiveSection]   = useState("clients");

  // ── Annotate records with owner info ────────────────────────────────────────
  function annotate(rows) {
    return (rows || []).map(r => ({
      ...r,
      _ownerEmail: memberMap[r.user_id]?.email || r.user_id,
      _ownerColor: memberMap[r.user_id]?.color || BRAND.primary,
    }));
  }

  const allClients  = annotate(data.clients);
  const allContacts = annotate(data.contacts);
  const allLeads    = annotate(data.leads);
  const allFollowups = annotate(data.followups);

  // ── Apply member filter ──────────────────────────────────────────────────────
  function filterByMember(rows) {
    if (!selectedMember) return rows;
    return rows.filter(r => r.user_id === selectedMember);
  }

  const clients  = filterByMember(allClients);
  const contacts = filterByMember(allContacts);
  const leads    = filterByMember(allLeads).filter(l => !["Won", "Lost"].includes(l.stage));
  const followups = filterByMember(allFollowups).filter(f => !f.completed);
  const overdueFU = followups.filter(f => f.date < today);

  // ── Summary stats (always show full team totals) ─────────────────────────────
  const totalClients   = allClients.length;
  const totalOpenLeads = allLeads.filter(l => !["Won", "Lost"].includes(l.stage)).length;
  const totalOpenFU    = allFollowups.filter(f => !f.completed).length;
  const totalOverdueFU = allFollowups.filter(f => !f.completed && f.date < today).length;

  // ── Section tabs ─────────────────────────────────────────────────────────────
  const SECTIONS = [
    { key: "clients",   label: "Clients",     icon: Users,      count: clients.length,   color: "#166534", bg: "#DCFCE7" },
    { key: "leads",     label: "Leads",       icon: TrendingUp, count: leads.length,     color: "#5B21B6", bg: "#EDE9FE" },
    { key: "followups", label: "Follow-ups",  icon: Calendar,   count: followups.length, color: "#1E40AF", bg: "#DBEAFE" },
    { key: "contacts",  label: "Contacts",    icon: UserPlus,   count: contacts.length,  color: "#92400E", bg: "#FEF3C7" },
  ];

  const activeS = SECTIONS.find(s => s.key === activeSection) || SECTIONS[0];

  // ── Currently displayed rows ─────────────────────────────────────────────────
  const DISPLAY_MAP = { clients, leads, followups, contacts };
  const rows = DISPLAY_MAP[activeSection] || [];
  const LIMIT = 30;
  const displayed = rows.slice(0, LIMIT);

  return (
    <div className="space-y-4">
      {/* ── Team summary stats ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-0.5">
          Team totals
        </p>
        <div className="flex gap-2">
          <MiniStat label="Clients" value={totalClients} color={BRAND.primary} />
          <MiniStat label="Open leads" value={totalOpenLeads} color="#5B21B6" />
          <MiniStat
            label="Follow-ups"
            value={totalOpenFU}
            sub={totalOverdueFU > 0 ? `${totalOverdueFU} overdue` : undefined}
            color={totalOverdueFU > 0 ? "#DC2626" : "#1D4ED8"}
          />
        </div>
      </div>

      {/* ── Teammate filter pills ── */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-0.5">
          Filter by teammate
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {/* All pill */}
          <button
            onClick={() => setSelectedMember(null)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black whitespace-nowrap border-2 transition-all shrink-0 ${
              !selectedMember
                ? "border-transparent text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
            style={!selectedMember ? { background: BRAND.primary } : {}}>
            Everyone
          </button>

          {teamMembers.map((m, i) => {
            const name    = displayName(m.email, m.user_id);
            const color   = memberColor(i);
            const isMe    = m.user_id === userId;
            const isActive = selectedMember === m.user_id;
            return (
              <button
                key={m.user_id}
                onClick={() => setSelectedMember(isActive ? null : m.user_id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-black whitespace-nowrap border-2 transition-all shrink-0 ${
                  isActive ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700"
                }`}
                style={isActive ? { background: color } : {}}>
                <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-white text-[8px] font-black shrink-0"
                  style={{ background: isActive ? "rgba(255,255,255,0.35)" : color }}>
                  {(m.email || "?").slice(0, 1).toUpperCase()}
                </span>
                {isMe ? "Me" : name}
                {isAdmin && m.role === "admin" && (
                  <span className="opacity-60">★</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {SECTIONS.map(s => {
          const active = activeSection === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap border-2 transition-all shrink-0 ${
                active ? "border-transparent" : "border-slate-100 bg-white text-slate-500"
              }`}
              style={active ? { background: s.bg, color: s.color, borderColor: s.bg } : {}}>
              <s.icon size={12} />
              {s.label}
              {s.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                  active ? "bg-white/50" : "bg-slate-100"
                }`}>
                  {s.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Records list ── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <SectionHead
            icon={activeS.icon}
            label={selectedMember
              ? `${displayName(memberMap[selectedMember]?.email, selectedMember)}'s ${activeS.label}`
              : `All ${activeS.label}`}
            count={rows.length}
            color={activeS.color}
            bg={activeS.bg}
          />
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
            <AnimatePresence>
              {activeSection === "clients"  && displayed.map(r => <ClientRow key={r.id} client={r} memberColor={r._ownerColor} onOpen={isAdmin ? () => onNavigate?.("Client360", { clientId: r.id, returnTo: "TeamDashboard" }) : undefined} />)}
              {activeSection === "contacts" && displayed.map(r => <ContactRow key={r.id} contact={r} memberColor={r._ownerColor} onOpen={isAdmin ? () => onNavigate?.("TeamRecordDetail", { recordType: "contacts", recordId: r.id }) : undefined} />)}
              {activeSection === "leads"    && displayed.map(r => <LeadRow key={r.id} lead={r} memberColor={r._ownerColor} onOpen={isAdmin ? () => onNavigate?.("TeamRecordDetail", { recordType: "leads", recordId: r.id }) : undefined} />)}
              {activeSection === "followups"&& displayed.map(r => <FollowupRow key={r.id} fu={r} today={today} memberColor={r._ownerColor} onOpen={isAdmin ? () => onNavigate?.("TeamRecordDetail", { recordType: "followups", recordId: r.id }) : undefined} />)}
            </AnimatePresence>

            {rows.length > LIMIT && (
              <p className="text-xs text-slate-400 text-center py-3 font-bold">
                Showing {LIMIT} of {rows.length} — use the teammate filter to narrow down
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── Admin-only: pipeline breakdown ── */}
      {isAdmin && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Pipeline — admin view
            </p>
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
            {clients.length === 0 && (
              <p className="text-sm text-slate-400 py-2">No clients yet</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
