// ─── Quotes Screen ────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Edit2, Trash2, File as FileIcon, Share2, Download } from "lucide-react";
import { BRAND, QUOTE_STATUS_COLORS } from "../lib/constants";
import { todayISO, smartDate, formatCurrency, genId } from "../lib/helpers";
import { QuoteLineItems } from "../components/QuoteLineItems";
import { QuoteDetailsEditor, emptyDetails, hasDetails } from "../components/QuoteDetailsEditor";
import { resolveDocumentPhotos } from "../lib/documentPhotos";
import { addDays } from "../lib/documentPDF";
import { useCompanyProfile } from "../lib/companyProfile";
import { buildDocumentPDF, documentFilename, documentTitle, shareDocumentPDF } from "../lib/documentPDF";
import { quoteToDocument } from "../lib/documentData";
import { autoCreateChaseFollowup, autoAdvanceOnAccept } from "../lib/quoteAutomation";
import { offlineSave } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { ShareSheet } from "../components/ShareSheet";
import { supabase } from "../supabase";
import {
  Card,
  Btn,
  Field,
  SelectField,
  SearchBar,
  CollapsibleFilters,
  Toast,
  Empty,
  PageHeader,
  useConfirm,
  ClientSelector,
} from "../components/ui";
import { useIsMine } from "../lib/teamView";

function ExpandableText({ text, limit = 110, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > limit;
  const display = isLong && !expanded ? text.slice(0, limit).trimEnd() + "…" : text;
  return (
    <div className={className}>
      <p className="text-sm text-slate-500 wrap-break-word whitespace-pre-wrap">{display}</p>
      {isLong && (
        <button
          type="button"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(v => !v);
          }}
          className="mt-1.5 inline-block text-xs font-bold px-2 py-1 rounded-full"
          style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}
        >
          {expanded ? "▲ Show less" : "▼ Show more"}
        </button>
      )}
    </div>
  );
}

export function QuotesScreen({
  data,
  setData,
  userId,
  userEmail,
  teamId,
  teamMembers = [],
  quickAddTrigger,
  searchSeed,
}) {
  const isMine = useIsMine(userId);
  const profile = useCompanyProfile(teamId);
  const [pdfFor, setPdfFor] = useState(null);
  async function sharePdf(q, kind) {
    try {
      setToast(kind === "quote" && hasDetails(q.details) ? "Preparing PDF…" : "");
      const me = teamMembers.find(m => m.user_id === userId || m.id === userId);
      const preparedBy = me?.full_name || me?.name || userEmail || "";
      const doc = await resolveDocumentPhotos(
        quoteToDocument(q, kind, { clients: data.clients || [], profile, preparedBy }),
      );
      const blob = await buildDocumentPDF(doc, profile);
      const r = await shareDocumentPDF(blob, documentFilename(doc, profile), `${documentTitle(kind, profile)} ${doc.number}`);
      if (r !== "cancelled") setToast(r === "shared" ? "PDF shared" : "PDF downloaded");
      setPdfFor(null);
    } catch (err) {
      console.error("Quote PDF failed:", err);
      setToast("Couldn't generate PDF — try again");
    }
  }
  const [showForm, setShowForm] = useState(false),
    [search, setSearch] = useState(""),
    [filterStatus, setFilterStatus] = useState("All"),
    [editId, setEditId] = useState(null),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({
      client_name: "",
      client_id: null,
      description: "",
      value: "",
      status: "Pending",
    }),
    [lineItems, setLineItems] = useState([]),
    [vatInclusive, setVatInclusive] = useState(true),
    [details, setDetails] = useState(emptyDetails),
    [validDays, setValidDays] = useState(""),
    [shareSheet, setShareSheet] = useState(null),
    [sharing, setSharing] = useState(false);
  const { confirm, dialog } = useConfirm();
  const quotes = (data.quotes || []).filter(isMine);
  useEffect(() => {
    if (quickAddTrigger?.screen !== "Quotes") return;
    setEditId(null);
    setShowForm(true);
  }, [quickAddTrigger?.ts]);
  useEffect(() => {
    if (searchSeed?.ts) setSearch(searchSeed.term || "");
  }, [searchSeed?.ts]);
  function resetForm() {
    setForm({ client_name: "", client_id: null, description: "", value: "", status: "Pending" });
    setLineItems([]);
    setVatInclusive(true);
    setDetails(emptyDetails());
    setValidDays("");
    setEditId(null);
    setShowForm(false);
  }
  async function saveQuote() {
    if (!form.description.trim()) {
      setToast("Please enter a description");
      return;
    }
    const days = Math.round(Number(validDays));
    if (validDays !== "" && !(days >= 1 && days <= 365)) {
      setToast("Valid for must be 1 to 365 days");
      return;
    }
    const extra = {
      details: hasDetails(details) ? details : null,
      ...(validDays !== ""
        ? {
            expiry_date: addDays(
              (editId && quotes.find(q => q.id === editId)?.sent_date) || todayISO(),
              days,
            ),
          }
        : {}),
    };
    if (editId) {
      const existing = quotes.find(q => q.id === editId);
      const totalFromLines = lineItems.reduce(
        (sum, i) => sum + (parseFloat(i.qty) || 1) * (parseFloat(i.unitPrice) || 0),
        0,
      );
      const updated = {
        ...existing,
        ...form,
        value: lineItems.length > 0 ? totalFromLines : parseFloat(form.value || 0),
        line_items: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
        vat_inclusive: vatInclusive,
        ...extra,
        sync_status: "pending",
      };
      setData(d => ({
        ...d,
        quotes: (d.quotes || []).map(q => (q.id === editId ? updated : q)),
        syncQueue: [
          {
            id: genId(),
            table: "quotes",
            action: "update",
            data: updated,
            status: "pending",
            created_at: new Date().toISOString(),
          },
          ...(d.syncQueue || []),
        ],
      }));
      if (form.status === "Accepted" && existing.status !== "Accepted")
        autoAdvanceOnAccept(updated, data.clients, setData);
      await offlineSave("quotes", updated);
      setToast("Quote updated");
      triggerImmediateSync();
    } else {
      const totalFromLines = lineItems.reduce(
          (s, i) => s + (parseFloat(i.qty) || 1) * (parseFloat(i.unitPrice) || 0),
          0,
        ),
        quoteValue = lineItems.length > 0 ? totalFromLines : parseFloat(form.value || 0),
        item = withTeamId(
          {
            id: genId(),
            user_id: userId,
            ...form,
            value: quoteValue,
            line_items: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
            vat_inclusive: vatInclusive,
            ...extra,
            sent_date: todayISO(),
            created_at: new Date().toISOString(),
            sync_status: "pending",
          },
          teamId,
        );
      setData(d => ({
        ...d,
        quotes: [item, ...(d.quotes || [])],
        syncQueue: [
          {
            id: genId(),
            table: "quotes",
            action: "insert",
            data: item,
            status: "pending",
            created_at: new Date().toISOString(),
          },
          ...(d.syncQueue || []),
        ],
      }));
      await offlineSave("quotes", item);
      autoCreateChaseFollowup(item, userId, setData, teamId);
      setToast("Quote added — chase follow-up created");
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
  function startEdit(q) {
    setForm({
      client_name: q.client_name || "",
      client_id: q.client_id || null,
      description: q.description || "",
      value: String(q.value || ""),
      status: q.status || "Pending",
    });
    try {
      setLineItems(q.line_items ? JSON.parse(q.line_items) : []);
    } catch {
      setLineItems([]);
    }
    setVatInclusive(q.vat_inclusive !== false);
    setDetails(q.details && typeof q.details === "object" ? { ...emptyDetails(), ...q.details } : emptyDetails());
    setValidDays(
      q.expiry_date && q.sent_date
        ? String(Math.round((new Date(q.expiry_date) - new Date(q.sent_date)) / 86400000))
        : "",
    );
    setEditId(q.id);
    setShowForm(true);
  }
  async function assignQuote(uid, email) {
    if (!shareSheet || !uid) return;
    setSharing(true);
    const q = quotes.find(x => x.id === shareSheet.id);
    if (!q) {
      setToast("Quote not found");
      setSharing(false);
      return;
    }
    const now = new Date().toISOString();
    const updated = { ...q, assigned_to_user_id: uid, sync_status: "pending", updated_at: now };
    setData(d => ({
      ...d,
      quotes: (d.quotes || []).map(x => (x.id === q.id ? updated : x)),
      syncQueue: [
        { id: genId(), table: "quotes", action: "update", data: updated, status: "pending", created_at: now },
        ...(d.syncQueue || []),
      ],
    }));
    await offlineSave("quotes", updated);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ assigned_to_user_id: uid, updated_at: now })
        .eq("id", q.id);
      if (error) throw error;
      setData(d => ({
        ...d,
        quotes: (d.quotes || []).map(x => (x.id === q.id ? { ...x, sync_status: "synced" } : x)),
        syncQueue: (d.syncQueue || []).filter(item => !(item.table === "quotes" && item.data?.id === q.id)),
      }));
      setToast("Quote assigned to " + (email?.split("@")[0] || email));
    } catch (e) {
      setToast("Quote saved offline and queued for sync");
    }
    setSharing(false);
    setShareSheet(null);
  }
  function renderQuoteForm(isEdit) {
    return (
      <Card className="p-4 stack-y-3">
        <p className="text-base font-black text-slate-800">{isEdit ? "Edit Quote" : "New Quote"}</p>
        <ClientSelector
          label="Client"
          value={form.client_id}
          onChange={v => {
            const cl = (data.clients || []).find(c => c.id === v);
            setForm(f => ({
              ...f,
              client_id: v || null,
              client_name: cl ? `${cl.company}${cl.branch ? " — " + cl.branch : ""}` : "",
            }));
          }}
          clients={(data.clients || []).filter(isMine)}
          placeholder="Select client…"
        />
        <Field
          label="Description"
          value={form.description}
          onChange={v => setForm(f => ({ ...f, description: v }))}
          placeholder="What the quote covers"
          multiline
          required
        />
        <QuoteLineItems
          items={lineItems}
          onChange={setLineItems}
          vatInclusive={vatInclusive}
          vatRegistered={profile.vat_registered !== false}
          onVatToggle={setVatInclusive}
        />
        {lineItems.length === 0 && (
          <Field
            label="Value (R)"
            type="number"
            value={form.value}
            onChange={v => setForm(f => ({ ...f, value: v }))}
            placeholder="0.00"
          />
        )}
        <Field
          label="Valid for (days)"
          type="number"
          value={validDays}
          onChange={setValidDays}
          placeholder={`${profile.quote_validity_days || 30} (company default)`}
        />
        <QuoteDetailsEditor details={details} onChange={setDetails} />
        <SelectField
          label="Status"
          value={form.status}
          onChange={v => setForm(f => ({ ...f, status: v }))}
          options={["Pending", "Accepted", "Rejected", "Expired"]}
        />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveQuote}>
            <Save size={15} />
            {isEdit ? "Update" : "Add Quote"}
          </Btn>
          <Btn variant="secondary" onClick={resetForm}>
            Cancel
          </Btn>
        </div>
      </Card>
    );
  }
  const filtered = quotes
      .filter(q => filterStatus === "All" || q.status === filterStatus)
      .filter(
        q =>
          !search ||
          [q.client_name, q.description].some(x => x?.toLowerCase().includes(search.toLowerCase())),
      ),
    totalValue = filtered.reduce((s, q) => s + parseFloat(q.value || 0), 0);
  return (
    <div className="stack-y-4">
      {dialog}
      <ShareSheet
        open={!!shareSheet && !sharing}
        onClose={() => setShareSheet(null)}
        record={shareSheet}
        members={teamMembers}
        currentUserId={userId}
        userEmail={userEmail}
        teamId={teamId}
        onAssign={assignQuote}
      />
      <div className="flex items-start gap-3">
        <PageHeader title="Quotes" subtitle={`${quotes.length} total · ${formatCurrency(totalValue)}`} />
        <Btn
          size="sm"
          className="shrink-0 whitespace-nowrap"
          onClick={() => {
            if (showForm || editId) resetForm();
            else setShowForm(true);
          }}
        >
          {showForm || editId ? <X size={15} /> : <Plus size={15} />} {showForm || editId ? "Cancel" : "Add"}
        </Btn>
      </div>
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {renderQuoteForm(false)}
          </motion.div>
        )}
      </AnimatePresence>
      <SearchBar value={search} onChange={setSearch} placeholder="Search quotes…" />
      <div className="flex items-center justify-end">
        <CollapsibleFilters
          groups={[
            {
              label: "Status",
              options: ["All", "Pending", "Accepted", "Rejected", "Expired"],
              value: filterStatus,
              onChange: setFilterStatus,
              dangerValue: "Rejected",
            },
          ]}
        />
      </div>
      {filtered.length === 0 && (
        <Empty title="No quotes found" text="Add a quote or change filters." icon={FileIcon} />
      )}
      <div className="stack-y-2">
        {filtered.map(q => {
          if (editId === q.id)
            return (
              <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {renderQuoteForm(true)}
              </motion.div>
            );
          const sc = QUOTE_STATUS_COLORS[q.status] || QUOTE_STATUS_COLORS.Pending;
          return (
            <Card key={q.id} className="p-4">
              <div className="min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-slate-900 wrap-break-word">
                      {q.client_name || "Unknown client"}
                    </p>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{ background: sc.bg, color: sc.text }}
                    >
                      {q.status}
                    </span>
                  </div>
                  <ExpandableText text={q.description} className="mt-1" />
                  <p className="mt-1.5 text-lg font-black" style={{ color: BRAND.primary }}>
                    {formatCurrency(q.value)}
                  </p>
                  {q.sent_date && (
                    <p className="text-xs text-slate-400 mt-0.5">Sent {smartDate(q.sent_date)}</p>
                  )}
                  {q.sync_status === "pending" && (
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                      Not synced
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-4 gap-1.5">
                  {teamMembers.length > 0 && (
                    <button
                      onClick={() =>
                        setShareSheet({ id: q.id, title: q.client_name || "Quote", type: "quote" })
                      }
                      className="min-h-[44px] rounded-xl bg-slate-50 text-slate-400 active:bg-slate-100 active:text-purple-600 flex items-center justify-center"
                      title="Share with teammate"
                    >
                      <Share2 size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => setPdfFor(pdfFor === q.id ? null : q.id)}
                    className={`min-h-[44px] rounded-xl flex items-center justify-center ${pdfFor === q.id ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-400 active:bg-slate-100 active:text-green-600"}`}
                    title="Make a PDF"
                    aria-label="Make a PDF"
                    aria-expanded={pdfFor === q.id}
                  >
                    <Download size={15} />
                  </button>
                  <button
                    onClick={() => startEdit(q)}
                    className="min-h-[44px] rounded-xl bg-slate-50 text-slate-400 active:bg-slate-100 active:text-blue-600 flex items-center justify-center"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => deleteQuote(q.id, q.client_name)}
                    className="min-h-[44px] rounded-xl bg-slate-50 text-slate-400 active:bg-slate-100 active:text-red-600 flex items-center justify-center"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {pdfFor === q.id && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => sharePdf(q, "quote")}
                      className="min-h-[44px] rounded-xl bg-green-50 text-green-800 text-sm font-bold"
                    >
                      Quotation
                    </button>
                    <button
                      onClick={() => sharePdf(q, "proforma")}
                      className="min-h-[44px] rounded-xl bg-slate-50 text-slate-700 text-sm font-bold border border-slate-200"
                    >
                      Pro forma invoice
                    </button>
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
