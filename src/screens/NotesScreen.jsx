// ─── Notes Screen ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, Trash2, Clipboard, Paperclip, Edit2, Save, FileDown, CheckSquare, Square, Users, ChevronRight, Send, Mail, Share2 } from "lucide-react";
import { NOTE_URGENCY, URGENCY_ESCALATION } from "../lib/constants";
import { todayISO, smartDate, genId, uploadPhotoToSupabase } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { ShareSheet } from "../components/ShareSheet";
import { scheduleNotificationsViaSW } from "../lib/notifications";
import { VoiceInput } from "../components/VoiceInput";
import { Card, Btn, Field, SearchBar, FilterPills, Toast, Empty, PageHeader, UrgencyBadge, useConfirm, ClientSelector } from "../components/ui";
import { MediaPicker, MediaGallery } from "../components/MediaComponents";
import { ContactPicker, LinkedContactsDisplay } from "../components/ContactPicker";
import { DetailSheet, DetailRow } from "../components/DetailSheet";
import { ImageViewer } from "../components/ImageViewer";
import { NoteToFollowupBtn } from "../components/NoteToFollowup";
// NotesExport loaded lazily to keep initial bundle small

export function NotesScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], isOnline, quickAddTrigger, searchSeed }) {
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
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ company: "", branch: "" });
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [detailNote, setDetailNote]     = useState(null);
  const [shareSheet, setShareSheet]     = useState(null);
  const [viewerImages, setViewerImages] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [notesPack, setNotesPack] = useState(null); // { blob, url, filename } — PDF ready to preview/share
  const { confirm, dialog } = useConfirm();
  const notes    = (data.notes    || []).filter(n => n.user_id === userId || n.assigned_to_user_id === userId);
  const contacts = data.contacts || [];
  const clients  = data.clients  || [];
  const today    = todayISO();

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Notes") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  // ── Global search handoff: carry the term into this screen's search box ──
  useEffect(() => {
    if (!searchSeed?.ts) return;
    setSearch(searchSeed.term || "");
  }, [searchSeed?.ts]);


  function addMedia(m)  { setPendingMedia(pm => [...pm, m]); }
  function removeMedia(id) { setPendingMedia(pm => pm.filter(m => m.id !== id)); }
  function removeExistingMedia(id) { setExistingMedia(em => em.filter(m => m.id !== id)); }
  function removeLinkedContact(id) { setLinkedContactIds(ids => ids.filter(x => x !== id)); }

  function resetForm() {
    setForm({ client_id: "", note: "", urgency: "Normal", resolve_by: "" });
    setPendingMedia([]);
    setExistingMedia([]);
    setLinkedContactIds([]);
    setShowNewClient(false);
    setNewClient({ company: "", branch: "" });
    setEditId(null);
    setShowForm(false);
  }

  // ── Create a contact on the fly from inside the Link Contacts sheet ──
  async function createContactInline(c) {
    if (!c.name?.trim()) return null;
    const item = withTeamId({
      id: genId(),
      user_id: userId,
      name: c.name.trim(),
      company: (c.company || "").trim(),
      title: "", email: "",
      phone: (c.phone || "").trim(),
      met_at: "", met_date: todayISO(),
      notes: "", card_photo_url: null,
      status: "lead",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    }, teamId);
    setData(d => ({
      ...d,
      contacts: [item, ...(d.contacts || [])],
      syncQueue: [{ id: genId(), table: "contacts", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("contacts", item);
    setToast(`Contact "${item.name}" added ✓`);
    triggerImmediateSync();
    return item.id;
  }

  // ── Create a client on the fly from inside the note form ──
  async function createClientInline() {
    if (!newClient.company.trim()) { setToast("Company name is required"); return; }
    const item = withTeamId({
      id: genId(),
      user_id: userId,
      company: newClient.company.trim(),
      branch: newClient.branch.trim(),
      contact: "", phone: "", email: "",
      stage: "New Lead",
      notes: "",
      source: "field_note",
      created_at: new Date().toISOString(),
      sync_status: "pending",
    }, teamId);
    setData(d => ({
      ...d,
      clients: [item, ...(d.clients || [])],
      syncQueue: [{ id: genId(), table: "clients", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("clients", item);
    setForm(f => ({ ...f, client_id: item.id }));
    setNewClient({ company: "", branch: "" });
    setShowNewClient(false);
    setToast(`Client "${item.company}" added ✓`);
    triggerImmediateSync();
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
      // Lazy load to keep bundle small
      const { exportNotesPDF, exportNotesExcel } = await import("../NotesExport");
      const exportOptions = {
        contacts,
        onProgress: ({ percent }) => setExportProgress(percent),
      };
      if (format === "pdf") {
        // PDF now builds in memory and opens the preview/share sheet instead
        // of auto-downloading — same one-tap flow as the Expenses finance pack.
        const { blob, filename } = await exportNotesPDF(selected, exportOptions);
        const url = URL.createObjectURL(blob);
        setNotesPack({ blob, url, filename, count: selected.length });
        exitSelectMode();
      } else if (format === "excel") {
        await exportNotesExcel(selected, exportOptions);
        setToast(`Exported ${selected.length} note${selected.length !== 1 ? "s" : ""} ✓`);
        exitSelectMode();
      } else if (format === "both") {
        const { blob, filename } = await exportNotesPDF(selected, { ...exportOptions, onProgress: ({ percent }) => setExportProgress(Math.round(percent / 2)) });
        await exportNotesExcel(selected, { ...exportOptions, onProgress: ({ percent }) => setExportProgress(50 + Math.round(percent / 2)) });
        const url = URL.createObjectURL(blob);
        setNotesPack({ blob, url, filename, count: selected.length });
        setToast("Excel downloaded — PDF ready below");
        exitSelectMode();
      }
    } catch (e) {
      console.error("Export failed:", e);
      setToast("Export failed: " + (e.message || "unknown error"));
    }
    setExporting(false);
    setExportProgress(0);
  }

  function closeNotesPack() {
    if (notesPack?.url) URL.revokeObjectURL(notesPack.url);
    setNotesPack(null);
  }

  function previewNotesPack() {
    if (!notesPack) return;
    window.open(notesPack.url, "_blank");
  }

  // Native share sheet — pick Mail, Outlook, WhatsApp, Drive, whatever
  // management actually uses. Falls back to a plain download on desktop.
  async function shareNotesPack() {
    if (!notesPack) return;
    const { blob, filename, count } = notesPack;
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: "PowerMate Field Notes Report",
          text: `Field notes report — ${count} note${count !== 1 ? "s" : ""}.`,
          files: [file],
        });
      } catch (e) {
        if (e.name !== "AbortError") console.warn("Share failed:", e);
      }
    } else {
      const a = document.createElement("a");
      a.href = notesPack.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setToast("PDF downloaded — attach it to your email manually");
    }
  }

  function emailNotesPack() {
    if (!notesPack) return;
    const { filename, count, url } = notesPack;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const body = `Hi,

Please find attached the field notes report covering ${count} note${count !== 1 ? "s" : ""}.

The PDF (${filename}) includes a summary by client and full detail for each note.

Kind regards`;

    setToast("PDF downloaded — attach it to the email that just opened");
    setTimeout(() => {
      window.open(`mailto:?subject=${encodeURIComponent("Field Notes Report")}&body=${encodeURIComponent(body)}`, "_blank");
    }, 500);
  }

  async function saveNote() {
    if (!form.note.trim()) { setToast("Please enter a note"); return; }
    if (!isOnline && pendingMedia.length > 0) { setToast("Connect to the internet before saving attachments"); return; }

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
          const url = await uploadPhotoToSupabase(m.file || m.base64, path);
          return url ? { ...m, url, base64: undefined, file: undefined, uploadStatus: "done" } : { ...m, uploadStatus: "pending" };
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
        const url = await uploadPhotoToSupabase(m.file || m.base64, path);
        return url ? { ...m, url, base64: undefined, file: undefined, uploadStatus: "done" } : { ...m, uploadStatus: "pending" };
      }));
    } else {
      uploadedMedia = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
    }

    const item = withTeamId({
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
    }, teamId);
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
    await deleteRecord("notes", id, userId, setData);
    setToast("Note deleted");
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

        <div>
          {!showNewClient ? (
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <ClientSelector label="Client" value={form.client_id} onChange={v => setForm(f => ({ ...f, client_id: v }))} clients={clients} />
              </div>
              <button type="button"
                onClick={() => setShowNewClient(true)}
                className="shrink-0 flex items-center gap-1 rounded-xl px-3 text-sm font-bold min-h-[52px] border-2 transition-colors"
                style={{ background: "#F8FAFC", color: "#64748B", borderColor: "#E2E8F0" }}>
                <Plus size={14} /> New
              </button>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-500">Client</label>
              <div className="rounded-xl bg-slate-50 border-2 border-slate-200 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#8B1A1A" }}>New Client</p>
                  <button type="button"
                    onClick={() => { setShowNewClient(false); setNewClient({ company: "", branch: "" }); }}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg">
                    ← Select existing instead
                  </button>
                </div>
                <Field label="Company" value={newClient.company} onChange={v => setNewClient(c => ({ ...c, company: v }))} placeholder="e.g. ACME Mining" required />
                <Field label="Branch / Site (optional)" value={newClient.branch} onChange={v => setNewClient(c => ({ ...c, branch: v }))} placeholder="e.g. Rustenburg Plant" />
                <Btn size="sm" className="w-full" onClick={createClientInline} disabled={!newClient.company.trim()}>
                  <Check size={14} /> Add &amp; Select
                </Btn>
              </div>
            </div>
          )}
        </div>

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
          const note = notes.find(n => n.id === shareSheet.id);
          if (!note) return;
          const now = new Date().toISOString();
          const updated = { ...note, assigned_to_user_id: uid, sync_status: "pending" };
          setData(d => ({
            ...d,
            notes: (d.notes || []).map(n => n.id === shareSheet.id ? updated : n),
            syncQueue: [{ id: genId(), table: "notes", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
          }));
          triggerImmediateSync();
          setToast("Note shared with " + (email?.split("@")[0] || email));
          setShareSheet(null);
        }}
      />
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Field Notes Report ready: preview, share, or email ── */}
      <AnimatePresence>
        {notesPack && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeNotesPack}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">

              <div className="flex justify-center pt-2.5 pb-1">
                <div className="w-12 h-1 rounded-full bg-slate-300" />
              </div>

              <div className="px-5 pt-2 pb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-base font-black text-slate-900">Field Notes Report Ready</p>
                  <p className="text-xs text-slate-500 truncate">{notesPack.count} note{notesPack.count !== 1 ? "s" : ""} · {notesPack.filename}</p>
                </div>
                <button onClick={closeNotesPack} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
                  <X size={20} />
                </button>
              </div>

              <div className="px-4 pb-3">
                <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50" style={{ aspectRatio: "1 / 1.2" }}>
                  <iframe src={notesPack.url} title="Field notes report preview" className="w-full h-full" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 text-center">Scroll to review · {notesPack.filename}</p>
              </div>

              <div className="px-4 py-3 border-t border-slate-100 space-y-2" style={{ background: "#F7F3F3" }}>
                <button onClick={shareNotesPack}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                  style={{ background: "#8B1A1A" }}>
                  <Send size={16} /> Share / Send (Mail, Outlook, iCloud, WhatsApp…)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={previewNotesPack}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
                    <FileDown size={14} /> Open PDF
                  </button>
                  <button onClick={emailNotesPack}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
                    <Mail size={14} /> Email
                  </button>
                </div>
                <p className="text-xs text-slate-400 text-center pt-0.5 leading-relaxed">
                  <strong>Share</strong> opens your device's share sheet — pick any email app to send to management.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Note detail sheet ── */}
      <DetailSheet
        open={!!detailNote}
        onClose={() => setDetailNote(null)}
        title={detailNote ? (detailNote.client || "General Note") : ""}
        subtitle={detailNote
          ? `${detailNote.urgency || "Normal"}${detailNote.resolve_by ? ` · Resolve by ${smartDate(detailNote.resolve_by)}` : ""}${detailNote.resolved ? " · Resolved" : ""}`
          : ""}
        primaryActions={detailNote && !detailNote.resolved && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { resolveNote(detailNote.id); setDetailNote(null); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
              style={{ background: "#15803D" }}>
              <Check size={14} /> Resolve
            </button>
            <div className="flex gap-1">
              {Object.keys(NOTE_URGENCY).map(u2 => (
                <button key={u2} onClick={() => { changeUrgency(detailNote.id, u2); setDetailNote(n => ({ ...n, urgency: u2 })); }}
                  className="flex-1 rounded-lg px-2 py-2 text-xs font-bold border transition-all min-h-[48px]"
                  style={(detailNote.urgency || "Normal") === u2 ? { background: NOTE_URGENCY[u2].bg, color: NOTE_URGENCY[u2].text, borderColor: NOTE_URGENCY[u2].dot } : { background: "#F8FAFC", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                  {u2.charAt(0)}
                </button>
              ))}
            </div>
          </div>
        )}
        secondaryActions={detailNote && (
          <>
            <button onClick={() => { setDetailNote(null); startEdit(detailNote); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={() => { const id = detailNote.id; setDetailNote(null); deleteNote(id); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-red-100 bg-white text-red-600 min-h-[48px]">
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      >
        {detailNote && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Note</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 border border-slate-100 leading-relaxed">
                {detailNote.note || <span className="text-slate-400 italic">(empty)</span>}
              </p>
            </div>
            <NoteToFollowupBtn note={detailNote} userId={userId} teamId={teamId} data={data} setData={setData} onDone={() => setToast("Follow-up created")} />

            {(detailNote.linked_contact_ids || []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Linked contacts</p>
                <LinkedContactsDisplay contactIds={detailNote.linked_contact_ids} contacts={contacts} size="sm" />
              </div>
            )}

            {(detailNote.media || []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Attachments · tap to enlarge</p>
                <div className="grid grid-cols-3 gap-2">
                  {detailNote.media.map((m, i) => (
                    <button key={m.id} onClick={() => setViewerImages({ list: detailNote.media.map(mm => ({ url: mm.url, caption: detailNote.client || "Note" })), startIndex: i })}
                      className="rounded-lg overflow-hidden border-2 border-slate-200 bg-slate-50 active:opacity-80 aspect-square">
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {detailNote.resolved && detailNote.resolved_at && (
                <DetailRow label="Resolved" value={new Date(detailNote.resolved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} />
              )}
              {detailNote.created_at && (
                <DetailRow label="Created" value={new Date(detailNote.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} />
              )}
            </div>

            {detailNote.resolved && (
              <button onClick={() => { unresolveNote(detailNote.id); setDetailNote(null); }}
                className="w-full text-sm text-slate-500 underline py-2">
                Mark as unresolved
              </button>
            )}
          </>
        )}
      </DetailSheet>

      <AnimatePresence>
        {viewerImages && (
          <ImageViewer images={viewerImages.list} startIndex={viewerImages.startIndex} onClose={() => setViewerImages(null)} />
        )}
      </AnimatePresence>

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
            onCreate={createContactInline}
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
          const mediaCount = (n.media || []).length;
          return (
            <Card key={n.id}
              className={`overflow-hidden transition-all ${selectMode && isSelected ? "ring-2 ring-red-500" : ""} ${!selectMode ? "active:bg-slate-50 cursor-pointer" : ""}`}
              style={{ borderLeft: "3px solid " + urg.dot }}
              onClick={selectMode ? () => toggleSelect(n.id) : () => setDetailNote(n)}>
              <div className="p-4">
                <div className="flex items-start gap-3">
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
                    <p className={"text-sm leading-relaxed break-words line-clamp-2 " + (n.resolved ? "text-slate-400" : "text-slate-600")}>{n.note}</p>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {n.resolve_by && !n.resolved && <p className={"text-xs " + (isOverdue ? "text-red-600 font-bold" : "text-slate-400")}>Resolve by {smartDate(n.resolve_by)}</p>}
                      {mediaCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"><Paperclip size={10} />{mediaCount}</span>}
                      {(n.linked_contact_ids || []).length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700"><Users size={10} />{(n.linked_contact_ids || []).length}</span>}
                      {n.sync_status === "pending" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Syncing…</span>}
                    </div>
                  </div>
                  {!selectMode && <ChevronRight size={18} className="text-slate-300 shrink-0 mt-1" />}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
