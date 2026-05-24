// ─── Clients Screen ───────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, Check,
  ChevronDown, ChevronUp, Phone,
} from "lucide-react";
import { BRAND, PIPELINE_STAGES, REMINDER_OPTIONS } from "../lib/constants";
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

// ─── Follow-up row inside client card ─────────────────────────────────────────
function ClientFollowupRow({ followup: f, setData }) {
  const today    = todayISO();
  const isOverdue = !f.completed && f.date < today;

  async function toggleDone() {
    const up = { ...f, completed: !f.completed, sync_status: "pending" };
    setData(d => ({ ...d, followups: (d.followups || []).map(x => x.id === f.id ? up : x) }));
    await offlineSave("followups", up);
    triggerImmediateSync();
  }

  async function deleteIt() {
    setData(d => ({ ...d, followups: (d.followups || []).filter(x => x.id !== f.id) }));
  }

  const [expanded, setExpanded] = useState(false);
  const LIMIT = 80;
  const isLong = f.title && f.title.length > LIMIT;
  const displayText = isLong && !expanded
    ? f.title.slice(0, LIMIT).trimEnd() + "…"
    : f.title;

  return (
    <div className={`rounded-xl p-2.5 ${isOverdue ? "bg-red-50" : f.completed ? "bg-slate-50" : "bg-white border border-slate-100"}`}>
      <div className="flex items-start gap-2.5">
        <button onClick={toggleDone}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all mt-0.5 ${f.completed ? "bg-green-100 text-green-600" : isOverdue ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
          <Check size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${f.completed ? "line-through text-slate-400" : isOverdue ? "text-red-800" : "text-slate-900"}`}>
            {displayText}
            {isLong && (
              <button onClick={() => setExpanded(!expanded)}
                className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full align-middle"
                style={{background:"#FEF3C7", color:"#92400E", border:"1px solid #FCD34D"}}>
                {expanded ? "less" : "more"}
              </button>
            )}
          </p>
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
export function ClientsScreen({ data, setData, userId }) {
  const [showForm, setShowForm]         = useState(false);
  const [search, setSearch]             = useState("");
  const [filterStage, setFilterStage]   = useState("All");
  const [editId, setEditId]             = useState(null);
  const [toast, setToast]               = useState("");
  const [expandedClient, setExpandedClient] = useState(null);
  const [showFollowupForm, setShowFollowupForm] = useState(null);
  const [form, setForm] = useState({ company: "", branch: "", contact: "", phone: "", email: "", stage: "New Lead", notes: "" });
  const { confirm, dialog } = useConfirm();

  const clients   = data.clients   || [];
  const followups = data.followups || [];
  const today     = todayISO();

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
    const ok = await confirm(`Delete ${companyName}? This cannot be undone.`, { confirmLabel: "Delete" });
    if (!ok) return;
    // Queue delete for Supabase sync
    setData(d => ({
      ...d,
      clients: (d.clients || []).filter(c => c.id !== id),
      syncQueue: [{ id: genId(), table: "clients", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    // Also delete linked followups locally
    setData(d => ({ ...d, followups: (d.followups || []).filter(f => f.client_id !== id) }));
    setToast("Client deleted");
    triggerImmediateSync();
  }

  function startEdit(c) {
    setForm({ company: c.company || "", branch: c.branch || "", contact: c.contact || "", phone: c.phone || "", email: c.email || "", stage: c.stage || "New Lead", notes: c.notes || "" });
    setEditId(c.id);
    setShowForm(true);
  }

  function getClientFollowups(clientId) {
    return followups.filter(f => f.client_id === clientId).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.date.localeCompare(b.date);
    });
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
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? "Cancel" : "Add Client"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId ? "Edit Client" : "New Client"}</p>
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
                <Btn className="flex-1" onClick={saveClient}><Save size={15} />{editId ? "Update" : "Add Client"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
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
          const pendingFU     = companyFU.filter(f => !f.completed);
          const overdueFU     = companyFU.filter(f => !f.completed && f.date < today);

          return (
            <Card key={cn} className="overflow-hidden">
              <button className="w-full text-left px-4 pt-4 pb-3 flex items-center justify-between"
                onClick={() => setExpandedClient(isExpanded ? null : cn)}>
                <div>
                  <p className="font-black text-slate-900 text-base">{cn}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-sm text-slate-400">{branches.length} branch{branches.length !== 1 ? "es" : ""}</p>
                    {pendingFU.length > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${overdueFU.length > 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {overdueFU.length > 0 ? `⚠️ ${overdueFU.length} overdue` : `${pendingFU.length} follow-up${pendingFU.length !== 1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
              </button>

              <div className="divide-y divide-slate-50">
                {[...branches].sort((a, b) => {
                  // Overdue follow-ups first
                  const aOverdue = companyFU.some(f => f.client_id === a.id && !f.completed && f.date < today);
                  const bOverdue = companyFU.some(f => f.client_id === b.id && !f.completed && f.date < today);
                  if (aOverdue && !bOverdue) return -1;
                  if (!aOverdue && bOverdue) return 1;
                  // Then by stage priority
                  const aPri = STAGE_PRIORITY[a.stage || "New Lead"] ?? 3;
                  const bPri = STAGE_PRIORITY[b.stage || "New Lead"] ?? 3;
                  return aPri - bPri;
                }).map(c => {
                  const clientFU      = getClientFollowups(c.id);
                  const clientOverdue = clientFU.filter(f => !f.completed && f.date < today).length;
                  const clientPending = clientFU.filter(f => !f.completed).length;

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
                          {c.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.notes}</p>}
                          {c.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => startEdit(c)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15} /></button>
                          <button onClick={() => deleteClient(c.id, c.company)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15} /></button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="mt-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Follow-ups {clientPending > 0 ? `· ${clientPending} pending` : ""}
                              </p>
                              <button
                                onClick={() => setShowFollowupForm(showFollowupForm === c.id ? null : c.id)}
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
                              <p className="text-sm text-slate-400 py-2">No follow-ups yet. Tap + Add to create one.</p>
                            )}
                            <div className="space-y-2">
                              {clientFU.map(f => (
                                <ClientFollowupRow key={f.id} followup={f} setData={setData} />
                              ))}
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
