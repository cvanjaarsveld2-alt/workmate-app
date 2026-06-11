// ─── Clients Screen ───────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, Check,
  ChevronDown, ChevronUp, Phone, Clipboard,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, REMINDER_OPTIONS, NOTE_URGENCY } from "../lib/constants";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { WhatsAppButton } from "../components/WhatsAppButton";
import { EmailButton } from "../components/EmailButton";
import { triggerImmediateSync } from "../lib/sync";
import {
  Card, Btn, Field, SelectField, SearchBar,
  FilterPills, Toast, Empty, StagePill, PageHeader, useConfirm,
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
function InlineFollowupForm({ client, userId, setData, onDone }) {
  const [form, setForm] = useState({
    title: "", date: todayISO(), time: "09:00", reminder: "morning", notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const item = {
      id: genId(), user_id: userId,
      client_id: client.id,
      client: client.company,
      branch: client.branch || "",
      ...form,
      completed: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };
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
function InlineNoteForm({ client, userId, setData, onDone }) {
  const [form, setForm] = useState({ note: "", urgency: "Normal", resolve_by: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.note.trim()) return;
    setSaving(true);
    const clientLabel = client.company + (client.branch ? ` — ${client.branch}` : "");
    const item = {
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
    };
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
    setData(d => ({
      ...d,
      followups: (d.followups || []).filter(x => x.id !== f.id),
      syncQueue: [{ id: genId(), table: "followups", action: "delete", data: { id: f.id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    triggerImmediateSync();
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
export function ClientsScreen({ data, setData, userId, quickAddTrigger, searchSeed }) {
  const [showForm, setShowForm]         = useState(false);
  const [search, setSearch]             = useState("");
  const [filterStage, setFilterStage]   = useState("All");
  const [editId, setEditId]             = useState(null);
  const [toast, setToast]               = useState("");
  const [expandedClient, setExpandedClient] = useState(null);
  const [showFollowupForm, setShowFollowupForm] = useState(null);
  const [showNoteForm, setShowNoteForm] = useState(null);
  const [form, setForm] = useState({ company: "", branch: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "" });
  const { confirm, dialog } = useConfirm();

  const clients   = data.clients   || [];
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
    setForm({ company: "", branch: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "" });
    setEditId(null);
    setShowForm(false);
  }

  async function saveClient() {
    if (!form.company.trim()) { setToast("Company name is required"); return; }
    if (editId) {
      const existing = clients.find(c => c.id === editId);
      const updated  = { ...existing, ...form, sync_status: "pending" };
      setData(d => ({
        ...d,
        clients:   (d.clients || []).map(c => c.id === editId ? updated : c),
        syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("clients", updated);
      setToast("Client updated");
    triggerImmediateSync();
    } else {
      const item = { id: genId(), user_id: userId, ...form, created_at: new Date().toISOString(), sync_status: "pending" };
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
    const message = linkedFUs.length > 0
      ? `Delete ${companyName} and its ${linkedFUs.length} follow-up${linkedFUs.length !== 1 ? "s" : ""}? This cannot be undone. (Notes are kept.)`
      : `Delete ${companyName}? This cannot be undone.`;
    const ok = await confirm(message, { confirmLabel: "Delete" });
    if (!ok) return;

    const now = new Date().toISOString();
    setData(d => ({
      ...d,
      clients:   (d.clients   || []).filter(c => c.id !== id),
      followups: (d.followups || []).filter(f => f.client_id !== id),
      syncQueue: [
        { id: genId(), table: "clients", action: "delete", data: { id }, status: "pending", created_at: now },
        ...linkedFUs.map(f => ({ id: genId(), table: "followups", action: "delete", data: { id: f.id }, status: "pending", created_at: now })),
        ...(d.syncQueue || []),
      ],
    }));
    setToast(linkedFUs.length > 0 ? `Client + ${linkedFUs.length} follow-up${linkedFUs.length !== 1 ? "s" : ""} deleted` : "Client deleted");
    triggerImmediateSync();
  }

  // ── Edit-in-place: the edit form renders where the branch row is. ──
  function startEdit(c) {
    setForm({ company: c.company || "", branch: c.branch || "", contact: c.contact || "", phone: c.phone || "", email: c.email || "", stage: c.stage || "New Lead", notes: c.notes || "" });
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
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Client" : "New Client"}</p>
        <Field label="Company Name" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="e.g. Anglo American" required />
        <Field label="Branch / Mine / Site" value={form.branch} onChange={v => setForm(f => ({ ...f, branch: v }))} placeholder="e.g. Mogalakwena Mine" />
        <Field label="Contact Person" value={form.contact} onChange={v => setForm(f => ({ ...f, contact: v }))} placeholder="Contact name" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Phone" type="tel" />
          <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="Email" type="email" />
        </div>
        <SelectField label="Pipeline Stage" value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v }))} options={PIPELINE_STAGES} />
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Notes about this client…" multiline />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveClient}><Save size={15} />{isEdit ? "Update" : "Add Client"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  const filtered = clients
    .filter(c => filterStage === "All" || (c.stage || "New Lead") === filterStage)
    .filter(c => !search || [c.company, c.branch, c.contact].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const grouped = filtered.reduce((a, c) => {
    const k = c.company || "Unknown";
    if (!a[k]) a[k] = [];
    a[k].push(c);
    return a;
  }, {});

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <div className="flex items-center justify-between">
        <PageHeader title="Clients" subtitle={`${clients.length} total`} />
        <Btn size="sm" onClick={() => { if (showForm || editId) resetForm(); else setShowForm(true); }}>
          {(showForm || editId) ? <X size={15} /> : <Plus size={15} />}{(showForm || editId) ? "Cancel" : "Add Client"}
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
      <FilterPills options={["All", ...PIPELINE_STAGES]} value={filterStage} onChange={setFilterStage} dangerValue="Lost" />

      {Object.keys(grouped).length === 0 && <Empty title="No clients found" text="Add your first client." />}

      <div className="space-y-3">
        {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cn, branches]) => {
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

                  return (
                    <div key={c.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">{c.branch || "Main Branch"}</p>
                            <StagePill stage={c.stage || "New Lead"} />
                          </div>
                          {c.contact && <p className="text-sm text-slate-500 mt-0.5">{c.contact}</p>}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {c.phone && (
                              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium" onClick={e => e.stopPropagation()}>
                                <Phone size={12} />{c.phone}
                              </a>
                            )}
                            {c.phone && (
                              <span onClick={e => e.stopPropagation()}>
                                <WhatsAppButton
                                  phone={c.phone}
                                  contactName={c.contact}
                                  clientName={c.company}
                                  size="sm"
                                />
                              </span>
                            )}
                            {c.email && (
                              <span onClick={e => e.stopPropagation()}>
                                <EmailButton
                                  email={c.email}
                                  contactName={c.contact}
                                  clientName={c.company}
                                  size="sm"
                                />
                              </span>
                            )}
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="text-sm text-blue-600 truncate max-w-[160px]" onClick={e => e.stopPropagation()}>
                                {c.email}
                              </a>
                            )}
                          </div>
                          {/* Full info — no more clipped text */}
                          <ExpandableText text={c.notes} className="mt-1" />
                          {c.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => startEdit(c)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15} /></button>
                          <button onClick={() => deleteClient(c.id, c.company)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15} /></button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="mt-3 pt-3 border-t border-slate-100 space-y-4">

                            {/* ── Follow-ups section ── */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Follow-ups {clientPending > 0 ? `· ${clientPending} pending` : ""}
                                </p>
                                <button
                                  onClick={() => { setShowFollowupForm(showFollowupForm === c.id ? null : c.id); setShowNoteForm(null); }}
                                  className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold min-h-[36px]"
                                  style={{ background: BRAND.light, color: BRAND.primary }}>
                                  <Plus size={12} /> Add
                                </button>
                              </div>

                              <AnimatePresence>
                                {showFollowupForm === c.id && (
                                  <InlineFollowupForm client={c} userId={userId} setData={setData} onDone={() => setShowFollowupForm(null)} />
                                )}
                              </AnimatePresence>

                              {clientFU.length === 0 && showFollowupForm !== c.id && (
                                <p className="text-sm text-slate-400 py-1">No follow-ups yet.</p>
                              )}
                              <div className="space-y-2">
                                {clientFU.map(f => (
                                  <ClientFollowupRow key={f.id} followup={f} setData={setData} />
                                ))}
                              </div>
                            </div>

                            {/* ── Notes section — NEW ── */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  <Clipboard size={11} className="inline mr-1 -mt-0.5" />
                                  Notes {clientOpenNotes > 0 ? `· ${clientOpenNotes} open` : ""}
                                </p>
                                <button
                                  onClick={() => { setShowNoteForm(showNoteForm === c.id ? null : c.id); setShowFollowupForm(null); }}
                                  className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold min-h-[36px]"
                                  style={{ background: "#FEF3C7", color: "#92400E" }}>
                                  <Plus size={12} /> Add
                                </button>
                              </div>

                              <AnimatePresence>
                                {showNoteForm === c.id && (
                                  <InlineNoteForm client={c} userId={userId} setData={setData} onDone={() => setShowNoteForm(null)} />
                                )}
                              </AnimatePresence>

                              {clientNotes.length === 0 && showNoteForm !== c.id && (
                                <p className="text-sm text-slate-400 py-1">No notes for this client yet.</p>
                              )}
                              <div className="space-y-2">
                                {clientNotes.map(n => (
                                  <ClientNoteRow key={n.id} note={n} setData={setData} />
                                ))}
                              </div>
                            </div>

                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
