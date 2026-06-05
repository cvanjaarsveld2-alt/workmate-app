// ─── Follow-ups Screen ────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Edit2, Trash2, Check, Calendar } from "lucide-react";
import { BRAND, REMINDER_OPTIONS } from "../lib/constants";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { WhatsAppButton } from "../components/WhatsAppButton";
import { triggerImmediateSync } from "../lib/sync";
import {
  Card, Btn, Field, SearchBar, FilterPills,
  Toast, Empty, PageHeader, useConfirm, ClientSelector,
} from "../components/ui";

function FollowupCard({ f, today, onToggle, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = !f.completed && f.date < today;
  const reminder  = REMINDER_OPTIONS.find(o => o.value === f.reminder);
  const LIMIT = 80;
  const isLong = f.title && f.title.length > LIMIT;
  const displayText = isLong && !expanded
    ? f.title.slice(0, LIMIT).trimEnd() + "…"
    : f.title;

  function handleExpandToggle(e) {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(v => !v);
  }

  return (
    <Card className={`p-3.5 ${isOverdue ? "border-l-4 border-l-red-400" : ""}`}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle}
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all mt-0.5 ${f.completed ? "bg-green-100 text-green-600" : isOverdue ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-400"}`}>
          <Check size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold break-words ${f.completed ? "line-through text-slate-400" : "text-slate-900"}`}>
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
          {(f.client || f.branch) && <p className="text-sm text-slate-500 mt-1">{f.client}{f.branch ? ` — ${f.branch}` : ""}</p>}
          <p className="text-sm text-slate-400 mt-0.5">{smartDate(f.date)}{f.time ? ` at ${f.time}` : ""}</p>
          {f.notes && <p className="text-xs text-slate-400 mt-1">{f.notes}</p>}
          {reminder && reminder.value !== "none" && !f.completed && <p className="text-xs text-blue-400 mt-0.5">🔔 {reminder.label}</p>}
          {f.clientPhone && !f.completed && (
            <div className="mt-2">
              <WhatsAppButton phone={f.clientPhone} contactName={f.clientContact} clientName={f.client} followupTitle={f.title} size="sm" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {isOverdue && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-600 whitespace-nowrap">Overdue</span>}
          <button onClick={onEdit} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={14} /></button>
          <button onClick={onDelete} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={14} /></button>
        </div>
      </div>
    </Card>
  );
}

export function FollowupsScreen({ data, setData, userId, quickAddTrigger }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter]     = useState("By Client");
  const [editId, setEditId]     = useState(null);
  const [toast, setToast]       = useState("");
  const [form, setForm] = useState({ title: "", client_id: "", date: todayISO(), time: "09:00", reminder: "morning", notes: "" });
  const { confirm, dialog } = useConfirm();

  const followups = data.followups || [];
  const clients   = data.clients   || [];
  const today     = todayISO();
  const nextWeek  = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  // ── Quick capture: open add form when FAB triggers this screen ──
  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Followups") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  function resetForm() {
    setForm({ title: "", client_id: "", date: todayISO(), time: "09:00", reminder: "morning", notes: "" });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(f) {
    setForm({ title: f.title || "", client_id: f.client_id || "", date: f.date || todayISO(), time: f.time || "09:00", reminder: f.reminder || "morning", notes: f.notes || "" });
    setEditId(f.id);
    setShowForm(true);
  }

  async function saveFollowup() {
    if (!form.title.trim()) { setToast("Please enter a title"); return; }
    const selectedClient = clients.find(c => c.id === form.client_id);
    const clientName     = selectedClient ? selectedClient.company : "";
    const clientBranch   = selectedClient ? (selectedClient.branch || "") : "";

    if (editId) {
      const existing = followups.find(f => f.id === editId);
      const updated  = { ...existing, ...form, client: clientName, branch: clientBranch, sync_status: "pending" };
      setData(d => ({
        ...d,
        followups: (d.followups || []).map(f => f.id === editId ? updated : f),
        syncQueue: [{ id: genId(), table: "followups", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("followups", updated);
      setToast("Follow-up updated");
    triggerImmediateSync();
    } else {
      const item = {
        id: genId(), user_id: userId, ...form,
        client: clientName, branch: clientBranch,
        completed: false, created_at: new Date().toISOString(), sync_status: "pending",
      };
      setData(d => ({
        ...d,
        followups: [item, ...(d.followups || [])],
        syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("followups", item);
      setToast("Follow-up added");
    triggerImmediateSync();
    }
    resetForm();
  }

  async function toggleDone(id) {
    const t  = followups.find(f => f.id === id);
    const up = { ...t, completed: !t.completed, sync_status: "pending" };
    setData(d => ({ ...d, followups: (d.followups || []).map(f => f.id === id ? up : f) }));
    await offlineSave("followups", up);
    triggerImmediateSync();
  }

  async function deleteFollowup(id) {
    const ok = await confirm("Delete this follow-up?", { confirmLabel: "Delete" });
    if (!ok) return;
    setData(d => ({ ...d, syncQueue: [{ id: genId(), table: "followups", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])], followups: (d.followups || []).filter(f => f.id !== id) }));
    setToast("Follow-up deleted");
    triggerImmediateSync();
  }

  const filtered = followups.filter(f => {
    if (filter === "Overdue")    return f.date < today && !f.completed;
    if (filter === "Today")      return f.date === today && !f.completed;
    if (filter === "This week")  return f.date > today && f.date <= nextWeekStr && !f.completed;
    if (filter === "Done")       return f.completed;
    if (filter === "By Client")  return !f.completed;
    return !f.completed;
  }).sort((a, b) => a.completed - b.completed || a.date.localeCompare(b.date));

  const byClient = filter === "By Client"
    ? filtered.reduce((acc, f) => {
        const key = f.client || "No Client";
        if (!acc[key]) acc[key] = [];
        acc[key].push(f);
        return acc;
      }, {})
    : null;

  const overdueCount = followups.filter(f => f.date < today && !f.completed).length;
  const todayCount   = followups.filter(f => f.date === today && !f.completed).length;
  const pendingTotal = followups.filter(f => !f.completed).length;

  const grouped = (filter === "Upcoming")
    ? filtered.reduce((acc, f) => {
        const bucket = f.completed ? "Done" : f.date < today ? "Overdue" : f.date === today ? "Today" : f.date <= nextWeekStr ? "This Week" : "Later";
        if (!acc[bucket]) acc[bucket] = [];
        acc[bucket].push(f);
        return acc;
      }, {})
    : null;

  const bucketOrder = ["Overdue", "Today", "This Week", "Later", "Done"];

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <div className="flex items-center justify-between">
        <PageHeader title="Follow-ups" subtitle={`${pendingTotal} pending${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`} />
        <Btn size="sm" onClick={() => { if (showForm && editId) resetForm(); else setShowForm(!showForm); }}>
          {showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? "Cancel" : "Add"}
        </Btn>
      </div>

      {(overdueCount > 0 || todayCount > 0) && (
        <div className="flex gap-3">
          {overdueCount > 0 && (
            <button onClick={() => setFilter("Overdue")} className="flex-1 rounded-2xl bg-red-50 border border-red-200 p-3 text-center">
              <p className="text-2xl font-black text-red-700">{overdueCount}</p>
              <p className="text-xs font-bold text-red-500">Overdue</p>
            </button>
          )}
          {todayCount > 0 && (
            <button onClick={() => setFilter("Today")} className="flex-1 rounded-2xl bg-blue-50 border border-blue-200 p-3 text-center">
              <p className="text-2xl font-black text-blue-700">{todayCount}</p>
              <p className="text-xs font-bold text-blue-500">Due Today</p>
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId ? "Edit Follow-up" : "New Follow-up"}</p>
              <Field label="What to follow up on" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Call mine buyer re quote" required />
              <ClientSelector label="Client" value={form.client_id} onChange={v => setForm(f => ({ ...f, client_id: v }))} clients={clients} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
                <Field label="Time" type="time" value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">🔔 Reminder</label>
                <select value={form.reminder} onChange={e => setForm(f => ({ ...f, reminder: e.target.value }))}
                  className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 min-h-[52px]">
                  {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Any context…" multiline />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveFollowup}><Save size={15} />{editId ? "Update" : "Add Follow-up"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <FilterPills options={["Upcoming", "By Client", "Overdue", "Today", "This week", "Done"]} value={filter} onChange={setFilter} dangerValue="Overdue" />

      {filtered.length === 0 && <Empty title={filter === "Done" ? "No completed follow-ups" : "All clear!"} text="No follow-ups in this category." icon={Calendar} />}

      {byClient ? (
        <div className="space-y-4">
          {Object.entries(byClient).sort(([a],[b]) => a.localeCompare(b)).map(([clientName, fus]) => {
            const overdueFUs = fus.filter(f => f.date < today && !f.completed);
            const pendingFUs = fus.filter(f => !f.completed);
            return (
              <div key={clientName} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100" style={{background:"#F7F3F3"}}>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black text-slate-900">{clientName}</p>
                    <div className="flex items-center gap-2">
                      {overdueFUs.length > 0 && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                          ⚠️ {overdueFUs.length} overdue
                        </span>
                      )}
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">
                        {pendingFUs.length} pending
                      </span>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-50 px-3 py-2 space-y-2">
                  {fus
                    .sort((a, b) => {
                      const aOverdue = a.date < today && !a.completed;
                      const bOverdue = b.date < today && !b.completed;
                      if (aOverdue && !bOverdue) return -1;
                      if (!aOverdue && bOverdue) return 1;
                      if (a.completed && !b.completed) return 1;
                      if (!a.completed && b.completed) return -1;
                      return a.date.localeCompare(b.date);
                    })
                    .map(f => (
                      <FollowupCard key={f.id} f={f} today={today} onToggle={() => toggleDone(f.id)} onEdit={() => startEdit(f)} onDelete={() => deleteFollowup(f.id)} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {bucketOrder.filter(b => grouped[b]?.length > 0).map(bucket => (
            <div key={bucket}>
              <p className={`text-sm font-bold uppercase tracking-wider px-1 mb-2 ${bucket === "Overdue" ? "text-red-600" : bucket === "Today" ? "text-blue-600" : "text-slate-400"}`}>
                {bucket === "Overdue" ? `⚠️ ${bucket}` : bucket === "Today" ? `📍 ${bucket}` : bucket} ({grouped[bucket].length})
              </p>
              <div className="space-y-2">
                {grouped[bucket].map(f => (
                  <FollowupCard key={f.id} f={f} today={today} onToggle={() => toggleDone(f.id)} onEdit={() => startEdit(f)} onDelete={() => deleteFollowup(f.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <FollowupCard key={f.id} f={f} today={today} onToggle={() => toggleDone(f.id)} onEdit={() => startEdit(f)} onDelete={() => deleteFollowup(f.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
