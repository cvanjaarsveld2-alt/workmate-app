// ─── Team Dashboard Screen ─────────────────────────────────────────────────────
// Combined view of all team activity with filter-by-teammate pills.
// Admin can share/assign any record to a teammate directly from here.
// Accept/decline notifications flow back to the admin automatically.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, TrendingUp, Calendar,
  CheckCircle2, Clock, Send, X, FolderOpen,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, STAGE_COLORS } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";
import { CompanyDocuments } from "../components/CompanyDocuments";
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
function ClientRow({ client, color, onOpen, onShare, onTap }) {
  return (
    <div className="border-b border-slate-50 last:border-0">
      <button onClick={onTap} className="w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50/60 transition-colors -mx-1 px-1 rounded-lg">
        <MemberChip email={client._ownerEmail} userId={client.user_id} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{client.company}</p>
          <p className="text-xs text-slate-400 truncate">{[client.branch, client.contact].filter(Boolean).join(" · ")}</p>
          {client.location && <p className="text-xs text-slate-300 truncate">{client.location}</p>}
        </div>
        <StagePill stage={client.stage || "New Lead"} />
      </button>
      <div className="flex gap-2 pb-2 pl-8">
        {onOpen && (
          <button onClick={onOpen} className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
            Full profile →
          </button>
        )}
        {onShare && (
          <button onClick={onShare} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
            <Send size={11} /> Assign
          </button>
        )}
      </div>
    </div>
  );
}

function ContactRow({ contact, color, onShare, onTap }) {
  return (
    <div className="border-b border-slate-50 last:border-0">
      <button onClick={onTap} className="w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50/60 transition-colors -mx-1 px-1 rounded-lg">
        <MemberChip email={contact._ownerEmail} userId={contact.user_id} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{contact.name}</p>
          <p className="text-xs text-slate-400 truncate">{[contact.company, contact.title].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "#EDE9FE", color: "#5B21B6" }}>
          {contact.status || "Lead"}
        </span>
      </button>
      {onShare && (
        <div className="pb-2 pl-8">
          <button onClick={onShare} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
            <Send size={11} /> Assign
          </button>
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, color, onShare, onTap }) {
  return (
    <div className="border-b border-slate-50 last:border-0">
      <button onClick={onTap} className="w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50/60 transition-colors -mx-1 px-1 rounded-lg">
        <MemberChip email={lead._ownerEmail} userId={lead.user_id} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{lead.title || lead.client_name}</p>
          <p className="text-xs text-slate-400 truncate">{lead.client_name}</p>
        </div>
        <StagePill stage={lead.stage || "New Lead"} />
      </button>
      {onShare && (
        <div className="pb-2 pl-8">
          <button onClick={onShare} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
            <Send size={11} /> Assign
          </button>
        </div>
      )}
    </div>
  );
}

function FollowupRow({ fu, today, color, onShare, onTap }) {
  const overdue = fu.date < today && !fu.completed;
  return (
    <div className="border-b border-slate-50 last:border-0">
      <button onClick={onTap} className="w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50/60 transition-colors -mx-1 px-1 rounded-lg">
        <MemberChip email={fu._ownerEmail} userId={fu.user_id} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{fu.title}</p>
          <p className="text-xs text-slate-400 truncate">{fu.client}{fu.branch ? ` — ${fu.branch}` : ""}</p>
          {fu.notes && <p className="text-xs text-slate-400 truncate mt-0.5 italic">{fu.notes}</p>}
          <p className="text-[10px] text-slate-300 mt-0.5">{fu.time ? `${fu.time} · ` : ""}{fu.date}</p>
        </div>
        {fu.completed ? (
          <CheckCircle2 size={14} className="text-green-500 shrink-0" />
        ) : (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${overdue ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-100"}`}>
            {overdue ? "Overdue" : smartDate(fu.date)}
          </span>
        )}
      </button>
      {onShare && (
        <div className="pb-2 pl-8">
          <button onClick={onShare} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-700 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
            <Send size={11} /> Assign to teammate
          </button>
        </div>
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

  // ALL hooks must be declared before any conditional return
  const [selectedMember, setSelectedMember] = useState(null);
  const [activeSection, setActiveSection]   = useState("clients");
  const [shareTarget, setShareTarget]       = useState(null);
  const [detailFU, setDetailFU]             = useState(null);
  const [detailItem, setDetailItem]         = useState(null); // {type, data} for clients/contacts/leads

  const memberMap = useMemo(() => {
    const map = {};
    teamMembers.forEach((m, i) => {
      map[m.user_id] = { email: m.email, role: m.role, color: memberColor(i) };
    });
    return map;
  }, [teamMembers]);

  // Members see a simplified view without individual teammate data
  if (!isAdmin) {
    const myClients = (data.clients || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId);
    const myOpenFU = (data.followups || []).filter(f => (f.user_id === userId || f.assigned_to_user_id === userId) && !f.completed);
    const myOverdue = myOpenFU.filter(f => f.date < today);
    return (
      <div className="space-y-4">
        <Card className="p-5 text-center">
          <p className="text-base font-black text-slate-900">Team Overview</p>
          <p className="text-sm text-slate-400 mt-1">Contact your admin to see full team analytics</p>
          <div className="flex gap-3 mt-4">
            <div className="flex-1 bg-slate-50 rounded-xl p-3">
              <p className="text-xl font-black" style={{color: BRAND.primary}}>{myClients.length}</p>
              <p className="text-xs font-bold text-slate-400">My clients</p>
            </div>
            <div className="flex-1 bg-slate-50 rounded-xl p-3">
              <p className="text-xl font-black" style={{color: myOverdue.length > 0 ? "#DC2626" : "#1D4ED8"}}>{myOpenFU.length}</p>
              <p className="text-xs font-bold text-slate-400">{myOverdue.length > 0 ? `${myOverdue.length} overdue` : "Follow-ups"}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

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
    // Show under assignee if assigned, otherwise under creator. Prevents double-counting.
    return rows.filter(r => {
      const responsible = r.assigned_to_user_id || r.user_id;
      return responsible === selectedMember;
    });
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
    { key: "docs",      label: "Docs",       icon: FolderOpen, count: 0,                color: "#8B1A1A", bg: "#FEE2E2" },
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

      {/* Teammate filter — not shown for the shared Docs library */}
      {activeSection !== "docs" && (
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
      )}

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

      {/* Docs tab: shared company document library (view / upload / share) */}
      {activeSection === "docs" ? (
        <CompanyDocuments userId={userId} teamId={teamId} />
      ) : (
      /* Records list */
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
                onTap={() => setDetailItem({ type: "client", data: r })}
                onOpen={isAdmin ? () => onNavigate?.("Client360", { clientId: r.id, returnTo: "TeamDashboard" }) : undefined}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.company, type: "client" }) : undefined} />
            ))}
            {activeSection === "contacts" && displayed.map(r => (
              <ContactRow key={r.id} contact={r} color={r._ownerColor}
                onTap={() => setDetailItem({ type: "contact", data: r })}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.name, type: "contact" }) : undefined} />
            ))}
            {activeSection === "leads" && displayed.map(r => (
              <LeadRow key={r.id} lead={r} color={r._ownerColor}
                onTap={() => setDetailItem({ type: "lead", data: r })}
                onShare={isAdmin ? () => handleShare({ id: r.id, title: r.title || r.client_name, type: "lead" }) : undefined} />
            ))}
            {activeSection === "followups" && displayed.map(r => (
              <FollowupRow key={r.id} fu={r} today={today} color={r._ownerColor}
                onTap={() => setDetailFU(r)}
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
      )}

      {/* Admin pipeline */}
      {isAdmin && activeSection !== "docs" && (
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

      {/* ── Client / Contact / Lead detail sheet ── */}
      <AnimatePresence>
        {detailItem && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={() => setDetailItem(null)} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"/>
            <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
              transition={{type:"spring",damping:28,stiffness:300}}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white"
              style={{maxHeight:"82vh"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
              <div className="overflow-y-auto px-5 pb-8 space-y-4" style={{maxHeight:"calc(82vh - 24px)"}}>

                {/* Header */}
                <div className="flex items-start justify-between pt-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-black text-slate-900">
                      {detailItem.type === "client"  && detailItem.data.company}
                      {detailItem.type === "contact" && detailItem.data.name}
                      {detailItem.type === "lead"    && (detailItem.data.title || detailItem.data.client_name)}
                    </p>
                    {detailItem.type === "client"  && detailItem.data.branch  && <p className="text-sm text-slate-400">{detailItem.data.branch}</p>}
                    {detailItem.type === "contact" && detailItem.data.title   && <p className="text-sm text-slate-400">{detailItem.data.title}</p>}
                    {detailItem.type === "lead"    && detailItem.data.client_name && <p className="text-sm text-slate-400">{detailItem.data.client_name}</p>}
                  </div>
                  <button onClick={() => setDetailItem(null)} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500 shrink-0">
                    <X size={18}/>
                  </button>
                </div>

                {/* CLIENT detail */}
                {detailItem.type === "client" && (() => { const d = detailItem.data; return (<>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StagePill stage={d.stage || "New Lead"} />
                    {d.sync_status === "pending" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Not synced</span>}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                    {d.contact  && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Contact</p><p className="text-sm text-slate-800">{d.contact}</p></div>}
                    {d.phone    && <div className="flex gap-2 items-center"><p className="text-xs font-bold text-slate-400 w-16">Phone</p>
                      <a href={`tel:${d.phone}`} className="text-sm text-blue-600 font-medium">{d.phone}</a>
                      <a href={`https://wa.me/${d.phone.replace(/^0/,"27").replace(/[^0-9]/,"")}`} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700">WhatsApp</a>
                    </div>}
                    {d.email    && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Email</p><a href={`mailto:${d.email}`} className="text-sm text-blue-600">{d.email}</a></div>}
                    {d.location && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Location</p><p className="text-sm text-slate-800">{d.location}</p></div>}
                  </div>
                  {d.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800">{d.notes}</p></div>}
                  {isAdmin && (
                    <button onClick={() => { onNavigate?.("Client360", { clientId: d.id, returnTo: "TeamDashboard" }); setDetailItem(null); }}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white min-h-[52px]"
                      style={{background: BRAND.primary}}>
                      Open full client profile →
                    </button>
                  )}
                </>); })()}

                {/* CONTACT detail */}
                {detailItem.type === "contact" && (() => { const d = detailItem.data; return (<>
                  <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                    {d.company  && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Company</p><p className="text-sm text-slate-800">{d.company}</p></div>}
                    {d.phone    && <div className="flex gap-2 items-center"><p className="text-xs font-bold text-slate-400 w-16">Phone</p>
                      <a href={`tel:${d.phone}`} className="text-sm text-blue-600 font-medium">{d.phone}</a>
                      <a href={`https://wa.me/${d.phone.replace(/^0/,"27").replace(/[^0-9]/,"")}`} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700">WhatsApp</a>
                    </div>}
                    {d.email    && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Email</p><a href={`mailto:${d.email}`} className="text-sm text-blue-600">{d.email}</a></div>}
                    {d.met_at   && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Met at</p><p className="text-sm text-slate-800">{d.met_at}</p></div>}
                    {d.met_date && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Met on</p><p className="text-sm text-slate-800">{smartDate(d.met_date)}</p></div>}
                    {d.status   && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-16">Status</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:"#EDE9FE",color:"#5B21B6"}}>{d.status}</span>
                    </div>}
                  </div>
                  {d.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800 whitespace-pre-wrap">{d.notes}</p></div>}
                </>); })()}

                {/* LEAD detail */}
                {detailItem.type === "lead" && (() => { const d = detailItem.data; return (<>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StagePill stage={d.stage || "New Lead"} />
                    {d.estimated_value && <p className="text-sm font-black" style={{color:BRAND.primary}}>R {parseFloat(d.estimated_value||0).toLocaleString("en-ZA")}</p>}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                    {d.lead_date      && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-20">Lead date</p><p className="text-sm text-slate-800">{smartDate(d.lead_date)}</p></div>}
                    {d.follow_up_date && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-20">Follow up</p><p className="text-sm text-slate-800">{smartDate(d.follow_up_date)}</p></div>}
                    {d.assigned_to    && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-20">Assigned</p><p className="text-sm text-slate-800">{d.assigned_to}</p></div>}
                    {d.captured_by    && <div className="flex gap-2"><p className="text-xs font-bold text-slate-400 w-20">Captured</p><p className="text-sm text-slate-800">{d.captured_by}</p></div>}
                  </div>
                  {d.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800 whitespace-pre-wrap">{d.notes}</p></div>}
                  {d.outcome_notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400 mb-1">Outcome</p><p className="text-sm text-slate-800">{d.outcome_notes}</p></div>}
                  {isAdmin && (
                    <button onClick={() => { setShareTarget({ id: d.id, title: d.title || d.client_name, type: "lead" }); setDetailItem(null); }}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white min-h-[52px]"
                      style={{background: BRAND.primary}}>
                      <Send size={16}/> Assign to teammate
                    </button>
                  )}
                </>); })()}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <ShareToTeamModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        record={shareTarget}
        fromUserId={userId}
        fromEmail={userEmail}
        teamId={teamId}
        teamMembers={teamMembers}
      />

      {/* Follow-up detail sheet */}
      <AnimatePresence>
        {detailFU && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDetailFU(null)}
              className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white overflow-hidden"
              style={{ maxHeight: "80vh" }}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
              <div className="px-5 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(80vh - 24px)" }}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        detailFU.completed ? "bg-green-100 text-green-700"
                        : detailFU.date < today ? "bg-red-100 text-red-700"
                        : "bg-blue-50 text-blue-700"
                      }`}>
                        {detailFU.completed ? "✓ Done" : detailFU.date < today ? "Overdue" : smartDate(detailFU.date)}
                      </span>
                      {detailFU.time && <span className="text-xs text-slate-400">{detailFU.time}</span>}
                    </div>
                    <p className="text-xl font-black text-slate-900 mt-2">{detailFU.title}</p>
                    {detailFU.client && <p className="text-sm text-slate-500 mt-0.5">{detailFU.client}{detailFU.branch ? ` — ${detailFU.branch}` : ""}</p>}
                  </div>
                  <button onClick={() => setDetailFU(null)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500 shrink-0 mt-1">
                    <X size={18} />
                  </button>
                </div>

                {/* Assigned to */}
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Assigned to</p>
                  <div className="flex items-center gap-2.5">
                    <MemberChip email={detailFU._ownerEmail} userId={detailFU.user_id} color={detailFU._ownerColor} />
                    <p className="text-sm font-bold text-slate-700">
                      {detailFU.assigned_to || detailFU._ownerEmail?.split("@")[0] || "Unassigned"}
                    </p>
                  </div>
                </div>

                {/* Date + time */}
                <div className="rounded-xl bg-slate-50 p-3.5 space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Schedule</p>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400 shrink-0" />
                    <p className="text-sm text-slate-700">{detailFU.date}{detailFU.time ? ` at ${detailFU.time}` : ""}</p>
                  </div>
                  {detailFU.reminder && detailFU.reminder !== "none" && (
                    <p className="text-xs text-slate-400">Reminder: {detailFU.reminder.replace(/_/g, " ")}</p>
                  )}
                </div>

                {/* Notes */}
                {detailFU.notes && (
                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailFU.notes}</p>
                  </div>
                )}

                {/* Admin actions */}
                {isAdmin && !detailFU.completed && (
                  <button
                    onClick={() => {
                      setShareTarget({ id: detailFU.id, title: detailFU.title, type: "followup" });
                      setDetailFU(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white min-h-[52px]"
                    style={{ background: BRAND.primary }}>
                    <Send size={16} /> Reassign to teammate
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
