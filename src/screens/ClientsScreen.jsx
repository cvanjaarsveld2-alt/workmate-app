// ─── Clients Screen ───────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, Check,
  ChevronDown, ChevronUp, Phone, Clipboard, Send, Share2, FolderPlus, Tag,
} from "lucide-react";
import { useBulkGroup, BulkGroupBar, BulkGroupSheet, useCollapsibleGroups, RenameGroupSheet } from "../components/BulkGroup";
import { MemberSelector } from "../components/MemberSelector";
import { ShareSheet } from "../components/ShareSheet";
import { sendAssignmentNotification } from "../lib/teamNotifications";
import { BRAND, PIPELINE_STAGES, REMINDER_OPTIONS, NOTE_URGENCY, STAGE_COLORS } from "../lib/constants";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { WhatsAppButton } from "../components/WhatsAppButton";
import { EmailButton } from "../components/EmailButton";
import { triggerImmediateSync } from "../lib/sync";
import { SendCompanyInfoSheet } from "../components/SendCompanyInfo";
import {
  Card, Btn, Field, GroupField, SelectField, SearchBar,
  FilterPills, CollapsibleFilters, Toast, Empty, StagePill, PageHeader, useConfirm,
} from "../components/ui";

const STAGE_PRIORITY = { Active: 0, Quoted: 1, Contacted: 2, "New Lead": 3, Won: 4, Lost: 5 };

// ─── Expandable text (used for long client notes) ─────────────────────────────
function ExpandableText({ text, limit = 100, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > limit;
  const display = isLong && !expanded ? text.slice(0, limit).trimEnd() + "…" : text;
  return (
    <div className={className}>
      <p className="text-xs text-slate-500 break-words whitespace-pre-wrap">{display}</p>
      {isLong && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="mt-1 inline-block text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          {expanded ? "▲ Show less" : "▼ Show more"}
        </button>
      )}
    </div>
  );
}

// ─── Inline follow-up form (inside client card) ───────────────────────────────
function InlineFollowupForm({ client, userId, teamId, setData, onDone }) {
  const [form, setForm] = useState({
    title: "", date: todayISO(), time: "09:00", reminder: "morning", notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const item = withTeamId({
      id: genId(), user_id: userId,
      client_id: client.id,
      client: client.company,
      branch: client.branch || "",
      ...form,
      completed: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    }, teamId);
    setData(d => ({
      ...d,
      followups: [item, ...(d.followups || [])],
      syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("followups", item);
    triggerImmediateSync();
    setSaving(false);
    onDone();
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      className="bg-slate-50 rounded-xl p-3 space-y-2.5 mb-3">
      <Field label="What to follow up on" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))}
        placeholder={`e.g. Call ${client.contact || client.company} re quote`} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
        <Field label="Time" type="time" value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-bold text-slate-500">Reminder</label>
        <select value={form.reminder} onChange={e => setForm(f => ({ ...f, reminder: e.target.value }))}
          className="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm outline-none focus:border-red-300 min-h-[48px]">
          {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <Field label="Notes (optional)" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Any extra context…" multiline />
      <div className="flex gap-2">
        <Btn className="flex-1" size="sm" onClick={save} disabled={saving || !form.title.trim()}>
          <Check size={14} />{saving ? "Saving…" : "Save Follow-up"}
        </Btn>
        <Btn variant="secondary" size="sm" onClick={onDone}>Cancel</Btn>
      </div>
    </motion.div>
  );
}

// ─── Inline NOTE form (inside client card) — NEW ──────────────────────────────
function InlineNoteForm({ client, userId, teamId, setData, onDone }) {
  const [form, setForm] = useState({ note: "", urgency: "Normal", resolve_by: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.note.trim()) return;
    setSaving(true);
    const clientLabel = client.company + (client.branch ? ` — ${client.branch}` : "");
    const item = withTeamId({
      id: genId(),
      user_id: userId,
      client_id: client.id,
      client: clientLabel,
      note: form.note,
      urgency: form.urgency,
      resolve_by: form.resolve_by || null,
      media: [],
      linked_contact_ids: [],
      resolved: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    }, teamId);
    setData(d => ({
      ...d,
      notes: [item, ...(d.notes || [])],
      syncQueue: [{ id: genId(), table: "notes", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("notes", item);
    triggerImmediateSync();
    setSaving(false);
    onDone();
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      className="bg-slate-50 rounded-xl p-3 space-y-2.5 mb-3">
      <Field label="Note" value={form.note} onChange={v => setForm(f => ({ ...f, note: v }))} placeholder="Visit note, issue, reminder…" multiline />
      <div>
        <label className="mb-1.5 block text-sm font-bold text-slate-500">Urgency</label>
        <div className="flex gap-2">
          {Object.keys(NOTE_URGENCY).map(u => (
            <button key={u} type="button" onClick={() => setForm(f => ({ ...f, urgency: u }))}
              className="flex-1 rounded-xl py-2.5 text-xs font-bold border-2 transition-all min-h-[44px]"
              style={form.urgency === u ? { background: NOTE_URGENCY[u].bg, color: NOTE_URGENCY[u].text, borderColor: NOTE_URGENCY[u].dot } : { background: "#F8FAFC", color: "#94A3B8", borderColor: "#E2E8F0" }}>
              {u}
            </button>
          ))}
        </div>
      </div>
      <Field label="Resolve By (optional)" type="date" value={form.resolve_by} onChange={v => setForm(f => ({ ...f, resolve_by: v }))} />
      <div className="flex gap-2">
        <Btn className="flex-1" size="sm" onClick={save} disabled={saving || !form.note.trim()}>
          <Check size={14} />{saving ? "Saving…" : "Save Note"}
        </Btn>
        <Btn variant="secondary" size="sm" onClick={onDone}>Cancel</Btn>
      </div>
    </motion.div>
  );
}

// ─── Note row inside client card — NEW ────────────────────────────────────────
function ClientNoteRow({ note: n, setData }) {
  const today = todayISO();
  const urg = NOTE_URGENCY[n.urgency || "Normal"] || NOTE_URGENCY.Normal;
  const isOverdue = !n.resolved && n.resolve_by && n.resolve_by < today;
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 100;
  const isLong = n.note && n.note.length > LIMIT;
  const displayText = isLong && !expanded ? n.note.slice(0, LIMIT).trimEnd() + "…" : n.note;

  async function toggleResolved() {
    const updated = {
      ...n,
      resolved: !n.resolved,
      resolved_at: !n.resolved ? new Date().toISOString() : null,
      sync_status: "pending",
    };
    setData(d => ({
      ...d,
      notes: (d.notes || []).map(x => x.id === n.id ? updated : x),
      syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("notes", updated);
    triggerImmediateSync();
  }

  return (
    <div className={`rounded-xl p-2.5 ${n.resolved ? "bg-slate-50" : "bg-white border border-slate-100"}`}
      style={!n.resolved ? { borderLeft: "3px solid " + urg.dot } : {}}>
      <div className="flex items-start gap-2.5">
        <button onClick={toggleResolved}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all mt-0.5 ${n.resolved ? "bg-green-100 text-green-600" : isOverdue ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
          <Check size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm break-words ${n.resolved ? "line-through text-slate-400" : "text-slate-700"}`}>
            {displayText}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
              className="mt-1.5 inline-block text-xs font-bold px-2 py-1 rounded-full"
              style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
              {expanded ? "▲ Show less" : "▼ Show more"}
            </button>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {!n.resolved && (
              <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: urg.bg, color: urg.text }}>
                {n.urgency || "Normal"}
              </span>
            )}
            {isOverdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">Overdue</span>}
            <span className="text-xs text-slate-400">
              {n.created_at ? new Date(n.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}
              {n.resolve_by && !n.resolved ? ` · resolve by ${smartDate(n.resolve_by)}` : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Follow-up row inside client card ─────────────────────────────────────────
function ClientFollowupRow({ followup: f, setData }) {
  const today    = todayISO();
  const isOverdue = !f.completed && f.date < today;
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 80;
  const isLong = f.title && f.title.length > LIMIT;
  const displayText = isLong && !expanded
    ? f.title.slice(0, LIMIT).trimEnd() + "…"
    : f.title;

  async function toggleDone() {
    const up = { ...f, completed: !f.completed, sync_status: "pending" };
    setData(d => ({
      ...d,
      followups: (d.followups || []).map(x => x.id === f.id ? up : x),
      syncQueue: [{ id: genId(), table: "followups", action: "update", data: up, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("followups", up);
    triggerImmediateSync();
  }

  async function deleteIt() {
    await deleteRecord("followups", f.id, f.user_id, setData);
  }

  function handleExpandToggle(e) {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(v => !v);
  }

  return (
    <div className={`rounded-xl p-2.5 ${isOverdue ? "bg-red-50" : f.completed ? "bg-slate-50" : "bg-white border border-slate-100"}`}>
      <div className="flex items-start gap-2.5">
        <button onClick={toggleDone}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all mt-0.5 ${f.completed ? "bg-green-100 text-green-600" : isOverdue ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
          <Check size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold break-words ${f.completed ? "line-through text-slate-400" : isOverdue ? "text-red-800" : "text-slate-900"}`}>
            {displayText}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={handleExpandToggle}
              className="mt-1.5 inline-block text-xs font-bold px-2 py-1 rounded-full"
              style={{background:"#FEF3C7", color:"#92400E", border:"1px solid #FCD34D"}}>
              {expanded ? "▲ Show less" : "▼ Show more"}
            </button>
          )}
          <p className="text-xs text-slate-400 mt-0.5">{smartDate(f.date)}{f.time ? ` at ${f.time}` : ""}</p>
        </div>
        {isOverdue && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">Overdue</span>}
        <button onClick={deleteIt} className="shrink-0 p-2 rounded-xl text-slate-300 hover:text-red-500 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Main ClientsScreen ───────────────────────────────────────────────────────
export function ClientsScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], quickAddTrigger, searchSeed, onNavigate, isOnline }) {
  const [showForm, setShowForm]         = useState(false);
  const [search, setSearch]             = useState("");
// ─── Lead categories ──────────────────────────────────────────────────────────
// Stored as a comma-separated string in the existing `division` column.
const LEAD_CATEGORIES = [
  { id: "opencast",  label: "Opencast",                 color: "#B45309", bg: "#FEF3C7" },
  { id: "underground", label: "Underground",            color: "#1E293B", bg: "#E2E8F0" },
  { id: "jacks",     label: "Jacks",                    color: "#1E40AF", bg: "#DBEAFE" },
  { id: "tyres",     label: "Tyre Handlers",            color: "#166534", bg: "#DCFCE7" },
  { id: "starters",  label: "Starters",                 color: "#92400E", bg: "#FEF3C7" },
  { id: "ausco",     label: "Ausco Brakes",             color: "#7C2D12", bg: "#FFE4D9" },
  { id: "manifolds", label: "Axiom — Manifolds",        color: "#5B21B6", bg: "#EDE9FE" },
  { id: "motors",    label: "Axiom — Motors",           color: "#0E7490", bg: "#CFFAFE" },
  { id: "pumps",     label: "Axiom — Pumps",            color: "#065F46", bg: "#D1FAE5" },
  { id: "coolers",   label: "Axiom — Coolers",          color: "#9F1239", bg: "#FFE4E6" },
  { id: "other",     label: "Other",                    color: "#64748B", bg: "#F1F5F9" },
];

function parseCats(str) {
  if (!str) return [];
  return str.split(",").map(s => s.trim()).filter(Boolean);
}

function encodeCats(arr) {
  return arr.join(",");
}

function CategoryBadge({ catId, size = "sm" }) {
  const cat = LEAD_CATEGORIES.find(c => c.id === catId);
  if (!cat) return null;
  return (
    <span className={`inline-flex items-center rounded-full font-bold ${size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}
      style={{ background: cat.bg, color: cat.color }}>
      {cat.label}
    </span>
  );
}
  const [editId, setEditId]             = useState(null);
  const [toast, setToast]               = useState("");
  const [sendInfo, setSendInfo]         = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [showFollowupForm, setShowFollowupForm] = useState(null);
  const [showNoteForm, setShowNoteForm] = useState(null);
  const [filterStage, setFilterStage]   = useState("All");
  const [filterCat, setFilterCat]       = useState("All");
  const [groupMode, setGroupMode]       = useState("category"); // always "category" — Group toggle removed
  const bulk = useBulkGroup();
  const [renamingGroup, setRenamingGroup] = useState(null);

  const clientGroupNames = [...new Set((data.clients || []).map(c => c.category?.trim()).filter(Boolean))].sort();

  // Assign a group to all selected clients
  function assignGroupToClients(groupName) {
    const ids = bulk.selected;
    const now = new Date().toISOString();
    const affected = (data.clients || []).filter(c => ids.has(c.id));
    setData(d => ({
      ...d,
      clients: (d.clients || []).map(c => ids.has(c.id) ? { ...c, category: groupName, sync_status: "pending" } : c),
      syncQueue: [
        ...affected.map(c => ({ id: genId(), table: "clients", action: "update", data: { ...c, category: groupName }, status: "pending", created_at: now })),
        ...(d.syncQueue || []),
      ],
    }));
    affected.forEach(c => offlineSave("clients", { ...c, category: groupName }).catch(() => {}));
    setToast(`${ids.size} client${ids.size !== 1 ? "s" : ""} added to "${groupName}"`);
    bulk.cancel();
    setGroupMode("category");
  }

  // Rename a client group: update every client in it
  function renameClientGroup(oldName, newName) {
    if (oldName === "(No group)") { setRenamingGroup(null); return; }
    const now = new Date().toISOString();
    const affected = (data.clients || []).filter(c => (c.category?.trim() || "") === oldName);
    setData(d => ({
      ...d,
      clients: (d.clients || []).map(c => (c.category?.trim() || "") === oldName ? { ...c, category: newName, sync_status: "pending" } : c),
      syncQueue: [
        ...affected.map(c => ({ id: genId(), table: "clients", action: "update", data: { ...c, category: newName }, status: "pending", created_at: now })),
        ...(d.syncQueue || []),
      ],
    }));
    affected.forEach(c => offlineSave("clients", { ...c, category: newName }).catch(() => {}));
    setToast(`Renamed to "${newName}"`);
    setRenamingGroup(null);
  }
  const [shareSheet, setShareSheet]     = useState(null);
  const [form, setForm] = useState({ company: "", branch: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "", categories: [], category: "", assigned_to_user_id: null, assigned_to: "" });
  const { confirm, dialog } = useConfirm();

  const clients   = (data.clients || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId);
  const followups = data.followups || [];
  const notes     = data.notes     || [];
  const today     = todayISO();

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Clients") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  // ── Global search handoff: carry the term into this screen's search box ──
  useEffect(() => {
    if (!searchSeed?.ts) return;
    setSearch(searchSeed.term || "");
  }, [searchSeed?.ts]);


  function resetForm() {
    setForm({ company: "", branch: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "", categories: [], category: "", assigned_to_user_id: null, assigned_to: "" });
    setEditId(null);
    setShowForm(false);
  }

  async function saveClient() {
    if (!form.company.trim()) { setToast("Company name is required"); return; }
    const { categories: _cats, ...formWithoutCats } = form;
      const formWithDivision = { ...formWithoutCats, division: encodeCats(form.categories), assigned_to_user_id: form.assigned_to_user_id || null, assigned_to: form.assigned_to || "" };
    if (editId) {
      const existing = clients.find(c => c.id === editId);
      const updated  = { ...existing, ...formWithDivision, sync_status: "pending" };
      setData(d => ({
        ...d,
        clients:   (d.clients || []).map(c => c.id === editId ? updated : c),
        syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("clients", updated);
      setToast("Client updated");
    triggerImmediateSync();
    } else {
      const item = withTeamId({ id: genId(), user_id: userId, ...formWithDivision, created_at: new Date().toISOString(), sync_status: "pending" }, teamId);
      setData(d => ({
        ...d,
        clients:   [item, ...(d.clients || [])],
        syncQueue: [{ id: genId(), table: "clients", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("clients", item);
      setToast("Client added");
    triggerImmediateSync();
    }
    resetForm();
  }

  async function deleteClient(id, companyName) {
    const linkedFUs = followups.filter(f => f.client_id === id);
    const linkedContacts = (data.contacts || []).filter(c => c.client_id === id);
    const linkedLeads = (data.leads || []).filter(l => l.client_id === id);
    const linkedNotes = (data.notes || []).filter(n => n.client_id === id);
    const linkedEquip = (data.equipment || []).filter(e => e.client_id === id);
    const linkedActs = (data.activities || []).filter(a => a.client_id === id);
    const linkedQuotes = (data.quotes || []).filter(q => q.client_id === id);
    const total = linkedFUs.length + linkedContacts.length + linkedLeads.length + linkedNotes.length + linkedEquip.length + linkedActs.length + linkedQuotes.length;
    const message = total > 0
      ? `Delete ${companyName} and all ${total} linked record${total !== 1 ? "s" : ""}? This cannot be undone.`
      : `Delete ${companyName}? This cannot be undone.`;
    const ok = await confirm(message, { confirmLabel: "Delete" });
    if (!ok) return;
    await deleteRecord("clients", id, userId, setData);
    for (const r of linkedFUs) { await deleteRecord("followups", r.id, userId, setData); }
    for (const r of linkedContacts) { await deleteRecord("contacts", r.id, userId, setData); }
    for (const r of linkedLeads) { await deleteRecord("leads", r.id, userId, setData); }
    for (const r of linkedNotes) { await deleteRecord("notes", r.id, userId, setData); }
    for (const r of linkedEquip) { await deleteRecord("equipment", r.id, userId, setData); }
    for (const r of linkedActs) { await deleteRecord("activities", r.id, userId, setData); }
    for (const r of linkedQuotes) { await deleteRecord("quotes", r.id, userId, setData); }
    setToast(`${companyName} and ${total} linked records deleted`);
  }

  // ── Edit-in-place: the edit form renders where the branch row is. ──
  function startEdit(c) {
    setForm({ company: c.company || "", branch: c.branch || "", contact: c.contact || "", phone: c.phone || "", email: c.email || "", stage: c.stage || "New Lead", notes: c.notes || "", categories: parseCats(c.division), category: c.category || "", assigned_to_user_id: c.assigned_to_user_id || null, assigned_to: c.assigned_to || "" });
    setEditId(c.id);
    setShowForm(false);
  }

  function getClientFollowups(clientId) {
    return followups.filter(f => f.client_id === clientId).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.date.localeCompare(b.date);
    });
  }

  function getClientNotes(clientId) {
    return notes.filter(n => n.client_id === clientId).sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
  }

  // ── Shared client form JSX (top for NEW, in-place for EDIT) ──
  function renderClientForm(isEdit) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Client" : "New Lead / Client"}</p>
        {!isEdit && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
            <p className="text-xs text-blue-700 leading-snug">
              <span className="font-black">New to Power Works?</span> Add them here — stage starts as "New Lead" and moves forward as you work the deal. For a new opportunity at an existing client, use the <span className="font-bold">Leads</span> screen instead.
            </p>
          </div>
        )}
        <Field label="Company Name" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="e.g. Anglo American" required />
        <Field label="Branch / Mine / Site" value={form.branch} onChange={v => setForm(f => ({ ...f, branch: v }))} placeholder="e.g. Mogalakwena Mine" />
        <Field label="Contact Person" value={form.contact} onChange={v => setForm(f => ({ ...f, contact: v }))} placeholder="Contact name" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Phone" type="tel" />
          <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="Email" type="email" />
        </div>
        <SelectField label="Pipeline Stage" value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v }))} options={PIPELINE_STAGES} />

        <GroupField label="Group (optional)" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} existing={clientGroupNames} placeholder="e.g. Kathu Expo, Priority Accounts" />

        {/* ── Product / service categories ── */}
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-500">
            Categories <span className="text-slate-400 font-normal">(what do they need?)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {LEAD_CATEGORIES.map(cat => {
              const selected = form.categories.includes(cat.id);
              return (
                <button key={cat.id} type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    categories: selected
                      ? f.categories.filter(c => c !== cat.id)
                      : [...f.categories, cat.id],
                  }))}
                  className="rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-all min-h-[36px]"
                  style={selected
                    ? { background: cat.bg, color: cat.color, borderColor: cat.color }
                    : { background: "white", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Notes about this client…" multiline />

        {/* Assign to team member */}
        {teamMembers.length > 0 && (
          <MemberSelector
            label="Assigned to"
            value={form.assigned_to_user_id}
            onChange={(uid, email) => setForm(f => ({
              ...f,
              assigned_to_user_id: uid,
              assigned_to: uid ? (email?.split("@")[0] || email || "") : "",
            }))}
            members={teamMembers}
            currentUserId={userId}
          />
        )}

        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveClient}><Save size={15} />{isEdit ? "Update" : "Add Lead"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  const filtered = clients
    .filter(c => filterStage === "All" || (c.stage || "New Lead") === filterStage)
    .filter(c => filterCat === "All" || parseCats(c.division).includes(filterCat))
    .filter(c => !search || [c.company, c.branch, c.contact].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const grouped = filtered.reduce((a, c) => {
    const k = groupMode === "category"
      ? (c.category?.trim() || "(No group)")
      : (c.company || "Unknown");
    if (!a[k]) a[k] = [];
    a[k].push(c);
    return a;
  }, {});
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "(No group)") return 1;
    if (b === "(No group)") return -1;
    return a.localeCompare(b);
  });
  const collapse = useCollapsibleGroups(groupMode === "category" ? groupKeys.filter(k => k !== "(No group)") : null, groupMode === "category");

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
          if (!shareSheet || !uid) return;
          const client = clients.find(c => c.id === shareSheet.id);
          if (!client) return;
          const now = new Date().toISOString();
          const updated = { ...client, assigned_to_user_id: uid, assigned_to: email?.split("@")[0] || email, sync_status: "pending", updated_at: now };
          setData(d => ({
            ...d,
            clients: (d.clients || []).map(c => c.id === shareSheet.id ? updated : c),
            syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
          }));
          triggerImmediateSync();
          setToast(`Client shared with ${email?.split("@")[0] || email}`);
          setShareSheet(null);
        }}
      />

      <AnimatePresence>
        {sendInfo && (
          <SendCompanyInfoSheet
            recipientName={sendInfo.name}
            recipientEmail={sendInfo.email}
            recipientPhone={sendInfo.phone}
            onClose={() => setSendInfo(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <PageHeader title="Clients & Leads" subtitle={`${clients.length} total · add new clients here`} />
        <Btn size="sm" onClick={() => { if (showForm || editId) resetForm(); else setShowForm(true); }}>
          {(showForm || editId) ? <X size={15} /> : <Plus size={15} />}{(showForm || editId) ? "Cancel" : "Add Lead"}
        </Btn>
      </div>

      {/* Top form: NEW clients only. Edits render in-place. */}
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderClientForm(false)}
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />

      {/* Compact filter + group controls on one row */}
      {!bulk.active && (
        <div className="flex items-center justify-end gap-2">
          <CollapsibleFilters
            groups={[
              {
                label: "Stage",
                options: ["All", ...PIPELINE_STAGES],
                value: filterStage,
                onChange: setFilterStage,
                dangerValue: "Lost",
              },
              {
                label: "Division",
                options: ["All", ...LEAD_CATEGORIES.map(c => c.label)],
                value: filterCat === "All" ? "All" : (LEAD_CATEGORIES.find(c => c.id === filterCat)?.label || "All"),
                onChange: v => setFilterCat(v === "All" ? "All" : (LEAD_CATEGORIES.find(c => c.label === v)?.id || "All")),
              },
            ]}
          />
          {clients.length > 0 && (
            <button onClick={bulk.enter} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600">
              <FolderPlus size={13} /> Group
            </button>
          )}
        </div>
      )}

      <BulkGroupBar
        active={bulk.active}
        count={bulk.selected.size}
        allCount={filtered.length}
        onCancel={bulk.cancel}
        onAssign={bulk.openAssign}
        onSelectAll={() => bulk.selectAll(filtered.map(c => c.id))}
        onClear={bulk.clear}
        label="clients"
      />

      {Object.keys(grouped).length === 0 && <Empty title="No clients or leads found" text="Add new leads and clients here. Use the Leads screen for new opportunities at existing clients." />}

      <div className="space-y-3">
        {(() => {
          // In category mode, group the companies under category-group headers.
          // In company mode, render the company cards directly (no wrapper).
          if (groupMode === "category") {
            // Build: groupName -> { companyName -> branches[] }
            const sections = {};
            filtered.forEach(c => {
              const g = c.category?.trim() || "(No group)";
              const co = c.company || "Unknown";
              if (!sections[g]) sections[g] = {};
              if (!sections[g][co]) sections[g][co] = [];
              sections[g][co].push(c);
            });
            const sectionKeys = Object.keys(sections).sort((a, b) => {
              if (a === "(No group)") return 1;
              if (b === "(No group)") return -1;
              return a.localeCompare(b);
            });
            return sectionKeys.map(gName => {
              const isCol = collapse.isCollapsed(gName);
              const companyCount = Object.keys(sections[gName]).length;
              return (
                <div key={`grp-${gName}`} className="space-y-2">
                  <div className="flex items-center px-1">
                    <button onClick={() => collapse.toggle(gName)}
                      className="flex-1 flex items-center justify-between py-1 active:opacity-70 transition-opacity">
                      <div className="flex items-center gap-1.5">
                        <motion.div animate={{ rotate: isCol ? -90 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronDown size={16} className="text-slate-400" />
                        </motion.div>
                        <Tag size={14} style={{ color: "#8B1A1A" }} />
                        <p className="text-sm font-black text-slate-700">{gName}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-400">{companyCount} {companyCount === 1 ? "company" : "companies"}</span>
                    </button>
                    {gName !== "(No group)" && (
                      <button onClick={() => setRenamingGroup(gName)}
                        className="pl-3 pr-1 text-slate-400 active:text-slate-700 transition-colors" aria-label="Rename group">
                        <Edit2 size={13} />
                      </button>
                    )}
                  </div>
                  {!isCol && (
                    <div className="space-y-3">
                      {Object.entries(sections[gName]).sort(([a],[b]) => a.localeCompare(b)).map(([cn, branches]) =>
                        renderCompanyCard(cn, branches))}
                    </div>
                  )}
                </div>
              );
            });
          }
          // Company mode — original behaviour
          return Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cn, branches]) =>
            renderCompanyCard(cn, branches));
        })()}
      </div>

      <BulkGroupSheet
        open={bulk.assignOpen}
        existingGroups={clientGroupNames}
        onClose={bulk.closeAssign}
        onConfirm={assignGroupToClients}
      />
      <RenameGroupSheet
        open={!!renamingGroup}
        currentName={renamingGroup}
        existingGroups={clientGroupNames}
        onClose={() => setRenamingGroup(null)}
        onConfirm={(newName) => renameClientGroup(renamingGroup, newName)}
      />
    </div>
  );

  // Renders a single company card (used by both grouping modes)
  function renderCompanyCard(cn, branches) {
          const isExpanded    = expandedClient === cn;
          const allBranchIds  = branches.map(b => b.id);
          const companyFU     = followups.filter(f => allBranchIds.includes(f.client_id));
          const companyNotes  = notes.filter(n => allBranchIds.includes(n.client_id));
          const pendingFU     = companyFU.filter(f => !f.completed);
          const overdueFU     = companyFU.filter(f => !f.completed && f.date < today);
          const openNotes     = companyNotes.filter(n => !n.resolved);

          return (
            <Card key={cn} className="overflow-hidden">
              <button className="w-full text-left px-4 pt-4 pb-3 flex items-center justify-between"
                onClick={() => setExpandedClient(isExpanded ? null : cn)}>
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-black text-slate-900 text-base break-words">{cn}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-sm text-slate-400">{branches.length} branch{branches.length !== 1 ? "es" : ""}</p>
                    {pendingFU.length > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${overdueFU.length > 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {overdueFU.length > 0 ? `⚠️ ${overdueFU.length} overdue` : `${pendingFU.length} follow-up${pendingFU.length !== 1 ? "s" : ""}`}
                      </span>
                    )}
                    {openNotes.length > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700">
                        📝 {openNotes.length} note{openNotes.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
              </button>

              <div className="divide-y divide-slate-50">
                {[...branches].sort((a, b) => {
                  const aOverdue = companyFU.some(f => f.client_id === a.id && !f.completed && f.date < today);
                  const bOverdue = companyFU.some(f => f.client_id === b.id && !f.completed && f.date < today);
                  if (aOverdue && !bOverdue) return -1;
                  if (!aOverdue && bOverdue) return 1;
                  const aPri = STAGE_PRIORITY[a.stage || "New Lead"] ?? 3;
                  const bPri = STAGE_PRIORITY[b.stage || "New Lead"] ?? 3;
                  return aPri - bPri;
                }).map(c => {
                  // ── Edit-in-place: form replaces this branch row ──
                  if (editId === c.id) {
                    return (
                      <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-3">
                        {renderClientForm(true)}
                      </motion.div>
                    );
                  }

                  const clientFU      = getClientFollowups(c.id);
                  const clientNotes   = getClientNotes(c.id);
                  const clientPending = clientFU.filter(f => !f.completed).length;
                  const clientOpenNotes = clientNotes.filter(n => !n.resolved).length;

                  const isSel = bulk.selected.has(c.id);
                  return (
                    <div key={c.id}
                      className={`px-4 py-3 ${bulk.active ? (isSel ? "bg-red-50 cursor-pointer" : "cursor-pointer active:bg-slate-50") : ""}`}
                      onClick={bulk.active ? () => bulk.toggle(c.id) : undefined}>
                      {bulk.active && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                            style={isSel ? { background: BRAND.primary, borderColor: BRAND.primary } : { borderColor: "#CBD5E1" }}>
                            {isSel && <Check size={13} className="text-white" />}
                          </span>
                          <span className="text-xs font-bold text-slate-400">{isSel ? "Selected" : "Tap to select"}</span>
                        </div>
                      )}
                      {/* Branch header + action buttons */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">{c.branch || "Main Branch"}</p>
                            <StagePill stage={c.stage || "New Lead"} />
                          </div>
                          {c.contact && <p className="text-sm text-slate-500 mt-0.5">{c.contact}</p>}
                          {c.division && parseCats(c.division).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {parseCats(c.division).map(catId => (
                                <CategoryBadge key={catId} catId={catId} size="xs" />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {teamMembers.length > 0 && (
                            <button onClick={() => setShareSheet({ id: c.id, title: `${c.company}${c.branch ? ` — ${c.branch}` : ""}`, type: "client" })}
                              className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-purple-600 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center">
                              <Share2 size={14} />
                            </button>
                          )}
                          <button onClick={() => startEdit(c)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"><Edit2 size={14} /></button>
                          <button onClick={() => deleteClient(c.id, c.company)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"><Trash2 size={14} /></button>
                        </div>
                      </div>

                      {/* Quick actions — call, WhatsApp, email, company info */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 min-h-[32px]">
                            <Phone size={11} /> {c.phone}
                          </a>
                        )}
                        {c.phone && (
                          <WhatsAppButton phone={c.phone} contactName={c.contact} clientName={c.company} size="sm" />
                        )}
                        {c.email && (
                          <EmailButton email={c.email} contactName={c.contact} clientName={c.company} size="sm" />
                        )}
                      </div>

                      {c.notes && <ExpandableText text={c.notes} className="mt-2" />}
                      {c.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}

                      {/* View full details — opens Client360 */}
                      <button
                        onClick={() => onNavigate?.("Client360", { clientId: c.id, returnTo: "Clients" })}
                        className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors min-h-[40px]"
                        style={{ background: BRAND.light, color: BRAND.primary }}>
                        View full details →
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
  }
}
