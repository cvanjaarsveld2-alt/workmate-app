// ─── Notes Screen ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, Trash2, Clipboard, Paperclip, Edit2, Save, FileDown, CheckSquare, Square, Users } from "lucide-react";
import { NOTE_URGENCY, URGENCY_ESCALATION } from "../lib/constants";
import { todayISO, smartDate, genId, uploadPhotoToSupabase } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { scheduleNotificationsViaSW } from "../lib/notifications";
import { Card, Btn, Field, SearchBar, FilterPills, Toast, Empty, PageHeader, UrgencyBadge, useConfirm, ClientSelector } from "../components/ui";
import { MediaPicker, MediaGallery } from "../components/MediaComponents";
import { ContactPicker, LinkedContactsDisplay } from "../components/ContactPicker";
import { exportNotesPDF, exportNotesExcel } from "../NotesExport";

export function NotesScreen({ data, setData, userId, isOnline, quickAddTrigger }) {
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState(null);
  const [search, setSearch]             = useState("");
  const [filterUrgency, setFilterUrgency] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Unresolved");
  const [toast, setToast]               = useState("");
  const [form, setForm] = useState({ client_id: "", note: "", urgency: "Normal", resolve_by: "" });
  const [pendingMedia, setPendingMedia] = useState([]);
  const [existingMedia, setExistingMedia] = useState([]);
  const [linkedContactIds, setLinkedContactIds] = useState([]);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const { confirm, dialog } = useConfirm();
  const notes    = data.notes    || [];
  const contacts = data.contacts || [];
  const clients  = data.clients  || [];
  const today    = todayISO();

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Notes") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  function addMedia(m)  { setPendingMedia(pm => [...pm, m]); }
  function removeMedia(id) { setPendingMedia(pm => pm.filter(m => m.id !== id)); }
  function removeExistingMedia(id) { setExistingMedia(em => em.filter(m => m.id !== id)); }
  function removeLinkedContact(id) { setLinkedContactIds(ids => ids.filter(x => x !== id)); }

  function resetForm() {
    setForm({ client_id: "", note: "", urgency: "Normal", resolve_by: "" });
    setPendingMedia([]);
    setExistingMedia([]);
    setLinkedContactIds([]);
    setEditId(null);
    setShowForm(false);
  }

  // ── Edit-in-place: startEdit no longer opens the top form. The edit form
  // renders directly where the note card was, so the screen doesn't jump.
  function startEdit(n) {
    setForm({
      client_id:  n.client_id || "",
      note:       n.note || "",
      urgency:    n.urgency || "Normal",
      resolve_by: n.resolve_by || "",
    });
    setExistingMedia(n.media || []);
    setPendingMedia([]);
    setLinkedContactIds(n.linked_contact_ids || []);
    setEditId(n.id);
    setShowForm(false);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function enterSelectMode() { resetForm(); setSelectMode(true); setSelectedIds(new Set()); }
  function exitSelectMode()  { setSelectMode(false); setSelectedIds(new Set()); setShowExportMenu(false); }
  function selectAllVisible(visibleNotes) { setSelectedIds(new Set(visibleNotes.map(n => n.id))); }

  async function handleExport(format) {
    const selected = notes.filter(n => selectedIds.has(n.id));
    if (selected.length === 0) { setToast("Select at least one note"); return; }
    setExporting(true);
    setShowExportMenu(false);
    setExportProgress(0);
    try {
      const exportOptions = {
        contacts,
        onProgress: ({ percent }) => setExportProgress(percent),
      };
      if (format === "pdf") {
        await exportNotesPDF(selected, exportOptions);
      } else if (format === "excel") {
        await exportNotesExcel(selected, exportOptions);
      } else if (format === "both") {
        await exportNotesPDF(selected, { ...exportOptions, onProgress: ({ percent }) => setExportProgress(Math.round(percent / 2)) });
        await exportNotesExcel(selected, { ...exportOptions, onProgress: ({ percent }) => setExportProgress(50 + Math.round(percent / 2)) });
      }
      setToast(`Exported ${selected.length} note${selected.length !== 1 ? "s" : ""} ✓`);
      exitSelectMode();
    } catch (e) {
      console.error("Export failed:", e);
      setToast("Export failed: " + (e.message || "unknown error"));
    }
    setExporting(false);
    setExportProgress(0);
  }

  async function saveNote() {
    if (!form.note.trim()) { setToast("Please enter a note"); return; }

    // Resolve the selected client into a display label (kept in the `client`
    // text column so grouping, search, and exports keep working as before).
    const selectedClient = clients.find(c => c.id === form.client_id);
    const clientLabel = selectedClient
      ? selectedClient.company + (selectedClient.branch ? ` — ${selectedClient.branch}` : "")
      : "";

    if (editId) {
      const existing = notes.find(n => n.id === editId);
      if (!existing) { setToast("Note not found"); return; }

      let newUploadedMedia = [];
      if (isOnline && pendingMedia.length > 0) {
        newUploadedMedia = await Promise.all(pendingMedia.map(async m => {
          const path = "notes/" + editId + "/" + m.id;
          const url = await uploadPhotoToSupabase(m.base64, path);
          return url ? { ...m, url, base64: undefined, uploadStatus: "done" } : { ...m, uploadStatus: "pending" };
        }));
      } else {
        newUploadedMedia = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
      }

      const updated = {
        ...existing,
        client_id:  form.client_id || null,
        client:     clientLabel || (form.client_id ? "" : existing.client) || "",
        note:       form.note,
        urgency:    form.urgency,
        resolve_by: form.resolve_by || null,
        media: [...existingMedia, ...newUploadedMedia],
        linked_contact_ids: linkedContactIds,
        sync_status: "pending",
      };

      setData(d => ({
        ...d,
        notes: (d.notes || []).map(n => n.id === editId ? updated : n),
        syncQueue: [{
          id: genId(),
          table: "notes",
          action: "update",
          data: { ...updated, media: updated.media.map(m => ({ ...m, base64: undefined })) },
          status: "pending",
          created_at: new Date().toISOString(),
        }, ...(d.syncQueue || [])],
      }));
      await offlineSave("notes", updated);
      setToast("Note updated");
      triggerImmediateSync();
      resetForm();
      return;
    }

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

    const item = {
      id: noteId,
      user_id: userId,
      client_id:  form.client_id || null,
      client:     clientLabel,
      note:       form.note,
      urgency:    form.urgency,
      resolve_by: form.resolve_by || null,
      media: uploadedMedia,
      linked_contact_ids: linkedContactIds,
      resolved: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };
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
        scheduleNotificationsViaSW([{ id: "note_" + item.id, title: emoji + " Unresolved Note: " + (clientLabel || "General"), body: form.note.slice(0, 80), fireAt: fireAt.toISOString(), tag: "note_" + item.id }]);
      }
    }
    setToast("Note saved");
    triggerImmediateSync();
    resetForm();
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
    setData(d => ({
      ...d,
      notes: (d.notes || []).map(x => x.id === id ? updated : x),
      syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("notes", updated);
    triggerImmediateSync();
  }

  async function changeUrgency(id, urgency) {
    const n = notes.find(n => n.id === id); if (!n) return;
    const updated = { ...n, urgency, sync_status: "pending" };
    setData(d => ({ ...d, notes: (d.notes || []).map(x => x.id === id ? updated : x), syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
    await offlineSave("notes", updated);
    triggerImmediateSync();
  }

  async function deleteNote(id) {
    const ok = await confirm("Delete this note?", { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    setData(d => ({ ...d, syncQueue: [{ id: genId(), table: "notes", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])], notes: (d.notes || []).filter(n => n.id !== id) }));
    setToast("Note deleted");
    triggerImmediateSync();
  }

  async function deleteNoteMedia(noteId, mediaId) {
    const note = notes.find(n => n.id === noteId); if (!note) return;
    const updated = { ...note, media: (note.media || []).filter(m => m.id !== mediaId), sync_status: "pending" };
    setData(d => ({
      ...d,
      notes: (d.notes || []).map(n => n.id === noteId ? updated : n),
      syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("notes", updated);
    triggerImmediateSync();
  }

  const unresolvedCount = notes.filter(n => !n.resolved).length;
  const criticalCount   = notes.filter(n => !n.resolved && n.urgency === "Critical").length;
  const overdueCount    = notes.filter(n => !n.resolved && n.resolve_by && n.resolve_by < today).length;

  const filtered = notes
    .filter(n => filterStatus === "All" ? true : filterStatus === "Resolved" ? n.resolved : !n.resolved)
    .filter(n => filterUrgency === "All" || (n.urgency || "Normal") === filterUrgency)
    .filter(n => !search || [n.client, n.note].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => { const u = { Critical: 0, Urgent: 1, Normal: 2 }; if (a.resolved !== b.resolved) return a.resolved ? 1 : -1; return (u[a.urgency || "Normal"] || 2) - (u[b.urgency || "Normal"] || 2); });

  // ── Shared form JSX (rendered at top for NEW, in-place for EDIT) ──
  // Plain function returning JSX (not a component) so inputs keep focus.
  function renderNoteForm(isEdit) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Note" : "New Note"}</p>

        <ClientSelector label="Client" value={form.client_id} onChange={v => setForm(f => ({ ...f, client_id: v }))} clients={clients} />

        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-500">Linked Contacts</label>
          <button type="button" onClick={() => setShowContactPicker(true)}
            className="w-full flex items-center gap-2 rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm text-left hover:border-red-300 transition-colors min-h-[52px]">
            <Users size={16} className="text-slate-400 shrink-0" />
            {linkedContactIds.length === 0
              ? <span className="text-slate-400">Tap to link people you met…</span>
              : <span className="font-bold text-slate-700">{linkedContactIds.length} contact{linkedContactIds.length !== 1 ? "s" : ""} linked</span>}
          </button>
          {linkedContactIds.length > 0 && (
            <div className="mt-2">
              <LinkedContactsDisplay
                contactIds={linkedContactIds}
                contacts={contacts}
                onRemove={removeLinkedContact}
                size="md"
              />
            </div>
          )}
        </div>

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

        {isEdit && existingMedia.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-500">Current Photos / Videos</label>
            <MediaGallery media={existingMedia} onDelete={removeExistingMedia} />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-500">{isEdit ? "Add More Photos / Videos" : "Attach Photos / Videos"}</label>
          <MediaPicker onAdd={addMedia} />
          <MediaGallery media={pendingMedia} onDelete={removeMedia} />
        </div>

        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveNote}>
            {isEdit ? <Save size={15} /> : <Plus size={15} />}
            {isEdit ? "Update Note" : `Add Note${pendingMedia.length > 0 ? ` + ${pendingMedia.length} file${pendingMedia.length !== 1 ? "s" : ""}` : ""}`}
          </Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {!selectMode ? (
        <div className="flex items-center justify-between">
          <PageHeader title="Field Notes" subtitle={`${unresolvedCount} unresolved · ${notes.length} total`} />
          <div className="flex gap-2">
            {notes.length > 0 && (
              <Btn size="sm" variant="secondary" onClick={enterSelectMode}>
                <FileDown size={14} /> Export
              </Btn>
            )}
            <Btn size="sm" onClick={() => { if (showForm || editId) resetForm(); else setShowForm(true); }}>
              {(showForm || editId) ? <X size={15} /> : <Plus size={15} />}{(showForm || editId) ? "Cancel" : "Add"}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-red-200 p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-base font-black text-slate-900">{selectedIds.size} selected</p>
              <p className="text-xs text-slate-400">Tap notes to select for export</p>
            </div>
            <button onClick={exitSelectMode} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => selectAllVisible(filtered)} className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 min-h-[40px]">
              Select All Visible ({filtered.length})
            </button>
            <button onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0} className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40 min-h-[40px]">
              Clear
            </button>
            <button onClick={() => setShowExportMenu(true)} disabled={selectedIds.size === 0 || exporting} className="flex-1 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-40 min-h-[40px]" style={{ background: "#8B1A1A" }}>
              <FileDown size={14} className="inline mr-1" /> Export ({selectedIds.size})
            </button>
          </div>
          {exporting && (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <motion.div className="h-full" style={{ background: "#8B1A1A" }} initial={{ width: 0 }} animate={{ width: `${exportProgress}%` }} transition={{ duration: 0.3 }} />
              </div>
              <p className="text-xs text-slate-500 mt-1 text-center">Generating export… {exportProgress}%</p>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showExportMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExportMenu(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100" style={{ background: "#F7F3F3" }}>
                <p className="text-base font-black text-slate-900">Export {selectedIds.size} Note{selectedIds.size !== 1 ? "s" : ""}</p>
                <p className="text-xs text-slate-500 mt-0.5">Choose your format</p>
              </div>
              <div className="divide-y divide-slate-100">
                <button onClick={() => handleExport("pdf")} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 min-h-[68px]">
                  <div className="w-11 h-11 rounded-xl bg-red-100 text-red-700 flex items-center justify-center text-xl shrink-0">📄</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900">PDF Report</p>
                    <p className="text-xs text-slate-500">Polished, with embedded photos.</p>
                  </div>
                </button>
                <button onClick={() => handleExport("excel")} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 min-h-[68px]">
                  <div className="w-11 h-11 rounded-xl bg-green-100 text-green-700 flex items-center justify-center text-xl shrink-0">📊</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900">Excel Workbook</p>
                    <p className="text-xs text-slate-500">Filterable, for strategy sessions.</p>
                  </div>
                </button>
                <button onClick={() => handleExport("both")} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 min-h-[68px]">
                  <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl shrink-0">📦</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900">Both</p>
                    <p className="text-xs text-slate-500">PDF + Excel.</p>
                  </div>
                </button>
              </div>
              <button onClick={() => setShowExportMenu(false)} className="w-full p-3 text-sm font-bold text-slate-500 hover:bg-slate-50 min-h-[48px]">Cancel</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContactPicker && (
          <ContactPicker
            contacts={contacts}
            selectedIds={linkedContactIds}
            onChange={setLinkedContactIds}
            onClose={() => setShowContactPicker(false)}
          />
        )}
      </AnimatePresence>

      {!selectMode && (criticalCount > 0 || overdueCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {criticalCount > 0 && <div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold border" style={{ background: NOTE_URGENCY.Critical.bg, color: NOTE_URGENCY.Critical.text, borderColor: NOTE_URGENCY.Critical.border }}>🚨 {criticalCount} Critical</div>}
          {overdueCount > 0 && <div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold border" style={{ background: NOTE_URGENCY.Urgent.bg, color: NOTE_URGENCY.Urgent.text, borderColor: NOTE_URGENCY.Urgent.border }}>⏰ {overdueCount} Overdue</div>}
        </div>
      )}

      {/* Top form: NEW notes only. Edits render in-place in the list below. */}
      <AnimatePresence>
        {showForm && !editId && !selectMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderNoteForm(false)}
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
          // ── Edit-in-place: the form replaces the card at its position ──
          if (editId === n.id && !selectMode) {
            return (
              <motion.div key={n.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {renderNoteForm(true)}
              </motion.div>
            );
          }

          const urg      = NOTE_URGENCY[n.urgency || "Normal"] || NOTE_URGENCY.Normal;
          const isOverdue = !n.resolved && n.resolve_by && n.resolve_by < today;
          const isSelected = selectedIds.has(n.id);
          return (
            <Card key={n.id}
              className={`overflow-hidden transition-all ${selectMode && isSelected ? "ring-2 ring-red-500" : ""}`}
              style={{ borderLeft: "3px solid " + urg.dot }}
              onClick={selectMode ? () => toggleSelect(n.id) : undefined}>
              <div className={`p-4 ${selectMode ? "cursor-pointer" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  {selectMode && (
                    <div className="shrink-0 mt-0.5">
                      {isSelected ? <CheckSquare size={22} className="text-red-600" /> : <Square size={22} className="text-slate-300" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className={"text-base font-bold " + (n.resolved ? "text-slate-400 line-through" : "text-slate-900")}>{n.client || "General Note"}</p>
                      <UrgencyBadge urgency={n.urgency || "Normal"} />
                      {n.resolved && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Resolved</span>}
                      {isOverdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Overdue</span>}
                    </div>
                    <p className={"text-sm leading-relaxed break-words " + (n.resolved ? "text-slate-400" : "text-slate-600")}>{n.note}</p>

                    {(n.linked_contact_ids || []).length > 0 && (
                      <div className="mt-2">
                        <LinkedContactsDisplay contactIds={n.linked_contact_ids} contacts={contacts} size="sm" />
                      </div>
                    )}

                    {n.resolve_by && !n.resolved && <p className={"mt-1 text-sm font-medium " + (isOverdue ? "text-red-600" : "text-slate-400")}>Resolve by: {smartDate(n.resolve_by)}</p>}
                    {n.resolved && n.resolved_at && <p className="mt-1 text-xs text-slate-400">Resolved {new Date(n.resolved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>}
                    {(n.media || []).length > 0 && <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Paperclip size={11} />{n.media.length} attachment{n.media.length !== 1 ? "s" : ""}</div>}
                    {!selectMode && <MediaGallery media={n.media || []} onDelete={mid => deleteNoteMedia(n.id, mid)} />}
                    <p className="mt-1.5 text-xs text-slate-400">{n.created_at ? new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                    {n.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                  </div>
                  {!selectMode && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(n); }} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }} className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
                {!selectMode && !n.resolved && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      {Object.keys(NOTE_URGENCY).map(u2 => (
                        <button key={u2} onClick={(e) => { e.stopPropagation(); changeUrgency(n.id, u2); }}
                          className="rounded-lg px-3 py-1.5 text-sm font-bold border transition-all min-h-[40px]"
                          style={(n.urgency || "Normal") === u2 ? { background: NOTE_URGENCY[u2].bg, color: NOTE_URGENCY[u2].text, borderColor: NOTE_URGENCY[u2].dot } : { background: "#F8FAFC", color: "#CBD5E1", borderColor: "#E2E8F0" }}>
                          {u2}
                        </button>
                      ))}
                    </div>
                    <Btn size="sm" variant="success" onClick={(e) => { e.stopPropagation(); resolveNote(n.id); }}><Check size={13} /> Resolve</Btn>
                  </div>
                )}
                {!selectMode && n.resolved && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <button onClick={(e) => { e.stopPropagation(); unresolveNote(n.id); }} className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-1">Mark as unresolved</button>
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
