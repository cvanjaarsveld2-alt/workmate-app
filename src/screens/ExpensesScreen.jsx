// ─── Expenses Screen ──────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Save,
  Edit2,
  Trash2,
  Camera,
  Sparkles,
  Receipt,
  Mail,
  CheckSquare,
  Square,
  FileDown,
  Send,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Bell,
} from "lucide-react";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { deleteRecord } from "../lib/deleteHelpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { supabase } from "../supabase";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { convertToZAR } from "../lib/exchangeRate";
// expenseFinancePDF loaded lazily
import { DetailSheet, DetailRow } from "../components/DetailSheet";
import { ImageViewer } from "../components/ImageViewer";
import {
  Card, Btn, Field, SelectField, SearchBar, FilterPills,
  Toast, Empty, PageHeader, useConfirm, ClientSelector,
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

// Status used internally — no longer shown as pills on cards
const STATUS_COLORS = {
  unsubmitted: { bg: "#FEF3C7", text: "#92400E", label: "Unsubmitted" },
  submitted:   { bg: "#DBEAFE", text: "#1E40AF", label: "Submitted" },
  reimbursed:  { bg: "#DCFCE7", text: "#166534", label: "Reimbursed" },
};

// ⚠️ SET YOUR FINANCE DEPARTMENT EMAIL HERE
const FINANCE_EMAIL = "vicky@pwrstart.com";

// ─── Calendar month grouping ─────────────────────────────────────────────────
// Groups expenses by calendar month (1st → last day). Returns:
//   key:   "2026-07" (stable sort key)
//   label: "July 2026"
//   start: "2026-07-01"
//   end:   "2026-07-31"
function calendarMonth(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + "T12:00:00");
  if (isNaN(d.getTime())) return null;
  const year  = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const key   = `${year}-${String(month + 1).padStart(2, "0")}`;
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end   = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const label = d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  return { key, label, start, end };
}

// Current calendar month
function currentCalendarMonth() {
  return calendarMonth(new Date().toISOString().slice(0, 10));
}

// ─── End-of-month push notification reminder ─────────────────────────────────
// Shows an in-app banner in the last 3 days of each calendar month,
// reminding the user to submit their expenses to Vicky.
// Uses localStorage to avoid showing more than once per month.
function useEndOfMonthReminder() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const today = new Date();
    const year  = today.getFullYear();
    const month = today.getMonth();
    // Last day of this month
    const lastDay = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysLeft = lastDay - dayOfMonth; // 0 = last day, 1 = second to last, etc.

    if (daysLeft > 3) return; // Only show in last 3 days

    const dismissKey = `expense_reminder_dismissed_${year}_${String(month + 1).padStart(2, "0")}`;
    const alreadyDismissed = localStorage.getItem(dismissKey) === "1";
    if (!alreadyDismissed) {
      setShowBanner(true);
    }

    return undefined;
  }, []);

  function dismiss() {
    const today = new Date();
    const key = `expense_reminder_dismissed_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, "0")}`;
    localStorage.setItem(key, "1");
    setShowBanner(false);
  }

  return { showBanner, dismiss };
}

// ─── Signed URL helper ───────────────────────────────────────────────────────
async function signReceipt(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  try {
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(pathOrUrl, 60 * 60);
    if (error) return null;
    return data?.signedUrl || null;
  } catch { return null; }
}

function ReceiptThumb({ path, onClick }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    signReceipt(path).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  if (!url) {
    return (
      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
        <Receipt size={16} className="text-slate-300" />
      </div>
    );
  }
  return (
    <button onClick={onClick} className="shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
      <img src={url} alt="" className="w-full h-full object-cover" />
    </button>
  );
}

function SignedReceiptImg({ stored, className }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    signReceipt(stored).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [stored]);
  if (!url) {
    return (
      <div className="w-full h-32 bg-slate-50 flex items-center justify-center">
        <Receipt size={24} className="text-slate-300" />
      </div>
    );
  }
  return <img src={url} alt="Receipt" className={className} />;
}

// ─── Decimal-safe amount input ───────────────────────────────────────────────
function normaliseDecimalInput(raw) {
  if (raw === null || raw === undefined) return "";
  let s = String(raw);
  s = s.replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  s = s.replace(/\.(?=.*\.)/g, "");
  return s;
}

function AmountField({ label, value, onChange, placeholder = "0.00", required = false }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(normaliseDecimalInput(e.target.value))}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-base outline-none focus:border-red-300 min-h-[48px]"
      />
    </div>
  );
}

// ─── Duplicate detection ─────────────────────────────────────────────────────
function findLikelyDuplicateIds(expenses) {
  const flagged = new Set();
  const norm = s => (s || "").trim().toLowerCase();
  const amtClose = (a, b) => Math.abs(parseFloat(a || 0) - parseFloat(b || 0)) < 0.05;
  const dateClose = (a, b) => {
    if (!a || !b) return false;
    const da = new Date(a + "T12:00:00");
    const db = new Date(b + "T12:00:00");
    return Math.abs(da - db) <= 86400000;
  };
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i], b = expenses[j];
      if (!a.vendor || !b.vendor) continue;
      if (norm(a.vendor) !== norm(b.vendor)) continue;
      if (!amtClose(a.amount, b.amount)) continue;
      if (!dateClose(a.expense_date, b.expense_date)) continue;
      flagged.add(a.id);
      flagged.add(b.id);
    }
  }
  return flagged;
}

function fmtMoney(amount, currency = "ZAR") {
  const sym = currency === "ZAR" ? "R" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const n = parseFloat(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

// ─── Collapsible month section ───────────────────────────────────────────────
function MonthSection({ monthKey, label, items, duplicateIds, editId, renderExpenseForm,
  selectMode, selectedIds, toggleSelect, setDetailExpense, fmtMoney, CATEGORY_COLORS, smartDate }) {

  const periodTotal = items.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);
  const isCurrent = monthKey === currentCalendarMonth()?.key;
  const [collapsed, setCollapsed] = useState(!isCurrent); // FIX: only current month starts expanded

  return (
    <div>
      {/* Month header — tappable to collapse */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-1 mb-2 group"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-black text-slate-500 uppercase tracking-wider">{label}</p>
          {isCurrent && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
              style={{ background: "#FEF3C7", color: "#92400E" }}>
              Current
            </span>
          )}
          <span className="text-xs text-slate-400 font-medium">{items.length} item{items.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-black" style={{ color: "#8B1A1A" }}>{fmtMoney(periodTotal)}</p>
          <div className="rounded-full p-0.5 bg-slate-100 group-hover:bg-slate-200 transition-colors">
            {collapsed
              ? <ChevronDown size={14} className="text-slate-400" />
              : <ChevronUp size={14} className="text-slate-400" />}
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2 overflow-hidden"
          >
            {items.map(ex => {
              if (editId === ex.id) {
                return (
                  <motion.div key={ex.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {renderExpenseForm()}
                  </motion.div>
                );
              }
              const cc = CATEGORY_COLORS[ex.category] || CATEGORY_COLORS.Other;
              const isSelected = selectedIds.has(ex.id);
              return (
                <Card key={ex.id}
                  className={`overflow-hidden transition-all ${selectMode && isSelected ? "ring-2 ring-red-500" : ""} ${!selectMode ? "active:bg-slate-50 cursor-pointer" : ""}`}
                  onClick={selectMode ? () => toggleSelect(ex.id) : () => setDetailExpense(ex)}>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {selectMode && (
                        <div className="shrink-0 mt-0.5">
                          {isSelected
                            ? <CheckSquare size={22} className="text-red-600" />
                            : <Square size={22} className="text-slate-300" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-lg font-black text-slate-900">{fmtMoney(ex.amount, ex.currency)}</p>
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: cc.bg, color: cc.text }}>{ex.category}</span>
                          {ex.ai_extracted && <Sparkles size={12} className="text-purple-400" />}
                        </div>
                        {ex.currency && ex.currency !== "ZAR" && ex.amount_zar > 0 && (
                          <p className="text-xs font-bold mt-0.5" style={{ color: "#15803D" }}>
                            ≈ {fmtMoney(ex.amount_zar, "ZAR")}
                          </p>
                        )}
                        {ex.vendor && <p className="text-sm font-bold text-slate-700 mt-1">{ex.vendor}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-xs text-slate-400">
                            {ex.expense_date ? smartDate(ex.expense_date) : "No date"}
                            {ex.expense_time ? ` · ${ex.expense_time}` : ""}
                          </p>
                          <span className="text-xs text-slate-300">·</span>
                          <p className="text-xs text-slate-400">{ex.payment_method}</p>
                        </div>
                        {/* Pills row — slip badges + duplicate, but NO status pill */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {ex.receipt_url && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                              <Receipt size={10} /> Slip
                            </span>
                          )}
                          {ex.no_receipt && !ex.receipt_url && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                              ⚠️ No receipt
                            </span>
                          )}
                          {ex.payment_slip_url && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                              💳 Card slip
                            </span>
                          )}
                          {duplicateIds.has(ex.id) && (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                              ⚠ Possible duplicate
                            </span>
                          )}
                          {ex.sync_status === "pending" && (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                              Syncing…
                            </span>
                          )}
                        </div>
                      </div>
                      {!selectMode && <ChevronRight size={18} className="text-slate-300 shrink-0 mt-1" />}
                    </div>
                  </div>
                </Card>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ExpensesScreen({ data, setData, userId, quickAddTrigger }) {
  const [showForm, setShowForm]       = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editId, setEditId]           = useState(null);
  const [search, setSearch]           = useState("");
  const [filterCat, setFilterCat]     = useState("All");
  const [toast, setToast]             = useState("");
  const [receiptUrl, setReceiptUrl]   = useState(null);
  const [paymentSlipUrl, setPaymentSlipUrl] = useState(null);
  const [scannerMode, setScannerMode] = useState("receipt");
  const [paymentMismatch, setPaymentMismatch] = useState(null);
  const [scannedNotice, setScannedNotice] = useState(false);
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [manualZAR, setManualZAR]     = useState("");
  const [detailExpense, setDetailExpense] = useState(null);
  const [viewerImages, setViewerImages] = useState(null);
  const [form, setForm] = useState({
    vendor: "", amount: "", vat_amount: "", currency: "ZAR",
    expense_date: todayISO(), expense_time: "", category: "Other",
    payment_method: "Card", notes: "", client_id: null, client_name: "",
  });
  const { confirm, dialog } = useConfirm();
  const { showBanner: showReminderBanner, dismiss: dismissReminder } = useEndOfMonthReminder();
  const expenses = data.expenses || [];

  // quickAddTrigger → open scanner OR enter select mode pre-filled with unsubmitted
  useEffect(() => {
    if (!quickAddTrigger) return;
    if (quickAddTrigger.screen !== "Expenses") return;
    if (quickAddTrigger.mode === "SelectMode") {
      // Navigate from home "X expenses not submitted" — jump straight to select mode
      // with all unsubmitted expenses pre-selected
      const unsubmitted = (data.expenses || []).filter(e => e.status === "unsubmitted");
      setSelectMode(true);
      setSelectedIds(new Set(unsubmitted.map(e => e.id)));
      setShowForm(false);
      setShowScanner(false);
      setEditId(null);
    } else {
      // Normal FAB tap — open camera scanner
      setEditId(null);
      setShowForm(false);
      setShowScanner(true);
      setScannerMode("receipt");
    }
  }, [quickAddTrigger?.ts]);

  function resetForm() {
    setForm({
      vendor: "", amount: "", vat_amount: "", currency: "ZAR",
      expense_date: todayISO(), expense_time: "", category: "Other",
      payment_method: "Card", notes: "", client_id: null, client_name: "",
    });
    setReceiptUrl(null);
    setPaymentSlipUrl(null);
    setPaymentMismatch(null);
    setScannerMode("receipt");
    setScannedNotice(false);
    setManualZAR("");
    setEditId(null);
    setShowForm(false);
    setShowScanner(false);
  }

  function handleScanComplete(extracted) {
    if (scannerMode === "payment") {
      setPaymentSlipUrl(extracted.receipt_url || null);
      const tillAmount = parseFloat(form.amount || 0);
      const slipAmount = parseFloat(extracted.amount || 0);
      if (tillAmount > 0 && slipAmount > 0 && Math.abs(tillAmount - slipAmount) > 0.5) {
        setPaymentMismatch({ tillAmount, slipAmount });
      } else {
        setPaymentMismatch(null);
      }
      setShowScanner(false);
      setShowForm(true);
      setScannerMode("receipt");
      return;
    }
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
      client_id:      ex.client_id || null,
      client_name:    ex.client_name || "",
    });
    setReceiptUrl(ex.receipt_url || null);
    setPaymentSlipUrl(ex.payment_slip_url || null);
    setManualZAR(ex.rate_source === "Manual entry" && ex.amount_zar ? String(ex.amount_zar) : "");
    setEditId(ex.id);
    setShowForm(true);
    setShowScanner(false);
  }

  async function saveExpense() {
    if (!form.amount || parseFloat(form.amount) <= 0) { setToast("Enter a valid amount"); return; }

    let zarInfo = null;
    const manualZARNum = parseFloat(manualZAR);
    if (!form.currency || form.currency === "ZAR") {
      zarInfo = { amount_zar: parseFloat(form.amount), exchange_rate: 1, rate_date: todayISO(), rate_source: "ZAR" };
    } else if (!isNaN(manualZARNum) && manualZARNum > 0) {
      zarInfo = {
        amount_zar: manualZARNum,
        exchange_rate: manualZARNum / parseFloat(form.amount),
        rate_date: todayISO(),
        rate_source: "Manual entry",
      };
    } else {
      try {
        zarInfo = await convertToZAR(parseFloat(form.amount), form.currency, form.expense_date, userId);
      } catch {
        zarInfo = null;
      }
    }

    const now = new Date().toISOString();
    const row = {
      id:               editId || genId(),
      user_id:          userId,
      vendor:           form.vendor,
      amount:           parseFloat(form.amount) || 0,
      vat_amount:       parseFloat(form.vat_amount) || null,
      currency:         form.currency || "ZAR",
      amount_zar:       zarInfo?.amount_zar ?? null,
      exchange_rate:    zarInfo?.exchange_rate ?? null,
      rate_date:        zarInfo?.rate_date ?? null,
      rate_source:      zarInfo?.rate_source ?? null,
      expense_date:     form.expense_date || todayISO(),
      expense_time:     form.expense_time || null,
      category:         form.category || "Other",
      payment_method:   form.payment_method || "Card",
      notes:            form.notes || null,
      receipt_url:      (receiptUrl && receiptUrl !== "no-receipt") ? receiptUrl : null,
      no_receipt:       receiptUrl === "no-receipt" ? true : undefined,
      payment_slip_url: paymentSlipUrl || null,
      status:           editId
                          ? (expenses.find(e => e.id === editId)?.status || "unsubmitted")
                          : "unsubmitted",
      ai_extracted:     scannedNotice,
      client_id:        form.client_id || null,
      client_name:      form.client_name || null,
      sync_status:      "pending",
      created_at:       editId
                          ? (expenses.find(e => e.id === editId)?.created_at || now)
                          : now,
      updated_at:       now,
    };

    setData(d => ({
      ...d,
      expenses: editId
        ? (d.expenses || []).map(e => e.id === editId ? row : e)
        : [row, ...(d.expenses || [])],
      syncQueue: [{
        id: genId(), table: "expenses",
        action: editId ? "update" : "insert",
        data: row, status: "pending", created_at: now,
      }, ...(d.syncQueue || [])],
    }));
    offlineSave("expenses", row);
    setToast(editId ? "Expense updated ✓" : "Expense saved ✓");
    triggerImmediateSync();
    resetForm();
  }

  async function deleteExpense(id) {
    const ok = await confirm("Delete this expense?", { confirmLabel: "Delete" });
    if (!ok) return;
    if (editId === id) resetForm();
    await deleteRecord("expenses", id, userId, setData);
    setToast("Expense deleted");
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const [financePack, setFinancePack] = React.useState(null);

  async function sendToFinance() {
    const selected = expenses.filter(e => selectedIds.has(e.id));
    if (selected.length === 0) { setToast("Select expenses to send"); return; }
    setToast("Building finance pack…");
    const sampleDate = selected[0]?.expense_date;
    const period = sampleDate ? calendarMonth(sampleDate) : currentCalendarMonth();

    let pdfBlob, filename, ref;
    try {
      const result = await buildExpensePDF({
        expenses: selected,
        submitter: { name: data?._submitter?.name, email: data?._submitter?.email },
        periodLabel: period?.label || "—",
      });
      pdfBlob = result.blob;
      filename = result.filename;
      ref = result.ref;
    } catch (e) {
      console.error("PDF build failed:", e);
      setToast("Couldn't build PDF — try again");
      return;
    }
    const totalZAR = selected.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);
    const url = URL.createObjectURL(pdfBlob);
    setFinancePack({ blob: pdfBlob, url, filename, ref, periodLabel: period?.label || "—", totalZAR, count: selected.length, ids: Array.from(selectedIds) });
    setToast("");
  }

  function markPackSubmitted() {
    if (!financePack) return;
    const ids = new Set(financePack.ids);
    const now = new Date().toISOString();
    const updates = expenses.filter(e => ids.has(e.id));
    setData(d => ({
      ...d,
      expenses: (d.expenses || []).map(e => ids.has(e.id) ? { ...e, status: "submitted", sync_status: "pending" } : e),
      syncQueue: [
        ...updates.map(e => ({ id: genId(), table: "expenses", action: "update", data: { ...e, status: "submitted", sync_status: "pending" }, status: "pending", created_at: now })),
        ...(d.syncQueue || []),
      ],
    }));
    updates.forEach(e => offlineSave("expenses", { ...e, status: "submitted" }));
    triggerImmediateSync();
    setToast(`${financePack.count} expense${financePack.count !== 1 ? "s" : ""} marked submitted ✓`);
    setSelectMode(false);
    setSelectedIds(new Set());
    closeFinancePack();
  }

  function closeFinancePack() {
    if (financePack?.url) URL.revokeObjectURL(financePack.url);
    setFinancePack(null);
  }

  async function openExpenseImages(ex, startWith = "till") {
    const items = [];
    const tillSigned = await signReceipt(ex.receipt_url);
    if (tillSigned) items.push({ url: tillSigned, caption: `Till slip — ${ex.vendor || ""}` });
    const paySigned = await signReceipt(ex.payment_slip_url);
    if (paySigned) items.push({ url: paySigned, caption: `Payment slip — ${ex.vendor || ""}` });
    if (items.length === 0) { setToast("No images on this expense"); return; }
    const startIdx = startWith === "payment" && items.length > 1 ? 1 : 0;
    setViewerImages({ list: items, startIndex: startIdx });
  }

  function previewFinancePack() {
    if (!financePack) return;
    window.open(financePack.url, "_blank");
  }

  async function shareFinancePack() {
    if (!financePack) return;
    const { blob, filename, ref, totalZAR, periodLabel } = financePack;
    const file = new File([blob], filename, { type: "application/pdf" });
    const shareData = { title: `Expense Claim ${ref}`, text: `Expense claim ${ref} — ${fmtMoney(totalZAR, "ZAR")} for ${periodLabel}.`, files: [file] };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share(shareData);
        markPackSubmitted();
      } catch (e) {
        if (e.name !== "AbortError") console.warn("Share failed:", e);
      }
    } else {
      const a = document.createElement("a");
      a.href = financePack.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setToast("PDF downloaded — attach it to your email manually");
    }
  }

  function emailFinancePack() {
    if (!financePack) return;
    const { filename, ref, totalZAR, periodLabel, count, url } = financePack;
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    const body = `Hi Vicky,\n\nPlease find attached my expense claim ${ref}.\n\nSummary:\n  • ${count} item${count !== 1 ? "s" : ""}\n  • Period: ${periodLabel}\n  • Total claim: ${fmtMoney(totalZAR, "ZAR")}\n\nThe attached PDF (${filename}) contains the full breakdown, totals by category, and all receipt images.\n\nKind regards`;
    const subject = encodeURIComponent(`Expense Claim ${ref} — ${fmtMoney(totalZAR, "ZAR")}`);
    setToast("PDF downloaded — attach it to the email that just opened");
    setTimeout(() => {
      window.open(`mailto:${encodeURIComponent(FINANCE_EMAIL)}?subject=${subject}&body=${encodeURIComponent(body)}`, "_blank");
      markPackSubmitted();
    }, 500);
  }

  // ─── Derived state ─────────────────────────────────────────────────────────
  const duplicateIds = findLikelyDuplicateIds(expenses);

  const filtered = expenses
    .filter(e => filterCat === "All" || e.category === filterCat)
    .filter(e => !search || [e.vendor, e.category, e.notes].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      const da = a.expense_date || "";
      const db = b.expense_date || "";
      const dt = da.localeCompare(db);
      if (dt !== 0) return dt;
      return (a.expense_time || "").localeCompare(b.expense_time || "");
    });

  // Group by calendar month
  const monthsInOrder = [];
  const byMonthMap = {};
  filtered.forEach(e => {
    const m = e.expense_date ? calendarMonth(e.expense_date) : null;
    const key   = m ? m.key   : "no-date";
    const label = m ? m.label : "No date";
    if (!byMonthMap[key]) {
      byMonthMap[key] = { label, items: [] };
      monthsInOrder.push(key);
    }
    byMonthMap[key].items.push(e);
  });
  const orderedMonthKeys = monthsInOrder
    .filter(k => k !== "no-date")
    .sort((a, b) => b.localeCompare(a))
    .concat(monthsInOrder.includes("no-date") ? ["no-date"] : []);

  // Summary for header
  const thisPeriod = currentCalendarMonth();
  const totalThisMonth = expenses
    .filter(e => e.expense_date && e.expense_date >= thisPeriod.start && e.expense_date <= thisPeriod.end)
    .reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);

  const unsubmittedCount = expenses.filter(e => e.status === "unsubmitted").length;

  // ─── Expense form (rendered at top for new, inline for edit) ────────────────
  function renderExpenseForm() {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-black text-slate-800">{editId ? "Edit Expense" : "New Expense"}</p>
          {scannedNotice && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
              <Sparkles size={12} /> AI extracted — verify
            </span>
          )}
        </div>

        {/* Slip photos — big tap targets with camera icon, easy to replace */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Till slip</p>
            {receiptUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <SignedReceiptImg stored={receiptUrl} className="w-full h-32 object-contain" />
                {/* Overlay: tap anywhere to re-scan */}
                <button type="button"
                  onClick={() => { setScannerMode("receipt"); setShowScanner(true); }}
                  className="absolute inset-0 flex items-end justify-center pb-2 bg-black/0 hover:bg-black/20 active:bg-black/30 transition-colors">
                  <span className="rounded-full bg-black/50 text-white text-[10px] font-bold px-2 py-1 flex items-center gap-1">
                    <Camera size={10} /> Replace
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button type="button"
                  onClick={() => { setScannerMode("receipt"); setShowScanner(true); }}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 hover:border-red-300 hover:bg-red-50 active:scale-98 transition-all">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F7F3F3" }}>
                    <Camera size={18} style={{ color: "#8B1A1A" }} />
                  </div>
                  <span className="text-xs font-bold text-slate-500">Scan till slip</span>
                </button>
                {/* No receipt option */}
                <button type="button"
                  onClick={() => setReceiptUrl("no-receipt")}
                  className={`w-full py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                    receiptUrl === "no-receipt"
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-slate-100 bg-slate-50 text-slate-400 hover:border-amber-300 hover:text-amber-600"
                  }`}>
                  {receiptUrl === "no-receipt" ? "⚠️ No receipt" : "No receipt"}
                </button>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">
              Payment slip <span className="text-slate-400 font-normal">(optional)</span>
            </p>
            {paymentSlipUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <SignedReceiptImg stored={paymentSlipUrl} className="w-full h-32 object-contain" />
                <div className="absolute top-1 right-1 flex gap-1">
                  <button type="button"
                    onClick={() => { setScannerMode("payment"); setShowScanner(true); }}
                    className="p-1.5 rounded-full bg-black/50 text-white">
                    <Camera size={11} />
                  </button>
                  <button type="button"
                    onClick={() => { setPaymentSlipUrl(null); setPaymentMismatch(null); }}
                    className="p-1.5 rounded-full bg-black/50 text-white">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ) : (
              <button type="button"
                onClick={() => { setScannerMode("payment"); setShowScanner(true); }}
                className="w-full h-32 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 hover:border-red-300 hover:bg-red-50 active:scale-98 transition-all">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F7F3F3" }}>
                  <Camera size={18} style={{ color: "#8B1A1A" }} />
                </div>
                <span className="text-xs font-bold text-slate-500">Add payment slip</span>
              </button>
            )}
          </div>
        </div>

        {paymentMismatch && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800">⚠ Amount mismatch</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Till slip says {fmtMoney(paymentMismatch.tillAmount, form.currency)}, payment slip says {fmtMoney(paymentMismatch.slipAmount, form.currency)}.
              Verify which is correct before saving.
            </p>
          </div>
        )}

        <Field label="Vendor" value={form.vendor} onChange={v => setForm(f => ({ ...f, vendor: v }))} placeholder="e.g. Engen Garage" />
        <div className="grid grid-cols-2 gap-3">
          <AmountField label="Amount (total)" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} placeholder="0.00" required />
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-500">Currency</label>
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 min-h-[52px]">
              {["ZAR","USD","GBP","EUR","GHS","NGN","KES","TZS","UGX","BWP","NAD","MWK","MZN","ZMW","AED","SAR","INR","CNY","JPY","AUD","CAD"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {form.currency && form.currency !== "ZAR" && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <label className="mb-1.5 block text-sm font-bold text-slate-600">
              ZAR equivalent <span className="text-slate-400 font-normal">— what your bank actually charged</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-500 shrink-0">R</span>
              <input type="text" inputMode="decimal" value={manualZAR}
                onChange={e => setManualZAR(normaliseDecimalInput(e.target.value))}
                placeholder="leave blank to use ECB rate"
                className="flex-1 rounded-xl border-2 border-slate-100 bg-white p-3 text-base outline-none focus:border-red-300 min-h-[48px]" />
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Leave blank for USD/GBP/EUR — the app fetches the ECB rate. Fill in for Cedi, Naira, etc.
            </p>
          </div>
        )}

        <AmountField label="VAT amount (optional)" value={form.vat_amount} onChange={v => setForm(f => ({ ...f, vat_amount: v }))} placeholder="0.00" />
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
        <ClientSelector label="Client (optional)" value={form.client_id}
          onChange={v => {
            const cl = (data.clients || []).find(c => c.id === v);
            setForm(f => ({ ...f, client_id: v || null, client_name: cl ? `${cl.company}${cl.branch ? " — " + cl.branch : ""}` : "" }));
          }}
          clients={(data.clients || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId)} placeholder="Link to a client…" />

        <Field label="Notes (optional)" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="What was this for?" multiline />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveExpense}><Save size={15} />{editId ? "Update" : "Save Expense"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Expense detail sheet ── */}
      <DetailSheet
        open={!!detailExpense}
        onClose={() => setDetailExpense(null)}
        title={detailExpense ? fmtMoney(detailExpense.amount, detailExpense.currency) : ""}
        subtitle={detailExpense
          ? `${detailExpense.vendor || "Unknown vendor"} · ${detailExpense.category}${detailExpense.expense_date ? ` · ${smartDate(detailExpense.expense_date)}` : ""}`
          : ""}
        primaryActions={detailExpense && (
          <div className={`grid gap-2 ${detailExpense.receipt_url && detailExpense.payment_slip_url ? "grid-cols-2" : "grid-cols-1"}`}>
            {detailExpense.receipt_url && (
              <button onClick={() => openExpenseImages(detailExpense, "till")}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                style={{ background: "#8B1A1A" }}>
                📄 View till slip
              </button>
            )}
            {detailExpense.payment_slip_url && (
              <button onClick={() => openExpenseImages(detailExpense, "payment")}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                style={{ background: "#7C2D12" }}>
                💳 Payment slip
              </button>
            )}
            {!detailExpense.receipt_url && !detailExpense.payment_slip_url && (
              <button
                onClick={() => { setDetailExpense(null); startEdit(detailExpense); setScannerMode("receipt"); setShowScanner(true); setShowForm(false); }}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                style={{ background: "#8B1A1A" }}>
                <Camera size={15} /> Add slip photo
              </button>
            )}
          </div>
        )}
        secondaryActions={detailExpense && (
          <>
            <button
              onClick={() => { setDetailExpense(null); startEdit(detailExpense); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
              <Edit2 size={14} /> Edit
            </button>
            <button
              onClick={() => { const id = detailExpense.id; setDetailExpense(null); deleteExpense(id); }}
              className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-red-100 bg-white text-red-600 min-h-[48px]">
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      >
        {detailExpense && (
          <>
            {duplicateIds.has(detailExpense.id) && (() => {
              const match = expenses.find(e =>
                e.id !== detailExpense.id &&
                (e.vendor || "").trim().toLowerCase() === (detailExpense.vendor || "").trim().toLowerCase()
              );
              return (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-bold text-amber-800">⚠ Possible duplicate</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Same vendor and amount as another expense{match?.expense_date ? ` dated ${smartDate(match.expense_date)}` : ""}.
                    Check both before submitting.
                  </p>
                </div>
              );
            })()}

            {detailExpense.currency && detailExpense.currency !== "ZAR" && detailExpense.amount_zar > 0 && (
              <div className="rounded-xl bg-green-50 border border-green-100 p-3">
                <p className="text-xs font-bold text-green-700 uppercase tracking-wider">ZAR equivalent</p>
                <p className="text-xl font-black text-green-800 mt-0.5">{fmtMoney(detailExpense.amount_zar, "ZAR")}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  Rate {Number(detailExpense.exchange_rate || 0).toFixed(4)} on {detailExpense.rate_date || "n/a"} ({detailExpense.rate_source || "n/a"})
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Payment" value={detailExpense.payment_method} />
              <DetailRow label="Status" value={(STATUS_COLORS[detailExpense.status] || STATUS_COLORS.unsubmitted).label} />
              {detailExpense.expense_time && <DetailRow label="Time" value={detailExpense.expense_time} mono />}
              {detailExpense.vat_amount > 0 && <DetailRow label="VAT included" value={fmtMoney(detailExpense.vat_amount, detailExpense.currency)} />}
            </div>

            {detailExpense.notes && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 border border-slate-100">{detailExpense.notes}</p>
              </div>
            )}

            {/* Inline receipt previews with re-scan overlays */}
            {(detailExpense.receipt_url || detailExpense.payment_slip_url) && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Receipts · tap to enlarge</p>
                <div className={`grid gap-2 ${detailExpense.receipt_url && detailExpense.payment_slip_url ? "grid-cols-2" : "grid-cols-1"}`}>
                  {detailExpense.receipt_url && (
                    <button onClick={() => openExpenseImages(detailExpense, "till")}
                      className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 active:opacity-80">
                      <SignedReceiptImg stored={detailExpense.receipt_url} className="w-full h-40 object-contain bg-slate-50" />
                      <p className="text-xs font-bold text-slate-600 py-2 text-center bg-white">Till slip</p>
                    </button>
                  )}
                  {detailExpense.payment_slip_url && (
                    <button onClick={() => openExpenseImages(detailExpense, "payment")}
                      className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 active:opacity-80">
                      <SignedReceiptImg stored={detailExpense.payment_slip_url} className="w-full h-40 object-contain bg-slate-50" />
                      <p className="text-xs font-bold text-slate-600 py-2 text-center bg-white">Payment slip</p>
                    </button>
                  )}
                </div>
              </div>
            )}

            {detailExpense.ai_extracted && (
              <p className="text-xs text-purple-600 flex items-center gap-1.5">
                <Sparkles size={12} /> Filled by AI from the slip — verify before submitting
              </p>
            )}
          </>
        )}
      </DetailSheet>

      {/* ── Fullscreen image viewer ── */}
      <AnimatePresence>
        {viewerImages && (
          <ImageViewer images={viewerImages.list} startIndex={viewerImages.startIndex || 0} onClose={() => setViewerImages(null)} />
        )}
      </AnimatePresence>

      {/* ── Finance Pack ── */}
      <AnimatePresence>
        {financePack && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeFinancePack}
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
                  <p className="text-base font-black text-slate-900">Finance Pack Ready</p>
                  <p className="text-xs text-slate-500 truncate">{financePack.ref} · {financePack.count} item{financePack.count !== 1 ? "s" : ""} · {fmtMoney(financePack.totalZAR, "ZAR")}</p>
                </div>
                <button onClick={closeFinancePack} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
                  <X size={20} />
                </button>
              </div>
              <div className="px-4 pb-3">
                <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50" style={{ aspectRatio: "1 / 1.2" }}>
                  <iframe src={financePack.url} title="Finance pack preview" className="w-full h-full" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 text-center">Pinch / scroll to review · {financePack.filename}</p>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 space-y-2" style={{ background: "#F7F3F3" }}>
                <button onClick={shareFinancePack}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                  style={{ background: "#8B1A1A" }}>
                  <Send size={16} /> Share / Send (Mail, Outlook, iCloud, WhatsApp…)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={previewFinancePack}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
                    <FileDown size={14} /> Open PDF
                  </button>
                  <button onClick={emailFinancePack}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
                    <Mail size={14} /> Email to Vicky
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── End-of-month reminder banner ── */}
      <AnimatePresence>
        {showReminderBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border-2 p-3.5 flex items-start gap-3"
            style={{ background: "#FFF7ED", borderColor: "#FED7AA" }}>
            <div className="rounded-xl p-2 shrink-0" style={{ background: "#FEF3C7" }}>
              <Bell size={16} style={{ color: "#D97706" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-amber-800">Submit your expenses</p>
              <p className="text-xs text-amber-700 mt-0.5">
                End of month is coming — {unsubmittedCount} unsubmitted expense{unsubmittedCount !== 1 ? "s" : ""}. Send your pack to Vicky before month-end.
              </p>
            </div>
            <button onClick={dismissReminder} className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-100 shrink-0">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      {!selectMode ? (
        <div className="flex items-center justify-between gap-2">
          <PageHeader
            title="Expenses"
            subtitle={`${fmtMoney(totalThisMonth)} this month · ${unsubmittedCount} to submit`}
          />
          <div className="flex gap-2">
            {expenses.length > 0 && (
              <Btn size="sm" variant="secondary" onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}>
                <Mail size={14} /> Send
              </Btn>
            )}
            <Btn size="sm" onClick={() => {
              if (showForm || showScanner || editId) { resetForm(); }
              else { setShowScanner(true); setScannerMode("receipt"); }
            }}>
              {(showForm || showScanner || editId) ? <X size={15} /> : <Camera size={15} />}
              {(showForm || showScanner || editId) ? "Cancel" : "Scan"}
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

      {/* ── Scanner ── */}
      <AnimatePresence>
        {showScanner && (
          <ReceiptScanner
            userId={userId}
            slipType={scannerMode === "payment" ? "payment" : "till"}
            onExtracted={handleScanComplete}
            onCancel={() => {
              setShowScanner(false);
              if (!editId) setShowForm(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── New expense form (top, only when not editing) ── */}
      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderExpenseForm()}
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search vendor, category…" />
      <FilterPills options={["All", ...CATEGORIES]} value={filterCat} onChange={setFilterCat} dangerValue={null} />

      {filtered.length === 0 && (
        <Empty
          title="No expenses yet"
          text="Tap Scan to photograph a receipt — AI fills in the details."
          icon={Receipt}
        />
      )}

      {/* ── Expense list grouped by calendar month, collapsible ── */}
      <div className="space-y-5">
        {orderedMonthKeys.map(monthKey => {
          const { label, items } = byMonthMap[monthKey];
          return (
            <MonthSection
              key={monthKey}
              monthKey={monthKey}
              label={label}
              items={items}
              duplicateIds={duplicateIds}
              editId={editId}
              renderExpenseForm={renderExpenseForm}
              selectMode={selectMode}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              setDetailExpense={setDetailExpense}
              fmtMoney={fmtMoney}
              CATEGORY_COLORS={CATEGORY_COLORS}
              smartDate={smartDate}
            />
          );
        })}
      </div>
    </div>
  );
}
