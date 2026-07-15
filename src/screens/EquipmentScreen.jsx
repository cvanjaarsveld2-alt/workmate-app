// ─── Equipment Screen ─────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Edit2, Trash2, Wrench, MapPin, Users, Hash, Paperclip, ChevronRight, Share2 } from "lucide-react";
import { smartDate, genId, uploadPhotoToSupabase, daysDiff } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { ShareSheet } from "../components/ShareSheet";
import { Card, Btn, Field, SearchBar, FilterPills, Toast, Empty, PageHeader, ServiceBadge, useConfirm, ClientSelector } from "../components/ui";
import { MediaPicker, MediaGallery } from "../components/MediaComponents";
import { DetailSheet, DetailRow } from "../components/DetailSheet";
import { ImageViewer } from "../components/ImageViewer";

// ─── Show-more text (full info on tap, no silent clipping) ──────────────────
function ExpandableText({ text, limit = 110, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > limit;
  const display = isLong && !expanded ? text.slice(0, limit).trimEnd() + "…" : text;
  return (
    <div className={className}>
      <p className="text-sm text-slate-500 break-words whitespace-pre-wrap italic">{display}</p>
      {isLong && (
        <button type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
          className="mt-1.5 inline-block text-xs font-bold px-2 py-1 rounded-full not-italic"
          style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          {expanded ? "▲ Show less" : "▼ Show more"}
        </button>
      )}
    </div>
  );
}

export function EquipmentScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], isOnline, quickAddTrigger, searchSeed }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch]     = useState("");
  const [detailEq, setDetailEq] = useState(null);
  const [shareSheet, setShareSheet] = useState(null);
  const [viewerImages, setViewerImages] = useState(null);
  const [filter, setFilter]     = useState("All");
  const [editId, setEditId]     = useState(null);
  const [toast, setToast]       = useState("");
  const [form, setForm] = useState({ name: "", type: "", make: "", model: "", serial: "", location: "", client: "", client_id: null, service_due: "", notes: "" });
  const [pendingMedia, setPendingMedia] = useState([]);
  const { confirm, dialog } = useConfirm();
  const equipment = (data.equipment || []).filter(e => e.user_id === userId || e.assigned_to_user_id === userId);

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Equipment") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  // ── Global search handoff: carry the term into this screen's search box ──
  useEffect(() => {
    if (!searchSeed?.ts) return;
    setSearch(searchSeed.term || "");
  }, [searchSeed?.ts]);

  function resetForm() { setForm({ name: "", type: "", make: "", model: "", serial: "", location: "", client: "", client_id: null, service_due: "", notes: "" }); setEditId(null); setShowForm(false); setPendingMedia([]); }
  function addMedia(m)     { setPendingMedia(pm => [...pm, m]); }
  function removeMedia(id) { setPendingMedia(pm => pm.filter(m => m.id !== id)); }

  async function saveEquipment() {
    if (!form.name.trim()) { setToast("Equipment name is required"); return; }
    if (editId) {
      const existing = equipment.find(e => e.id === editId);
      const cleanForm = { ...form, service_due: form.service_due || null };
      let newUploaded = [];
      if (isOnline && pendingMedia.length > 0) {
        newUploaded = await Promise.all(pendingMedia.map(async m => {
          const path = `equipment/${editId}/${m.id}`;
          const url = await uploadPhotoToSupabase(m.file || m.base64, path);
          return url ? { ...m, url, base64: undefined, uploadStatus: "done" } : { ...m, uploadStatus: "pending" };
        }));
      } else {
        newUploaded = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
      }

      const allMedia = [...(existing?.media || []), ...newUploaded];
      const updated = { ...existing, ...cleanForm, media: allMedia, sync_status: "pending" };

      setData(d => ({
        ...d,
        equipment: (d.equipment || []).map(e => e.id === editId ? updated : e),
        syncQueue: [{ id: genId(), table: "equipment", action: "update", data: { ...updated, media: updated.media.map(m => ({ ...m, base64: undefined })) }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("equipment", updated);
      setToast("Equipment updated");
      triggerImmediateSync();
    } else {
      const cleanForm = { ...form, service_due: form.service_due || null };
      const itemId = genId();

      let uploadedMedia = [];
      if (isOnline && pendingMedia.length > 0) {
        uploadedMedia = await Promise.all(pendingMedia.map(async m => {
          const path = `equipment/${itemId}/${m.id}`;
          const url = await uploadPhotoToSupabase(m.file || m.base64, path);
          if (url) {
            setToast("Photo uploaded ✓");
            return { ...m, url, base64: undefined, uploadStatus: "done" };
          } else {
            setToast("Photo upload failed — check connection");
            return { ...m, uploadStatus: "failed" };
          }
        }));
      } else {
        uploadedMedia = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
      }

      const item = withTeamId({
        id: itemId,
        user_id: userId,
        ...cleanForm,
        media: uploadedMedia,
        created_at: new Date().toISOString(),
        sync_status: "pending",
      }, teamId);

      setData(d => ({
        ...d,
        equipment: [item, ...(d.equipment || [])],
        syncQueue: [{ id: genId(), table: "equipment", action: "insert", data: { ...item, media: item.media.map(m => ({ ...m, base64: undefined })) }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("equipment", item);
      setToast("Equipment added");
      triggerImmediateSync();
    }
    resetForm();
  }

  // Deleting an equipment photo queues the update for Supabase sync.
  async function deleteEquipMedia(equipId, mediaId) {
    const eq = equipment.find(e => e.id === equipId); if (!eq) return;
    const updated = { ...eq, media: (eq.media || []).filter(m => m.id !== mediaId), sync_status: "pending" };
    setData(d => ({
      ...d,
      equipment: (d.equipment || []).map(e => e.id === equipId ? updated : e),
      syncQueue: [{ id: genId(), table: "equipment", action: "update", data: { ...updated, media: updated.media.map(m => ({ ...m, base64: undefined })) }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("equipment", updated);
    triggerImmediateSync();
  }

  async function deleteEquipment(id, name) {
    const ok = await confirm(`Delete ${name}?`, { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    await deleteRecord("equipment", id, userId, setData);
    setToast("Equipment deleted");
  }

  function startEdit(e) {
    setForm({ name: e.name || "", type: e.type || "", make: e.make || "", model: e.model || "", serial: e.serial || "", location: e.location || "", client: e.client || "", client_id: e.client_id || null, service_due: e.service_due || "", notes: e.notes || "" });
    setPendingMedia([]); setEditId(e.id); setShowForm(true);
  }

  // ── Shared form: rendered at top for NEW, in-place for EDIT ──
  function renderEquipForm(isEdit) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Equipment" : "Register Equipment"}</p>
        <Field label="Equipment Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Main Compressor Unit" required />
        <Field label="Type / Category" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} placeholder="e.g. Compressor, Generator…" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make / Brand" value={form.make} onChange={v => setForm(f => ({ ...f, make: v }))} placeholder="e.g. Atlas Copco" />
          <Field label="Model" value={form.model} onChange={v => setForm(f => ({ ...f, model: v }))} placeholder="e.g. GA110" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-500">Serial Number</label>
          <div className="relative">
            <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={form.serial} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} placeholder="Serial / Asset number"
              className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pl-9 text-base outline-none focus:border-red-300 focus:bg-white transition-colors font-mono min-h-[52px]" />
          </div>
        </div>
        <Field label="Location / Site" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="e.g. Pump Room B" />
        <ClientSelector label="Client / Site" value={form.client_id}
                  onChange={v => {
                    const cl = (data.clients || []).find(c => c.id === v);
                    setForm(f => ({ ...f, client_id: v || null, client: cl ? cl.company : "" }));
                  }}
                  clients={(data.clients || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId)} placeholder="Select client…" />
        <Field label="Next Service Due" type="date" value={form.service_due} onChange={v => setForm(f => ({ ...f, service_due: v }))} />
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Additional notes…" multiline />
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-500">Photos / Videos</label>
          <MediaPicker onAdd={addMedia} />
          {pendingMedia.length > 0 && <><p className="mt-2 text-sm text-slate-400">{pendingMedia.length} file{pendingMedia.length !== 1 ? "s" : ""} ready</p><MediaGallery media={pendingMedia} onDelete={removeMedia} /></>}
          {isEdit && (equipment.find(e => e.id === editId)?.media || []).length > 0 && <><p className="mt-2 text-sm font-bold text-slate-500">Existing photos:</p><MediaGallery media={equipment.find(e => e.id === editId)?.media || []} onDelete={mid => deleteEquipMedia(editId, mid)} /></>}
        </div>
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveEquipment}><Save size={15} />{isEdit ? "Update" : "Register"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  const filtered = equipment
    .filter(e => { const d = e.service_due ? daysDiff(e.service_due) : null; if (filter === "Overdue") return d !== null && d < 0; if (filter === "Due Soon") return d !== null && d >= 0 && d <= 14; if (filter === "OK") return d === null || d > 14; return true; })
    .filter(e => !search || [e.name, e.type, e.make, e.model, e.serial, e.location, e.client].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  const overdueCount  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) < 0).length;
  const dueSoonCount  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) >= 0 && daysDiff(e.service_due) <= 14).length;

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
          const eq = (data.equipment || []).find(e => e.id === shareSheet.id);
          if (!eq) return;
          const now = new Date().toISOString();
          const updated = { ...eq, sync_status: "pending" };
          setData(d => ({
            ...d,
            equipment: (d.equipment || []).map(e => e.id === shareSheet.id ? updated : e),
            syncQueue: [{ id: genId(), table: "equipment", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
          }));
          triggerImmediateSync();
          setToast("Equipment shared with " + (email?.split("@")[0] || email));
          setShareSheet(null);
        }}
      />
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Equipment detail sheet ── */}
      <DetailSheet
        open={!!detailEq}
        onClose={() => setDetailEq(null)}
        title={detailEq?.name || ""}
        subtitle={detailEq ? [detailEq.type, detailEq.make, detailEq.model].filter(Boolean).join(" · ") : ""}
        primaryActions={detailEq && (detailEq.media || []).length > 0 && (
          <button
            onClick={() => setViewerImages({ list: (detailEq.media || []).map(m => ({ url: m.url || m, caption: detailEq.name })), startIndex: 0 })}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
            style={{ background: "#8B1A1A" }}>
            <Paperclip size={16} /> View {(detailEq.media || []).length} photo{(detailEq.media || []).length !== 1 ? "s" : ""}
          </button>
        )}
        secondaryActions={detailEq && (
          <>
            <button onClick={() => { const e = detailEq; setDetailEq(null); startEdit(e); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={() => { const id = detailEq.id; const nm = detailEq.name; setDetailEq(null); deleteEquipment(id, nm); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-red-100 bg-white text-red-600 min-h-[48px]">
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      >
        {detailEq && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {detailEq.serial && <DetailRow label="Serial #" value={detailEq.serial} mono />}
              {detailEq.client && <DetailRow label="Client" value={detailEq.client} />}
              {detailEq.location && <DetailRow label="Location" value={detailEq.location} />}
              {detailEq.service_due && <DetailRow label="Service due" value={smartDate(detailEq.service_due)} />}
              {detailEq.installed_date && <DetailRow label="Installed" value={smartDate(detailEq.installed_date)} />}
            </div>

            {detailEq.notes && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 border border-slate-100">{detailEq.notes}</p>
              </div>
            )}

            {(detailEq.media || []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Photos · tap to enlarge</p>
                <div className="grid grid-cols-2 gap-2">
                  {(detailEq.media || []).map((m, i) => {
                    const url = m.url || m;
                    return (
                      <button key={i}
                        onClick={() => setViewerImages({ list: (detailEq.media || []).map(mm => ({ url: mm.url || mm, caption: detailEq.name })), startIndex: i })}
                        className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 active:opacity-80">
                        <img src={url} alt="" className="w-full h-32 object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </DetailSheet>

      {/* ── Fullscreen image viewer ── */}
      <AnimatePresence>
        {viewerImages && (
          <ImageViewer
            images={viewerImages.list}
            startIndex={viewerImages.startIndex || 0}
            onClose={() => setViewerImages(null)}
          />
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Equipment" subtitle={`${equipment.length} registered · ${overdueCount} overdue`} />
        <Btn size="sm" onClick={() => { if (showForm || editId) resetForm(); else setShowForm(true); }}>
          {(showForm || editId) ? <X size={15} /> : <Plus size={15} />}{(showForm || editId) ? "Cancel" : "Add"}
        </Btn>
      </div>

      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {overdueCount > 0 && <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center"><p className="text-2xl font-black text-red-700">{overdueCount}</p><p className="text-sm font-bold text-red-500">Overdue Service</p></div>}
          {dueSoonCount > 0 && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center"><p className="text-2xl font-black text-amber-700">{dueSoonCount}</p><p className="text-sm font-bold text-amber-500">Due in 14 Days</p></div>}
        </div>
      )}

      {/* Top form: NEW equipment only. Edits render in place. */}
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderEquipForm(false)}
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search name, serial, location…" />
      <FilterPills options={["All", "Overdue", "Due Soon", "OK"]} value={filter} onChange={setFilter} dangerValue="Overdue" />
      {filtered.length === 0 && <Empty title="No equipment found" text="Register your first piece of equipment." icon={Wrench} />}

      <div className="space-y-2">
        {filtered.map(eq => {
          // ── Edit-in-place: form replaces this item at its list position ──
          if (editId === eq.id) {
            return (
              <motion.div key={eq.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {renderEquipForm(true)}
              </motion.div>
            );
          }

          const mediaCount = (eq.media || []).length;
          return (
            <Card key={eq.id}
              className="p-4 active:bg-slate-50 cursor-pointer"
              onClick={() => setDetailEq(eq)}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-base font-black text-slate-900">{eq.name}</p>
                    {eq.type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{eq.type}</span>}
                    {eq.service_due && <ServiceBadge dueDate={eq.service_due} />}
                  </div>
                  {(eq.make || eq.model) && <p className="text-sm text-slate-500">{[eq.make, eq.model].filter(Boolean).join(" · ")}</p>}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {eq.location && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><MapPin size={11} />{eq.location}</span>}
                    {eq.client && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Users size={11} />{eq.client}</span>}
                    {mediaCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"><Paperclip size={10} />{mediaCount}</span>}
                    {eq.sync_status === "pending" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Syncing…</span>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0 mt-1" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
