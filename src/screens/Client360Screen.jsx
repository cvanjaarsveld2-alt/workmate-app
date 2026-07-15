// ─── Client 360° Screen ───────────────────────────────────────────────────────
// Full client view: contacts, follow-ups, notes, quotes, leads, equipment,
// expenses, activities, and a merged timeline.
//
// UPGRADES:
//   + Expenses tab (was missing entirely)
//   + Location with tap-to-map
//   + Edit client button
//   + Note media thumbnails
//   + Revenue summary (quoted vs won vs pending)
//   + Quick-add buttons per tab (add followup, add note, etc.)
//   + Tap any card to navigate to its screen
//   + Client health indicator (last contact + pipeline status)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Phone, Mail, MapPin, Plus, Edit2,
  Users, Calendar, TrendingUp, FileText, Wrench,
  MessageSquare, CheckCircle2, Clock, DollarSign,
  Send, ExternalLink, Receipt, AlertTriangle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { BRAND, NOTE_URGENCY, QUOTE_STATUS_COLORS } from "../lib/constants";
import { todayISO, smartDate, formatCurrency, daysDiff } from "../lib/helpers";
import { Card, StagePill, UrgencyBadge, ServiceBadge, Toast } from "../components/ui";
import { ShareToTeamModal } from "../components/ShareToTeamModal";
import { ActivityLogger } from "../components/ActivityLogger";

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000), hours = Math.floor(ms / 3600000), days = Math.floor(ms / 86400000);
  if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`; if (days < 30) return `${days}d ago`;
  return smartDate(iso);
}
function whatsappLink(phone, text) {
  const clean = (phone||"").replace(/[^0-9+]/g,"");
  const num = clean.startsWith("0") ? "27"+clean.slice(1) : clean;
  return `https://wa.me/${num}${text?"?text="+encodeURIComponent(text):""}`;
}
function telLink(p) { return `tel:${(p||"").replace(/[^0-9+]/g,"")}`; }
function mapsLink(loc) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`; }

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key:"timeline",  label:"Timeline",   icon:Clock },
  { key:"contacts",  label:"Contacts",   icon:Users },
  { key:"followups", label:"Follow-ups", icon:Calendar },
  { key:"notes",     label:"Notes",      icon:MessageSquare },
  { key:"quotes",    label:"Quotes",     icon:FileText },
  { key:"leads",     label:"Leads",      icon:TrendingUp },
  { key:"equipment", label:"Equipment",  icon:Wrench },
  { key:"expenses",  label:"Expenses",   icon:Receipt },
];

// ── Timeline styles ──────────────────────────────────────────────────────────
const EVENT_STYLE = {
  followup:  { icon:Calendar,      bg:"#DBEAFE", color:"#1E40AF", label:"Follow-up" },
  note:      { icon:MessageSquare, bg:"#FEF3C7", color:"#92400E", label:"Note" },
  quote:     { icon:FileText,      bg:"#EDE9FE", color:"#5B21B6", label:"Quote" },
  lead:      { icon:TrendingUp,    bg:"#DCFCE7", color:"#166534", label:"Lead" },
  equipment: { icon:Wrench,        bg:"#CFFAFE", color:"#0E7490", label:"Equipment" },
  activity:  { icon:Phone,         bg:"#F0FDF4", color:"#15803D", label:"Activity" },
  expense:   { icon:Receipt,       bg:"#FFF7ED", color:"#9A3412", label:"Expense" },
};

function TimelineItem({ event, onTap }) {
  const s = EVENT_STYLE[event.type] || EVENT_STYLE.activity;
  const Icon = s.icon;
  return (
    <button onClick={onTap} className="w-full text-left flex gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors rounded-lg -mx-1 px-1">
      <div className="flex flex-col items-center pt-0.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{background:s.bg}}>
          <Icon size={14} style={{color:s.color}} />
        </div>
        <div className="w-px flex-1 bg-slate-100 mt-1" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider" style={{color:s.color}}>{s.label}</span>
          <span className="text-[10px] text-slate-400 ml-auto shrink-0">{timeAgo(event.date)}</span>
        </div>
        <p className="text-sm font-bold text-slate-900 mt-0.5 break-words">{event.title}</p>
        {event.subtitle && <p className="text-xs text-slate-500 mt-0.5">{event.subtitle}</p>}
        {event.badge && (
          <span className="inline-block mt-1 text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{background:event.badge.bg, color:event.badge.color}}>{event.badge.text}</span>
        )}
      </div>
    </button>
  );
}

function ActionBtn({icon:Icon,label,onClick,color,bg}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 flex-1 py-3 rounded-2xl min-h-[64px] active:scale-95 transition-transform" style={{background:bg}}>
      <Icon size={18} style={{color}} /><span className="text-[10px] font-black" style={{color}}>{label}</span>
    </button>
  );
}

function ContactCard({contact}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0" style={{background:BRAND.primary}}>
          {(contact.name||"?").slice(0,2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">{contact.name}</p>
          {contact.title && <p className="text-xs text-slate-500">{contact.title}</p>}
          <div className="flex gap-2 mt-2 flex-wrap">
            {contact.phone && (
              <>
                <a href={telLink(contact.phone)} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 min-h-[32px]"><Phone size={11}/> Call</a>
                <a href={whatsappLink(contact.phone)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 min-h-[32px]"><ExternalLink size={11}/> WhatsApp</a>
              </>
            )}
            {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 min-h-[32px]"><Mail size={11}/> Email</a>}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyTab({ icon: Icon, label, actionLabel, onAction }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <Icon size={28} className="text-slate-200" />
      <p className="text-sm font-bold text-slate-400">No {label}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl min-h-[36px]"
          style={{ color: BRAND.primary, background: "#F7F3F3" }}>
          <Plus size={12} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function Client360Screen({ data, setData, userId, userEmail, teamId, teamMembers, clientId, onBack, onNavigate }) {
  const [activeTab, setActiveTab] = useState("timeline");
  const [toast, setToast] = useState("");
  const [shareTarget, setShareTarget] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [showAllStats, setShowAllStats] = useState(false);
  const today = todayISO();

  const client = (data.clients||[]).find(c => c.id === clientId);
  if (!client) return (
    <div className="space-y-4">
      <button onClick={onBack} className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center"><ArrowLeft size={18}/></button>
      <div className="text-center py-12"><p className="text-sm text-slate-400">Client not found</p></div>
    </div>
  );

  // ── Related records ────────────────────────────────────────────────────────
  const contacts   = (data.contacts||[]).filter(c => c.client_id===clientId);
  const followups  = (data.followups||[]).filter(f => f.client_id===clientId);
  const notes      = (data.notes||[]).filter(n => n.client_id===clientId);
  const quotes     = (data.quotes||[]).filter(q => q.client_id === clientId || (q.client_name && client.company && q.client_name.toLowerCase()===client.company.toLowerCase()));
  const leads      = (data.leads||[]).filter(l => l.client_id===clientId || (l.client_name && client.company && l.client_name.toLowerCase()===client.company.toLowerCase()));
  const equipment  = (data.equipment||[]).filter(e => e.client_id === clientId || (e.client && client.company && e.client.toLowerCase()===client.company.toLowerCase()));
  const activities = (data.activities||[]).filter(a => a.client_id===clientId);
  // NEW: expenses linked to this client
  const expenses   = (data.expenses||[]).filter(e => e.client_id === clientId || (e.client_name && client.company && e.client_name.toLowerCase()===client.company.toLowerCase()));

  // ── Timeline ───────────────────────────────────────────────────────────────
  const timeline = useMemo(() => {
    const events = [];
    followups.forEach(f => events.push({ type:"followup", date:f.created_at||f.date, title:f.title,
      subtitle:f.completed?"Completed":f.date<today?"Overdue":smartDate(f.date),
      badge:f.completed?{text:"Done",bg:"#DCFCE7",color:"#166534"}:f.date<today?{text:"Overdue",bg:"#FEF2F2",color:"#DC2626"}:null,
      screen:"Followups" }));
    notes.forEach(n => { const u=NOTE_URGENCY[n.urgency]||NOTE_URGENCY.Normal; events.push({ type:"note", date:n.created_at, title:(n.note||"").slice(0,120),
      subtitle:n.resolved?"Resolved":n.resolve_by?`Resolve by ${smartDate(n.resolve_by)}`:null,
      badge:n.urgency!=="Normal"?{text:n.urgency,bg:u.bg,color:u.text}:null,
      screen:"Notes" }); });
    quotes.forEach(q => { const c=QUOTE_STATUS_COLORS[q.status]||{}; events.push({ type:"quote", date:q.created_at||q.sent_date,
      title:`${q.description||"Quote"} — ${formatCurrency(q.value)}`, subtitle:q.status,
      badge:{text:q.status,bg:c.bg||"#F1F5F9",color:c.text||"#64748B"},
      screen:"Quotes" }); });
    leads.forEach(l => events.push({ type:"lead", date:l.created_at||l.lead_date, title:l.title||"Lead",
      subtitle:l.estimated_value?formatCurrency(l.estimated_value):null,
      badge:{text:l.stage||"New",bg:"#EDE9FE",color:"#5B21B6"},
      screen:"Leads" }));
    equipment.forEach(e => events.push({ type:"equipment", date:e.created_at,
      title:`${e.name} ${e.make?`(${e.make})`:""}`, subtitle:e.serial?`S/N: ${e.serial}`:e.location||null,
      badge:e.service_due&&daysDiff(e.service_due)!==null&&daysDiff(e.service_due)<0?{text:"Service overdue",bg:"#FEF2F2",color:"#DC2626"}:null,
      screen:"Equipment" }));
    activities.forEach(a => events.push({ type:"activity", date:a.created_at,
      title:`${(a.activity_type||"").replace(/_/g," ")}: ${a.summary||""}`,
      subtitle:a.outcome||null, screen:null }));
    expenses.forEach(e => events.push({ type:"expense", date:e.expense_date||e.created_at,
      title:`${e.vendor||"Expense"} — ${formatCurrency(e.amount_zar||e.amount)}`,
      subtitle:e.category||null,
      badge:{text:e.category||"Expense",bg:"#FFF7ED",color:"#9A3412"},
      screen:"Expenses" }));
    events.sort((a,b) => new Date(b.date||0)-new Date(a.date||0));
    return events;
  }, [followups, notes, quotes, leads, equipment, activities, expenses, today]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const openFU      = followups.filter(f=>!f.completed);
  const overdueFU   = openFU.filter(f=>f.date<today);
  const openLeads   = leads.filter(l=>!["Won","Lost"].includes(l.stage));
  const pendingQ    = quotes.filter(q=>q.status==="Pending");
  const totalQuoted = quotes.reduce((s,q)=>s+parseFloat(q.value||0),0);
  const wonRev      = quotes.filter(q=>q.status==="Accepted").reduce((s,q)=>s+parseFloat(q.value||0),0);
  const pendingRev  = pendingQ.reduce((s,q)=>s+parseFloat(q.value||0),0);
  const totalExpenses = expenses.reduce((s,e)=>s+parseFloat(e.amount_zar||e.amount||0),0);
  const unresolvedNotes = notes.filter(n=>!n.resolved).length;
  const overdueEquip = equipment.filter(e=>e.service_due&&daysDiff(e.service_due)<0).length;

  // ── Last contact ───────────────────────────────────────────────────────────
  const allDates = [
    ...followups.filter(f=>f.completed).map(f=>f.date),
    ...activities.map(a=>a.created_at),
    ...notes.map(n=>n.created_at),
  ].filter(Boolean).sort().reverse();
  const lastContact   = allDates[0];
  const daysSinceLast = lastContact ? Math.floor((Date.now()-new Date(lastContact).getTime())/86400000) : null;

  // ── Client health score (simple) ───────────────────────────────────────────
  const healthIssues = [];
  if (daysSinceLast !== null && daysSinceLast > 14) healthIssues.push(`${daysSinceLast}d since last contact`);
  if (overdueFU.length > 0) healthIssues.push(`${overdueFU.length} overdue follow-up${overdueFU.length!==1?"s":""}`);
  if (unresolvedNotes > 0 && notes.some(n=>n.urgency==="Critical"&&!n.resolved)) healthIssues.push("Critical notes unresolved");
  if (overdueEquip > 0) healthIssues.push(`${overdueEquip} service${overdueEquip!==1?"s":""} overdue`);

  // ── Tab content ────────────────────────────────────────────────────────────
  function renderTab() {
    switch(activeTab) {

      case "timeline":
        return timeline.length===0
          ? <EmptyTab icon={Clock} label="activity yet" />
          : <div className="px-1">{timeline.slice(0,50).map((e,i) =>
              <TimelineItem key={i} event={e} onTap={() => e.screen && onNavigate?.(e.screen)} />
            )}</div>;

      case "contacts":
        return contacts.length===0
          ? <EmptyTab icon={Users} label="contacts linked" actionLabel="Add contact" onAction={() => onNavigate?.("Contacts")} />
          : <div className="space-y-3">{contacts.map(c => <ContactCard key={c.id} contact={c}/>)}</div>;

      case "followups":
        return followups.length===0
          ? <EmptyTab icon={Calendar} label="follow-ups" actionLabel="Add follow-up" onAction={() => onNavigate?.("Followups")} />
          : <div className="space-y-2">{followups.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(f=>(
            <button key={f.id} onClick={() => onNavigate?.("Followups")} className="w-full text-left">
              <Card className={`p-3 ${!f.completed&&f.date<today?"border-l-4 border-l-red-400":""}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${f.completed?"bg-green-100":"bg-slate-100"}`}>
                    {f.completed?<CheckCircle2 size={14} className="text-green-600"/>:<Calendar size={14} className="text-slate-400"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${f.completed?"line-through text-slate-400":"text-slate-900"}`}>{f.title}</p>
                    <p className="text-xs text-slate-400">{smartDate(f.date)}{f.time?` at ${f.time}`:""}</p>
                  </div>
                  {!f.completed && f.date < today && <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700 shrink-0">Overdue</span>}
                </div>
              </Card>
            </button>))}</div>;

      case "notes":
        return notes.length===0
          ? <EmptyTab icon={MessageSquare} label="notes" actionLabel="Add note" onAction={() => onNavigate?.("Notes")} />
          : <div className="space-y-2">{notes.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).map(n=>{
            const u=NOTE_URGENCY[n.urgency]||NOTE_URGENCY.Normal;
            return (
              <button key={n.id} onClick={() => onNavigate?.("Notes")} className="w-full text-left">
                <Card className="p-3" style={{borderLeft:`3px solid ${u.border}`}}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 break-words">{(n.note||"").slice(0,150)}</p>
                      {n.resolve_by&&<p className="text-xs text-slate-400 mt-1">Resolve by {smartDate(n.resolve_by)}</p>}
                      {/* Media thumbnails */}
                      {n.media && n.media.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {n.media.filter(m=>m.url).slice(0,4).map((m,i) => (
                            <div key={i} className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                              <img src={m.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          ))}
                          {n.media.filter(m=>m.url).length > 4 && <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">+{n.media.filter(m=>m.url).length-4}</div>}
                        </div>
                      )}
                    </div>
                    <UrgencyBadge urgency={n.urgency}/>
                  </div>
                </Card>
              </button>);})}</div>;

      case "quotes":
        return quotes.length===0
          ? <EmptyTab icon={FileText} label="quotes" actionLabel="Create quote" onAction={() => onNavigate?.("Quotes")} />
          : <div className="space-y-2">{quotes.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).map(q=>{
            const c=QUOTE_STATUS_COLORS[q.status]||{};
            return (
              <button key={q.id} onClick={() => onNavigate?.("Quotes")} className="w-full text-left">
                <Card className="p-3.5"><div className="flex items-start justify-between gap-3"><div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{q.description||"Quote"}</p>
                  <p className="text-lg font-black mt-0.5" style={{color:BRAND.primary}}>{formatCurrency(q.value)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{smartDate(q.sent_date||q.created_at)}</p>
                </div><span className="text-xs font-bold rounded-full px-2.5 py-1 shrink-0" style={{background:c.bg||"#F1F5F9",color:c.text||"#64748B"}}>{q.status}</span></div></Card>
              </button>);})}</div>;

      case "leads":
        return leads.length===0
          ? <EmptyTab icon={TrendingUp} label="leads" actionLabel="Add lead" onAction={() => onNavigate?.("Leads")} />
          : <div className="space-y-2">{leads.map(l=>(
            <button key={l.id} onClick={() => onNavigate?.("Leads")} className="w-full text-left">
              <Card className="p-3.5">
                <p className="text-sm font-bold text-slate-900">{l.title||"Lead"}</p>
                {l.estimated_value&&<p className="text-sm font-black mt-0.5" style={{color:BRAND.primary}}>{formatCurrency(l.estimated_value)}</p>}
                <div className="flex items-center gap-2 mt-1.5"><span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{background:"#EDE9FE",color:"#5B21B6"}}>{l.stage||"New"}</span>
                  <span className="text-xs text-slate-400">{smartDate(l.created_at)}</span></div>
              </Card>
            </button>))}</div>;

      case "equipment":
        return equipment.length===0
          ? <EmptyTab icon={Wrench} label="equipment" actionLabel="Add equipment" onAction={() => onNavigate?.("Equipment")} />
          : <div className="space-y-2">{equipment.map(e=>(
            <button key={e.id} onClick={() => onNavigate?.("Equipment")} className="w-full text-left">
              <Card className="p-3.5"><div className="flex items-start justify-between">
                <div><p className="text-sm font-bold text-slate-900">{e.name}</p><p className="text-xs text-slate-500">{[e.make,e.model].filter(Boolean).join(" · ")}</p>
                  {e.serial&&<p className="text-xs text-slate-400 mt-0.5">S/N: {e.serial}</p>}</div>
                {e.service_due&&<ServiceBadge dueDate={e.service_due}/>}
              </div></Card>
            </button>))}</div>;

      case "expenses":
        return expenses.length===0
          ? <EmptyTab icon={Receipt} label="expenses" actionLabel="Add expense" onAction={() => onNavigate?.("Expenses")} />
          : <div className="space-y-2">
              <div className="flex justify-between items-center px-1 pb-1">
                <p className="text-xs font-bold text-slate-400">Total: {formatCurrency(totalExpenses)}</p>
              </div>
              {expenses.sort((a,b)=>(b.expense_date||b.created_at||"").localeCompare(a.expense_date||a.created_at||"")).slice(0,20).map(e=>(
                <button key={e.id} onClick={() => onNavigate?.("Expenses")} className="w-full text-left">
                  <Card className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{e.vendor||"Expense"}</p>
                        <p className="text-xs text-slate-500">{e.category||""} · {smartDate(e.expense_date||e.created_at)}</p>
                      </div>
                      <p className="text-sm font-black shrink-0" style={{color:BRAND.primary}}>{formatCurrency(e.amount_zar||e.amount)}</p>
                    </div>
                  </Card>
                </button>
              ))}
            </div>;

      default: return null;
    }
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast&&<Toast message={toast} onDone={()=>setToast("")}/>}</AnimatePresence>

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 mt-0.5"><ArrowLeft size={18}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-black text-slate-900 truncate">{client.company}</p>
          <div className="flex items-center gap-2 mt-1">
            <StagePill stage={client.stage||"New Lead"}/>
            {client.branch&&<span className="text-xs text-slate-400">· {client.branch}</span>}
          </div>
          {client.contact&&<p className="text-sm text-slate-500 mt-1">{client.contact}</p>}
          {/* Location with map link */}
          {client.location && (
            <a href={mapsLink(client.location)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 mt-1 hover:underline">
              <MapPin size={11}/> {client.location}
            </a>
          )}
        </div>
        {/* Edit button */}
        <button onClick={() => onNavigate?.("Clients")}
          className="p-2 rounded-xl bg-slate-100 text-slate-500 min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0">
          <Edit2 size={15}/>
        </button>
      </div>

      {/* ── Quick actions ── */}
      <div className="flex gap-2">
        <ActionBtn icon={Plus} label="Log" onClick={()=>setActivityOpen(true)} color="#8B1A1A" bg="#F7F3F3"/>
        {client.phone&&<>
          <ActionBtn icon={Phone} label="Call" onClick={()=>window.open(telLink(client.phone))} color="#1E40AF" bg="#DBEAFE"/>
          <ActionBtn icon={ExternalLink} label="WhatsApp" onClick={()=>window.open(whatsappLink(client.phone,`Hi ${client.contact || ""}`))} color="#166534" bg="#DCFCE7"/>
        </>}
        {client.email&&<ActionBtn icon={Mail} label="Email" onClick={()=>window.open(`mailto:${client.email}`)} color="#5B21B6" bg="#EDE9FE"/>}
        {teamId&&<ActionBtn icon={Send} label="Share" onClick={()=>setShareTarget({id:client.id,title:client.company,type:"client"})} color="#92400E" bg="#FEF3C7"/>}
      </div>

      {/* ── Health warning ── */}
      {healthIssues.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-bold text-amber-700">Needs attention</p>
            <p className="text-xs text-amber-600 mt-0.5">{healthIssues.join(" · ")}</p>
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div>
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
            <p className="text-lg font-black" style={{color:BRAND.primary}}>{contacts.length}</p>
            <p className="text-[10px] font-bold text-slate-400">Contacts</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
            <p className="text-lg font-black" style={{color:overdueFU.length>0?"#DC2626":"#1E40AF"}}>{openFU.length}</p>
            <p className="text-[10px] font-bold text-slate-400">{overdueFU.length>0?`${overdueFU.length} overdue`:"Open F/U"}</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
            <p className="text-lg font-black" style={{color:"#166534"}}>{formatCurrency(wonRev)}</p>
            <p className="text-[10px] font-bold text-slate-400">Won</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
            <p className="text-lg font-black" style={{color:"#5B21B6"}}>{formatCurrency(pendingRev)}</p>
            <p className="text-[10px] font-bold text-slate-400">Pending</p>
          </div>
        </div>
        {/* Expandable extra stats */}
        {(totalExpenses > 0 || equipment.length > 0 || openLeads.length > 0) && (
          <button onClick={() => setShowAllStats(s => !s)} className="w-full flex items-center justify-center gap-1 pt-2 text-xs font-bold text-slate-400">
            {showAllStats ? "Less" : "More stats"} {showAllStats ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
        )}
        <AnimatePresence>
          {showAllStats && (
            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
              <div className="flex gap-2 mt-2">
                <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
                  <p className="text-lg font-black" style={{color:"#5B21B6"}}>{formatCurrency(totalQuoted)}</p>
                  <p className="text-[10px] font-bold text-slate-400">Total quoted</p>
                </div>
                <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
                  <p className="text-lg font-black" style={{color:"#9A3412"}}>{formatCurrency(totalExpenses)}</p>
                  <p className="text-[10px] font-bold text-slate-400">Expenses</p>
                </div>
                <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-100 min-w-0">
                  <p className="text-lg font-black text-slate-700">{equipment.length}</p>
                  <p className="text-[10px] font-bold text-slate-400">Equipment</p>
                </div>
              </div>
              {lastContact && (
                <p className="text-xs text-slate-400 text-center mt-2">Last contact: {smartDate(lastContact)} ({daysSinceLast}d ago)</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => {
          const active = activeTab === t.key;
          let count = 0;
          if(t.key==="contacts")  count=contacts.length;
          if(t.key==="followups") count=openFU.length;
          if(t.key==="notes")     count=unresolvedNotes;
          if(t.key==="quotes")    count=pendingQ.length;
          if(t.key==="leads")     count=openLeads.length;
          if(t.key==="equipment") count=equipment.length;
          if(t.key==="expenses")  count=expenses.length;
          if(t.key==="timeline")  count=timeline.length;
          return (
            <button key={t.key} onClick={()=>setActiveTab(t.key)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition-all ${active?"text-white":"bg-white border border-slate-100 text-slate-500"}`}
              style={active?{background:BRAND.primary}:{}}>
              <t.icon size={12}/>{t.label}
              {count>0&&<span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${active?"bg-white/30":"bg-slate-100"}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <Card className="overflow-hidden"><div className="p-4">{renderTab()}</div></Card>

      {/* ── Modals ── */}
      <ShareToTeamModal open={!!shareTarget} onClose={()=>setShareTarget(null)} record={shareTarget}
        fromUserId={userId} fromEmail={userEmail} teamId={teamId} teamMembers={teamMembers}/>
      <ActivityLogger open={activityOpen} onClose={()=>setActivityOpen(false)} client={client} userId={userId} teamId={teamId} data={data} setData={setData}/>
    </div>
  );
}
