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
  ArrowLeft, Phone, Mail, MapPin, Plus, Edit2, X,
  Users, Calendar, TrendingUp, FileText, Wrench,
  MessageSquare, CheckCircle2, Clock, DollarSign,
  Send, ExternalLink, Receipt, AlertTriangle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { BRAND, NOTE_URGENCY, QUOTE_STATUS_COLORS } from "../lib/constants";
import { genId, todayISO, smartDate, formatCurrency, daysDiff } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { offlineSave } from "../offline/offlineDb";
import { Card, Field, StagePill, UrgencyBadge, ServiceBadge, Toast } from "../components/ui";
import { InteractionLog } from "./InteractionLog";
import { ShareToTeamModal } from "../components/ShareToTeamModal";

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
  { key:"calls",     label:"Calls",      icon:Phone },
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
  const [detailItem, setDetailItem] = useState(null); // {type, data} for inline detail sheet
  const [toast, setToast] = useState("");
  const [shareTarget, setShareTarget] = useState(null);
  const [addForm, setAddForm] = useState(null); // "followup"|"note"|"contact"|"lead"|"quote"|"equipment"
  const [addData, setAddData] = useState({});
  const [showAllStats, setShowAllStats] = useState(false);
  const today = todayISO();

  const client = (data.clients||[]).find(c => c.id === clientId);
  // NOTE: no early return here — ALL hooks must run on every render or React
  // throws "Rendered fewer hooks than expected". The not-found guard lives
  // after the last hook below.
  const clientCo = client?.company || "";

  // ── Related records (null-safe so they work even when client is missing) ──
  const contacts   = (data.contacts||[]).filter(c => c.client_id===clientId);
  const followups  = (data.followups||[]).filter(f => f.client_id===clientId);
  const notes      = (data.notes||[]).filter(n => n.client_id===clientId);
  const quotes     = (data.quotes||[]).filter(q => q.client_id === clientId || (q.client_name && clientCo && q.client_name.toLowerCase()===clientCo.toLowerCase()));
  const leads      = (data.leads||[]).filter(l => l.client_id===clientId || (l.client_name && clientCo && l.client_name.toLowerCase()===clientCo.toLowerCase()));
  const equipment  = (data.equipment||[]).filter(e => e.client_id === clientId || (e.client && clientCo && e.client.toLowerCase()===clientCo.toLowerCase()));
  const activities = (data.activities||[]).filter(a => a.client_id===clientId);
  const expenses   = (data.expenses||[]).filter(e => e.client_id === clientId || (e.client_name && clientCo && e.client_name.toLowerCase()===clientCo.toLowerCase()));

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

  // ── Not-found guard — safe here because every hook above has already run ──
  if (!client) return (
    <div className="space-y-4">
      <button onClick={onBack} className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center"><ArrowLeft size={18}/></button>
      <div className="text-center py-12"><p className="text-sm text-slate-400">Client not found</p></div>
    </div>
  );

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

      case "calls":
        return <div className="px-1"><InteractionLog client={client} setData={setData} userId={userId} teamId={teamId} /></div>;

      case "timeline":
        return timeline.length===0
          ? <EmptyTab icon={Clock} label="activity yet" />
          : <div className="px-1">{timeline.slice(0,50).map((e,i) =>
              <TimelineItem key={i} event={e} onTap={() => {
                if (e.type === 'note') { const n = notes.find(x => x.created_at === e.date || x.note?.startsWith(e.title?.slice(0,30))); if(n) setDetailItem({type:'note',data:n}); return; }
                if (e.screen) onNavigate?.(e.screen);
              }} />
            )}</div>;

      case "contacts":
        return contacts.length===0
          ? <EmptyTab icon={Users} label="contacts linked" actionLabel="Add contact" onAction={() => { setAddData({ name: "", phone: "", email: "", title: "" }); setAddForm("contact"); }} />
          : <div className="space-y-3">{contacts.map(c => <ContactCard key={c.id} contact={c}/>)}</div>;

      case "followups":
        return followups.length===0
          ? <EmptyTab icon={Calendar} label="follow-ups" actionLabel="Add follow-up" onAction={() => { setAddData({ date: todayISO(), time: "", notes: "", reminder: "30_min" }); setAddForm("followup"); }} />
          : <div className="space-y-2">{followups.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(f=>(
            <button key={f.id} onClick={() => setDetailItem({type:'followup',data:f})} className="w-full text-left">
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
          ? <EmptyTab icon={MessageSquare} label="notes" actionLabel="Add note" onAction={() => { setAddData({ note: "", urgency: "Normal" }); setAddForm("note"); }} />
          : <div className="space-y-2">{notes.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).map(n=>{
            const u=NOTE_URGENCY[n.urgency]||NOTE_URGENCY.Normal;
            return (
              <button key={n.id} onClick={() => setDetailItem({type:'note',data:n})} className="w-full text-left">
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
          ? <EmptyTab icon={FileText} label="quotes" actionLabel="Create quote" onAction={() => { setAddData({ description: "", value: "", status: "Pending" }); setAddForm("quote"); }} />
          : <div className="space-y-2">{quotes.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).map(q=>{
            const c=QUOTE_STATUS_COLORS[q.status]||{};
            return (
              <button key={q.id} onClick={() => setDetailItem({type:'quote',data:q})} className="w-full text-left">
                <Card className="p-3.5"><div className="flex items-start justify-between gap-3"><div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{q.description||"Quote"}</p>
                  <p className="text-lg font-black mt-0.5" style={{color:BRAND.primary}}>{formatCurrency(q.value)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{smartDate(q.sent_date||q.created_at)}</p>
                </div><span className="text-xs font-bold rounded-full px-2.5 py-1 shrink-0" style={{background:c.bg||"#F1F5F9",color:c.text||"#64748B"}}>{q.status}</span></div></Card>
              </button>);})}</div>;

      case "leads":
        return leads.length===0
          ? <EmptyTab icon={TrendingUp} label="leads" actionLabel="Add lead" onAction={() => { setAddData({ title: "", stage: "New", notes: "" }); setAddForm("lead"); }} />
          : <div className="space-y-2">{leads.map(l=>(
            <button key={l.id} onClick={() => setDetailItem({type:'lead',data:l})} className="w-full text-left">
              <Card className="p-3.5">
                <p className="text-sm font-bold text-slate-900">{l.title||"Lead"}</p>
                {l.estimated_value&&<p className="text-sm font-black mt-0.5" style={{color:BRAND.primary}}>{formatCurrency(l.estimated_value)}</p>}
                <div className="flex items-center gap-2 mt-1.5"><span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{background:"#EDE9FE",color:"#5B21B6"}}>{l.stage||"New"}</span>
                  <span className="text-xs text-slate-400">{smartDate(l.created_at)}</span></div>
              </Card>
            </button>))}</div>;

      case "equipment":
        return equipment.length===0
          ? <EmptyTab icon={Wrench} label="equipment" actionLabel="Add equipment" onAction={() => { setAddData({ name: "", type: "", serial: "" }); setAddForm("equipment"); }} />
          : <div className="space-y-2">{equipment.map(e=>(
            <button key={e.id} onClick={() => setDetailItem({type:'equipment',data:e})} className="w-full text-left">
              <Card className="p-3.5"><div className="flex items-start justify-between">
                <div><p className="text-sm font-bold text-slate-900">{e.name}</p><p className="text-xs text-slate-500">{[e.make,e.model].filter(Boolean).join(" · ")}</p>
                  {e.serial&&<p className="text-xs text-slate-400 mt-0.5">S/N: {e.serial}</p>}</div>
                {e.service_due&&<ServiceBadge dueDate={e.service_due}/>}
              </div></Card>
            </button>))}</div>;

      case "expenses":
        return expenses.length===0
          ? <EmptyTab icon={Receipt} label="expenses" actionLabel="Add expense" onAction={() => { onNavigate?.("Expenses"); }} />
          : <div className="space-y-2">
              <div className="flex justify-between items-center px-1 pb-1">
                <p className="text-xs font-bold text-slate-400">Total: {formatCurrency(totalExpenses)}</p>
              </div>
              {expenses.sort((a,b)=>(b.expense_date||b.created_at||"").localeCompare(a.expense_date||a.created_at||"")).slice(0,20).map(e=>(
                <button key={e.id} onClick={() => setDetailItem({type:'expense',data:e})} className="w-full text-left">
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
        <ActionBtn icon={Plus} label="Log" onClick={()=>setActiveTab("calls")} color="#8B1A1A" bg="#F7F3F3"/>
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

      {/* ── Inline Add Form Sheet ── */}
      <AnimatePresence>
        {addForm && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={() => setAddForm(null)} className="fixed inset-0 z-[82] bg-black/50 backdrop-blur-sm"/>
            <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
              transition={{type:"spring",damping:28,stiffness:300}}
              className="fixed bottom-0 left-0 right-0 z-[83] rounded-t-3xl bg-white"
              style={{maxHeight:"85vh"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
              <div className="overflow-y-auto px-5 pb-8 pt-2 space-y-4" style={{maxHeight:"calc(85vh - 24px)"}}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-slate-900">
                      {addForm==="followup"  && "Add Follow-up"}
                      {addForm==="note"      && "Add Field Note"}
                      {addForm==="contact"   && "Add Contact"}
                      {addForm==="lead"      && "Add Lead"}
                      {addForm==="quote"     && "Create Quote"}
                      {addForm==="equipment" && "Add Equipment"}
                    </p>
                    <p className="text-xs text-slate-400">{client.company}{client.branch ? ` — ${client.branch}` : ""}</p>
                  </div>
                  <button onClick={()=>setAddForm(null)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center"><X size={16}/></button>
                </div>

                {addForm==="followup" && (<>
                  <Field label="Title" value={addData.title||""} onChange={v=>setAddData(d=>({...d,title:v}))} placeholder="What needs to happen?" />
                  <Field label="Date" type="date" value={addData.date||todayISO()} onChange={v=>setAddData(d=>({...d,date:v}))} />
                  <Field label="Time (optional)" type="time" value={addData.time||""} onChange={v=>setAddData(d=>({...d,time:v}))} />
                  <Field label="Notes (optional)" value={addData.notes||""} onChange={v=>setAddData(d=>({...d,notes:v}))} multiline placeholder="Any context..." />
                  <button onClick={()=>{
                    if (!addData.title?.trim()) return;
                    const item = withTeamId({id:genId(),user_id:userId,title:addData.title,client:client.company,branch:client.branch||"",client_id:clientId||null,date:addData.date||todayISO(),time:addData.time||"",notes:addData.notes||"",reminder:"30_min",completed:false,sync_status:"pending",created_at:new Date().toISOString()},teamId);
                    setData(d=>({...d,followups:[item,...(d.followups||[])],syncQueue:[{id:genId(),table:"followups",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                    offlineSave("followups",item).catch(()=>{});
                    setToast("Follow-up added ✓"); setAddForm(null);
                  }} className="w-full py-4 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{background:BRAND.primary}}>Save Follow-up</button>
                </>)}

                {addForm==="note" && (<>
                  <Field label="Note" value={addData.note||""} onChange={v=>setAddData(d=>({...d,note:v}))} multiline placeholder="What happened on site..." />
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2">Urgency</p>
                    <div className="flex gap-2">
                      {["Normal","Urgent","Critical"].map(u=>(
                        <button key={u} onClick={()=>setAddData(d=>({...d,urgency:u}))}
                          className={"flex-1 py-2 rounded-xl text-xs font-bold transition-all "+(addData.urgency===u?"text-white":"bg-slate-100 text-slate-500")}
                          style={addData.urgency===u?{background:u==="Critical"?"#DC2626":u==="Urgent"?"#D97706":BRAND.primary}:{}}>{u}</button>
                      ))}
                    </div>
                  </div>
                  <Field label="Resolve by (optional)" type="date" value={addData.resolve_by||""} onChange={v=>setAddData(d=>({...d,resolve_by:v}))} />
                  <button onClick={()=>{
                    if (!addData.note?.trim()) return;
                    const item = withTeamId({id:genId(),user_id:userId,client:client.company,client_id:clientId||null,note:addData.note,urgency:addData.urgency||"Normal",resolve_by:addData.resolve_by||null,resolved:false,media:[],sync_status:"pending",created_at:new Date().toISOString()},teamId);
                    setData(d=>({...d,notes:[item,...(d.notes||[])],syncQueue:[{id:genId(),table:"notes",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                    offlineSave("notes",item).catch(()=>{});
                    setToast("Note added ✓"); setAddForm(null);
                  }} className="w-full py-4 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{background:BRAND.primary}}>Save Note</button>
                </>)}

                {addForm==="contact" && (<>
                  <Field label="Name" value={addData.name||""} onChange={v=>setAddData(d=>({...d,name:v}))} placeholder="Full name" />
                  <Field label="Title / Role" value={addData.ctitle||""} onChange={v=>setAddData(d=>({...d,ctitle:v}))} placeholder="e.g. Maintenance Manager" />
                  <Field label="Phone" type="tel" value={addData.phone||""} onChange={v=>setAddData(d=>({...d,phone:v}))} placeholder="0XX XXX XXXX" />
                  <Field label="Email" type="email" value={addData.email||""} onChange={v=>setAddData(d=>({...d,email:v}))} placeholder="name@company.com" />
                  <button onClick={()=>{
                    if (!addData.name?.trim()) return;
                    const item = withTeamId({id:genId(),user_id:userId,name:addData.name,title:addData.ctitle||"",phone:addData.phone||"",email:addData.email||"",company:client.company,client_id:clientId||null,status:"Lead",met_at:client.company,met_date:todayISO(),sync_status:"pending",created_at:new Date().toISOString()},teamId);
                    setData(d=>({...d,contacts:[item,...(d.contacts||[])],syncQueue:[{id:genId(),table:"contacts",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                    offlineSave("contacts",item).catch(()=>{});
                    setToast("Contact added ✓"); setAddForm(null);
                  }} className="w-full py-4 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{background:BRAND.primary}}>Save Contact</button>
                </>)}

                {addForm==="lead" && (<>
                  <Field label="Title" value={addData.title||""} onChange={v=>setAddData(d=>({...d,title:v}))} placeholder="e.g. Tyre Handler opportunity" />
                  <Field label="Estimated value (R)" type="number" value={addData.estimated_value||""} onChange={v=>setAddData(d=>({...d,estimated_value:v}))} placeholder="0" />
                  <Field label="Notes" value={addData.notes||""} onChange={v=>setAddData(d=>({...d,notes:v}))} multiline placeholder="Details..." />
                  <button onClick={()=>{
                    if (!addData.title?.trim()) return;
                    const item = withTeamId({id:genId(),user_id:userId,title:addData.title,client_name:client.company,client_id:clientId||null,estimated_value:parseFloat(addData.estimated_value)||0,notes:addData.notes||"",stage:"New",captured_by:userEmail?.split("@")[0]||"",sync_status:"pending",created_at:new Date().toISOString()},teamId);
                    setData(d=>({...d,leads:[item,...(d.leads||[])],syncQueue:[{id:genId(),table:"leads",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                    offlineSave("leads",item).catch(()=>{});
                    setToast("Lead added ✓"); setAddForm(null);
                  }} className="w-full py-4 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{background:BRAND.primary}}>Save Lead</button>
                </>)}

                {addForm==="quote" && (<>
                  <Field label="Description" value={addData.description||""} onChange={v=>setAddData(d=>({...d,description:v}))} multiline placeholder="What are you quoting?" />
                  <Field label="Value (R)" type="number" value={addData.value||""} onChange={v=>setAddData(d=>({...d,value:v}))} placeholder="0.00" />
                  <button onClick={()=>{
                    if (!addData.description?.trim()) return;
                    const item = withTeamId({id:genId(),user_id:userId,client_name:client.company,client_id:clientId||null,description:addData.description,value:parseFloat(addData.value)||0,status:"Pending",sent_date:todayISO(),sync_status:"pending",created_at:new Date().toISOString()},teamId);
                    setData(d=>({...d,quotes:[item,...(d.quotes||[])],syncQueue:[{id:genId(),table:"quotes",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                    offlineSave("quotes",item).catch(()=>{});
                    setToast("Quote created ✓"); setAddForm(null);
                  }} className="w-full py-4 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{background:BRAND.primary}}>Save Quote</button>
                </>)}

                {addForm==="equipment" && (<>
                  <Field label="Name / Description" value={addData.name||""} onChange={v=>setAddData(d=>({...d,name:v}))} placeholder="e.g. Tyre Handler TH-500" />
                  <Field label="Type" value={addData.type||""} onChange={v=>setAddData(d=>({...d,type:v}))} placeholder="e.g. Tyre Handler" />
                  <Field label="Serial number" value={addData.serial||""} onChange={v=>setAddData(d=>({...d,serial:v}))} placeholder="Serial / asset no." />
                  <Field label="Service due (optional)" type="date" value={addData.service_due||""} onChange={v=>setAddData(d=>({...d,service_due:v}))} />
                  <button onClick={()=>{
                    if (!addData.name?.trim()) return;
                    const item = withTeamId({id:genId(),user_id:userId,name:addData.name,type:addData.type||"",serial:addData.serial||"",client:client.company,client_id:clientId||null,location:client.branch||client.company,service_due:addData.service_due||null,notes:"",media:[],sync_status:"pending",created_at:new Date().toISOString()},teamId);
                    setData(d=>({...d,equipment:[item,...(d.equipment||[])],syncQueue:[{id:genId(),table:"equipment",action:"insert",data:item,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                    offlineSave("equipment",item).catch(()=>{});
                    setToast("Equipment added ✓"); setAddForm(null);
                  }} className="w-full py-4 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{background:BRAND.primary}}>Save Equipment</button>
                </>)}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Inline detail sheet — tapping any tab item opens this instead of navigating away ── */}
      <AnimatePresence>
        {detailItem && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={()=>setDetailItem(null)} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"/>
            <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
              transition={{type:"spring",damping:28,stiffness:300}}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white"
              style={{maxHeight:"82vh"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
              <div className="overflow-y-auto px-5 pb-8 space-y-4" style={{maxHeight:"calc(82vh - 24px)"}}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 pt-1">
                  <p className="text-lg font-black text-slate-900 flex-1 leading-snug">
                    {detailItem.type==="note"      && (detailItem.data.note||"").slice(0,80)}
                    {detailItem.type==="followup"  && detailItem.data.title}
                    {detailItem.type==="quote"     && (detailItem.data.description||"Quote")}
                    {detailItem.type==="equipment" && detailItem.data.name}
                    {detailItem.type==="lead"      && (detailItem.data.title||"Lead")}
                    {detailItem.type==="expense"   && (detailItem.data.vendor||"Expense")}
                  </p>
                  <button onClick={()=>setDetailItem(null)} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500 shrink-0">
                    <X size={18}/>
                  </button>
                </div>

                {/* NOTE */}
                {detailItem.type==="note" && (()=>{const n=detailItem.data;const u=NOTE_URGENCY[n.urgency]||NOTE_URGENCY.Normal;return(<>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:u.bg,color:u.text}}>{n.urgency||"Normal"}</span>
                    {n.resolved && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">✓ Resolved</span>}
                    {n.resolve_by && <span className="text-xs text-slate-500">Due: {smartDate(n.resolve_by)}</span>}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{n.note||""}</p></div>
                  {n.media && n.media.filter(m=>m.url).length>0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {n.media.filter(m=>m.url).map((m,i)=>(
                        <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-slate-100">
                          <img src={m.url} alt="" className="w-full h-full object-cover"/>
                        </a>
                      ))}
                    </div>
                  )}
                </>);})()}

                {/* FOLLOW-UP */}
                {detailItem.type==="followup" && (()=>{const f=detailItem.data;return(<>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${f.completed?"bg-green-100 text-green-700":f.date<today?"bg-red-100 text-red-700":"bg-blue-50 text-blue-700"}`}>
                      {f.completed?"✓ Completed":f.date<today?"Overdue":smartDate(f.date)}
                    </span>
                    {f.time && <span className="text-xs text-slate-400">{f.time}</span>}
                  </div>
                  {f.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{f.notes}</p></div>}
                  {f.reminder && f.reminder!=="none" && <p className="text-sm text-slate-500">Reminder: {f.reminder.replace(/_/g," ")}</p>}
                </>);})()}

                {/* QUOTE */}
                {detailItem.type==="quote" && (()=>{const q=detailItem.data;return(<>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-black" style={{color:BRAND.primary}}>{formatCurrency(q.value)}</p>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{q.status}</span>
                  </div>
                  {q.sent_date && <p className="text-sm text-slate-500">Sent: {smartDate(q.sent_date)}</p>}
                  {q.description && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800">{q.description}</p></div>}
                </>);})()}

                {/* EQUIPMENT */}
                {detailItem.type==="equipment" && (()=>{const e=detailItem.data;return(<>
                  <div className="rounded-xl bg-slate-50 p-4 space-y-1.5">
                    {e.type     && <p className="text-sm text-slate-700"><span className="font-bold">Type:</span> {e.type}</p>}
                    {e.make     && <p className="text-sm text-slate-700"><span className="font-bold">Make:</span> {e.make}</p>}
                    {e.model    && <p className="text-sm text-slate-700"><span className="font-bold">Model:</span> {e.model}</p>}
                    {e.serial   && <p className="text-sm text-slate-700"><span className="font-bold">Serial:</span> {e.serial}</p>}
                    {e.location && <p className="text-sm text-slate-700"><span className="font-bold">Location:</span> {e.location}</p>}
                    {e.service_due && <p className="text-sm font-bold" style={{color:daysDiff(e.service_due)<0?"#DC2626":"#166534"}}>Service due: {smartDate(e.service_due)}</p>}
                  </div>
                  {e.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800">{e.notes}</p></div>}
                  {e.media && e.media.filter(m=>m.url).length>0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {e.media.filter(m=>m.url).map((m,i)=>(
                        <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-slate-100">
                          <img src={m.url} alt="" className="w-full h-full object-cover"/>
                        </a>
                      ))}
                    </div>
                  )}
                </>);})()}

                {/* LEAD */}
                {detailItem.type==="lead" && (()=>{const l=detailItem.data;return(<>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:"#EDE9FE",color:"#5B21B6"}}>{l.stage||"New"}</span>
                    {l.estimated_value && <p className="text-sm font-black" style={{color:BRAND.primary}}>{formatCurrency(l.estimated_value)}</p>}
                  </div>
                  {l.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800 whitespace-pre-wrap">{l.notes}</p></div>}
                  {l.follow_up_date && <p className="text-sm text-slate-500">Follow up: {smartDate(l.follow_up_date)}</p>}
                </>);})()}

                {/* EXPENSE */}
                {detailItem.type==="expense" && (()=>{const e=detailItem.data;return(<>
                  <div className="rounded-xl bg-slate-50 p-4 space-y-1.5">
                    <p className="text-2xl font-black" style={{color:BRAND.primary}}>{formatCurrency(e.amount_zar||e.amount)}</p>
                    {e.currency!=="ZAR" && <p className="text-xs text-slate-400">{e.currency} {e.amount} @ {e.exchange_rate}</p>}
                    {e.category && <p className="text-sm text-slate-700"><span className="font-bold">Category:</span> {e.category}</p>}
                    {e.payment_method && <p className="text-sm text-slate-700"><span className="font-bold">Payment:</span> {e.payment_method}</p>}
                    {e.expense_date && <p className="text-sm text-slate-700"><span className="font-bold">Date:</span> {smartDate(e.expense_date)}</p>}
                  </div>
                  {e.notes && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-800">{e.notes}</p></div>}
                  {e.receipt_url && (
                    <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-blue-50 text-blue-700">
                      View Receipt →
                    </a>
                  )}
                </>);})()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
