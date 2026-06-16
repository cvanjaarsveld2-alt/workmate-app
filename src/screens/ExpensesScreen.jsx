// ─── Expenses Screen ──────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, Camera, Sparkles, Receipt,
  Mail, CheckSquare, Square, FileDown,
} from "lucide-react";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { supabase } from "../supabase";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { resolveReceiptUrl, getSignedUrl, extractStoragePath } from "../lib/storage";
import {
  Card, Btn, Field, SelectField, SearchBar, FilterPills,
  Toast, Empty, PageHeader, useConfirm,
} from "../components/ui";

const CATEGORIES = [
  "Fuel", "Accommodation", "Meals & Entertainment", "Tools & Equipment",
  "Parts & Materials", "Travel", "Office", "Other",
];

const CATEGORY_COLORS = {
  "Fuel":                  { bg: "#FEF3C7", text: "#92400E" },
  "Accommodation":         { bg: "#EDE9FE", text: "#5B21B6" },
  "Meals & Entertainment": { bg: "#FFE4D9", text: "#7C2D12" },
  "Tools & Equipment":     { bg: "#DBEAFE", text: "#1E40AF" },
  "Parts & Materials":     { bg: "#DCFCE7", text: "#166534" },
  "Travel":                { bg: "#CFFAFE", text: "#0E7490" },
  "Office":                { bg: "#F1F5F9", text: "#475569" },
  "Other":                 { bg: "#F1F5F9", text: "#64748B" },
};

const STATUS_COLORS = {
  unsubmitted: { bg: "#FEF3C7", text: "#92400E", label: "Unsubmitted" },
  submitted:   { bg: "#DBEAFE", text: "#1E40AF", label: "Submitted" },
  reimbursed:  { bg: "#DCFCE7", text: "#166534", label: "Reimbursed" },
};

// ⚠️ SET YOUR FINANCE DEPARTMENT EMAIL HERE
const FINANCE_EMAIL = "vicky@pwrstart.com";

// Receipts live in a PRIVATE bucket. We mint a short-lived signed URL on demand
// (path is what's stored in receipt_url). Falls back to treating the value as a
// full URL for any legacy rows saved before the bucket was made private.
async function signReceipt(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl; // legacy public URL
  try {
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(pathOrUrl, 60 * 60); // 1 hour
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

// Thumbnail that resolves a signed URL for a private receipt path.
function ReceiptThumb({ path, onClick }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    signReceipt(path).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  if (!url) {
    return <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0"><Receipt size={16} className="text-slate-300" /></div>;
  }
  return (
    <button onClick={onClick} className="shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
      <img src={url} alt="" className="w-full h-full object-cover" />
    </button>
  );
}

// Full-size signed receipt image (used in the form preview).
function SignedReceiptImg({ stored, className }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    signReceipt(stored).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [stored]);
  if (!url) {
    return <div className="w-full h-32 bg-slate-50 flex items-center justify-center"><Receipt size={24} className="text-slate-300" /></div>;
  }
  return <img src={url} alt="Receipt" className={className} />;
}

function fmtMoney(amount, currency = "ZAR") {
  const sym = currency === "ZAR" ? "R" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const n = parseFloat(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

// Resolves a private receipt path/URL into a signed URL for display.
function SignedReceiptImg({ stored, className, alt = "Receipt" }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    if (!stored) { setUrl(null); return; }
    // Already a usable http URL that isn't a stale public link? use directly.
    resolveReceiptUrl(stored).then(u => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [stored]);
  if (!stored) return null;
  if (!url) return <div className={className} style={{ background: "#F1F5F9" }} />;
  return <img src={url} alt={alt} className={className} />;
}

// Opens a receipt in a new tab via a freshly signed URL.
async function openReceipt(stored) {
  const url = await resolveReceiptUrl(stored);
  if (url) window.open(url, "_blank");
}

export function ExpensesScreen({ data, setData, userId, quickAddTrigger }) {
  const [showForm, setShowForm]       = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editId, setEditId]           = useState(null);
  const [search, setSearch]           = useState("");
  const [filterCat, setFilterCat]     = useState("All");
  const [toast, setToast]             = useState("");
  const [receiptUrl, setReceiptUrl]   = useState(null);
  const [scannedNotice, setScannedNotice] = useState(false);
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [form, setForm] = useState({
    vendor: "", amount: "", vat_amount: "", currency: "ZAR",
    expense_date: todayISO(), expense_time: "", category: "Other",
    payment_method: "Card", notes: "",
  });
  const { confirm, dialog } = useConfirm();
  const expenses = data.expenses || [];

  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Expenses") return;
    setEditId(null);
    setShowScanner(true);
  }, [quickAddTrigger?.ts]);

  function resetForm() {
    setForm({
      vendor: "", amount: "", vat_amount: "", currency: "ZAR",
      expense_date: todayISO(), expense_time: "", category: "Other",
      payment_method: "Card", notes: "",
    });
    setReceiptUrl(null);
    setScannedNotice(false);
    setEditId(null);
    setShowForm(false);
    setShowScanner(false);
  }

  function handleScanComplete(extracted) {
    setForm({
      vendor:         extracted.vendor || "",
      amount:         extracted.amount ? String(extracted.amount) : "",
      vat_amount:     extracted.vat_amount ? String(extracted.vat_amount) : "",
      currency:       extracted.currency || "ZAR",
      expense_date:   extracted.expense_date || todayISO(),
      expense_time:   extracted.expense_time || "",
      category:       extracted.category || "Other",
      payment_method: extracted.payment_method || "Card",
      notes:          "",
    });
    setReceiptUrl(extracted.receipt_url || null);
    setScannedNotice(true);
    setShowScanner(false);
    setShowForm(true);
    setTimeout(() => setScannedNotice(false), 6000);
  }

  function startEdit(ex) {
    setForm({
      vendor:         ex.vendor || "",
      amount:         ex.amount ? String(ex.amount) : "",
      vat_amount:     ex.vat_amount ? String(ex.vat_amount) : "",
      currency:       ex.currency || "ZAR",
      expense_date:   ex.expense_date || todayISO(),
      expense_time:   ex.expense_time || "",
      category:       ex.category || "Other",
      payment_method: ex.payment_method || "Card",
      notes:          ex.notes || "",
    });
    setReceiptUrl(ex.receipt_url || null);
    setEditId(ex.id);
    setShowForm(true);
    setShowScanner(false);
  }

  async function saveExpense() {
    if (!form.amount || parseFloat(form.amount) <= 0) { setToast("Enter a valid amount"); return; }
    const clean = {
      ...form,
      amount: parseFloat(form.amount || 0),
      vat_amount: parseFloat(form.vat_amount || 0),
      expense_date: form.expense_date || null,
      receipt_url: receiptUrl || null,
    };

    if (editId) {
      const existing = expenses.find(e => e.id === editId);
      const updated = { ...existing, ...clean, ai_extracted: existing.ai_extracted, updated_at: new Date().toISOString(), sync_status: "pending" };
      setData(d => ({
        ...d,
        expenses: (d.expenses || []).map(e => e.id === editId ? updated : e),
        syncQueue: [{ id: genId(), table: "expenses", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("expenses", updated);
      setToast("Expense updated");
      triggerImmediateSync();
    } else {
      const item = {
        id: genId(), user_id: userId, ...clean,
        status: "unsubmitted",
        ai_extracted: scannedNotice,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_status: "pending",
      };
      setData(d => ({
        ...d,
        expenses: [item, ...(d.expenses || [])],
        syncQueue: [{ id: genId(), table: "expenses", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
      }));
      await offlineSave("expenses", item);
      setToast("Expense saved");
      triggerImmediateSync();
    }
    resetForm();
  }

  async function deleteExpense(id) {
    const ok = await confirm("Delete this expense?", { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    setData(d => ({
      ...d,
      expenses: (d.expenses || []).filter(e => e.id !== id),
      syncQueue: [{ id: genId(), table: "expenses", action: "delete", data: { id }, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    setToast("Expense deleted");
    triggerImmediateSync();
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function sendToFinance() {
    const selected = expenses.filter(e => selectedIds.has(e.id));
    if (selected.length === 0) { setToast("Select expenses to send"); return; }

    setToast("Preparing receipt links…");

    // Sign each receipt with a 7-day link so Finance has time to open them.
    const signedLinks = await Promise.all(selected.map(async (e) => {
      if (!e.receipt_url) return null;
      if (e.receipt_url.startsWith("http")) return e.receipt_url;
      try {
        const { data } = await supabase.storage.from("receipts").createSignedUrl(e.receipt_url, 60 * 60 * 24 * 7);
        return data?.signedUrl || null;
      } catch { return null; }
    }));

    const total = selected.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const lines = selected.map((e, i) =>
      `${i + 1}. ${e.expense_date ? smartDate(e.expense_date) : "No date"} — ${e.vendor || "Unknown vendor"}\n` +
      `   ${e.category} · ${fmtMoney(e.amount, e.currency)}${e.vat_amount > 0 ? ` (VAT ${fmtMoney(e.vat_amount, e.currency)})` : ""} · ${e.payment_method}\n` +
      `   ${signedLinks[i] ? "Receipt: " + signedLinks[i] : "No receipt photo"}`
    ).join("\n\n");

    const body = `Hi Finance team,

Please find my expense claim below (${selected.length} item${selected.length !== 1 ? "s" : ""}):

${lines}

────────────────────
TOTAL: ${fmtMoney(total, selected[0]?.currency || "ZAR")}
Date: ${smartDate(todayISO())}

Note: receipt links expire in 7 days.

Kind regards`;

    const subject = encodeURIComponent(`Expense Claim — ${smartDate(todayISO())} (${selected.length} item${selected.length !== 1 ? "s" : ""})`);
    window.open(`mailto:${encodeURIComponent(FINANCE_EMAIL)}?subject=${subject}&body=${encodeURIComponent(body)}`, "_blank");

    // Mark as submitted
    const now = new Date().toISOString();
    setData(d => ({
      ...d,
      expenses: (d.expenses || []).map(e => selectedIds.has(e.id) ? { ...e, status: "submitted", sync_status: "pending" } : e),
      syncQueue: [
        ...selected.map(e => ({ id: genId(), table: "expenses", action: "update", data: { ...e, status: "submitted", sync_status: "pending" }, status: "pending", created_at: now })),
        ...(d.syncQueue || []),
      ],
    }));
    selected.forEach(e => offlineSave("expenses", { ...e, status: "submitted" }));
    triggerImmediateSync();
    setToast(`${selected.length} expense${selected.length !== 1 ? "s" : ""} sent to finance ✓`);
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const filtered = expenses
    .filter(e => filterCat === "All" || e.category === filterCat)
    .filter(e => !search || [e.vendor, e.category, e.notes].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (b.expense_date || "").localeCompare(a.expense_date || ""));

  // Group by month
  const byMonth = filtered.reduce((acc, e) => {
    const d = e.expense_date ? new Date(e.expense_date + "T12:00:00") : null;
    const key = d ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "No date";
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const totalThisMonth = (() => {
    const now = new Date();
    return expenses
      .filter(e => {
        if (!e.expense_date) return false;
        const d = new Date(e.expense_date + "T12:00:00");
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  })();

  const unsubmittedCount = expenses.filter(e => e.status === "unsubmitted").length;

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {!selectMode ? (
        <div className="flex items-center justify-between gap-2">
          <PageHeader title="Expenses" subtitle={`${fmtMoney(totalThisMonth)} this month · ${unsubmittedCount} unsubmitted`} />
          <div className="flex gap-2">
            {expenses.length > 0 && (
              <Btn size="sm" variant="secondary" onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}>
                <Mail size={14} /> Send
              </Btn>
            )}
            <Btn size="sm" onClick={() => { if (showForm || showScanner || editId) resetForm(); else setShowScanner(true); }}>
              {(showForm || showScanner || editId) ? <X size={15} /> : <Plus size={15} />}
              {(showForm || showScanner || editId) ? "Cancel" : "Add"}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-red-200 p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-base font-black text-slate-900">{selectedIds.size} selected</p>
              <p className="text-xs text-slate-400">Tap expenses to add to the claim</p>
            </div>
            <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
              <X size={18} />
            </button>
          </div>
          <button onClick={sendToFinance} disabled={selectedIds.size === 0}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40 min-h-[48px]" style={{ background: "#8B1A1A" }}>
            <Mail size={15} /> Send {selectedIds.size > 0 ? `${selectedIds.size} ` : ""}to Finance
          </button>
        </div>
      )}

      <AnimatePresence>
        {showScanner && (
          <ReceiptScanner userId={userId} onExtracted={handleScanComplete} onCancel={() => { setShowScanner(false); setShowForm(true); }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-base font-black text-slate-800">{editId ? "Edit Expense" : "New Expense"}</p>
                {scannedNotice && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
                    <Sparkles size={12} /> AI extracted — please verify
                  </span>
                )}
              </div>

              {receiptUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <SignedReceiptImg stored={receiptUrl} className="w-full max-h-44 object-contain bg-slate-50" />
                </div>
              )}

              <Field label="Vendor" value={form.vendor} onChange={v => setForm(f => ({ ...f, vendor: v }))} placeholder="e.g. Engen Garage" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (total)" type="number" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} placeholder="0.00" required />
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-500">Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 min-h-[52px]">
                    {["ZAR", "USD", "GBP", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <Field label="VAT amount (optional)" type="number" value={form.vat_amount} onChange={v => setForm(f => ({ ...f, vat_amount: v }))} placeholder="0.00" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" type="date" value={form.expense_date} onChange={v => setForm(f => ({ ...f, expense_date: v }))} />
                <Field label="Time (optional)" type="time" value={form.expense_time} onChange={v => setForm(f => ({ ...f, expense_time: v }))} />
              </div>
              <SelectField label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES} />
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {["Card", "Cash", "Account"].map(m => (
                    <button key={m} type="button" onClick={() => setForm(f => ({ ...f, payment_method: m }))}
                      className="rounded-xl py-2.5 text-sm font-bold border-2 transition-all min-h-[44px]"
                      style={form.payment_method === m
                        ? { background: "#F7F3F3", color: "#8B1A1A", borderColor: "#8B1A1A" }
                        : { background: "#F8FAFC", color: "#94A3B8", borderColor: "#E2E8F0" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Notes (optional)" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="What was this for?" multiline />
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={saveExpense}><Save size={15} />{editId ? "Update" : "Save Expense"}</Btn>
                <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search vendor, category…" />
      <FilterPills options={["All", ...CATEGORIES]} value={filterCat} onChange={setFilterCat} dangerValue={null} />

      {filtered.length === 0 && <Empty title="No expenses yet" text="Snap a receipt and let AI capture the details." icon={Receipt} />}

      <div className="space-y-4">
        {Object.entries(byMonth).map(([month, items]) => {
          const monthTotal = items.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
          return (
            <div key={month}>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{month}</p>
                <p className="text-sm font-black" style={{ color: "#8B1A1A" }}>{fmtMoney(monthTotal)}</p>
              </div>
              <div className="space-y-2">
                {items.map(ex => {
                  const cc = CATEGORY_COLORS[ex.category] || CATEGORY_COLORS.Other;
                  const sc = STATUS_COLORS[ex.status] || STATUS_COLORS.unsubmitted;
                  const isSelected = selectedIds.has(ex.id);
                  return (
                    <Card key={ex.id}
                      className={`overflow-hidden transition-all ${selectMode && isSelected ? "ring-2 ring-red-500" : ""}`}
                      onClick={selectMode ? () => toggleSelect(ex.id) : undefined}>
                      <div className={`p-4 ${selectMode ? "cursor-pointer" : ""}`}>
                        <div className="flex items-start gap-3">
                          {selectMode && (
                            <div className="shrink-0 mt-0.5">
                              {isSelected ? <CheckSquare size={22} className="text-red-600" /> : <Square size={22} className="text-slate-300" />}
                            </div>
                          )}
                          {ex.receipt_url && !selectMode && (
                            <ReceiptThumb
                              path={ex.receipt_url}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const signed = await signReceipt(ex.receipt_url);
                                if (signed) window.open(signed, "_blank");
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-base font-black text-slate-900">{fmtMoney(ex.amount, ex.currency)}</p>
                              <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: cc.bg, color: cc.text }}>{ex.category}</span>
                              {ex.ai_extracted && <Sparkles size={12} className="text-purple-400" />}
                            </div>
                            {ex.vendor && <p className="text-sm text-slate-600 mt-0.5">{ex.vendor}</p>}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <p className="text-xs text-slate-400">{ex.expense_date ? smartDate(ex.expense_date) : "No date"}{ex.expense_time ? ` · ${ex.expense_time}` : ""}</p>
                              <span className="text-xs text-slate-300">·</span>
                              <p className="text-xs text-slate-400">{ex.payment_method}</p>
                              {ex.vat_amount > 0 && <><span className="text-xs text-slate-300">·</span><p className="text-xs text-slate-400">VAT {fmtMoney(ex.vat_amount, ex.currency)}</p></>}
                            </div>
                            {ex.notes && <p className="text-xs text-slate-500 italic mt-1 break-words">{ex.notes}</p>}
                            <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                            {ex.sync_status === "pending" && <span className="mt-1 ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Not synced</span>}
                          </div>
                          {!selectMode && (
                            <div className="flex flex-col gap-2 shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); startEdit(ex); }} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Edit2 size={15} /></button>
                              <button onClick={(e) => { e.stopPropagation(); deleteExpense(ex.id); }} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={15} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
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
