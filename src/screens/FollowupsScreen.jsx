// ─── Follow-ups Screen ────────────────────────────────────────────────────────
import { VoiceInput } from "../components/VoiceInput";
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Edit2, Trash2, Check, Calendar, Send, Share2 } from "lucide-react";
import { BRAND, REMINDER_OPTIONS } from "../lib/constants";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { haptic } from "../lib/haptics";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { WhatsAppButton } from "../components/WhatsAppButton";
import { triggerImmediateSync } from "../lib/sync";
import { sendAssignmentNotification } from "../lib/teamNotifications";
import { ShareSheet } from "../components/ShareSheet";
import { SendCompanyInfoSheet } from "../components/SendCompanyInfo";
import { MemberSelector } from "../components/MemberSelector";
import {
  Card, Btn, Field, SearchBar, FilterPills,
  Toast, Empty, PageHeader, useConfirm, ClientSelector,
} from "../components/ui";

function FollowupCard({ f, today, onToggle, onEdit, onDelete, onSendInfo, onShare, showShare }) {
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
          {f.notes && <p className="text-xs text-slate-400 mt-1 break-words whitespace-pre-wrap">{f.notes}</p>}
          {reminder && reminder.value !== "none" && !f.completed && <p className="text-xs text-blue-400 mt-0.5">🔔 {reminder.label}</p>}
          {f.clientPhone && !f.completed && (
            <div className="mt-2">
              <WhatsAppButton phone={f.clientPhone} contactName={f.clientContact} clientName={f.client} followupTitle={f.title} size="sm" />
            </div>
          )}
          {(f.clientEmail || f.clientPhone) && !f.completed && (
            <button
              onClick={(e) => { e.stopPropagation(); onSendInfo && onSendInfo(f); }}
              className="mt-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-blue-200 bg-blue-50 text-blue-700 min-h-[36px]">
              <Send size={12} /> Send Company Info
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {isOverdue && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-600 whitespace-nowrap">Overdue</span>}
          {showShare && (
            <button onClick={onShare} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-purple-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Share with teammate"><Share2 size={14} /></button>
          )}
          <button onClick={onEdit} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={14} /></button>
          <button onClick={onDelete} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={14} /></button>
        </div>
      </div>
    </Card>
  );
}

export function FollowupsScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], quickAddTrigger, searchSeed }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter]     = useState("By Client");
  const [editId, setEditId]     = useState(null);
  const [toast, setToast]       = useState("");
  const [sendInfo, setSendInfo] = useState(null);
  const [shareSheet, setShareSheet] = useState(null);
  const [nextActionPrompt, setNextActionPrompt] = useState(null);
  const [form, setForm] = useState({ title: "", client_id: "", date: todayISO(), time: "09:00", reminder: "morning", notes: "", linked_note_id: "", assigned_to_user_id: null, assigned_to: "" });
  const { confirm, dialog } = useConfirm();

  const followups = (data.followups || []).filter(f => f.user_id === userId || f.assigned_to_user_id === userId);
  const clients   = (data.clients || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId);
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
    setForm({ title: "", client_id: "", date: todayISO(), time: "09:00", reminder: "morning", notes: "", linked_note_id: "", assigned_to_user_id: null, assigned_to: "" });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(f) {
    setForm({ title: f.title || "", client_id: f.client_id || "", date: f.date || todayISO(), time: f.time || "09:00", reminder: f.reminder || "morning", notes: f.notes || "", linked_note_id: f.linked_note_id || "", assigned_to_user_id: f.assigned_to_user_id || null, assigned_to: f.assigned_to || "" });
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
      // Strict payload — only real table columns get sent up.
      const syncPayload = {
        id: updated.id,
        client_id: updated.client_id || null,
        client: updated.client || "",
        branch: updated.branch || "",
        title: updated.title || "",
        date: updated.date || null,
        time: updated.time || "",
        reminder: updated.reminder || "morning",
        notes: updated.notes || "",
        completed: !!updated.completed,
        linked_note_id: updated.linked_note_id || null,
        assigned_to_user_id: updated.assigned_to_user_id || null,
        assigned_to: updated.assigned_to || "",
        sync_status: "pending",
      };
      setData(d => ({
        ...d,
        followups: (d.followups || []).map(f => f.id === editId ? updated : f),
        syncQueue: [{ id: genId(), table: "followups", action: "update", data: syncPayload, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("followups", updated);
      setToast("Follow-up updated");
      triggerImmediateSync();
    } else {
      const item = withTeamId({
        id: genId(), user_id: userId, ...form,
        client_id: form.client_id || null,
        linked_note_id: form.linked_note_id || null,
        assigned_to_user_id: form.assigned_to_user_id || null,
        client: clientName, branch: clientBranch,
        completed: false, created_at: new Date().toISOString(), sync_status: "pending",
      }, teamId);
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

  // toggleDone queues the update for Supabase sync (cross-device completions).
  async function toggleDone(id) {
    const t = followups.find(f => f.id === id);
    if (!t) return;
    const completing = !t.completed;
    if (completing) haptic.success();
    const up = { ...t, completed: completing, sync_status: "pending" };
    // Send the FULL row — sync upserts, so a partial payload would null out
    // required columns like title. `up` already carries every field.
    const syncPayload = { ...up, user_id: t.user_id || userId, team_id: t.team_id || teamId || null };
    setData(d => ({
      ...d,
      followups: (d.followups || []).map(f => f.id === id ? up : f),
      syncQueue: [{ id: genId(), table: "followups", action: "update", data: syncPayload, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("followups", up);
    triggerImmediateSync();
    // Show "schedule next action?" prompt when marking complete
    if (completing) {
      setTimeout(() => setNextActionPrompt(t), 400);
    }
  }

  async function deleteFollowup(id) {
    const ok = await confirm("Delete this follow-up?", { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    await deleteRecord("followups", id, userId, setData);
    setToast("Follow-up deleted");
  }

  // ── Notes filtered by selected client ────────────────────────────────────
  const notes = data.notes || [];
  const clientNotes = useMemo(() => {
    if (!form.client_id) return notes;
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return notes;
    return notes.filter(n => n.client === client.company || n.client_id === form.client_id);
  }, [notes, form.client_id, clients]);

  // ── Shared form: rendered at top for NEW, in-place for EDIT ──
  function renderFollowupForm(isEdit) {
    const linkedNote = notes.find(n => n.id === form.linked_note_id);
    return (
      <Card className="p-4 space-y-3">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Follow-up" : "New Follow-up"}</p>
        <Field label="What to follow up on" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Call mine buyer re quote" required />
        <ClientSelector label="Client" value={form.client_id} onChange={v => setForm(f => ({ ...f, client_id: v, linked_note_id: "" }))} clients={clients} />

        {/* ── Linked note dropdown ── */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-500">
            Linked note <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <select
            value={form.linked_note_id}
            onChange={e => setForm(f => ({ ...f, linked_note_id: e.target.value }))}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 min-h-[56px]">
            <option value="">— No linked note</option>
            {clientNotes.map(n => (
              <option key={n.id} value={n.id}>
                {n.client ? `${n.client}: ` : ""}{(n.note || "").slice(0, 60)}{(n.note || "").length > 60 ? "…" : ""}
              </option>
            ))}
            {clientNotes.length === 0 && notes.length > 0 && (
              <option disabled>No notes for this client yet</option>
            )}
          </select>
          {linkedNote && (
            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-700 mb-0.5">Linked note</p>
              <p className="text-xs text-amber-800 leading-snug line-clamp-3">{linkedNote.note}</p>
            </div>
          )}
        </div>

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
              <VoiceInput onResult={text => setForm(f => ({ ...f, notes: f.notes ? f.notes + " " + text : text }))} />

        {/* Assign to team member */}
        {teamMembers.length > 0 && (
          <MemberSelector
            label="Assign to"
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
          <Btn className="flex-1" onClick={saveFollowup}><Save size={15} />{isEdit ? "Update" : "Add Follow-up"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  // ── Render one followup row, or the edit form in its place ──
  function renderFollowupOrForm(f) {
    if (editId === f.id) {
      return (
        <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {renderFollowupForm(true)}
        </motion.div>
      );
    }
    return (
      <FollowupCard key={f.id} f={f} today={today} onToggle={() => toggleDone(f.id)} onEdit={() => startEdit(f)} onDelete={() => deleteFollowup(f.id)}
        showShare={teamMembers.length > 0}
        onShare={() => setShareSheet({ id: f.id, title: f.title, type: "followup" })}
        onSendInfo={() => {
          const client = clients.find(c => c.id === f.client_id);
          setSendInfo({ name: f.client || client?.contact || "", email: client?.email || "", phone: f.clientPhone || client?.phone || "" });
        }} />
    );
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
          const fu = followups.find(f => f.id === shareSheet.id);
          if (!fu) return;
          const now = new Date().toISOString();
          const updated = { ...fu, assigned_to_user_id: uid, assigned_to: email?.split("@")[0] || email, sync_status: "pending" };
          setData(d => ({
            ...d,
            followups: (d.followups || []).map(f => f.id === shareSheet.id ? updated : f),
            syncQueue: [{ id: genId(), table: "followups", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
          }));
          triggerImmediateSync();
          setToast(`Follow-up shared with ${email?.split("@")[0] || email}`);
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
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Next Action Prompt ── */}
      <AnimatePresence>
        {nextActionPrompt && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={() => setNextActionPrompt(null)}
              className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"/>
            <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
              transition={{type:"spring",damping:28,stiffness:300}}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white"
              style={{maxWidth:480,margin:"0 auto"}}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
              <div className="px-6 pb-8 pt-2 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <span className="text-lg">&#10003;</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-900">Done! Schedule next action?</p>
                    <p className="text-xs text-slate-400 truncate">{nextActionPrompt.title}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[{label:"Tomorrow",days:1},{label:"3 days",days:3},{label:"1 week",days:7},{label:"2 weeks",days:14},{label:"1 month",days:30},{label:"Custom",days:null}].map(opt => (
                    <button key={opt.label}
                      onClick={() => {
                        if (!opt.days) {
                          setForm({title:nextActionPrompt.title,client_id:nextActionPrompt.client_id||null,client:nextActionPrompt.client||"",branch:nextActionPrompt.branch||"",date:todayISO(),time:"",reminder:"30_min",notes:"",linked_note_id:null,assigned_to_user_id:null,assigned_to:""});
                          setShowForm(true); setNextActionPrompt(null); return;
                        }
                        const nd=new Date(); nd.setDate(nd.getDate()+opt.days);
                        const ds=nd.toISOString().slice(0,10);
                        const fu=withTeamId({id:genId(),user_id:userId,title:nextActionPrompt.title,client_id:nextActionPrompt.client_id||null,client:nextActionPrompt.client||"",branch:nextActionPrompt.branch||"",date:ds,time:"",reminder:"30_min",notes:"",completed:false,sync_status:"pending",created_at:new Date().toISOString()},teamId);
                        setData(d=>({...d,followups:[fu,...(d.followups||[])],syncQueue:[{id:genId(),table:"followups",action:"insert",data:fu,status:"pending",created_at:new Date().toISOString()},...(d.syncQueue||[])]}));
                        offlineSave("followups",fu).catch(()=>{});
                        triggerImmediateSync();
                        setToast("Next follow-up scheduled");
                        setNextActionPrompt(null);
                      }}
                      className="py-3 rounded-xl text-xs font-bold border-2 border-slate-100 bg-slate-50 text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-800 transition-all min-h-[48px]">
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setNextActionPrompt(null)}
                  className="w-full py-3 text-sm text-slate-400 font-bold">
                  Skip
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <PageHeader title="Follow-ups" subtitle={`${pendingTotal} pending${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`} />
        <Btn size="sm" onClick={() => { if (showForm || editId) resetForm(); else setShowForm(true); }}>
          {(showForm || editId) ? <X size={15} /> : <Plus size={15} />}{(showForm || editId) ? "Cancel" : "Add"}
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

      {/* Top form: NEW follow-ups only. Edits render in place. */}
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderFollowupForm(false)}
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
                <div className="px-3 py-2 space-y-2">
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
                    .map(f => renderFollowupOrForm(f))}
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
                {grouped[bucket].map(f => renderFollowupOrForm(f))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => renderFollowupOrForm(f))}
        </div>
      )}
    </div>
  );
}
