// ─── Expenses Screen ──────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Save, Edit2, Trash2, Camera, Sparkles, Receipt,
  Mail, CheckSquare, Square, FileDown, Send, ChevronRight, ExternalLink,
} from "lucide-react";
import { todayISO, smartDate, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { supabase } from "../supabase";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { convertToZAR } from "../lib/exchangeRate";
import { buildExpensePDF } from "../lib/expenseFinancePDF";
import { DetailSheet, DetailRow } from "../components/DetailSheet";
import { ImageViewer } from "../components/ImageViewer";
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

// ─── Finance period: 26th → 25th cycle ──────────────────────────────────────
// Power Works' expense period runs from the 26th of one month to the 25th of
// the next. An expense dated the 25th itself belongs to the CLOSING period
// (i.e. the one ending on that 25th).
//
// Given any ISO date, return:
//   - key       a stable sort key like "2026-05-26" (period start)
//   - label     human label like "26 May – 25 Jun 2026"
//   - start     ISO date when the period started (the 26th)
//   - end       ISO date when the period ends (the 25th)
// ─── Decimal-safe amount input ──────────────────────────────────────────────
// Some iPhones (locale-dependent) show a numeric keypad that uses a COMMA as
// the decimal separator. HTML's type="number" only accepts a period, so on
// those devices typing "1223,14" either gets rejected or silently mangled.
// Fix: use a plain text input with inputMode="decimal" (still shows the
// numeric keypad) and accept EITHER comma or period as the separator,
// normalising to a period internally before it's ever parsed as a number.

// Turn whatever the user typed (1223,14 / 1223.14 / 1 223,14) into a clean
// string suitable for parseFloat — always period-separated, digits only.
function normaliseDecimalInput(raw) {
  if (raw === null || raw === undefined) return "";
  let s = String(raw);
  // Strip anything that isn't a digit, comma, period, or leading minus.
  s = s.replace(/[^\d.,-]/g, "");
  // If both a comma and a period appear, assume the comma was a thousands
  // separator (e.g. "1,223.14") and just remove it.
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else {
    // Only a comma present → it's being used as the decimal separator.
    s = s.replace(",", ".");
  }
  // Collapse any accidental double periods from fast typing.
  s = s.replace(/\.(?=.*\.)/g, "");
  return s;
}

// A drop-in replacement for <Field type="number"> that works correctly on
// comma-decimal iPhone keyboards. Displays exactly what the user typed
// (so they can keep using a comma if that's their habit) but the value
// handed back via onChange is always period-normalised and safe to
// parseFloat() when saving.
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
// Purely informational — never blocks a save. Flags expenses that look like
// they might be the same purchase entered twice: same vendor (case/space
// insensitive), same amount (within a few cents to absorb rounding), and a
// date within ±1 day of each other.
//
// Returns a Set of expense IDs that have at least one likely duplicate
// elsewhere in the list. Pure function — call with the full expenses array,
// recompute whenever the list changes (cheap: O(n²) but n is small per user).
function findLikelyDuplicateIds(expenses) {
  const flagged = new Set();
  const norm = s => (s || "").trim().toLowerCase();
  const amtClose = (a, b) => Math.abs(parseFloat(a || 0) - parseFloat(b || 0)) < 0.05;
  const dateClose = (a, b) => {
    if (!a || !b) return false;
    const da = new Date(a + "T12:00:00");
    const db = new Date(b + "T12:00:00");
    return Math.abs(da - db) <= 86400000; // within 1 day
  };

  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i], b = expenses[j];
      if (!a.vendor || !b.vendor) continue; // no vendor on either side — too weak a signal to flag
      if (norm(a.vendor) !== norm(b.vendor)) continue;
      if (!amtClose(a.amount, b.amount)) continue;
      if (!dateClose(a.expense_date, b.expense_date)) continue;
      flagged.add(a.id);
      flagged.add(b.id);
    }
  }
  return flagged;
}

function financePeriod(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + "T12:00:00");
  if (isNaN(d.getTime())) return null;

  // If the day is 1..25, the period started on the 26th of the PREVIOUS month
  // and ends on the 25th of THIS month. If the day is 26..31, the period
  // started on the 26th of THIS month and ends on the 25th of NEXT month.
  let startYear, startMonth; // 0-indexed month
  if (d.getDate() <= 25) {
    startYear  = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    startMonth = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
  } else {
    startYear  = d.getFullYear();
    startMonth = d.getMonth();
  }

  const start = new Date(Date.UTC(startYear, startMonth, 26));
  const end   = new Date(Date.UTC(startYear, startMonth + 1, 25));
  const startISO = start.toISOString().slice(0, 10);
  const endISO   = end.toISOString().slice(0, 10);

  const opt = { day: "numeric", month: "short" };
  const startLbl = start.toLocaleDateString("en-GB", opt);
  const endLbl   = end.toLocaleDateString("en-GB", { ...opt, year: "numeric" });
  return { key: startISO, label: `${startLbl} – ${endLbl}`, start: startISO, end: endISO };
}

// Period that contains today.
function currentFinancePeriod() {
  return financePeriod(new Date().toISOString().slice(0, 10));
}

function fmtMoney(amount, currency = "ZAR") {
  const sym = currency === "ZAR" ? "R" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const n = parseFloat(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

export function ExpensesScreen({ data, setData, userId, quickAddTrigger }) {
  const [showForm, setShowForm]       = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editId, setEditId]           = useState(null);
  const [search, setSearch]           = useState("");
  const [filterCat, setFilterCat]     = useState("All");
  const [toast, setToast]             = useState("");
  const [receiptUrl, setReceiptUrl]   = useState(null);
  const [paymentSlipUrl, setPaymentSlipUrl] = useState(null);
  const [scannerMode, setScannerMode] = useState("receipt"); // "receipt" or "payment"
  const [paymentMismatch, setPaymentMismatch] = useState(null); // { tillAmount, slipAmount }
  const [scannedNotice, setScannedNotice] = useState(false);
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [manualZAR, setManualZAR]     = useState(""); // for currencies ECB doesn't cover
  const [detailExpense, setDetailExpense] = useState(null);   // the row whose sheet is open
  const [viewerImages, setViewerImages] = useState(null);     // array of {url, caption} or null
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
      // Payment slip: keep the photo + cross-check the amount against the till slip
      setPaymentSlipUrl(extracted.receipt_url || null);
      const tillAmount = parseFloat(form.amount || 0);
      const slipAmount = parseFloat(extracted.amount || 0);
      // Allow R0.50 rounding tolerance
      if (tillAmount > 0 && slipAmount > 0 && Math.abs(tillAmount - slipAmount) > 0.5) {
        setPaymentMismatch({ tillAmount, slipAmount });
      } else {
        setPaymentMismatch(null);
      }
      setShowScanner(false);
      setShowForm(true);
      setScannerMode("receipt"); // reset for next time
      return;
    }
    // Till slip (default): fill the form fields
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
    setPaymentSlipUrl(ex.payment_slip_url || null);
    // If this expense was manually converted, prefill the manual ZAR field
    // so the user can adjust it when re-editing.
    setManualZAR(ex.rate_source === "Manual entry" && ex.amount_zar ? String(ex.amount_zar) : "");
    setEditId(ex.id);
    setShowForm(true);
    setShowScanner(false);
  }

  async function saveExpense() {
    if (!form.amount || parseFloat(form.amount) <= 0) { setToast("Enter a valid amount"); return; }
    // Payment slip is OPTIONAL in all cases. (Some merchants don't issue one,
    // and finance can verify card payments against the bank statement.)

    // ZAR conversion logic:
    //   1. ZAR currency? trivial (zar = amount, rate = 1).
    //   2. Manual ZAR entered? use it (rate_source = "Manual entry").
    //   3. Otherwise try ECB rate via Frankfurter.
    //   4. If all fails, save without ZAR conversion (fields left null).
    let zarInfo = null;
    const manualZARNum = parseFloat(manualZAR);
    if (!form.currency || form.currency === "ZAR") {
      zarInfo = { zar: parseFloat(form.amount), rate: 1, rateDate: form.expense_date || todayISO(), source: "n/a" };
    } else if (!isNaN(manualZARNum) && manualZARNum > 0) {
      const amt = parseFloat(form.amount);
      zarInfo = {
        zar: manualZARNum,
        rate: amt > 0 ? manualZARNum / amt : 0,
        rateDate: form.expense_date || todayISO(),
        source: "Manual entry",
      };
    } else {
      setToast("Fetching exchange rate…");
      zarInfo = await convertToZAR(form.amount, form.currency, form.expense_date || undefined);
      // If ECB doesn't cover this currency, zarInfo will be null — that's fine,
      // the expense saves with no ZAR conversion. User can edit and add manually.
    }

    const clean = {
      ...form,
      amount: parseFloat(form.amount || 0),
      vat_amount: parseFloat(form.vat_amount || 0),
      expense_date: form.expense_date || null,
      receipt_url: receiptUrl || null,
      payment_slip_url: paymentSlipUrl || null,
      amount_zar:    zarInfo ? zarInfo.zar : null,
      exchange_rate: zarInfo ? zarInfo.rate : null,
      rate_date:     zarInfo ? zarInfo.rateDate : null,
      rate_source:   zarInfo ? zarInfo.source : null,
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

  // The built PDF lives here so the preview/share/email actions all reuse it.
  // Cleared after the user closes the sheet.
  const [financePack, setFinancePack] = React.useState(null); // { blob, url, filename, ref, periodLabel, totalZAR, count, ids }

  async function sendToFinance() {
    const selected = expenses.filter(e => selectedIds.has(e.id));
    if (selected.length === 0) { setToast("Select expenses to send"); return; }

    setToast("Building finance pack…");

    // Use the first selected item's date for the period label on the cover.
    const sampleDate = selected[0]?.expense_date;
    const period = sampleDate ? financePeriod(sampleDate) : currentFinancePeriod();

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
    setFinancePack({
      blob: pdfBlob,
      url,
      filename,
      ref,
      periodLabel: period?.label || "—",
      totalZAR,
      count: selected.length,
      ids: Array.from(selectedIds),
    });
    setToast("");
  }

  // Mark the included expenses as 'submitted' and trigger sync.
  // Called only after the user actually shares/emails the pack — so they can
  // back out of the preview without altering state.
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

  // Open one (or both) of an expense's slip images in the fullscreen viewer.
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

  // — Preview: open the PDF in a new tab/window. Mobile: usually opens in the
  // device PDF viewer; user can then share from there.
  function previewFinancePack() {
    if (!financePack) return;
    window.open(financePack.url, "_blank");
  }

  // — Share: native share sheet on mobile (iOS / Android). Lets the user pick
  // Mail, Outlook, iCloud Mail, WhatsApp, Files, AirDrop, etc.
  async function shareFinancePack() {
    if (!financePack) return;
    const { blob, filename, ref, totalZAR, periodLabel } = financePack;
    const file = new File([blob], filename, { type: "application/pdf" });
    const shareData = {
      title: `Expense Claim ${ref}`,
      text: `Expense claim ${ref} — ${fmtMoney(totalZAR, "ZAR")} for ${periodLabel}.`,
      files: [file],
    };
    // Feature-detect Web Share API with file support (iOS Safari ≥15, Android Chrome).
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share(shareData);
        markPackSubmitted(); // Share completed (or user cancelled — we can't tell).
      } catch (e) {
        // User cancelled or share failed silently — don't mark submitted.
        if (e.name !== "AbortError") console.warn("Share failed:", e);
      }
    } else {
      // Fallback: download the PDF so the user can attach it manually.
      const a = document.createElement("a");
      a.href = financePack.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setToast("PDF downloaded — attach it to your email manually");
    }
  }

  // — Email: open the user's mail client with a pre-filled message. The PDF
  // is also downloaded so they can attach it (browsers can't auto-attach).
  function emailFinancePack() {
    if (!financePack) return;
    const { filename, ref, totalZAR, periodLabel, count, url } = financePack;

    // Download the PDF first so it's in their Files / Downloads ready to attach.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const body = `Hi Vicky,

Please find attached my expense claim ${ref}.

Summary:
  • ${count} item${count !== 1 ? "s" : ""}
  • Period: ${periodLabel}
  • Total claim: ${fmtMoney(totalZAR, "ZAR")}

The attached PDF (${filename}) contains the full breakdown, totals by category, and all receipt images.

Kind regards`;

    const subject = encodeURIComponent(`Expense Claim ${ref} — ${fmtMoney(totalZAR, "ZAR")}`);
    setToast("PDF downloaded — attach it to the email that just opened");
    setTimeout(() => {
      window.open(`mailto:${encodeURIComponent(FINANCE_EMAIL)}?subject=${subject}&body=${encodeURIComponent(body)}`, "_blank");
      markPackSubmitted();
    }, 500);
  }

  // Computed from the FULL list (not the filtered view) so a duplicate is
  // still flagged correctly even if a filter happens to be hiding its match.
  const duplicateIds = findLikelyDuplicateIds(expenses);

  const filtered = expenses
    .filter(e => filterCat === "All" || e.category === filterCat)
    .filter(e => !search || [e.vendor, e.category, e.notes].some(x => x?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      // Sort by month descending (newest month first), then within each month
      // by date+time ASCENDING (oldest first — true chronological order).
      const da = a.expense_date || "";
      const db = b.expense_date || "";
      // Within month grouping the rendering already groups by month;
      // we sort the whole list ascending by date+time, then reverse-group.
      const dt = da.localeCompare(db);
      if (dt !== 0) return dt;
      const ta = a.expense_time || "";
      const tb = b.expense_time || "";
      return ta.localeCompare(tb);
    });

  // Group by month
  // Group by finance period (26th → 25th). Newest period at the top; within
  // each period, items remain in true chronological order (oldest → newest).
  const periodsInOrder = [];
  const byPeriodMap = {};
  filtered.forEach(e => {
    const period = e.expense_date ? financePeriod(e.expense_date) : null;
    const key = period ? period.key : "no-date";
    const label = period ? period.label : "No date";
    if (!byPeriodMap[key]) {
      byPeriodMap[key] = { label, items: [] };
      periodsInOrder.push(key);
    }
    byPeriodMap[key].items.push(e);
  });
  // No-date always sinks to the bottom; everything else sorts by period key DESC.
  const orderedPeriodKeys = periodsInOrder
    .filter(k => k !== "no-date")
    .sort((a, b) => b.localeCompare(a)) // newest period first
    .concat(periodsInOrder.includes("no-date") ? ["no-date"] : []);

  // Total for the CURRENT finance period (26th–25th cycle).
  const thisPeriod = currentFinancePeriod();
  const totalThisPeriod = expenses
    .filter(e => {
      if (!e.expense_date) return false;
      return e.expense_date >= thisPeriod.start && e.expense_date <= thisPeriod.end;
    })
    .reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);

  const unsubmittedCount = expenses.filter(e => e.status === "unsubmitted").length;

  // The Add/Edit form, extracted so it can render in TWO places:
  //   1. At the top of the page — for adding a NEW expense (when editId is null)
  //   2. Inline, replacing the card being edited at its position in the list
  //      — so editing never yanks the user's scroll position up to the top.
  function renderExpenseForm() {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-black text-slate-800">{editId ? "Edit Expense" : "New Expense"}</p>
          {scannedNotice && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
              <Sparkles size={12} /> AI extracted — please verify
            </span>
          )}
        </div>

        {/* Slips: till on the left, payment on the right */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Till slip</p>
            {receiptUrl ? (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <SignedReceiptImg stored={receiptUrl} className="w-full h-32 object-contain" />
              </div>
            ) : (
              <button type="button"
                onClick={() => { setScannerMode("receipt"); setShowScanner(true); }}
                className="w-full h-32 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 hover:border-red-300 hover:bg-red-50 transition-colors">
                <Camera size={20} style={{ color: "#8B1A1A" }} />
                <span className="text-xs font-bold text-slate-500">Scan till slip</span>
              </button>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">
              Payment slip <span className="text-slate-400 font-normal">(optional)</span>
            </p>
            {paymentSlipUrl ? (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 relative">
                <SignedReceiptImg stored={paymentSlipUrl} className="w-full h-32 object-contain" />
                <button type="button" onClick={() => { setPaymentSlipUrl(null); setPaymentMismatch(null); }}
                  className="absolute top-1 right-1 p-1 rounded-full bg-white/90 shadow text-slate-500 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button"
                onClick={() => { setScannerMode("payment"); setShowScanner(true); }}
                className="w-full h-32 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 hover:border-red-300 hover:bg-red-50 transition-colors">
                <Camera size={20} style={{ color: "#8B1A1A" }} />
                <span className="text-xs font-bold text-slate-500">Add payment slip</span>
              </button>
            )}
          </div>
        </div>

        {paymentMismatch && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800">⚠ Amount mismatch</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Till slip says {fmtMoney(paymentMismatch.tillAmount, form.currency)},
              payment slip says {fmtMoney(paymentMismatch.slipAmount, form.currency)}.
              Please verify which is correct before saving.
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
              {[
                "ZAR", "USD", "GBP", "EUR",       // major
                "GHS",                              // Ghanaian Cedi
                "NGN", "KES", "TZS", "UGX",         // other Africa
                "BWP", "NAD", "MWK", "MZN", "ZMW", // Southern Africa
                "AED", "SAR", "INR", "CNY", "JPY", "AUD", "CAD", // common others
              ].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Manual ZAR override — appears whenever currency is not ZAR.
            For currencies the ECB rate covers (USD/GBP/EUR/etc) this is
            optional and overrides the auto rate if you fill it in. For
            currencies the ECB doesn't cover (Cedi, Naira, etc) this is
            the ONLY way to record the ZAR figure. */}
        {form.currency && form.currency !== "ZAR" && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <label className="mb-1.5 block text-sm font-bold text-slate-600">
              ZAR equivalent <span className="text-slate-400 font-normal">— what your bank/card actually charged you</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-500 shrink-0">R</span>
              <input
                type="text"
                inputMode="decimal"
                value={manualZAR}
                onChange={e => setManualZAR(normaliseDecimalInput(e.target.value))}
                placeholder="leave blank to use ECB rate"
                className="flex-1 rounded-xl border-2 border-slate-100 bg-white p-3 text-base outline-none focus:border-red-300 min-h-[48px]"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Leave blank for USD/GBP/EUR/major currencies — the app fetches the official ECB rate automatically.
              Fill in for Cedi, Naira and other African currencies, or to override the auto rate.
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
        <Field label="Notes (optional)" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="What was this for?" multiline />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={saveExpense}><Save size={15} />{editId ? "Update" : "Save Expense"}</Btn>
          <Btn variant="secondary" onClick={resetForm}>Cancel</Btn>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      {/* ── Expense detail sheet (opens on card tap) ── */}
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
                💳 View payment slip
              </button>
            )}
            {!detailExpense.receipt_url && !detailExpense.payment_slip_url && (
              <p className="text-sm text-slate-500 text-center py-2">No slip photos on this expense</p>
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
            {/* Possible duplicate warning — informational only, doesn't block anything */}
            {duplicateIds.has(detailExpense.id) && (() => {
              const match = expenses.find(e =>
                e.id !== detailExpense.id &&
                duplicateIds.has(e.id) &&
                (e.vendor || "").trim().toLowerCase() === (detailExpense.vendor || "").trim().toLowerCase() &&
                Math.abs(parseFloat(e.amount || 0) - parseFloat(detailExpense.amount || 0)) < 0.05
              );
              return (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-bold text-amber-800">⚠ Possible duplicate</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    Same vendor and amount as another expense{match?.expense_date ? ` dated ${smartDate(match.expense_date)}` : ""}.
                    {" "}This is just a heads-up — nothing's blocked. Check both before submitting if you're not sure.
                  </p>
                </div>
              );
            })()}

            {/* ZAR equivalent (if foreign currency) */}
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

            {/* Inline slip previews — big, tappable */}
            {(detailExpense.receipt_url || detailExpense.payment_slip_url) && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Receipt photos · tap to enlarge</p>
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
          <ImageViewer
            images={viewerImages.list}
            startIndex={viewerImages.startIndex || 0}
            onClose={() => setViewerImages(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Finance Pack ready: preview, share, or email ── */}
      <AnimatePresence>
        {financePack && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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

              {/* Embedded preview */}
              <div className="px-4 pb-3">
                <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50" style={{ aspectRatio: "1 / 1.2" }}>
                  <iframe src={financePack.url} title="Finance pack preview" className="w-full h-full" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 text-center">Pinch / scroll to review · {financePack.filename}</p>
              </div>

              {/* Action buttons */}
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
                <p className="text-xs text-slate-400 text-center pt-0.5 leading-relaxed">
                  <strong>Share</strong> opens your device's share sheet — pick any email app.
                  Expenses are marked submitted after you share or email.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {!selectMode ? (
        <div className="flex items-center justify-between gap-2">
          <PageHeader title="Expenses" subtitle={`${fmtMoney(totalThisPeriod)} this period (${thisPeriod.label}) · ${unsubmittedCount} unsubmitted`} />
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
          <ReceiptScanner
            userId={userId}
            slipType={scannerMode === "payment" ? "payment" : "till"}
            onExtracted={handleScanComplete}
            onCancel={() => { setShowScanner(false); setShowForm(true); setScannerMode("receipt"); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && !editId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {renderExpenseForm()}
          </motion.div>
        )}
      </AnimatePresence>

      <SearchBar value={search} onChange={setSearch} placeholder="Search vendor, category…" />
      <FilterPills options={["All", ...CATEGORIES]} value={filterCat} onChange={setFilterCat} dangerValue={null} />

      {filtered.length === 0 && <Empty title="No expenses yet" text="Snap a receipt and let AI capture the details." icon={Receipt} />}

      <div className="space-y-4">
        {orderedPeriodKeys.map(periodKey => {
          const { label, items } = byPeriodMap[periodKey];
          const periodTotal = items.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);
          return (
            <div key={periodKey}>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-black" style={{ color: "#8B1A1A" }}>{fmtMoney(periodTotal)}</p>
              </div>
              <div className="space-y-2">
                {items.map(ex => {
                  // ── Edit-in-place: form replaces this card at its exact
                  // list position, so editing never jumps the page to the top.
                  if (editId === ex.id) {
                    return (
                      <motion.div key={ex.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {renderExpenseForm()}
                      </motion.div>
                    );
                  }
                  const cc = CATEGORY_COLORS[ex.category] || CATEGORY_COLORS.Other;
                  const sc = STATUS_COLORS[ex.status] || STATUS_COLORS.unsubmitted;
                  const isSelected = selectedIds.has(ex.id);
                  return (
                    <Card key={ex.id}
                      className={`overflow-hidden transition-all ${selectMode && isSelected ? "ring-2 ring-red-500" : ""} ${!selectMode ? "active:bg-slate-50 cursor-pointer" : ""}`}
                      onClick={selectMode ? () => toggleSelect(ex.id) : () => setDetailExpense(ex)}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {selectMode && (
                            <div className="shrink-0 mt-0.5">
                              {isSelected ? <CheckSquare size={22} className="text-red-600" /> : <Square size={22} className="text-slate-300" />}
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
                              <p className="text-xs text-slate-400">{ex.expense_date ? smartDate(ex.expense_date) : "No date"}{ex.expense_time ? ` · ${ex.expense_time}` : ""}</p>
                              <span className="text-xs text-slate-300">·</span>
                              <p className="text-xs text-slate-400">{ex.payment_method}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                              {ex.receipt_url && <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">📄 Slip</span>}
                              {ex.payment_slip_url && <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">💳 Card slip</span>}
                              {duplicateIds.has(ex.id) && <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">⚠ Possible duplicate</span>}
                              {ex.sync_status === "pending" && <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Syncing…</span>}
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
        })}
      </div>
    </div>
  );
}
