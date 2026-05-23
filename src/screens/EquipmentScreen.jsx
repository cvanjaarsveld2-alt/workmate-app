// ─── Equipment Screen ─────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Edit2, Trash2, Wrench, MapPin, Users, Hash, Paperclip } from "lucide-react";
import { smartDate, genId, uploadPhotoToSupabase, daysDiff } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { Card, Btn, Field, SearchBar, FilterPills, Toast, Empty, PageHeader, ServiceBadge, useConfirm } from "../components/ui";
import { MediaPicker, MediaGallery } from "../components/MediaComponents";

export function EquipmentScreen({ data, setData, userId, isOnline }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("All");
  const [editId, setEditId]     = useState(null);
  const [toast, setToast]       = useState("");
  const [form, setForm] = useState({ name: "", type: "", make: "", model: "", serial: "", location: "", client: "", service_due: "", notes: "" });
  const [pendingMedia, setPendingMedia] = useState([]);
  const { confirm, dialog } = useConfirm();
  const equipment = data.equipment || [];

  function resetForm() { setForm({ name: "", type: "", make: "", model: "", serial: "", location: "", client: "", service_due: "", notes: "" }); setEditId(null); setShowForm(false); setPendingMedia([]); }
  function addMedia(m)     { setPendingMedia(pm => [...pm, m]); }
  function removeMedia(id) { setPendingMedia(pm => pm.filter(m => m.id !== id)); }

  async function saveEquipment() {
    if (!form.name.trim()) { setToast("Equipment name is required"); return; }
    if (editId) {
      const existing = equipment.find(e => e.id === editId);
      const cleanForm = { ...form, service_due: form.service_due || null };
      // Step 1: Upload new photos FIRST
      let newUploaded = [];
      if (isOnline && pendingMedia.length > 0) {
        newUploaded = await Promise.all(pendingMedia.map(async m => {
          const path = `equipment/${editId}/${m.id}`;
          const url = await uploadPhotoToSupabase(m.base64, path);
          return url ? { ...m, url, base64: undefined, uploadStatus: "done" } : { ...m, uploadStatus: "pending" };
        }));
      } else {
        newUploaded = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
      }

      // Step 2: Build final record with all media (existing + new uploads)
      const allMedia = [...(existing?.media || []), ...newUploaded];
      const updated = { ...existing, ...cleanForm, media: allMedia, sync_status: "pending" };

      // Step 3: Save with photos already included
      setData(d => ({
        ...d,
        equipment: (d.equipment || []).map(e => e.id === editId ? updated : e),
        syncQueue: [{ id: genId(), table: "equipment", action: "update", data: { ...updated, media: updated.media.map(m => ({ ...m, base64: undefined })) }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("equipment", updated);
      setToast("Equipment updated");
    triggerImmediateSync();
    } else {
      // Convert empty date strings to null — Supabase date columns reject empty strings
      const cleanForm = { ...form, service_due: form.service_due || null };
      // Generate ID first so we can use it for photo paths
      const itemId = genId();

      // Step 1: Upload photos FIRST (before creating the record)
      let uploadedMedia = [];
      if (isOnline && pendingMedia.length > 0) {
        uploadedMedia = await Promise.all(pendingMedia.map(async m => {
          const path = `equipment/${itemId}/${m.id}`;
          const url = await uploadPhotoToSupabase(m.base64, path);
          if (url) {
            setToast("Photo uploaded ✓");
            return { ...m, url, base64: undefined, uploadStatus: "done" };
          } else {
            setToast("Photo upload failed — check connection");
            return { ...m, uploadStatus: "failed" };
          }
        }));
      } else {
        // Offline: keep base64 for now, mark as pending upload
        uploadedMedia = pendingMedia.map(m => ({ ...m, uploadStatus: "pending" }));
      }

      // Step 2: Create record with photos already included
      const item = {
        id: itemId,
        user_id: userId,
        ...cleanForm,
        media: uploadedMedia,
        created_at: new Date().toISOString(),
        sync_status: "pending",
      };

      // Step 3: Save locally and queue for sync (with photos already in the record)
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

  async function deleteEquipMedia(equipId, mediaId) {
    const eq = equipment.find(e => e.id === equipId); if (!eq) return;
    const updated = { ...eq, media: (eq.media || []).filter(m => m.id !== mediaId) };
    setData(d => ({ ...d, equipment: (d.equipment || []).map(e => e.id === equipId ? updated : e) }));
    await offlineSave("equipment", updated);
  }

  async function deleteEquipment(id, name) {
    const ok = await confirm(`Delete ${name}?`, { confirmLabel: "Delete" });
    if (!ok) return;
    setData(d => ({ ...d, syncQueue: [{ id: genId(), table: "equipment", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])], equipment: (d.equipment || []).filter(e => e.id !== id) }));
    setToast("Equipment deleted");
    triggerImmediateSync();
  }

  function startEdit(e) {
    setForm({ name: e.name || "", type: e.type || "", make: e.make || "", model: e.model || "", serial: e.serial || "", location: e.location || "", client: e.client || "", service_due: e.service_due || "", notes: e.notes || "" });
    setPendingMedia([]); setEditId(e.id); setShowForm(true);
  }

  const filtered = equipment
    .filter(e => { const d = e.service_due ? daysDiff(e.service_due) : null; if (filter === "Overdue") return d !== null && d < 0; if (filter === "Due Soon") return d !== null && d >= 0 && d <= 14; if (filter === "OK") return d === null || d > 14; return true; })
    .filter(e => !search || [e.name, e.type, e.make, e.model, e.serial, e.location, e.client].some(x => x?.toLowerCase().includes(search.toLowerCase())));

  const overdueCount  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) < 0).length;
  const dueSoonCount  = equipment.filter(e => e.service_due && daysDiff(e.service_due) !== null && daysDiff(e.service_due) >= 0 && daysDiff(e.service_due) <= 14).length;

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>
      <div className="flex items-center justify-between">
        <PageHeader title="Equipment" subtitle={`${equipment.length} registered · ${overdueCount} overdue`} />
        <Btn size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? "Cancel" : "Add"}</Btn>
      </div>

      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {overdueCount > 0 && <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center"><p className="text-2xl font-black text-red-700">{overdueCount}</p><p className="text-sm font-bold text-red-500">Overdue Service</p></div>}
          {dueSoonCount > 0 && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center"><p className="text-2xl font-black text-amber-700">{dueSoonCount}</p><p className="text-sm font-bold text-amber-500">Due in 14 Days</p></div>}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <p className="text-base font-black text-slate-800">{editId ? "Edit Equipment" : "Register Equipment"}</p>
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
              <Field label="Client / Site" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Linked client" />
              <Field label="Next Service Due" type="date" value={form.service_due} onChange={v => setForm(f => ({ ...f, service_due: v }))} />
              <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Additional notes…" multiline />
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Photos / Videos</label>
                <MediaPicker onAdd={addMedia} />
                {pendingMedia.length > 0 && <><p className="mt-2 text-sm text-slate-400">{pendingMedia.length} file{pendingMedia.length !== 1 ? "s" : ""} ready</p><MediaGallery media={pendingMedia} onDelete={removeMedia} /></>}
                {editId && (equipment.find(e => e.id === editId)?.media || []).length > 0 && <><p className="mt-2 text-sm font-bold text-slate-500">Existing photos:</p><MediaGallery media={equipment.find(e => e.id === editId)?.media || []} onDelete={mid => deleteEquipMedia(editId, mid)} /></>}
              </div>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveEquipment}><Save size={15} />{editId ? "Update" : "Register"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search name, serial, location…" />
      <FilterPills options={["All", "Overdue", "Due Soon", "OK"]} value={filter} onChange={setFilter} dangerValue="Overdue" />
      {filtered.length === 0 && <Empty title="No equipment found" text="Register your first piece of equipment." icon={Wrench} />}

      <div className="space-y-2">
        {filtered.map(eq => (
          <Card key={eq.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-base font-black text-slate-900">{eq.name}</p>
                  {eq.type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{eq.type}</span>}
                  {eq.service_due && <ServiceBadge dueDate={eq.service_due} />}
                </div>
                {(eq.make || eq.model) && <p className="text-sm text-slate-500">{[eq.make, eq.model].filter(Boolean).join(" · ")}</p>}
                {eq.serial && <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Hash size={11} className="text-slate-400" /><span className="text-sm font-mono font-bold text-slate-600">{eq.serial}</span></div>}
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {eq.location && <span className="inline-flex items-center gap-1 text-sm text-slate-400"><MapPin size={12} />{eq.location}</span>}
                  {eq.client && <span className="inline-flex items-center gap-1 text-sm text-slate-400"><Users size={12} />{eq.client}</span>}
                </div>
                {eq.service_due && <p className="mt-1 text-sm text-slate-400">Service due: {smartDate(eq.service_due)}</p>}
                {eq.notes && <p className="mt-1 text-sm text-slate-500 italic">{eq.notes}</p>}
                {(eq.media || []).length > 0 && <><div className="mt-1 flex items-center gap-1 text-sm text-slate-400"><Paperclip size={12} />{eq.media.length} photo{eq.media.length !== 1 ? "s" : ""}</div><MediaGallery media={eq.media || []} onDelete={mid => deleteEquipMedia(eq.id, mid)} /></>}
                {eq.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => startEdit(eq)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15} /></button>
                <button onClick={() => deleteEquipment(eq.id, eq.name)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15} /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
