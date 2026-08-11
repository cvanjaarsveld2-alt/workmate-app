// ─── Contacts Screen ──────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, User, Phone, Mail,
  Calendar as CalendarIcon, Camera, Sparkles, ArrowUpRight, Send, ChevronRight, ChevronDown, Share2,
  FolderPlus, Check,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { WhatsAppButton } from "../components/WhatsAppButton";
import { EmailButton } from "../components/EmailButton";
import { triggerImmediateSync } from "../lib/sync";
import { ShareSheet } from "../components/ShareSheet";
import { CardScanner } from "../components/CardScanner";
import { useBulkGroup, BulkGroupBar, BulkGroupSheet, useCollapsibleGroups, RenameGroupSheet } from "../components/BulkGroup";
import { SendCompanyInfoSheet } from "../components/SendCompanyInfo";
import { DetailSheet, DetailRow } from "../components/DetailSheet";
import { ImageViewer } from "../components/ImageViewer";
import { logCrash } from "../components/ErrorBoundary";
import {
  Card, Btn, Field, GroupField, SearchBar, FilterPills, CollapsibleFilters,
  Toast, Empty, PageHeader, useConfirm,
} from "../components/ui";

const STATUS_COLORS = {
  lead:      { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  active:    { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  converted: { bg: "#DCFCE7", text: "#166534", dot: "#16A34A" },
  archived:  { bg: "#F1F5F9", text: "#64748B", dot: "#94A3B8" },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status || "lead"] || STATUS_COLORS.lead;
  const label = status === "converted" ? "Converted" : status === "active" ? "Active" : status === "archived" ? "Archived" : "Lead";
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: s.bg, color: s.text }}>
      {label}
    </span>
  );
}

// ─── Show-more text (full info on tap, no silent clipping) ──────────────────
function ExpandableText({ text, limit = 100, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > limit;
  const display = isLong && !expanded ? text.slice(0, limit).trimEnd() + "…" : text;
  return (
    <div className={className}>
      <p className="text-xs text-slate-500 italic break-words whitespace-pre-wrap">{display}</p>
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

export function ContactsScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], quickAddTrigger, searchSeed }) {
  const [showForm, setShowForm]       = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editId, setEditId]           = useState(null);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const toggleGroupCollapse = (key) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const bulk = useBulkGroup();

  // Assign the chosen group name to all selected contacts
  function assignGroupToSelected(groupName) {
    const ids = bulk.selected;
    const now = new Date().toISOString();
    setData(d => ({
      ...d,
      contacts: (d.contacts || []).map(c =>
        ids.has(c.id) ? { ...c, category: groupName, sync_status: "pending", updated_at: now } : c
      ),
      syncQueue: [
        ...[...ids].map(id => {
          const existing = (d.contacts || []).find(c => c.id === id);
          return { id: genId(), table: "contacts", action: "update", data: { ...existing, category: groupName, updated_at: now }, status: "pending", created_at: now };
        }),
        ...(d.syncQueue || []),
      ],
    }));
    // Persist offline
    [...ids].forEach(id => {
      const existing = contacts.find(c => c.id === id);
      if (existing) offlineSave("contacts", { ...existing, category: groupName, updated_at: now }).catch(() => {});
    });
    setToast(`${ids.size} contact${ids.size !== 1 ? "s" : ""} added to "${groupName}"`);
    bulk.cancel();
  }

  // Existing group names for the picker
  const contactGroupNames = [...new Set((data.contacts || []).map(c => c.category?.trim()).filter(Boolean))].sort();

  const [renamingGroup, setRenamingGroup] = useState(null);

  // Rename a group: update category on every contact currently in it
  function renameContactGroup(oldName, newName) {
    if (oldName === "(No group)") { setRenamingGroup(null); return; }
    const now = new Date().toISOString();
    const affected = (data.contacts || []).filter(c => (c.category?.trim() || "") === oldName);
    setData(d => ({
      ...d,
      contacts: (d.contacts || []).map(c =>
        (c.category?.trim() || "") === oldName ? { ...c, category: newName, sync_status: "pending", updated_at: now } : c
      ),
      syncQueue: [
        ...affected.map(c => ({ id: genId(), table: "contacts", action: "update", data: { ...c, category: newName, updated_at: now }, status: "pending", created_at: now })),
        ...(d.syncQueue || []),
      ],
    }));
    affected.forEach(c => offlineSave("contacts", { ...c, category: newName, updated_at: now }).catch(() => {}));
    setToast(`Renamed to "${newName}"`);
    setRenamingGroup(null);
  }
  const [toast, setToast]             = useState("");
  const [cardPhotoUrl, setCardPhotoUrl] = useState(null);
  const [scannedNotice, setScannedNotice] = useState(false);
  const [detailContact, setDetailContact] = useState(null);
  const [viewerImages, setViewerImages] = useState(null);
  const [shareSheet, setShareSheet]     = useState(null);
  const [form, setForm] = useState({
    name: "", company: "", title: "", email: "", phone: "",
    met_at: "", met_date: todayISO(), notes: "", status: "lead", category: "",
  });
  const { confirm, dialog } = useConfirm();
  const contacts = (data.contacts || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId);
  const clients  = (data.clients  || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId);
  const [sendInfo, setSendInfo] = useState(null); // { name, email, phone }

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Contacts") return;
    setEditId(null);
    setShowForm(false);
    setShowScanner(true); // open camera immediately — scan a business card
  }, [quickAddTrigger?.ts]);

  // ── Global search handoff: carry the term into this screen's search box ──
  useEffect(() => {
    if (!searchSeed?.ts) return;
    setSearch(searchSeed.term || "");
  }, [searchSeed?.ts]);

  function resetForm() {
    setForm({
      name: "", company: "", title: "", email: "", phone: "",
      met_at: "", met_date: todayISO(), notes: "", status: "lead", category: "",
    });
    setEditId(null);
    setShowForm(false);
    setCardPhotoUrl(null);
    setScannedNotice(false);
  }

  function startEdit(c) {
    setForm({
      name:     c.name || "",
      company:  c.company || "",
      title:    c.title || "",
      email:    c.email || "",
      phone:    c.phone || "",
      met_at:   c.met_at || "",
      met_date: c.met_date || todayISO(),
      notes:    c.notes || "",
      status:   c.status || "lead",
      category: c.category || "",
    });
    setCardPhotoUrl(c.card_photo_url || null);
    setEditId(c.id);
    setShowForm(true);
    setShowScanner(false);
  }

  function handleScanComplete(extracted) {
    setForm({
      name:     extracted.name    || "",
      company:  extracted.company || "",
      title:    extracted.title   || "",
      email:    extracted.email   || "",
      phone:    extracted.phone   || "",
      met_at:   "",
      met_date: todayISO(),
      notes:    extracted.website ? `Website: ${extracted.website}` : "",
      status:   "lead",
    });
    setCardPhotoUrl(extracted.card_photo_url);
    setScannedNotice(true);
    setShowScanner(false);
    setEditId(null);
    setShowForm(true);
    setTimeout(() => setScannedNotice(false), 5000);
    // The AI extraction succeeded even if the photo failed to upload — tell
    // the user clearly, and log it where it's actually readable on a phone
    // (Settings → Diagnostics → Recent crashes), since a toast is too small
    // to read the full Supabase error message.
    if (extracted._photo_upload_error) {
      setToast("Card saved — photo didn't upload, see Diagnostics");
      logCrash({
        screen: "Contacts (card photo upload)",
        message: extracted._photo_upload_error,
      });
    }
  }

  async function saveContact() {
    if (!form.name.trim()) { setToast("Name is required"); return; }
    const cleanForm = {
      ...form,
      met_date: form.met_date || null,
      card_photo_url: cardPhotoUrl || null,
    };

    if (editId) {
      const existing = contacts.find(c => c.id === editId);
      const updated = {
        ...existing,
        ...cleanForm,
        updated_at: new Date().toISOString(),
        sync_status: "pending",
      };
      setData(d => ({
        ...d,
        contacts: (d.contacts || []).map(c => c.id === editId ? updated : c),
        syncQueue: [{ id: genId(), table: "contacts", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("contacts", updated);
      setToast("Contact updated");
      triggerImmediateSync();
    } else {
      const item = withTeamId({
        id: genId(),
        user_id: userId,
        ...cleanForm,
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
      setToast("Contact added");
      triggerImmediateSync();
    }
    resetForm();
  }

  async function deleteContact(id, name) {
    const ok = await confirm(`Delete ${name}?`, { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    await deleteRecord("contacts", id, userId, setData);
    setToast("Contact deleted");
  }

  // ── Promote Contact to Client ──
  async function promoteToClient(c) {
    if (!c.company?.trim()) {
      setToast("Add a company name first before promoting");
      return;
    }

    const existingClient = clients.find(cl => (cl.company || "").toLowerCase() === c.company.toLowerCase());

    const message = existingClient
      ? `A client called "${c.company}" already exists. This will mark ${c.name} as converted and link to that client. Continue?`
      : `This will create a new client "${c.company}" and mark ${c.name} as converted. Continue?`;

    const ok = await confirm(message, { confirmLabel: "Promote" });
    if (!ok) return;

    let clientId;
    let clientItem = null;

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      clientId = genId();
      clientItem = withTeamId({
        id: clientId,
        user_id: userId,
        company:  c.company,
        branch:   "",
        contact:  c.name,
        phone:    c.phone || "",
        email:    c.email || "",
        stage:    "New Lead",
        notes:    [c.notes, c.met_at ? `Originally met at ${c.met_at}${c.met_date ? ` on ${smartDate(c.met_date)}` : ""}` : ""].filter(Boolean).join("\n\n"),
        source:   "contact_promotion",
        created_at: new Date().toISOString(),
        sync_status: "pending",
      }, teamId);
    }

    const updatedContact = {
      ...c,
      status: "converted",
      client_id: clientId,
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    };

    setData(d => {
      const updates = {
        ...d,
        contacts: (d.contacts || []).map(x => x.id === c.id ? updatedContact : x),
        syncQueue: [
          { id: genId(), table: "contacts", action: "update", data: updatedContact, status: "pending", created_at: new Date().toISOString() },
          ...(d.syncQueue || []),
        ],
      };
      if (clientItem) {
        updates.clients = [clientItem, ...(d.clients || [])];
        updates.syncQueue = [
          { id: genId(), table: "clients", action: "insert", data: clientItem, status: "pending", created_at: new Date().toISOString() },
          ...updates.syncQueue,
        ];
      }
      return updates;
    });

    await offlineSave("contacts", updatedContact);
    if (clientItem) await offlineSave("clients", clientItem);

    setToast(existingClient ? `Linked to existing client ✓` : `Promoted to Client ✓`);
    triggerImmediateSync();
  }

  // ── Shared form: rendered at top for NEW, in-place for EDIT ──
  function renderContactForm(isEdit) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-black text-slate-800">{isEdit ? "Edit Contact" : "New Contact"}</p>
          {scannedNotice && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
              <Sparkles size={12} /> AI extracted
            </span>
          )}
        </div>

        {cardPhotoUrl && (
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <img src={cardPhotoUrl} alt="Business card" className="w-full max-h-48 object-contain bg-slate-50" />
          </div>
        )}

        <Field label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. John Smith" required />
        <div className="grid grid-cols-1 gap-3">
          <Field label="Company" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="e.g. ACME Mining" />
          <Field label="Job Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Senior Engineer" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="email@company.com" />
          <Field label="Phone" type="tel" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+27 ..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Met At" value={form.met_at} onChange={v => setForm(f => ({ ...f, met_at: v }))} placeholder="e.g. Wampex 2026" />
          <GroupField label="Group / Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} existing={contactGroupNames} placeholder="e.g. Expo 2026, Suppliers, Contractors" />
          <Field label="Met On" type="date" value={form.met_date} onChange={v => setForm(f => ({ ...f, met_date: v }))} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-500">Status</label>
          <div className="grid grid-cols-4 gap-2">
            {["lead", "active", "converted", "archived"].map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                className="rounded-xl py-2.5 text-xs font-bold border-2 transition-all min-h-[44px] capitalize"
                style={form.status === s
                  ? { background: STATUS_COLORS[s].bg, color: STATUS_COLORS[s].text, borderColor: STATUS_COLORS[s].dot }
                  : { background: "#F8FAFC", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="What you discussed, follow-ups, etc." multiline />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveContact}><Save size={15} />{isEdit ? "Update" : "Add Contact"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  const filtered = contacts
    .filter(c => filterStatus === "All" || (c.status || "lead") === filterStatus.toLowerCase())
    .filter(c => !search || [c.name, c.company, c.title, c.email, c.phone, c.met_at, c.notes]
      .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const grouped = filtered.reduce((acc, c) => {
    const k = c.category?.trim() || "(No group)";
    if (!acc[k]) acc[k] = [];
    acc[k].push(c);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const collapseKeys = groupKeys.filter(k => k !== "(No group)");
  const groups = useCollapsibleGroups(collapseKeys, true);

  const leadCount = contacts.filter(c => (c.status || "lead") === "lead").length;

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

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
          const contact = contacts.find(c => c.id === shareSheet.id);
          if (!contact) return;
          const now = new Date().toISOString();
          const updated = { ...contact, assigned_to_user_id: uid, assigned_to: email?.split("@")[0] || email, sync_status: "pending", updated_at: now };
          setData(d => ({
            ...d,
            contacts: (d.contacts || []).map(c => c.id === shareSheet.id ? updated : c),
            syncQueue: [{ id: genId(), table: "contacts", action: "update", data: updated, status: "pending", created_at: now }, ...(d.syncQueue || [])],
          }));
          triggerImmediateSync();
          setToast(`Contact shared with ${email?.split("@")[0] || email}`);
          setShareSheet(null);
        }}
      />

      {/* ── Contact detail sheet ── */}
      <DetailSheet
        open={!!detailContact}
        onClose={() => setDetailContact(null)}
        title={detailContact?.name || ""}
        subtitle={detailContact ? [detailContact.title, detailContact.company].filter(Boolean).join(" · ") : ""}
        primaryActions={detailContact && (
          <div className="grid grid-cols-3 gap-2">
            {detailContact.phone ? (
              <a href={`tel:${detailContact.phone}`}
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-3 text-white min-h-[64px]"
                style={{ background: "#8B1A1A" }}>
                <Phone size={18} />
                <span className="text-xs font-bold">Call</span>
              </a>
            ) : <div className="rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-1 py-3 text-slate-300"><Phone size={18} /><span className="text-xs font-bold">—</span></div>}
            {detailContact.phone ? (
              <a href={`https://wa.me/${detailContact.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-3 text-white min-h-[64px]"
                style={{ background: "#25D366" }}>
                <Send size={18} />
                <span className="text-xs font-bold">WhatsApp</span>
              </a>
            ) : <div className="rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-1 py-3 text-slate-300"><Send size={18} /><span className="text-xs font-bold">—</span></div>}
            {detailContact.email ? (
              <a href={`mailto:${detailContact.email}`}
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-3 text-white min-h-[64px]"
                style={{ background: "#2563EB" }}>
                <Mail size={18} />
                <span className="text-xs font-bold">Email</span>
              </a>
            ) : <div className="rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-1 py-3 text-slate-300"><Mail size={18} /><span className="text-xs font-bold">—</span></div>}
          </div>
        )}
        secondaryActions={detailContact && (
          <>
            <button onClick={() => { setDetailContact(null); startEdit(detailContact); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={() => { const c = detailContact; setDetailContact(null); deleteContact(c.id, c.name); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-red-100 bg-white text-red-600 min-h-[48px]">
              <Trash2 size={14} /> Delete
            </button>
            {teamMembers.length > 0 && (
              <button onClick={() => { setShareSheet({ id: detailContact.id, title: detailContact.name, type: "contact" }); setDetailContact(null); }}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 min-h-[48px] col-span-2"
                style={{ borderColor: "#8B1A1A", color: "#8B1A1A", background: "#FFF5F5" }}>
                <Share2 size={14} /> Share with teammate
              </button>
            )}
          </>
        )}
      >
        {detailContact && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Phone" value={detailContact.phone} mono />
              <DetailRow label="Email" value={detailContact.email} />
              <DetailRow label="Status" value={detailContact.status} />
              {(detailContact.met_at || detailContact.met_date) && (
                <DetailRow label="Met at" value={`${detailContact.met_at || ""}${detailContact.met_at && detailContact.met_date ? " · " : ""}${detailContact.met_date ? smartDate(detailContact.met_date) : ""}`} />
              )}
            </div>

            {detailContact.notes && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 border border-slate-100">{detailContact.notes}</p>
              </div>
            )}

            {detailContact.card_photo_url && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Business card · tap to enlarge</p>
                <button onClick={() => setViewerImages({ list: [{ url: detailContact.card_photo_url, caption: detailContact.name }], startIndex: 0 })}
                  className="w-full rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 active:opacity-80">
                  <img src={detailContact.card_photo_url} alt="" className="w-full h-48 object-contain bg-slate-50" />
                </button>
              </div>
            )}

            {((detailContact.status === "lead" || detailContact.status === "active") && detailContact.company?.trim()) && (
              <div className="pt-2 space-y-2 border-t border-slate-100">
                <button
                  onClick={() => { setSendInfo({ name: detailContact.name, email: detailContact.email, phone: detailContact.phone }); setDetailContact(null); }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-blue-200 bg-blue-50 text-blue-700 min-h-[48px]">
                  <Send size={14} /> Send Company Info
                </button>
                <button
                  onClick={() => { const c = detailContact; setDetailContact(null); promoteToClient(c); }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-green-200 bg-green-50 text-green-700 min-h-[48px]">
                  <ArrowUpRight size={14} /> Promote to Client
                </button>
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

      <div className="flex items-center justify-between gap-2">
        <PageHeader title="Contacts" subtitle={`${contacts.length} total · ${leadCount} leads`} />
        <div className="flex gap-1.5 shrink-0">
          {!showForm && !editId && !showScanner && !bulk.active && contacts.length > 0 && (
            <button onClick={bulk.enter}
              className="flex items-center justify-center gap-1 px-2.5 h-9 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 shrink-0"
              aria-label="Group">
              <FolderPlus size={15} />
            </button>
          )}
          {!showForm && !editId && !showScanner && !bulk.active && (
            <button onClick={() => { setShowScanner(true); setEditId(null); }}
              className="flex items-center justify-center gap-1 px-2.5 h-9 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 shrink-0"
              aria-label="Scan card">
              <Camera size={15} />
            </button>
          )}
          {!bulk.active && (
          <Btn size="sm" onClick={() => {
            if (showForm || editId) resetForm();
            else if (showScanner) setShowScanner(false);
            else setShowForm(true);
          }}>
            {(showForm || editId || showScanner) ? <X size={15} /> : <Plus size={15} />}
            {(showForm || editId || showScanner) ? "Cancel" : "Add"}
          </Btn>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showScanner && (
          <CardScanner
            userId={userId}
            onExtracted={handleScanComplete}
            onCancel={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>

      {/* Top form: NEW contacts only (incl. scanned). Edits render in place. */}
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderContactForm(false)}
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by name, company, email…" />

      <BulkGroupBar
        active={bulk.active}
        count={bulk.selected.size}
        allCount={filtered.length}
        onCancel={bulk.cancel}
        onAssign={bulk.openAssign}
        onSelectAll={() => bulk.selectAll(filtered.map(c => c.id))}
        onClear={bulk.clear}
        label="contacts"
      />
      <div className="flex items-center justify-end">
        <CollapsibleFilters
          groups={[
            {
              label: "Status",
              options: ["All", "Lead", "Active", "Converted", "Archived"],
              value: filterStatus,
              onChange: setFilterStatus,
            },
          ]}
        />
      </div>

      {Object.keys(grouped).length === 0 && (
        <Empty title="No contacts yet" text="Add the people you meet at events and site visits — they'll be searchable here." icon={User} />
      )}

      <div className="space-y-3">
        {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([company, list]) => {
          const isCol = groups.isCollapsed(company);
          return (
          <Card key={company} className="overflow-hidden">
            <div className="flex items-center border-b border-slate-100" style={{ background: "#F7F3F3" }}>
              <button onClick={() => groups.toggle(company)}
                className="flex-1 px-4 py-2.5 active:bg-slate-100 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <motion.div animate={{ rotate: isCol ? -90 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown size={16} className="text-slate-400" />
                    </motion.div>
                    <p className="text-sm font-black text-slate-900">{company}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-500">{list.length} contact{list.length !== 1 ? "s" : ""}</span>
                </div>
              </button>
              {company !== "(No group)" && (
                <button onClick={() => setRenamingGroup(company)}
                  className="px-3 py-2.5 text-slate-400 active:text-slate-700 active:bg-slate-100 transition-colors"
                  aria-label="Rename group">
                  <Edit2 size={14} />
                </button>
              )}
            </div>
            {!isCol && (
            <div className="divide-y divide-slate-50">
              {list.map(c => {
                // ── Edit-in-place: form replaces this contact at its position ──
                if (editId === c.id) {
                  return (
                    <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-3">
                      {renderContactForm(true)}
                    </motion.div>
                  );
                }

                const canPromote = (c.status === "lead" || c.status === "active") && c.company?.trim();
                const isSel = bulk.selected.has(c.id);
                return (
                  <div key={c.id}
                    className={`px-4 py-3 cursor-pointer transition-colors ${bulk.active && isSel ? "bg-red-50" : "active:bg-slate-50"}`}
                    onClick={() => bulk.active ? bulk.toggle(c.id) : setDetailContact(c)}>
                    {bulk.active && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                          style={isSel ? { background: BRAND.primary, borderColor: BRAND.primary } : { borderColor: "#CBD5E1" }}>
                          {isSel && <Check size={13} className="text-white" />}
                        </span>
                        <span className="text-xs font-bold text-slate-400">{isSel ? "Selected" : "Tap to select"}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-bold text-slate-900">{c.name}</p>
                          <StatusPill status={c.status} />
                          {c.card_photo_url && <Camera size={12} className="text-slate-400" />}
                        </div>
                        {c.title && <p className="text-sm text-slate-500 mt-0.5">{c.title}</p>}
                        {c.company && <p className="text-sm text-slate-600 mt-0.5">{c.company}</p>}

                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {c.phone && <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Phone size={11} />{c.phone}</span>}
                          {c.email && <span className="text-xs text-slate-400 inline-flex items-center gap-1 truncate max-w-[200px]"><Mail size={11} />{c.email}</span>}
                        </div>

                        {(c.met_at || c.met_date) && (
                          <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
                            <CalendarIcon size={11} />
                            {c.met_at}{c.met_at && c.met_date ? " · " : ""}{c.met_date ? smartDate(c.met_date) : ""}
                          </p>
                        )}
                        {c.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                      </div>
                      <ChevronRight size={18} className="text-slate-300 shrink-0 mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </Card>
          );
        })}
      </div>

      <BulkGroupSheet
        open={bulk.assignOpen}
        existingGroups={contactGroupNames}
        onClose={bulk.closeAssign}
        onConfirm={assignGroupToSelected}
      />

      <RenameGroupSheet
        open={!!renamingGroup}
        currentName={renamingGroup}
        existingGroups={contactGroupNames}
        onClose={() => setRenamingGroup(null)}
        onConfirm={(newName) => renameContactGroup(renamingGroup, newName)}
      />
    </div>
  );
}
