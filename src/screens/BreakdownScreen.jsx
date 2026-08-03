// ─── Breakdown & Repair Reports ──────────────────────────────────────────────
// Two report types sharing one engine:
//   • Breakdown — document what's wrong: photo(s) per item + faults + note
//   • Repair    — document the fix: photo(s) per item + what was done
// Each item holds MULTIPLE photos (2-3 angles). A repair report can stand alone
// or link to a breakdown (pulls its equipment/client, marks it resolved).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, ChevronRight, ChevronDown, AlertTriangle, Camera,
  Trash2, Wrench, ArrowLeft, Check, Search, CheckCircle2, Link2,
  Share2, FileText, FileType, LayoutGrid, ClipboardList,
} from "lucide-react";
import { BRAND, MAX_FILE_SIZE_MB } from "../lib/constants";
import { genId, todayISO, smartDate, uploadPhotoToSupabase, compressImage } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { offlineSave } from "../offline/offlineDb";
import { Card, Field, ClientSelector, Toast, Empty, PageHeader, useConfirm } from "../components/ui";
import { MediaPicker } from "../components/MediaComponents";
import { FAULT_GROUPS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "../lib/breakdownFaults";
import { EngineeringSections } from "./EngineeringSections";
import { haptic } from "../lib/haptics";
import { useExportProgress } from "../components/ExportProgress";

const BRAND_PRIMARY = BRAND.primary;

function severityMeta(v) { return SEVERITY_OPTIONS.find(s => s.value === v) || SEVERITY_OPTIONS[1]; }
function statusMeta(v)   { return STATUS_OPTIONS.find(s => s.value === v) || STATUS_OPTIONS[0]; }

// Normalise an item's photos into an array (handles old single-photo records)
function itemPhotos(it) {
  if (Array.isArray(it.photos)) return it.photos;
  if (it.photo_url || it._base64 || it._file) {
    return [{ id: it.id + "_p0", url: it.photo_url || null, _base64: it._base64 || null, _file: it._file || null }];
  }
  return [];
}

export function BreakdownScreen({ data, setData, userId, userEmail, teamId, teamMembers, onNavigate, mode = "breakdown" }) {
  const isRepair = mode === "repair";
  const [view, setView]       = useState("list");
  const [listMode, setListMode] = useState("list"); // "list" | "board" (breakdown only)
  const [editing, setEditing] = useState(null);
  const [toast, setToast]     = useState("");
  const { confirm, dialog } = useConfirm();

  const dataKey = isRepair ? "repairs" : "breakdowns";
  const tableName = isRepair ? "repair_reports" : "breakdown_reports";

  const reports = useMemo(
    () => (data[dataKey] || []).slice().sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")),
    [data[dataKey]]
  );

  function newReport(linkedBreakdown = null) {
    haptic.medium();
    const base = {
      id: genId(), title: "", reference: "", equipment: "", location: "",
      client_id: null, client_name: "",
      status: isRepair ? "resolved" : "open", severity: "medium",
      summary: "", items: [], report_date: todayISO(), engineering: {},
    };
    if (isRepair && linkedBreakdown) {
      base.linked_breakdown_id = linkedBreakdown.id;
      base.equipment   = linkedBreakdown.equipment || "";
      base.client_id   = linkedBreakdown.client_id || null;
      base.client_name = linkedBreakdown.client_name || "";
      base.reference   = linkedBreakdown.reference || "";
      base.title       = linkedBreakdown.title ? `Repair — ${linkedBreakdown.title}` : "";

      // Pre-fill a repair item for each distinct fault found in the breakdown,
      // so every fault gets a repair action logged against it. The fault seeds
      // the item heading; the technician adds the photo and "what was done".
      const seenFaults = new Set();
      const prefilled = [];
      for (const it of (Array.isArray(linkedBreakdown.items) ? linkedBreakdown.items : [])) {
        for (const fault of (it.faults || [])) {
          const key = fault.toLowerCase().trim();
          if (!key || seenFaults.has(key)) continue;
          seenFaults.add(key);
          prefilled.push({
            id: genId(),
            heading: fault,
            photos: [],
            faults: [],
            action: "",
            note: it.heading ? `From breakdown: ${it.heading}` : "",
            phase: "general",
            _fromFault: true,
          });
        }
      }
      if (prefilled.length > 0) base.items = prefilled;
    }
    setEditing(base);
    setView("edit");
  }

  function openReport(r) {
    haptic.light();
    setEditing({ ...r, engineering: r.engineering || {}, items: (Array.isArray(r.items) ? r.items : []).map(it => ({ ...it, photos: itemPhotos(it) })) });
    setView("edit");
  }

  async function saveReport(report) {
    const items = [];
    for (const it of report.items) {
      const photos = [];
      for (const p of itemPhotos(it)) {
        let url = p.url;
        if (!url && (p._file || p._base64)) {
          try {
            const path = `${dataKey}/${userId}/${report.id}/${p.id}.jpg`;
            url = await uploadPhotoToSupabase(p._file || p._base64, path);
          } catch (e) {
            console.warn("Photo upload failed:", e);
            url = p._base64 || null;
          }
        }
        photos.push({ id: p.id, url: url || null });
      }
      items.push({
        id: it.id,
        heading: it.heading || "",
        photos,
        faults: isRepair ? [] : (it.faults || []),
        action: isRepair ? (it.action || "") : "",
        note: it.note || "",
        phase: it.phase || "general",
      });
    }

    const clean = withTeamId({
      id: report.id, user_id: userId,
      title: report.title || (isRepair ? "Repair report" : "Breakdown report"),
      reference: report.reference || "", equipment: report.equipment || "",
      location: report.location || "", client_id: report.client_id || null,
      client_name: report.client_name || "",
      status: report.status || (isRepair ? "resolved" : "open"),
      severity: report.severity || "medium", summary: report.summary || "",
      items, report_date: report.report_date || todayISO(),
      engineering: report.engineering || {},
      ...(isRepair ? { linked_breakdown_id: report.linked_breakdown_id || null } : {}),
      sync_status: "pending", created_at: report.created_at || new Date().toISOString(),
    }, teamId);

    const exists = (data[dataKey] || []).some(b => b.id === report.id);
    setData(d => {
      const next = {
        ...d,
        [dataKey]: exists
          ? (d[dataKey] || []).map(b => b.id === report.id ? clean : b)
          : [clean, ...(d[dataKey] || [])],
        syncQueue: [
          { id: genId(), table: tableName, action: "upsert", data: clean, status: "pending", created_at: new Date().toISOString() },
          ...(d.syncQueue || []),
        ],
      };
      if (isRepair && clean.linked_breakdown_id) {
        const bd = (d.breakdowns || []).find(b => b.id === clean.linked_breakdown_id);
        if (bd && bd.status !== "resolved") {
          const resolvedBd = { ...bd, status: "resolved", sync_status: "pending" };
          next.breakdowns = (d.breakdowns || []).map(b => b.id === bd.id ? resolvedBd : b);
          next.syncQueue = [
            { id: genId(), table: "breakdown_reports", action: "upsert", data: resolvedBd, status: "pending", created_at: new Date().toISOString() },
            ...next.syncQueue,
          ];
          offlineSave("breakdowns", resolvedBd).catch(() => {});
        }
      }
      return next;
    });
    offlineSave(dataKey, clean).catch(() => {});
    setToast(exists ? "Report updated" : "Report saved");
    setView("list");
    setEditing(null);
  }

  async function deleteReport(r) {
    const ok = await confirm(`Delete "${r.title || "this report"}"? This can't be undone.`, { confirmLabel: "Delete" });
    if (!ok) return;
    setData(d => ({
      ...d,
      [dataKey]: (d[dataKey] || []).filter(b => b.id !== r.id),
      syncQueue: [
        { id: genId(), table: tableName, action: "delete", data: { id: r.id }, status: "pending", created_at: new Date().toISOString() },
        ...(d.syncQueue || []),
      ],
    }));
    setToast("Report deleted");
  }

  // ── Custom faults library (saved, reusable across all reports) ──
  function addCustomFault(label) {
    const clean = (label || "").trim();
    if (!clean) return;
    // Avoid duplicates (case-insensitive) against existing custom faults
    const existing = (data.customFaults || []).some(cf => (cf.label || "").toLowerCase() === clean.toLowerCase());
    if (existing) return;
    const rec = withTeamId({
      id: genId(),
      user_id: userId,
      label: clean,
      fault_group: "Custom",
      sync_status: "pending",
      created_at: new Date().toISOString(),
    }, teamId);
    setData(d => ({
      ...d,
      customFaults: [rec, ...(d.customFaults || [])],
      syncQueue: [
        { id: genId(), table: "custom_faults", action: "upsert", data: rec, status: "pending", created_at: new Date().toISOString() },
        ...(d.syncQueue || []),
      ],
    }));
    offlineSave("customFaults", rec).catch(() => {});
    haptic.success();
  }

  function removeCustomFault(id) {
    setData(d => ({
      ...d,
      customFaults: (d.customFaults || []).filter(cf => cf.id !== id),
      syncQueue: [
        { id: genId(), table: "custom_faults", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() },
        ...(d.syncQueue || []),
      ],
    }));
    haptic.light();
  }

  // ── Change a report's status (used by the board view to move between columns) ──
  function changeStatus(reportId, newStatus) {
    haptic.tick();
    const now = new Date().toISOString();
    setData(d => ({
      ...d,
      [dataKey]: (d[dataKey] || []).map(b =>
        b.id === reportId ? { ...b, status: newStatus, sync_status: "pending", updated_at: now } : b
      ),
      syncQueue: [
        { id: genId(), table: tableName, action: "upsert", data: { id: reportId, status: newStatus, updated_at: now }, status: "pending", created_at: now },
        ...(d.syncQueue || []),
      ],
    }));
    const updated = (data[dataKey] || []).find(b => b.id === reportId);
    if (updated) offlineSave(dataKey, { ...updated, status: newStatus, updated_at: now }).catch(() => {});
  }

  if (view === "list") {
    const openBreakdowns = (data.breakdowns || []).filter(b => b.status !== "resolved");
    return (
      <div className="space-y-4 pb-24">
        <PageHeader
          title={isRepair ? "Repair Reports" : "Breakdown Reports"}
          subtitle={reports.length ? `${reports.length} report${reports.length !== 1 ? "s" : ""}` : (isRepair ? "Log a completed repair" : "Log a breakdown with photos")} />

        <button onClick={() => newReport()}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-black text-sm min-h-[56px]"
          style={{ background: BRAND_PRIMARY }}>
          <Plus size={18} /> {isRepair ? "New repair report" : "New breakdown report"}
        </button>

        {/* List / Board toggle — breakdown only (repairs are all "Repaired") */}
        {!isRepair && reports.length > 0 && (
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
            {[
              { key: "list", label: "List", icon: ClipboardList },
              { key: "board", label: "Board", icon: LayoutGrid },
            ].map(m => (
              <button key={m.key} onClick={() => { haptic.light(); setListMode(m.key); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition-all min-h-[40px]"
                style={listMode === m.key
                  ? { background: "#fff", color: "#0F172A", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                  : { background: "transparent", color: "#94A3B8" }}>
                <m.icon size={15} /> {m.label}
              </button>
            ))}
          </div>
        )}

        {isRepair && openBreakdowns.length > 0 && (
          <Card className="p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Repair an open breakdown</p>
            <div className="space-y-2">
              {openBreakdowns.slice(0, 5).map(bd => (
                <button key={bd.id} onClick={() => newReport(bd)}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 active:bg-red-50 transition-colors text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{bd.title || "Untitled breakdown"}</p>
                    {bd.equipment && <p className="text-xs text-slate-400 truncate">{bd.equipment}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-black text-red-600 shrink-0"><Link2 size={13} /> Repair</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {reports.length === 0 ? (
          <Empty icon={isRepair ? CheckCircle2 : Wrench}
            title={isRepair ? "No repair reports yet" : "No breakdown reports yet"}
            text={isRepair
              ? "Log a completed repair — take photos of the fix and record what was done."
              : "Tap the button above to log your first breakdown — take photos and tag the faults as you inspect."}
            actionLabel={isRepair ? "New repair" : "New report"} onAction={() => newReport()} />
        ) : (!isRepair && listMode === "board") ? (
          <BreakdownBoard reports={reports} onOpen={openReport} onChangeStatus={changeStatus} />
        ) : (
          <div className="space-y-3">
            {reports.map(r => {
              const sev = severityMeta(r.severity);
              const st  = statusMeta(r.status);
              const allPhotos = (r.items || []).reduce((s, i) => s + itemPhotos(i).length, 0);
              const faultCount = (r.items || []).reduce((s, i) => s + (i.faults?.length || 0), 0);
              return (
                <Card key={r.id} className="p-0 overflow-hidden">
                  <button onClick={() => openReport(r)} className="w-full text-left p-4 active:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {isRepair
                            ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: "#16A34A18", color: "#16A34A" }}>Repaired</span>
                            : <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${st.color}18`, color: st.color }}>{st.label}</span>}
                          {!isRepair && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${sev.color}18`, color: sev.color }}>{sev.label}</span>}
                          {r.linked_breakdown_id && <span className="flex items-center gap-0.5 text-[10px] font-black text-slate-400"><Link2 size={10} /> linked</span>}
                        </div>
                        <p className="text-sm font-black text-slate-900 truncate">{r.title || "Untitled report"}</p>
                        {r.equipment && <p className="text-xs text-slate-500 truncate mt-0.5">{r.equipment}</p>}
                        {r.client_name && <p className="text-xs text-slate-400 truncate">{r.client_name}</p>}
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 font-bold">
                          <span className="flex items-center gap-1"><Camera size={12} /> {allPhotos}</span>
                          {!isRepair && <span className="flex items-center gap-1"><AlertTriangle size={12} /> {faultCount} fault{faultCount !== 1 ? "s" : ""}</span>}
                          <span>{smartDate(r.report_date)}</span>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 shrink-0 mt-1" />
                    </div>
                  </button>
                </Card>
              );
            })}
          </div>
        )}

        {toast && <Toast message={toast} onDone={() => setToast("")} />}
        {dialog}
      </div>
    );
  }

  return (
    <ReportEditor
      isRepair={isRepair}
      report={editing}
      clients={data.clients || []}
      customFaults={data.customFaults || []}
      onAddCustomFault={addCustomFault}
      onRemoveCustomFault={removeCustomFault}
      onBack={() => { setView("list"); setEditing(null); }}
      onSave={saveReport}
      onDelete={editing && (data[dataKey] || []).some(b => b.id === editing.id) ? () => deleteReport(editing) : null}
    />
  );
}

function ReportEditor({ isRepair, report, clients, customFaults, onAddCustomFault, onRemoveCustomFault, onBack, onSave, onDelete }) {
  const [r, setR] = useState(report);
  const [faultSheet, setFaultSheet] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportProgress = useExportProgress();

  function patch(fields) { setR(prev => ({ ...prev, ...fields })); }

  function addItemWithPhoto(media) {
    const photo = { id: genId(), url: null, _base64: media.base64 || null, _file: media.file || null };
    const item = { id: genId(), heading: "", photos: [photo], faults: [], action: "", note: "", phase: "general" };
    setR(prev => ({ ...prev, items: [...prev.items, item] }));
    haptic.success();
    if (!isRepair) setTimeout(() => setFaultSheet(item.id), 300);
  }

  function addPhotoToItem(itemId, media) {
    const photo = { id: genId(), url: null, _base64: media.base64 || null, _file: media.file || null };
    setR(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === itemId ? { ...it, photos: [...itemPhotos(it), photo] } : it),
    }));
    haptic.light();
  }

  function removePhoto(itemId, photoId) {
    setR(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === itemId ? { ...it, photos: itemPhotos(it).filter(p => p.id !== photoId) } : it),
    }));
    haptic.light();
  }

  function patchItem(id, fields) {
    setR(prev => ({ ...prev, items: prev.items.map(it => it.id === id ? { ...it, ...fields } : it) }));
  }

  function removeItem(id) {
    setR(prev => ({ ...prev, items: prev.items.filter(it => it.id !== id) }));
    haptic.light();
  }

  function toggleFault(itemId, fault) {
    setR(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (it.id !== itemId) return it;
        const has = (it.faults || []).includes(fault);
        haptic.tick();
        return { ...it, faults: has ? it.faults.filter(f => f !== fault) : [...(it.faults || []), fault] };
      }),
    }));
  }

  async function handleSave() {
    if (!r.title?.trim() && !r.equipment?.trim()) { alert("Add a title or equipment name first"); return; }
    setSaving(true);
    await onSave(r);
    setSaving(false);
  }

  const activeFaultItem = r.items.find(it => it.id === faultSheet);
  const isEditingExisting = report.created_at;

  async function handleExport(format) {
    setExporting(false);
    exportProgress.start(`Building ${format === "word" ? "Word" : "PDF"} report`);
    try {
      exportProgress.setStage("Loading generator…", 0.15);
      const { buildReportPDF, buildReportWord } = await import("../lib/reportExport");
      const builder = format === "word" ? buildReportWord : buildReportPDF;
      const photoCount = (r.items || []).reduce((s, i) => s + (Array.isArray(i.photos) ? i.photos.length : 0), 0);
      exportProgress.setStage(photoCount > 0 ? `Fetching ${photoCount} photo${photoCount !== 1 ? "s" : ""} & rendering` : "Rendering document", 0.4);
      const { blob, filename } = await builder({ report: r, mode: isRepair ? "repair" : "breakdown" });
      exportProgress.setStage("Finalising & downloading", 0.9);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      haptic.success();
      exportProgress.done(`${format === "word" ? "Word" : "PDF"} downloaded`);
    } catch (e) {
      console.error("Export failed:", e);
      exportProgress.fail("Could not generate the document");
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-black text-slate-900 flex-1">
          {isEditingExisting ? "Edit Report" : (isRepair ? "New Repair" : "New Report")}
        </h1>
        {isEditingExisting && (
          <button onClick={() => { haptic.light(); setExporting(true); }}
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Share2 size={18} />
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="p-2.5 rounded-xl border-2 border-red-100 bg-white text-red-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {r.linked_breakdown_id && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold">
          <Link2 size={14} className="shrink-0 mt-0.5" />
          <span>
            Linked to breakdown — it'll be marked resolved on save.
            {r.items.some(it => it._fromFault) && " Repair items were pre-filled from the breakdown's faults; add a photo and what you did to each."}
          </span>
        </div>
      )}

      <Card className="p-4 space-y-3">
        <Field label="Title" value={r.title} onChange={v => patch({ title: v })}
          placeholder={isRepair ? "e.g. Hydraulic ram reseal" : "e.g. Tyre Handler hydraulic failure"} />
        <Field label="Equipment / Vehicle" value={r.equipment} onChange={v => patch({ equipment: v })} placeholder="e.g. TH-500, Reg CA 123-456" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reference (optional)" value={r.reference} onChange={v => patch({ reference: v })} placeholder="Job / BD no." />
          <Field label="Location" value={r.location} onChange={v => patch({ location: v })} placeholder="Site / area" />
        </div>
        <ClientSelector label="Client / site (optional)" value={r.client_id} clients={clients}
          onChange={(id) => { const c = clients.find(cl => cl.id === id); patch({ client_id: id, client_name: c?.company || "" }); }} />

        {!isRepair && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Severity</p>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY_OPTIONS.map(s => (
                <button key={s.value} onClick={() => { haptic.light(); patch({ severity: s.value }); }}
                  className="py-2 rounded-xl text-xs font-black transition-all"
                  style={r.severity === s.value ? { background: s.color, color: "#fff" } : { background: "#F1F5F9", color: "#64748B" }}>{s.label}</button>
              ))}
            </div>
          </div>
        )}
        {!isRepair && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Status</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} onClick={() => { haptic.light(); patch({ status: s.value }); }}
                  className="py-2 rounded-xl text-xs font-black transition-all"
                  style={r.status === s.value ? { background: s.color, color: "#fff" } : { background: "#F1F5F9", color: "#64748B" }}>{s.label}</button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-black text-slate-700">{isRepair ? "Repair items" : "Inspection items"}</p>
          <span className="text-xs text-slate-400 font-bold">{r.items.length} item{r.items.length !== 1 ? "s" : ""}</span>
        </div>

        {r.items.map((it, idx) => {
          const photos = itemPhotos(it);
          return (
            <Card key={it.id} className="p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <input value={it.heading} onChange={e => patchItem(it.id, { heading: e.target.value })}
                  placeholder={`${isRepair ? "Repair" : "Item"} ${idx + 1} heading…`}
                  className="flex-1 text-sm font-bold text-slate-900 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none" />
                <button onClick={() => removeItem(it.id)} className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Phase selector (breakdown only): Intake / Strip & Assess / General */}
              {!isRepair && (
                <div className="flex gap-1.5">
                  {[
                    { value: "intake", label: "Intake" },
                    { value: "strip", label: "Strip & assess" },
                    { value: "general", label: "General" },
                  ].map(ph => (
                    <button key={ph.value}
                      onClick={() => { haptic.tick(); patchItem(it.id, { phase: ph.value }); }}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                      style={(it.phase || "general") === ph.value
                        ? { background: BRAND_PRIMARY, color: "#fff" }
                        : { background: "#F1F5F9", color: "#64748B" }}>
                      {ph.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map(p => (
                  <div key={p.id} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                    <img src={p.url || p._base64} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(it.id, p.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                <AddPhotoTile onAdd={(media) => addPhotoToItem(it.id, media)} />
              </div>

              {!isRepair && (
                <>
                  {(it.faults || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {it.faults.map(f => (
                        <span key={f} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
                          {f}<button onClick={() => toggleFault(it.id, f)}><X size={9} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button onClick={() => { haptic.light(); setFaultSheet(it.id); }}
                    className="w-full flex items-center justify-between gap-2 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100 active:bg-slate-100 min-h-[40px]">
                    <span className="flex items-center gap-1.5"><AlertTriangle size={13} style={{ color: BRAND_PRIMARY }} /> {(it.faults || []).length ? "Add / edit faults" : "Select faults"}</span>
                    <ChevronDown size={14} />
                  </button>
                </>
              )}

              {isRepair && (
                <>
                  {it._fromFault && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                      <AlertTriangle size={11} /> Fault from breakdown — log the repair below
                    </div>
                  )}
                  <textarea value={it.action || ""} onChange={e => patchItem(it.id, { action: e.target.value })}
                    placeholder="What was done to fix it…" rows={2}
                    className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none resize-none" />
                </>
              )}

              <input value={it.note} onChange={e => patchItem(it.id, { note: e.target.value })}
                placeholder="Note (optional)…"
                className="w-full text-xs text-slate-700 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none" />
            </Card>
          );
        })}

        <Card className="p-3">
          <p className="text-xs font-bold text-slate-500 mb-2">{isRepair ? "Add repair item photo" : "Add inspection photo"}</p>
          <MediaPicker onAdd={addItemWithPhoto} />
        </Card>
      </div>

      <Card className="p-4">
        <Field label={isRepair ? "Overall summary" : "Overall summary / recommendation"} value={r.summary} onChange={v => patch({ summary: v })}
          placeholder={isRepair ? "Summary of the repair and current condition…" : "What's the overall finding and what needs to happen next?"} multiline />
      </Card>

      {/* Full engineering report sections — breakdown reports only */}
      {!isRepair && (
        <EngineeringSections
          engineering={r.engineering || {}}
          onChange={(eng) => patch({ engineering: eng })} />
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-3 z-40" style={{ maxWidth: 672, margin: "0 auto" }}>
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-black text-sm min-h-[56px] disabled:opacity-60"
          style={{ background: BRAND_PRIMARY }}>
          {saving ? "Saving…" : <><Check size={18} /> Save report</>}
        </button>
      </div>

      <AnimatePresence>
        {faultSheet && activeFaultItem && (
          <FaultPickerSheet
            item={activeFaultItem}
            customFaults={customFaults}
            onAddCustomFault={onAddCustomFault}
            onRemoveCustomFault={onRemoveCustomFault}
            onToggle={(f) => toggleFault(faultSheet, f)}
            onClose={() => setFaultSheet(null)} />
        )}
      </AnimatePresence>

      {/* Export sheet: PDF or Word */}
      <AnimatePresence>
        {exporting && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setExporting(false)} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white p-5"
              style={{ maxWidth: 672, margin: "0 auto" }}>
              <div className="flex justify-center pb-3"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
              <p className="text-base font-black text-slate-900 mb-1">Export report</p>
              <p className="text-xs text-slate-400 mb-4">Download a branded document to share or print.</p>
              <div className="space-y-2.5">
                <button onClick={() => handleExport("pdf")}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-100 active:bg-slate-50 transition-colors text-left">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#FEF2F2" }}>
                    <FileText size={20} style={{ color: BRAND_PRIMARY }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-900">PDF document</p>
                    <p className="text-xs text-slate-400">Best for sending to clients &amp; printing</p>
                  </div>
                </button>
                <button onClick={() => handleExport("word")}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-100 active:bg-slate-50 transition-colors text-left">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#EFF6FF" }}>
                    <FileType size={20} style={{ color: "#2563EB" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-900">Word document</p>
                    <p className="text-xs text-slate-400">Editable .doc — opens in Microsoft Word</p>
                  </div>
                </button>
              </div>
              <button onClick={() => setExporting(false)}
                className="w-full mt-4 py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm min-h-[48px]">
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Board view: 3 status columns (Open / In progress / Resolved) ────────────
// Reuses the existing report.status field. Tap a card to open it; use the
// move buttons on each card to shift it between columns (persists + syncs).
// Tap-to-move is used instead of drag because it's far more reliable on a
// phone touchscreen inside a scrolling container.
function BreakdownBoard({ reports, onOpen, onChangeStatus }) {
  const columns = STATUS_OPTIONS; // open / in_progress / resolved, with colors
  const byStatus = (val) => reports.filter(r => (r.status || "open") === val);

  // The next status when moving right, and previous when moving left
  const order = columns.map(c => c.value);
  const moveTo = (current, dir) => {
    const i = order.indexOf(current || "open");
    const ni = i + dir;
    if (ni < 0 || ni >= order.length) return null;
    return order[ni];
  };

  return (
    <div className="-mx-4 px-4 overflow-x-auto pb-2">
      <div className="flex gap-3" style={{ minWidth: "min-content" }}>
        {columns.map(col => {
          const items = byStatus(col.value);
          return (
            <div key={col.value} className="shrink-0" style={{ width: 260 }}>
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <p className="text-sm font-black text-slate-700">{col.label}</p>
                </div>
                <span className="text-xs font-black text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{items.length}</span>
              </div>

              {/* Column cards */}
              <div className="space-y-2">
                {items.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-100 py-8 text-center">
                    <p className="text-xs text-slate-300 font-bold">Empty</p>
                  </div>
                )}
                {items.map(r => {
                  const sev = severityMeta(r.severity);
                  const allPhotos = (r.items || []).reduce((s, i) => s + itemPhotos(i).length, 0);
                  const faultCount = (r.items || []).reduce((s, i) => s + (i.faults?.length || 0), 0);
                  const left = moveTo(r.status, -1);
                  const right = moveTo(r.status, +1);
                  return (
                    <div key={r.id} className="rounded-xl border-2 border-slate-100 bg-white overflow-hidden">
                      <button onClick={() => onOpen(r)} className="w-full text-left p-3 active:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${sev.color}18`, color: sev.color }}>{sev.label}</span>
                          {r.linked_breakdown_id && <span className="flex items-center gap-0.5 text-[9px] font-black text-slate-400"><Link2 size={9} /> linked</span>}
                        </div>
                        <p className="text-sm font-black text-slate-900 leading-snug line-clamp-2">{r.title || "Untitled report"}</p>
                        {r.equipment && <p className="text-xs text-slate-500 truncate mt-0.5">{r.equipment}</p>}
                        {r.client_name && <p className="text-[11px] text-slate-400 truncate">{r.client_name}</p>}
                        <div className="flex items-center gap-2.5 mt-2 text-[10px] text-slate-400 font-bold">
                          <span className="flex items-center gap-1"><Camera size={11} /> {allPhotos}</span>
                          <span className="flex items-center gap-1"><AlertTriangle size={11} /> {faultCount}</span>
                          <span>{smartDate(r.report_date)}</span>
                        </div>
                      </button>
                      {/* Move controls */}
                      <div className="flex border-t border-slate-100">
                        <button
                          onClick={() => left && onChangeStatus(r.id, left)}
                          disabled={!left}
                          className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-bold transition-colors"
                          style={left ? { color: "#64748B" } : { color: "#E2E8F0", cursor: "default" }}>
                          <ChevronRight size={12} className="rotate-180" />
                          {left ? statusMeta(left).label : ""}
                        </button>
                        <div className="w-px bg-slate-100" />
                        <button
                          onClick={() => right && onChangeStatus(r.id, right)}
                          disabled={!right}
                          className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-bold transition-colors"
                          style={right ? { color: "#64748B" } : { color: "#E2E8F0", cursor: "default" }}>
                          {right ? statusMeta(right).label : ""}
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact single-button add-photo tile (camera), reuses the same compression flow
function AddPhotoTile({ onAdd }) {
  const inputRef = useRef(null);
  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) { console.warn("File too large"); continue; }
      try {
        const isVideo = file.type.startsWith("video/");
        const base64 = isVideo ? null : await compressImage(file);
        onAdd({ id: genId(), base64, file: isVideo ? file : undefined, isVideo, name: file.name, type: file.type });
      } catch (e) { console.warn("Could not process file:", e); }
    }
  }
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 active:bg-red-50 active:border-red-300 transition-colors">
        <Camera size={18} style={{ color: BRAND_PRIMARY }} />
        <span className="text-[10px] font-bold text-slate-400">Add</span>
      </button>
    </>
  );
}

function FaultPickerSheet({ item, customFaults = [], onAddCustomFault, onRemoveCustomFault, onToggle, onClose }) {
  const [q, setQ] = useState("");
  const selected = item.faults || [];

  // Build the "Your saved faults" group from the persisted custom faults library
  const customGroup = useMemo(() => {
    const labels = customFaults.map(cf => ({ label: cf.label, id: cf.id }));
    return labels;
  }, [customFaults]);

  // Filter built-in groups by search
  const groups = useMemo(() => {
    if (!q.trim()) return FAULT_GROUPS;
    const needle = q.toLowerCase();
    return FAULT_GROUPS.map(g => ({ ...g, faults: g.faults.filter(f => f.toLowerCase().includes(needle)) })).filter(g => g.faults.length > 0);
  }, [q]);

  // Filter custom faults by search
  const filteredCustom = useMemo(() => {
    if (!q.trim()) return customGroup;
    const needle = q.toLowerCase();
    return customGroup.filter(cf => cf.label.toLowerCase().includes(needle));
  }, [q, customGroup]);

  // Does the search term already exist anywhere? (built-in or custom)
  const trimmed = q.trim();
  const existsSomewhere = useMemo(() => {
    if (!trimmed) return true;
    const needle = trimmed.toLowerCase();
    const inBuiltIn = FAULT_GROUPS.some(g => g.faults.some(f => f.toLowerCase() === needle));
    const inCustom = customGroup.some(cf => cf.label.toLowerCase() === needle);
    return inBuiltIn || inCustom;
  }, [trimmed, customGroup]);

  const noResults = groups.length === 0 && filteredCustom.length === 0;

  function handleAddNew() {
    if (!trimmed) return;
    onAddCustomFault?.(trimmed);
    onToggle?.(trimmed);   // immediately tag it on the current item
    setQ("");              // clear search so it shows in the list
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white flex flex-col"
        style={{ maxHeight: "85vh", maxWidth: 672, margin: "0 auto" }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
        <div className="px-5 pt-1 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-base font-black text-slate-900">Select faults</p>
              <p className="text-xs text-slate-400">{selected.length} selected{item.heading ? ` · ${item.heading}` : ""}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center"><X size={16} /></button>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search or add a fault…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-6 flex-1">
          {/* Add-new button appears when the typed fault doesn't already exist */}
          {trimmed && !existsSomewhere && (
            <button onClick={handleAddNew}
              className="w-full flex items-center gap-2 px-3 py-3 mb-4 rounded-xl border-2 border-dashed transition-all min-h-[48px] text-left"
              style={{ borderColor: BRAND_PRIMARY, background: "#FEF2F2" }}>
              <Plus size={16} style={{ color: BRAND_PRIMARY }} />
              <span className="text-sm font-bold" style={{ color: "#B91C1C" }}>Add &amp; save “{trimmed}”</span>
            </button>
          )}

          {/* Your saved faults (custom library) */}
          {filteredCustom.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Your saved faults</p>
              <div className="space-y-1.5">
                {filteredCustom.map(cf => {
                  const on = selected.includes(cf.label);
                  return (
                    <div key={cf.id} className="flex items-center gap-2">
                      <button onClick={() => onToggle(cf.label)}
                        className="flex-1 flex items-center justify-between gap-2 px-3 py-3 rounded-xl border-2 transition-all min-h-[48px] text-left"
                        style={on ? { borderColor: BRAND_PRIMARY, background: "#FEF2F2" } : { borderColor: "#F1F5F9", background: "#fff" }}>
                        <span className="text-sm font-bold" style={{ color: on ? "#B91C1C" : "#334155" }}>{cf.label}</span>
                        {on && <Check size={16} style={{ color: BRAND_PRIMARY }} />}
                      </button>
                      <button onClick={() => onRemoveCustomFault?.(cf.id)}
                        className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0"
                        title="Remove from saved faults">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Built-in fault groups */}
          {groups.map(g => (
            <div key={g.group} className="mb-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">{g.group}</p>
              <div className="space-y-1.5">
                {g.faults.map(f => {
                  const on = selected.includes(f);
                  return (
                    <button key={f} onClick={() => onToggle(f)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl border-2 transition-all min-h-[48px] text-left"
                      style={on ? { borderColor: BRAND_PRIMARY, background: "#FEF2F2" } : { borderColor: "#F1F5F9", background: "#fff" }}>
                      <span className="text-sm font-bold" style={{ color: on ? "#B91C1C" : "#334155" }}>{f}</span>
                      {on && <Check size={16} style={{ color: BRAND_PRIMARY }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {noResults && !trimmed && <p className="text-center text-sm text-slate-400 py-8">No faults yet</p>}
          {noResults && trimmed && existsSomewhere && <p className="text-center text-sm text-slate-400 py-8">No faults match “{q}”</p>}
        </div>
        <div className="p-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-white font-black text-sm min-h-[52px]" style={{ background: BRAND_PRIMARY }}>
            Done ({selected.length})
          </button>
        </div>
      </motion.div>
    </>
  );
}
