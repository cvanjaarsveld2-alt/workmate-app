// ─── Quotes Screen ────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Edit2, Trash2, File as FileIcon, Share2 } from "lucide-react";
import { BRAND, QUOTE_STATUS_COLORS } from "../lib/constants";
import { todayISO, smartDate, formatCurrency, genId } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { ShareSheet } from "../components/ShareSheet";
import { Card, Btn, Field, SelectField, SearchBar, FilterPills, Toast, Empty, PageHeader, useConfirm } from "../components/ui";

// ─── Show-more text (full info on tap, no silent clipping) ──────────────────
function ExpandableText({ text, limit = 110, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > limit;
  const display = isLong && !expanded ? text.slice(0, limit).trimEnd() + "…" : text;
  return (
    <div className={className}>
      <p className="text-sm text-slate-500 break-words whitespace-pre-wrap">{display}</p>
      {isLong && (
        <button type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
          className="mt-1.5 inline-block text-xs font-bold px-2 py-1 rounded-full"
          style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          {expanded ? "▲ Show less" : "▼ Show more"}
        </button>
      )}
    </div>
  );
}

export function QuotesScreen({ data, setData, userId, userEmail, teamId, teamMembers = [], quickAddTrigger, searchSeed }) {
  const [showForm, setShowForm]       = useState(false);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editId, setEditId]           = useState(null);
  const [toast, setToast]             = useState("");
  const [form, setForm] = useState({ client_name: "", client_id: null, description: "", value: "", status: "Pending" });
  const { confirm, dialog } = useConfirm();
  const [shareSheet, setShareSheet] = useState(null);
  const quotes = (data.quotes || []).filter(q => q.user_id === userId || q.assigned_to_user_id === userId);

  // ── Quick capture: open add form when FAB triggers this screen ──
  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Quotes") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);

  // ── Global search handoff: carry the term into this screen's search box ──
  useEffect(() => {
    if (!searchSeed?.ts) return;
    setSearch(searchSeed.term || "");
  }, [searchSeed?.ts]);

  function resetForm() { setForm({ client_name: "", client_id: null, description: "", value: "", status: "Pending" }); setEditId(null); setShowForm(false); }

  async function saveQuote() {
    if (!form.description.trim()) { setToast("Please enter a description"); return; }
    if (editId) {
      const existing = quotes.find(q => q.id === editId);
      const updated  = { ...existing, ...form, value: parseFloat(form.value || 0), sync_status: "pending" };
      setData(d => ({ ...d, quotes: (d.quotes || []).map(q => q.id === editId ? updated : q), syncQueue: [{ id: genId(), table: "quotes", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
      await offlineSave("quotes", updated);
      setToast("Quote updated");
      triggerImmediateSync();
    } else {
      const item = withTeamId({ id: genId(), user_id: userId, ...form, value: parseFloat(form.value || 0), sent_date: todayISO(), created_at: new Date().toISOString(), sync_status: "pending" }, teamId);
      setData(d => ({ ...d, quotes: [item, ...(d.quotes || [])], syncQueue: [{ id: genId(), table: "quotes", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
      await offlineSave("quotes", item);
      setToast("Quote added");
      triggerImmediateSync();
    }
    resetForm();
  }

  async function deleteQuote(id, name) {
    const ok = await confirm(`Delete quote for ${name || "this client"}?`, { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    await deleteRecord("quotes", id, userId, setData);
    setToast("Quote deleted");
  }

  function startEdit(q) { setForm({ client_name: q.client_name || "", client_id: q.client_id || null, description: q.description || "", value: String(q.value || ""), status: q.status || "Pending" }); setEditId(q.id); setShowForm(true); }

  // ── Shared form: rendered at top for NEW, in-place for EDIT ──
  function renderQuoteForm(isEdit) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Quote" : "New Quote"}</p>
        <ClientSelector label="Client" value={form.client_id}
                onChange={v => {
                  const cl = (data.clients || []).find(c => c.id === v);
                  setForm(f => ({ ...f, client_id: v || null, client_name: cl ? `${cl.company}${cl.branch ? " — " + cl.branch : ""}` : "" }));
                }}
                clients={data.clients || []} placeholder="Select client…" />
        <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="What the quote covers" multiline required />
        <Field label="Value (R)" type="number" value={form.value} onChange={v => setForm(f => ({ ...f, value: v }))} placeholder="0.00" />
        <SelectField label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={["Pending", "Accepted", "Rejected", "Expired"]} />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveQuote}><Save size={15} />{isEdit ? "Update" : "Add Quote"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  const filtered   = quotes.filter(q => filterStatus === "All" || q.status === filterStatus).filter(q => !search || [q.client_name, q.description].some(x => x?.toLowerCase().includes(search.toLowerCase())));
  const totalValue = filtered.reduce((s, q) => s + parseFloat(q.value || 0), 0);

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
          const now = new Date().toISOString();
          setToast("Quote shared with " + (email?.split("@")[0] || email));
          setShareSheet(null);
        }}
      />
      <div className="flex items-center justify-between">
        <PageHeader title="Quotes" subtitle={`${quotes.length} total · ${formatCurrency(totalValue)}`} />
        <Btn size="sm" onClick={() => { if (showForm || editId) resetForm(); else setShowForm(true); }}>
          {(showForm || editId) ? <X size={15} /> : <Plus size={15} />}{(showForm || editId) ? "Cancel" : "Add"}
        </Btn>
      </div>
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* Top form: NEW quotes only. Edits render in place. */}
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderQuoteForm(false)}
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search quotes…" />
      <FilterPills options={["All", "Pending", "Accepted", "Rejected", "Expired"]} value={filterStatus} onChange={setFilterStatus} dangerValue="Rejected" />
      {filtered.length === 0 && <Empty title="No quotes found" text="Add a quote or change filters." icon={FileIcon} />}
      <div className="space-y-2">
        {filtered.map(q => {
          // ── Edit-in-place: form replaces this quote at its list position ──
          if (editId === q.id) {
            return (
              <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {renderQuoteForm(true)}
              </motion.div>
            );
          }

          const sc = QUOTE_STATUS_COLORS[q.status] || QUOTE_STATUS_COLORS.Pending;
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-slate-900">{q.client_name || "Unknown client"}</p>
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{q.status}</span>
                  </div>
                  <ExpandableText text={q.description} className="mt-1" />
                  <p className="mt-1.5 text-lg font-black" style={{ color: BRAND.primary }}>{formatCurrency(q.value)}</p>
                  {q.sent_date && <p className="text-xs text-slate-400 mt-0.5">Sent {smartDate(q.sent_date)}</p>}
                  {q.sync_status === "pending" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {teamMembers.length > 0 && (
                    <button onClick={() => setShareSheet({ id: q.id, title: q.client_name || "Quote", type: "quote" })} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-purple-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Share with teammate"><Share2 size={15} /></button>
                  )}
                  <button onClick={() => startEdit(q)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15} /></button>
                  <button onClick={() => deleteQuote(q.id, q.client_name)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15} /></button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
