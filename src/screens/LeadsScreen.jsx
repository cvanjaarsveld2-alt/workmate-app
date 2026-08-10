// ─── Leads Screen ─────────────────────────────────────────────────────────────
// A Lead = a specific sales opportunity at a client (new or existing).
// - Captured on-site, linked to existing client + contact
// - Assigned to a team member to follow up
// - Moves through: New > Assigned > In Progress > Quoted > Won | Lost
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, ChevronRight,
  Users, TrendingUp, ArrowRight, UserCheck, Send,
} from "lucide-react";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { sendAssignmentNotification } from "../lib/teamNotifications";
import { ShareSheet } from "../components/ShareSheet";
import {
  Card, Btn, Field, SearchBar, FilterPills, CollapsibleFilters,
  Toast, Empty, PageHeader, useConfirm, ClientSelector,
} from "../components/ui";
import { MemberSelector } from "../components/MemberSelector";
import { DetailSheet, DetailRow } from "../components/DetailSheet";

// ─── Lead stages ─────────────────────────────────────────────────────────────
const LEAD_STAGES = ["New", "Assigned", "In Progress", "Quoted", "Won", "Lost"];

const STAGE_STYLE = {
  "New":         { bg: "#FEF3C7", color: "#92400E", dot: "#D97706" },
  "Assigned":    { bg: "#DBEAFE", color: "#1E40AF", dot: "#3B82F6" },
  "In Progress": { bg: "#EDE9FE", color: "#5B21B6", dot: "#8B5CF6" },
  "Quoted":      { bg: "#CFFAFE", color: "#0E7490", dot: "#06B6D4" },
  "Won":         { bg: "#DCFCE7", color: "#166534", dot: "#22C55E" },
  "Lost":        { bg: "#F1F5F9", color: "#64748B", dot: "#94A3B8" },
};

// ─── Product categories (matches ClientsScreen) ───────────────────────────────
const LEAD_CATEGORIES = [
  { id: "jacks",     label: "Jacks",              color: "#1E40AF", bg: "#DBEAFE" },
  { id: "tyres",     label: "Tyre Handlers",       color: "#166534", bg: "#DCFCE7" },
  { id: "starters",  label: "Starters",            color: "#92400E", bg: "#FEF3C7" },
  { id: "ausco",     label: "Ausco Brakes",        color: "#7C2D12", bg: "#FFE4D9" },
  { id: "manifolds", label: "Axiom — Manifolds",   color: "#5B21B6", bg: "#EDE9FE" },
  { id: "motors",    label: "Axiom — Motors",      color: "#0E7490", bg: "#CFFAFE" },
  { id: "pumps",     label: "Axiom — Pumps",       color: "#065F46", bg: "#D1FAE5" },
  { id: "coolers",   label: "Axiom — Coolers",     color: "#9F1239", bg: "#FFE4E6" },
  { id: "other",     label: "Other",               color: "#64748B", bg: "#F1F5F9" },
];

function parseCats(str) { return (str || "").split(",").map(s => s.trim()).filter(Boolean); }
function encodeCats(arr) { return arr.join(","); }

function catLabel(id) { return LEAD_CATEGORIES.find(c => c.id === id)?.label || id; }

// ─── Stage pill ───────────────────────────────────────────────────────────────
function StagePill({ stage }) {
  const s = STAGE_STYLE[stage] || STAGE_STYLE["New"];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {stage}
    </span>
  );
}

// ─── Category badge ───────────────────────────────────────────────────────────
function CatBadge({ catId }) {
  const cat = LEAD_CATEGORIES.find(c => c.id === catId);
  if (!cat) return null;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: cat.bg, color: cat.color }}>
      {cat.label}
    </span>
  );
}

// ─── Money formatter ──────────────────────────────────────────────────────────
function money(n) {
  if (!n) return "";
  return "R " + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Blank form ───────────────────────────────────────────────────────────────
function blankForm(userId, userEmail) {
  return {
    title: "",
    description: "",
    categories: [],
    client_id: null,
    client_name: "",
    contact_id: null,
    contact_name: "",
    captured_by: userEmail || "",
    assigned_to: "",
    assigned_to_user_id: null,
    stage: "New",
    estimated_value: "",
    lead_date: todayISO(),
    follow_up_date: "",
    notes: "",
    outcome_notes: "",
  };
}

// ─── Lead form ────────────────────────────────────────────────────────────────
function LeadForm({ initial, clients, contacts, teamMembers, currentUserId, onSave, onCancel, isEdit }) {
  const [form, setForm] = useState({ ...initial });
  const f = key => v => setForm(s => ({ ...s, [key]: v }));

  const clientContacts = useMemo(() => {
    if (!form.client_id) return contacts;
    const cl = clients.find(c => c.id === form.client_id);
    if (!cl) return contacts;
    return contacts.filter(c => c.client_id === form.client_id || c.company === cl.company);
  }, [contacts, form.client_id, clients]);

  function handleClientChange(clientId) {
    const cl = clients.find(c => c.id === clientId);
    setForm(s => ({
      ...s,
      client_id: clientId,
      client_name: cl ? (cl.company + (cl.branch ? ` \u2014 ${cl.branch}` : "")) : "",
      contact_id: null,
      contact_name: "",
    }));
  }

  function handleContactChange(e) {
    const contactId = e.target.value || null;
    const contact = contacts.find(c => c.id === contactId);
    setForm(s => ({ ...s, contact_id: contactId, contact_name: contact ? contact.name : "" }));
  }

  function toggleCat(id) {
    setForm(s => ({
      ...s,
      categories: s.categories.includes(id)
        ? s.categories.filter(c => c !== id)
        : [...s.categories, id],
    }));
  }

  function handleAssign(userId, email) {
    setForm(s => ({
      ...s,
      assigned_to_user_id: userId,
      assigned_to: userId ? (email?.split("@")[0] || email || "") : "",
    }));
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Opportunity" : "New Opportunity"}</p>
        {!isEdit && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
            <p className="text-xs text-amber-700 leading-snug">
              <span className="font-black">For existing clients only.</span> Use this when a current client wants something new — e.g. Glencore already buys jacks but now wants Ausco brakes. For brand new clients, use the <span className="font-bold">Clients</span> screen.
            </p>
          </div>
        )}
        <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 min-w-[36px] min-h-[36px] flex items-center justify-center">
          <X size={16} />
        </button>
      </div>

      <Field label="Lead title" value={form.title} onChange={f("title")}
        placeholder="e.g. Glencore Eland — tyre handler inquiry" required />

      <ClientSelector label="Client" value={form.client_id} onChange={handleClientChange} clients={clients} />

      <div>
        <label className="mb-2 block text-sm font-bold text-slate-500">Contact person</label>
        <select value={form.contact_id || ""} onChange={handleContactChange}
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-red-300 min-h-[56px]">
          <option value="">— No contact</option>
          {clientContacts.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
          ))}
        </select>
      </div>

      {/* Categories */}
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-500">
          Product / service <span className="text-slate-400 font-normal">(select all that apply)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {LEAD_CATEGORIES.map(cat => {
            const sel = form.categories.includes(cat.id);
            return (
              <button key={cat.id} type="button" onClick={() => toggleCat(cat.id)}
                className="rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-all min-h-[36px]"
                style={sel
                  ? { background: cat.bg, color: cat.color, borderColor: cat.color }
                  : { background: "white", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage */}
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-500">Stage</label>
        <div className="flex flex-wrap gap-2">
          {LEAD_STAGES.map(stage => {
            const s = STAGE_STYLE[stage];
            const sel = form.stage === stage;
            return (
              <button key={stage} type="button" onClick={() => setForm(f => ({ ...f, stage }))}
                className="rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-all min-h-[36px]"
                style={sel
                  ? { background: s.bg, color: s.color, borderColor: s.dot }
                  : { background: "white", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                {stage}
              </button>
            );
          })}
        </div>
      </div>

      {/* Captured by */}
      <Field label="Captured by" value={form.captured_by} onChange={f("captured_by")}
        placeholder="Who found this?" />

      {/* Assigned to — MemberSelector if team exists, otherwise text field */}
      {teamMembers.length > 0 ? (
        <MemberSelector
          label="Assign to"
          value={form.assigned_to_user_id}
          onChange={handleAssign}
          members={teamMembers}
          currentUserId={currentUserId}
        />
      ) : (
        <Field label="Assigned to" value={form.assigned_to} onChange={f("assigned_to")}
          placeholder="Who follows up?" />
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lead date" type="date" value={form.lead_date} onChange={f("lead_date")} />
        <Field label="Follow-up date" type="date" value={form.follow_up_date} onChange={f("follow_up_date")} />
      </div>

      {/* Value */}
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-500">
          Estimated value <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-slate-400 shrink-0">R</span>
          <input type="text" inputMode="numeric" value={form.estimated_value}
            onChange={e => setForm(s => ({ ...s, estimated_value: e.target.value.replace(/[^0-9]/g, "") }))}
            placeholder="0"
            className="flex-1 rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-red-300 min-h-[56px]" />
        </div>
      </div>

      <Field label="Notes" value={form.notes} onChange={f("notes")}
        placeholder="Context, details, what was discussed…" multiline />

      {(form.stage === "Won" || form.stage === "Lost") && (
        <Field label={form.stage === "Won" ? "Win notes" : "Loss reason"}
          value={form.outcome_notes} onChange={f("outcome_notes")}
          placeholder={form.stage === "Won" ? "What closed it?" : "Why was this lost?"}
          multiline />
      )}

      <div className="flex gap-2">
        <Btn className="flex-1" onClick={() => onSave(form)} disabled={!form.title.trim()}>
          <Save size={15} /> {isEdit ? "Update" : "Save Opportunity"}
        </Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function LeadsScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], quickAddTrigger, searchSeed }) {
  const [showForm, setShowForm]       = useState(false);
  const [editLead, setEditLead]       = useState(null);
  const [detailLead, setDetailLead]   = useState(null);
  const [search, setSearch]           = useState("");
  const [filterStage, setFilterStage] = useState("All");
  const [filterCat, setFilterCat]     = useState("All");
  const [toast, setToast]             = useState("");
  const [shareSheet, setShareSheet]   = useState(null); // { id, title, type }
  const [reassigning, setReassigning] = useState(false);
  const { confirm, dialog }           = useConfirm();

  const leads    = data.leads    || [];
  const clients  = (data.clients  || []).filter(c => c.user_id === userId);
  const contacts = (data.contacts || []).filter(c => c.user_id === userId);

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Leads") return;
    setEditLead(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  function saveLead(form) {
    const now = new Date().toISOString();
    const id  = editLead?.id || genId();
    const prevAssignee = editLead?.assigned_to_user_id;
    const row = {
      id,
      user_id: userId,
      team_id: teamId || null,
      ...form,
      categories: encodeCats(form.categories || []),
      sync_status: "pending",
      created_at: editLead?.created_at || now,
      updated_at: now,
    };

    setData(d => ({
      ...d,
      leads: editLead
        ? (d.leads || []).map(l => l.id === id ? row : l)
        : [row, ...(d.leads || [])],
      syncQueue: [{
        id: genId(), table: "leads",
        action: editLead ? "update" : "insert",
        data: row, status: "pending", created_at: now,
      }, ...(d.syncQueue || [])],
    }));
    offlineSave("leads", row);
    triggerImmediateSync();

    // Fire notification if assigned to someone new
    const newAssignee = form.assigned_to_user_id;
    if (newAssignee && newAssignee !== prevAssignee && newAssignee !== userId) {
      sendAssignmentNotification({
        fromUserId: userId,
        toUserId: newAssignee,
        teamId,
        recordType: "lead",
        recordId: id,
        recordTitle: form.title,
        fromEmail: userEmail,
      });
    }

    setToast(editLead ? "Opportunity updated" : "Opportunity captured");
    setShowForm(false);
    setEditLead(null);
    setDetailLead(null);
  }

  async function reassignLead(lead, newUserId, newUserEmail) {
    if (!newUserId) return;
    setReassigning(true);
    const now = new Date().toISOString();
    const assignedName = newUserEmail?.split("@")[0] || newUserEmail || "";
    const updated = {
      ...lead,
      assigned_to_user_id: newUserId,
      assigned_to: assignedName,
      sync_status: "pending",
      updated_at: now,
    };
    setData(d => ({
      ...d,
      leads: (d.leads || []).map(l => l.id === lead.id ? updated : l),
      syncQueue: [{ id: genId(), table: "leads", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
    }));
    offlineSave("leads", updated);
    triggerImmediateSync();
    setDetailLead(updated);

    if (newUserId !== userId) {
      await sendAssignmentNotification({
        fromUserId: userId,
        toUserId: newUserId,
        teamId,
        recordType: "lead",
        recordId: lead.id,
        recordTitle: lead.title,
        fromEmail: userEmail,
      });
    }
    setToast(`Opportunity assigned to ${assignedName}`);
    setReassigning(false);
  }

  async function deleteLead(id) {
    const ok = await confirm("Delete this lead?", { confirmLabel: "Delete" });
    if (!ok) return;
    await deleteRecord("leads", id, userId, setData);
    setDetailLead(null);
    setToast("Opportunity deleted");
  }

  function advanceStage(lead) {
    const idx = LEAD_STAGES.indexOf(lead.stage || "New");
    if (idx >= LEAD_STAGES.length - 1) return;
    const newStage = LEAD_STAGES[idx + 1];
    const now = new Date().toISOString();
    const updated = { ...lead, stage: newStage, sync_status: "pending", updated_at: now };
    setData(d => ({
      ...d,
      leads: (d.leads || []).map(l => l.id === lead.id ? updated : l),
      syncQueue: [{ id: genId(), table: "leads", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
    }));
    offlineSave("leads", updated);
    triggerImmediateSync();
    setToast(`Moved to ${newStage}`);
    if (detailLead?.id === lead.id) setDetailLead(updated);
  }

  const filtered = useMemo(() => {
    return leads
      .filter(l => filterStage === "All" || l.stage === filterStage)
      .filter(l => filterCat === "All" || parseCats(l.categories).includes(filterCat))
      .filter(l => !search || [l.title, l.client_name, l.assigned_to, l.captured_by, l.notes]
        .some(x => x?.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => {
        const order = { "New": 0, "Assigned": 1, "In Progress": 2, "Quoted": 3, "Won": 10, "Lost": 11 };
        const sa = order[a.stage] ?? 5;
        const sb = order[b.stage] ?? 5;
        if (sa !== sb) return sa - sb;
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
  }, [leads, filterStage, filterCat, search]);

  const activeLeads = leads.filter(l => !["Won", "Lost"].includes(l.stage)).length;
  const wonLeads    = leads.filter(l => l.stage === "Won").length;
  const wonValue    = leads.filter(l => l.stage === "Won")
    .reduce((s, l) => s + parseFloat(l.estimated_value || 0), 0);

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* Share sheet */}
      <ShareSheet
        open={!!shareSheet}
        onClose={() => setShareSheet(null)}
        record={shareSheet}
        members={teamMembers}
        currentUserId={userId}
        userEmail={userEmail}
        teamId={teamId}
        onAssign={(uid, email) => {
          if (shareSheet) reassignLead(
            leads.find(l => l.id === shareSheet.id),
            uid, email
          );
          setShareSheet(null);
        }}
      />

      {/* ── Detail sheet ── */}
      <DetailSheet
        open={!!detailLead}
        onClose={() => setDetailLead(null)}
        title={detailLead?.title || ""}
        subtitle={[detailLead?.client_name, detailLead?.stage].filter(Boolean).join(" · ")}
        primaryActions={detailLead && (
          <div className="space-y-2">
            {!["Won", "Lost"].includes(detailLead.stage) && (
              <button onClick={() => advanceStage(detailLead)}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                style={{ background: "#8B1A1A" }}>
                <ArrowRight size={15} />
                Move to {LEAD_STAGES[LEAD_STAGES.indexOf(detailLead.stage) + 1]}
              </button>
            )}

            {/* Reassign to team member */}
            {teamMembers.length > 0 && (
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5">Assign to</p>
                <MemberSelector
                  value={detailLead.assigned_to_user_id}
                  onChange={(uid, email) => reassignLead(detailLead, uid, email)}
                  members={teamMembers}
                  currentUserId={userId}
                  placeholder="Assign to a team member"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setEditLead(detailLead); setDetailLead(null); setShowForm(true); }}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 text-slate-700 min-h-[48px]">
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={() => deleteLead(detailLead.id)}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-red-100 text-red-600 min-h-[48px]">
                <Trash2 size={14} /> Delete
              </button>
            </div>
            {/* Share button — only when team exists */}
            {teamMembers.length > 0 && (
              <button
                onClick={() => {
                  setShareSheet({ id: detailLead.id, title: detailLead.title, type: "lead" });
                  setDetailLead(null);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold border-2 min-h-[52px]"
                style={{ borderColor: "#8B1A1A", color: "#8B1A1A", background: "#FFF5F5" }}>
                <Send size={15} /> Share with teammate
              </button>
            )}
          </div>
        )}
      >
        {detailLead && (() => {
          const cats = parseCats(detailLead.categories);
          return (
            <div className="space-y-3">
              <StagePill stage={detailLead.stage} />

              {cats.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cats.map(id => <CatBadge key={id} catId={id} />)}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {detailLead.client_name && <DetailRow label="Client" value={detailLead.client_name} />}
                {detailLead.contact_name && <DetailRow label="Contact" value={detailLead.contact_name} />}
                {detailLead.captured_by && <DetailRow label="Captured by" value={detailLead.captured_by} />}
                {detailLead.assigned_to && <DetailRow label="Assigned to" value={detailLead.assigned_to} />}
                {detailLead.lead_date && <DetailRow label="Lead date" value={smartDate(detailLead.lead_date)} />}
                {detailLead.follow_up_date && <DetailRow label="Follow-up" value={smartDate(detailLead.follow_up_date)} />}
                {detailLead.estimated_value > 0 && (
                  <DetailRow label="Est. value" value={money(detailLead.estimated_value)} />
                )}
              </div>

              {detailLead.description && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-slate-700 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 leading-snug whitespace-pre-wrap">
                    {detailLead.description}
                  </p>
                </div>
              )}

              {detailLead.notes && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-slate-700 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 leading-snug whitespace-pre-wrap">
                    {detailLead.notes}
                  </p>
                </div>
              )}

              {detailLead.outcome_notes && (
                <div className="rounded-xl p-3 border"
                  style={detailLead.stage === "Won"
                    ? { background: "#F0FDF4", borderColor: "#BBF7D0" }
                    : { background: "#F8FAFC", borderColor: "#E2E8F0" }}>
                  <p className="text-xs font-black uppercase tracking-wider mb-1"
                    style={{ color: detailLead.stage === "Won" ? "#166534" : "#64748B" }}>
                    {detailLead.stage === "Won" ? "Win notes" : "Loss reason"}
                  </p>
                  <p className="text-sm leading-snug" style={{ color: detailLead.stage === "Won" ? "#15803D" : "#64748B" }}>
                    {detailLead.outcome_notes}
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </DetailSheet>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          title="Opportunities"
          subtitle={`${activeLeads} active · ${wonLeads} won${wonValue > 0 ? " · " + money(wonValue) : ""} · cross-sell at existing clients`}
        />
        <Btn size="sm" onClick={() => { setEditLead(null); setShowForm(s => !s); }}>
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? "Cancel" : "Add Opportunity"}
        </Btn>
      </div>

      {/* ── Form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <LeadForm
              initial={editLead
                ? { ...editLead, categories: parseCats(editLead.categories) }
                : blankForm(userId, userEmail)}
              clients={clients}
              contacts={contacts}
              teamMembers={teamMembers}
              currentUserId={userId}
              onSave={saveLead}
              onCancel={() => { setShowForm(false); setEditLead(null); }}
              isEdit={!!editLead}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stage summary strip ── */}
      {leads.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {LEAD_STAGES.filter(s => s !== "Lost").map(stage => {
            const count = leads.filter(l => l.stage === stage).length;
            const s = STAGE_STYLE[stage];
            return (
              <button key={stage}
                onClick={() => setFilterStage(fs => fs === stage ? "All" : stage)}
                className="shrink-0 flex flex-col items-center rounded-2xl px-3 py-2 border-2 transition-all min-w-[64px]"
                style={filterStage === stage
                  ? { background: s.bg, borderColor: s.dot }
                  : { background: "white", borderColor: "#E2E8F0" }}>
                <span className="text-lg font-black leading-none"
                  style={{ color: filterStage === stage ? s.color : "#1E293B" }}>
                  {count}
                </span>
                <span className="text-[10px] font-bold leading-tight mt-0.5"
                  style={{ color: filterStage === stage ? s.color : "#94A3B8" }}>
                  {stage}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <SearchBar value={search} onChange={setSearch} placeholder="Search leads, clients, assigned to…" />

      {/* Category filter */}
      <div className="flex items-center justify-end">
        <CollapsibleFilters
          groups={[
            {
              label: "Division",
              options: ["All", ...LEAD_CATEGORIES.map(c => c.label)],
              value: filterCat === "All" ? "All" : (LEAD_CATEGORIES.find(c => c.id === filterCat)?.label || "All"),
              onChange: v => setFilterCat(v === "All" ? "All" : (LEAD_CATEGORIES.find(c => c.label === v)?.id || "All")),
            },
          ]}
        />
      </div>

      {/* ── Lead list ── */}
      {filtered.length === 0 ? (
        <Empty
          title={leads.length === 0 ? "No opportunities yet" : "No opportunities match your filters"}
          text={leads.length === 0
            ? "Use this screen for new opportunities at existing clients — e.g. Glencore already buys jacks but now wants Ausco brakes. For brand new clients, use the Clients screen."
            : "Try clearing the filters above."}
          icon={TrendingUp}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(lead => {
            const cats = parseCats(lead.categories);
            const isOverdue = lead.follow_up_date && lead.follow_up_date < todayISO()
              && !["Won", "Lost"].includes(lead.stage);
            return (
              <Card key={lead.id}
                className="overflow-hidden cursor-pointer active:scale-[0.985] transition-transform"
                onClick={() => setDetailLead(lead)}>
                <div className="flex">
                  {/* Stage colour bar */}
                  <div className="w-1 shrink-0 rounded-l-2xl"
                    style={{ background: STAGE_STYLE[lead.stage]?.dot || "#E2E8F0" }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Title + stage */}
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className="text-sm font-black text-slate-900 leading-tight flex-1 min-w-0">{lead.title}</p>
                          <StagePill stage={lead.stage || "New"} />
                        </div>

                        {/* Client */}
                        {lead.client_name && (
                          <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1">
                            <Users size={11} /> {lead.client_name}
                          </p>
                        )}

                        {/* Category badges */}
                        {cats.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {cats.slice(0, 3).map(id => <CatBadge key={id} catId={id} />)}
                            {cats.length > 3 && (
                              <span className="text-[10px] font-bold text-slate-400">+{cats.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {lead.assigned_to && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <UserCheck size={10} /> {lead.assigned_to}
                            </span>
                          )}
                          {lead.follow_up_date && (
                            <span className="flex items-center gap-1 text-xs font-bold"
                              style={{ color: isOverdue ? "#DC2626" : "#64748B" }}>
                              {isOverdue ? "⚠ Overdue" : smartDate(lead.follow_up_date)}
                            </span>
                          )}
                          {lead.estimated_value > 0 && (
                            <span className="text-xs font-bold text-green-600">{money(lead.estimated_value)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 shrink-0 mt-0.5" />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
