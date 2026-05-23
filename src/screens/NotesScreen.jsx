// ─── Notes Screen ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, Trash2, Clipboard, Paperclip } from "lucide-react";
import { NOTE_URGENCY, URGENCY_ESCALATION } from "../lib/constants";
import { todayISO, smartDate, genId, uploadPhotoToSupabase } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { scheduleNotificationsViaSW } from "../lib/notifications";
import { Card, Btn, Field, SearchBar, FilterPills, Toast, Empty, PageHeader, UrgencyBadge, useConfirm } from "../components/ui";
import { MediaPicker, MediaGallery } from "../components/MediaComponents";

export function NotesScreen({ data, setData, userId, isOnline }) {
  const [showForm, setShowForm]         = useState(false);
  const [search, setSearch]             = useState("");
  const [filterUrgency, setFilterUrgency] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Unresolved");
  const [toast, setToast]               = useState("");
  const [form, setForm] = useState({ client: "", note: "", urgency: "Normal", resolve_by: "" });
  const [pendingMedia, setPendingMedia] = useState([]);
  const { confirm, dialog } = useConfirm();
  const notes = data.notes || [];
  const today = todayISO();

  function addMedia(m)  { setPendingMedia(pm => [...pm, m]); }
  function removeMedia(id) { setPendingMedia(pm => pm.filter(m => m.id !== id)); }

  async function addNote() {
    if (!form.note.trim()) { setToast("Please enter a note"); return; }
    const cleanForm = { ...form, resolve_by: form.resolve_by || null };
    // Step 1: Upload photos FIRST
    const noteId = genId();
    let uploadedMedia = [];
    if (isOnline && pendingMedia.length > 0) {
      uploadedMedia = await Promise.all(pendingMedia.map(async m => {
        const path = "notes/" + noteId + "/" + m.id;
        const url = await uploadPhotoToSupabase(m.base64, path);
        return url ? { ...m, url, base64: undefined, uploadStatus: "done" } : { ...m, uploadStatus: "pending" };
      }));
    } else {
      uploadedMedia = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
    }

    // Step 2: Create record with photos already included
    const item = { id: noteId, user_id: userId, ...cleanForm, media: uploadedMedia, resolved: false, created_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({
      ...d,
      notes: [item, ...(d.notes || [])],
      syncQueue: [{ id: genId(), table: "notes", action: "insert", data: { ...item, media: item.media.map(m => ({ ...m, base64: undefined })) }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("notes", item);
    if (form.resolve_by && Notification.permission === "granted") {
      const fireAt = new Date(form.resolve_by + "T09:00:00");
      if (fireAt > new Date()) {
        const urg = form.urgency || "Normal";
        const emoji = urg === "Critical" ? "🚨" : urg === "Urgent" ? "⚠️" : "📌";
        scheduleNotificationsViaSW([{ id: "note_" + item.id, title: emoji + " Unresolved Note: " + (form.client || "General"), body: form.note.slice(0, 80), fireAt: fireAt.toISOString(), tag: "note_" + item.id }]);
      }
    }
    setForm({ client: "", note: "", urgency: "Normal", resolve_by: "" });
    setPendingMedia([]); setShowForm(false); setToast("Note saved");
    triggerImmediateSync();
  }

  async function resolveNote(id) {
    const n = notes.find(n => n.id === id); if (!n) return;
    const updated = { ...n, resolved: true, resolved_at: new Date().toISOString(), sync_status: "pending" };
    setData(d => ({ ...d, notes: (d.notes || []).map(x => x.id === id ? updated : x), syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
    await offlineSave("notes", updated); setToast("Note resolved");
    triggerImmediateSync();
  }

  async function unresolveNote(id) {
    const n = notes.find(n => n.id === id); if (!n) return;
    const updated = { ...n, resolved: false, resolved_at: null, sync_status: "pending" };
    setData(d => ({ ...d, notes: (d.notes || []).map(x => x.id === id ? updated : x) }));
    await offlineSave("notes", updated);
  }

  async function changeUrgency(id, urgency) {
    const n = notes.find(n => n.id === id); if (!n) return;
    const updated = { ...n, urgency, sync_status: "pending" };
    setData(d => ({ ...d, notes: (d.notes || []).map(x => x.id === id ? updated : x), syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
    await offlineSave("notes", updated);
  }

  async function deleteNote(id) {
    const ok = await confirm("Delete this note?", { confirmLabel: "Delete" });
    if (!ok) return;
    setData(d => ({ ...d, syncQueue: [{ id: genId(), table: "notes", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])], notes: (d.notes || []).filter(n => n.id !== id) }));
    setToast("Note deleted");
    triggerImmediateSync();
  }

  async function deleteNoteMedia(noteId, mediaId) {
    const note = notes.find(n => n.id === noteId); if (!note) return;
    const updated = { ...note, media: (note.media || []).filter(m => m.id !== mediaId) };
    setData(d => ({ ...d, notes: (d.notes || []).map(n => n.id === noteId ? updated : n) }));
    await offlineSave("notes", updated);
  }

  const unresolvedCount = notes.filter(n => !n.resolved).length;
  const criticalCount   = notes.filter(n => !n.resolved && n.urgency === "Critical").length;
  const overdueCount    = notes.filter(n => !n.resolved && n.resolve_by && n.resolve_by < today).length;

  const filtered = notes
    .filter(n => filterStatus === "All" ? true : filterStatus === "Resolved" ? n.resolved : !n.resolved)
    .filter(n => filterUrgency === "All" || (n.urgency || "Normal") === filterUrgency)
    .filter(n => !search || [n.client, n.note].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => { const u = { Critical: 0, Urgent: 1, Normal: 2 }; if (a.resolved !== b.resolved) return a.resolved ? 1 : -1; return (u[a.urgency || "Normal"] || 2) - (u[b.urgency || "Normal"] || 2); });

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Field Notes" subtitle={`${unresolvedCount} unresolved · ${notes.length} total`} />
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? "Cancel" : "Add"}</Btn>
      </div>

      {(criticalCount > 0 || overdueCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {criticalCount > 0 && <div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold border" style={{ background: NOTE_URGENCY.Critical.bg, color: NOTE_URGENCY.Critical.text, borderColor: NOTE_URGENCY.Critical.border }}>🚨 {criticalCount} Critical</div>}
          {overdueCount > 0 && <div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold border" style={{ background: NOTE_URGENCY.Urgent.bg, color: NOTE_URGENCY.Urgent.text, borderColor: NOTE_URGENCY.Urgent.border }}>⏰ {overdueCount} Overdue</div>}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">New Note</p>
              <Field label="Client / Branch" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Client name" />
              <Field label="Note" value={form.note} onChange={v => setForm(f => ({ ...f, note: v }))} placeholder="Type your visit note…" multiline required />
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Urgency</label>
                <div className="flex gap-2">
                  {Object.keys(NOTE_URGENCY).map(u => (
                    <button key={u} type="button" onClick={() => setForm(f => ({ ...f, urgency: u }))}
                      className="flex-1 rounded-xl py-3 text-sm font-bold border-2 transition-all min-h-[48px]"
                      style={form.urgency === u ? { background: NOTE_URGENCY[u].bg, color: NOTE_URGENCY[u].text, borderColor: NOTE_URGENCY[u].dot } : { background: "#F8FAFC", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Resolve By (optional)" type="date" value={form.resolve_by} onChange={v => setForm(f => ({ ...f, resolve_by: v }))} />
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Attach Photos / Videos</label>
                <MediaPicker onAdd={addMedia} />
                <MediaGallery media={pendingMedia} onDelete={removeMedia} />
              </div>
              <Btn className="w-full" onClick={addNote}><Plus size={15} />Add Note{pendingMedia.length > 0 ? ` + ${pendingMedia.length} file${pendingMedia.length !== 1 ? "s" : ""}` : ""}</Btn>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search notes…" />
      <div className="space-y-2">
        <FilterPills options={["Unresolved", "Resolved", "All"]} value={filterStatus} onChange={setFilterStatus} dangerValue={null} />
        <FilterPills options={["All", "Normal", "Urgent", "Critical"]} value={filterUrgency} onChange={setFilterUrgency} dangerValue="Critical" />
      </div>
      {filtered.length === 0 && <Empty title="No notes found" text="Add a note or change your filters." icon={Clipboard} />}

      <div className="space-y-2">
        {filtered.map(n => {
          const urg      = NOTE_URGENCY[n.urgency || "Normal"] || NOTE_URGENCY.Normal;
          const isOverdue = !n.resolved && n.resolve_by && n.resolve_by < today;
          return (
            <Card key={n.id} className="overflow-hidden" style={{ borderLeft: "3px solid " + urg.dot }}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className={"text-base font-bold " + (n.resolved ? "text-slate-400 line-through" : "text-slate-900")}>{n.client || "General Note"}</p>
                      <UrgencyBadge urgency={n.urgency || "Normal"} />
                      {n.resolved && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Resolved</span>}
                      {isOverdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Overdue</span>}
                    </div>
                    <p className={"text-sm leading-relaxed " + (n.resolved ? "text-slate-400" : "text-slate-600")}>{n.note}</p>
                    {n.resolve_by && !n.resolved && <p className={"mt-1 text-sm font-medium " + (isOverdue ? "text-red-600" : "text-slate-400")}>Resolve by: {smartDate(n.resolve_by)}</p>}
                    {n.resolved && n.resolved_at && <p className="mt-1 text-xs text-slate-400">Resolved {new Date(n.resolved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>}
                    {(n.media || []).length > 0 && <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Paperclip size={11} />{n.media.length} attachment{n.media.length !== 1 ? "s" : ""}</div>}
                    <MediaGallery media={n.media || []} onDelete={mid => deleteNoteMedia(n.id, mid)} />
                    <p className="mt-1.5 text-xs text-slate-400">{n.created_at ? new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                    {n.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                  </div>
                  <button onClick={() => deleteNote(n.id)} className="shrink-0 p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15} /></button>
                </div>
                {!n.resolved && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      {Object.keys(NOTE_URGENCY).map(u2 => (
                        <button key={u2} onClick={() => changeUrgency(n.id, u2)}
                          className="rounded-lg px-3 py-1.5 text-sm font-bold border transition-all min-h-[40px]"
                          style={(n.urgency || "Normal") === u2 ? { background: NOTE_URGENCY[u2].bg, color: NOTE_URGENCY[u2].text, borderColor: NOTE_URGENCY[u2].dot } : { background: "#F8FAFC", color: "#CBD5E1", borderColor: "#E2E8F0" }}>
                          {u2}
                        </button>
                      ))}
                    </div>
                    <Btn size="sm" variant="success" onClick={() => resolveNote(n.id)}><Check size={13} /> Resolve</Btn>
                  </div>
                )}
                {n.resolved && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <button onClick={() => unresolveNote(n.id)} className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-1">Mark as unresolved</button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
