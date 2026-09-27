import React, { useEffect, useMemo, useState } from "react";
import { offlineDelete, offlineGetAll, offlineSave } from "../offline/offlineDb";
import { saveAndSync, triggerImmediateSync } from "../lib/sync";
import { supabase } from "../supabase";
import { Card, Btn, PageHeader, useConfirm } from "../components/ui";
import { BottomSheet } from "../components/BottomSheet";
import {
  Bell,
  CheckCircle2,
  CreditCard,
  FileClock,
  FileMinus,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Stamp,
  Trash2,
  Undo2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { daysOverdue, isOverdue, reminderMessage } from "../lib/reminders";
import { formatPhone } from "../components/WhatsAppButton";
import { useCompanyProfile } from "../lib/companyProfile";
import { buildDocumentPDF, documentFilename, documentTitle, shareDocumentPDF } from "../lib/documentPDF";
import { creditNoteToDocument, invoiceToDocument, isTemporaryInvoiceNumber, jobToCard, jobsForInvoice } from "../lib/documentData";
import { resolveDocumentPhotos } from "../lib/documentPhotos";
import { FORMATS, accountingCsv } from "../lib/accountingExport";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { MessageCustomer } from "../components/MessageCustomer";
import { InvoiceEditor } from "../components/InvoiceEditor";
import { AgedDebtors } from "../components/AgedDebtors";
import { publicUrl } from "../lib/appUrl";
import { round2 } from "../lib/lineTotals";
import { genId } from "../lib/helpers";

const money = v =>
  `R ${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const INVOICE_LABELS = {
  draft: "Draft",
  sent: "Awaiting payment",
  part_paid: "Partly paid",
  partially_paid: "Partly paid",
  paid: "Paid",
  credited: "Credited",
  overdue: "Overdue",
  cancelled: "Void",
};
const METHODS = { eft: "EFT", cash: "Cash", card: "Card", instant_eft: "Instant EFT", other: "Other" };
const FILTERS = ["All", "Draft", "Awaiting payment", "Overdue", "Paid", "Void"];
const isOpen = inv => !["draft", "cancelled", "paid", "credited"].includes(inv.status) && Number(inv.balance_due || 0) > 0;
const matchesFilter = (inv, f) =>
  f === "All" ||
  (f === "Draft" && inv.status === "draft") ||
  (f === "Awaiting payment" && isOpen(inv)) ||
  (f === "Overdue" && isOpen(inv) && isOverdue(inv)) ||
  (f === "Paid" && ["paid", "credited"].includes(inv.status)) ||
  (f === "Void" && inv.status === "cancelled");

// Generated ONCE per payment intent (here, before the offline/online branch) and
// carried as part of the record itself — every retry of the same queued item (offline
// save, sync-queue retry, browser restart, a second device racing the same payment)
// resends this exact key, so the DB's payments_idempotency_key_uidx constraint can
// tell "this exact intent already succeeded" apart from "this is a genuinely new
// payment". crypto.randomUUID isn't available on every older WebView, hence the fallback.
function genIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 10)}`;
}
const today = () => new Date().toISOString().slice(0, 10);

// The action sheets: record a payment, credit note, void, reverse a payment.
function ActionSheet({ sheet, onClose, onSubmit, busy, error }) {
  const inv = sheet?.inv;
  const owed = round2(Number(inv?.balance_due || 0));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("eft");
  const [text, setText] = useState("");
  useEffect(() => {
    setAmount(sheet && (sheet.type === "pay" || sheet.type === "credit") ? owed.toFixed(2) : "");
    setDate(today());
    setMethod("eft");
    setText("");
  }, [sheet?.type, sheet?.inv?.id, sheet?.payment?.id]);
  if (!sheet) return null;
  const titles = {
    pay: "Record a payment",
    credit: "Issue a credit note",
    void: "Void this invoice",
    reverse: "Reverse this payment",
  };
  const input = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base min-h-[52px]";
  const label = "block text-sm font-bold text-slate-500 mb-1";
  const submit = () => onSubmit({ amount: Number(String(amount).replace(/[, ]/g, "")), date, method, text: text.trim() });
  return (
    <BottomSheet open onClose={onClose} title={titles[sheet.type]} subtitle={inv?.invoice_number ? `Invoice ${inv.invoice_number} · owed ${money(owed)}` : ""}>
      <div className="stack-y-3 pb-2">
        {(sheet.type === "pay" || sheet.type === "credit") && (
          <label className={label}>
            Amount (R){sheet.type === "credit" ? ", including VAT" : ""}
            <input className={input} type="number" inputMode="decimal" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </label>
        )}
        {sheet.type === "pay" && (
          <>
            <label className={label}>
              Date received
              <input className={input} type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
            </label>
            <label className={label}>
              How it was paid
              <select className={input} value={method} onChange={e => setMethod(e.target.value)}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className={label}>
          {sheet.type === "pay" ? "Reference (optional)" : "Reason"}
          <input
            className={input}
            value={text}
            maxLength={sheet.type === "pay" ? 100 : 300}
            placeholder={
              sheet.type === "pay"
                ? "e.g. bank reference"
                : sheet.type === "credit"
                  ? "e.g. faulty part returned"
                  : sheet.type === "void"
                    ? "e.g. billed to the wrong customer"
                    : "e.g. EFT bounced"
            }
            onChange={e => setText(e.target.value)}
          />
        </label>
        {sheet.type === "credit" && (
          <p className="text-xs text-slate-500">
            The credit note gets its own number and reduces what the customer owes on this invoice. For the whole invoice,
            its lines are copied; otherwise the VAT is split in the same way as the invoice.
          </p>
        )}
        {sheet.type === "void" && (
          <p className="text-xs text-slate-500">
            The invoice keeps its number and stays on record marked VOID; the customer owes nothing on it. This can't be undone.
          </p>
        )}
        {sheet.type === "reverse" && (
          <p className="text-xs text-slate-500">
            The payment stays on record marked reversed and no longer counts towards the invoice. Record the correct one after.
          </p>
        )}
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Btn onClick={submit} disabled={busy} variant={sheet.type === "void" || sheet.type === "reverse" ? "danger" : "solid"}>
          {busy ? "Saving…" : titles[sheet.type]}
        </Btn>
      </div>
    </BottomSheet>
  );
}

export function InvoicesScreen({ userId, teamId, setData, clients = [], quotes = [], canMessage = true, isManager = false }) {
  const [messaging, setMessaging] = useState(null);
  const [invoices, setInvoices] = useState([]),
    [payments, setPayments] = useState([]),
    [creditNotes, setCreditNotes] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [editing, setEditing] = useState(null),
    [sheet, setSheet] = useState(null),
    [sheetBusy, setSheetBusy] = useState(false),
    [sheetError, setSheetError] = useState(""),
    [open, setOpen] = useState({});
  const online = useOnlineStatus();
  const profile = useCompanyProfile(teamId);
  const { confirm, dialog } = useConfirm();
  const [making, setMaking] = useState(null);
  const [notice, setNotice] = useState("");
  const clientName = inv => clients.find(c => c.id === inv.client_id)?.company || quotes.find(q => q.id === inv.quote_id)?.client_name || "";

  // Export for accounting packages (Xero / Sage / QuickBooks), by month.
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  function exportAccounting(format) {
    const list = invoices.filter(
      i => String(i.issue_date || "").startsWith(exportMonth) && !["cancelled", "draft"].includes(i.status),
    );
    if (!list.length) return setNotice(`No approved invoices in ${exportMonth}.`);
    const csv = accountingCsv(format, list, { clients, quotes, profile });
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoices_${exportMonth}_${FORMATS[format].label}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setNotice(`${list.length} invoice${list.length === 1 ? "" : "s"} exported for ${FORMATS[format].label}.`);
  }
  // Jobs, to attach their job cards to an invoice or pro forma.
  const [jobs, setJobs] = useState([]);
  const [attach, setAttach] = useState({});
  useEffect(() => {
    offlineGetAll("jobs").then(
      rows => setJobs(rows || []),
      () => {},
    );
  }, [invoices.length]);

  function replace(row) {
    setInvoices(list => (list.some(x => x.id === row.id) ? list.map(x => (x.id === row.id ? row : x)) : [row, ...list]));
    offlineSave("invoices", row).catch(() => {});
  }
  async function reloadInvoice(id) {
    const [{ data: inv }, { data: pays }, { data: cns }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
      supabase.from("payments").select("*").eq("invoice_id", id),
      supabase.from("credit_notes").select("*").eq("invoice_id", id),
    ]);
    if (inv) replace(inv);
    if (pays) {
      setPayments(list => [...pays, ...list.filter(p => p.invoice_id !== id)]);
      pays.forEach(p => offlineSave("payments", p).catch(() => {}));
    }
    if (cns) setCreditNotes(list => [...cns, ...list.filter(c => c.invoice_id !== id)]);
    return inv;
  }

  // A polite reminder with the customer's portal link: WhatsApp if we have
  // their number, else email, else the share sheet.
  async function remind(inv) {
    const client = clients.find(c => c.id === inv.client_id) || {};
    setMaking(`remind:${inv.id}`);
    setNotice("");
    const { data: token } = await supabase.rpc("client_portal_link", { p_client_id: inv.client_id, p_new: false });
    setMaking(null);
    const url = token ? `${publicUrl()}/?portal=${token}` : "";
    const text = reminderMessage({
      contact: client.contact,
      company: profile.trading_name || profile.legal_name,
      invoice: inv,
      url,
    });
    const phone = formatPhone(client.phone || "");
    if (phone) return window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    if (client.email)
      return window.open(
        `mailto:${client.email}?subject=${encodeURIComponent(`Reminder: invoice ${inv.invoice_number}`)}&body=${encodeURIComponent(text)}`,
      );
    try {
      if (navigator.share) return await navigator.share({ text });
      await navigator.clipboard.writeText(text);
      setNotice("Reminder copied. Paste it to the customer.");
    } catch {
      // Share sheet closed.
    }
  }

  // An invoice made offline reaches the server with the next sync; until
  // then it can't be approved or edited there.
  function notYetSynced(inv) {
    if (inv.sync_status !== "pending") return false;
    triggerImmediateSync();
    setError(`Invoice ${inv.invoice_number || ""} is still being sent to the server. Try again in a moment.`);
    return true;
  }

  // Approving issues the invoice: it gets locked on the server.
  async function approve(inv, { quiet = false } = {}) {
    if (!online) {
      setError("Connect to the internet to approve an invoice.");
      return null;
    }
    if (notYetSynced(inv)) return null;
    if (
      !quiet &&
      !(await confirm(`Approve invoice ${inv.invoice_number || ""}? Once approved it can't be changed, only credited or voided.`, {
        confirmLabel: "Approve",
        confirmVariant: "success",
      }))
    )
      return null;
    setError("");
    const { data, error: e } = await supabase.from("invoices").update({ status: "sent" }).eq("id", inv.id).select("*").single();
    if (e) {
      setError(e.message);
      return null;
    }
    replace(data);
    setNotice(`Invoice ${data.invoice_number} approved.`);
    return data;
  }
  async function removeDraft(inv) {
    if (!online) return setError("Connect to the internet to delete a draft.");
    if (notYetSynced(inv)) return;
    if (!(await confirm(`Delete draft invoice ${inv.invoice_number || ""}?`, { confirmLabel: "Delete" }))) return;
    const { error: e } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (e) return setError(e.message);
    await offlineDelete("invoices", inv.id).catch(() => {});
    setInvoices(list => list.filter(x => x.id !== inv.id));
    setNotice("Draft deleted.");
  }

  // Build and share an invoice or pro forma PDF. Online, the invoice is read
  // back first so it carries the number the server assigned. A tax invoice is
  // only issued for an approved invoice.
  async function sharePdf(inv, kind) {
    setNotice("");
    let row = inv;
    if (kind === "invoice" && inv.status === "draft") {
      if (
        !(await confirm(`Approve invoice ${inv.invoice_number || ""} to issue it? Once approved it can't be changed.`, {
          confirmLabel: "Approve and make PDF",
          confirmVariant: "success",
        }))
      )
        return;
      row = await approve(inv, { quiet: true });
      if (!row) return;
    }
    setMaking(inv.id + kind);
    try {
      if (online && isTemporaryInvoiceNumber(row.invoice_number)) {
        const { data } = await supabase.from("invoices").select("*").eq("id", inv.id).maybeSingle();
        if (data) {
          row = { ...row, ...data };
          replace(row);
        }
      }
      let doc = invoiceToDocument(row, kind, { clients, quotes, profile });
      if (attach[inv.id]) {
        let linked = jobsForInvoice(row, jobs);
        if (!linked.length && online && row.job_id) {
          const { data } = await supabase.from("jobs").select("*").eq("id", row.job_id);
          linked = data || [];
        }
        doc = await resolveDocumentPhotos({ ...doc, jobCards: linked.map(j => jobToCard(j, { clients, quotes })) });
      }
      const blob = await buildDocumentPDF(doc, profile);
      const r = await shareDocumentPDF(blob, documentFilename(doc, profile), `${documentTitle(kind, profile)} ${doc.number}`);
      if (r !== "cancelled")
        setNotice(
          doc.draft && kind === "invoice"
            ? "Draft PDF made. It gets its final invoice number once it syncs."
            : r === "shared"
              ? "PDF shared"
              : "PDF downloaded",
        );
    } catch (err) {
      console.error("Invoice PDF failed:", err);
      setNotice("Couldn't make the PDF. Please try again.");
    } finally {
      setMaking(null);
    }
  }
  async function shareCreditNote(cn) {
    const inv = invoices.find(i => i.id === cn.invoice_id) || {};
    setMaking(`cn:${cn.id}`);
    try {
      const doc = creditNoteToDocument(cn, { invoice: inv, clients, quotes });
      const blob = await buildDocumentPDF(doc, profile);
      const r = await shareDocumentPDF(blob, documentFilename(doc, profile), `${documentTitle("credit_note", profile)} ${doc.number}`);
      if (r !== "cancelled") setNotice(r === "shared" ? "PDF shared" : "PDF downloaded");
    } catch (err) {
      console.error("Credit note PDF failed:", err);
      setNotice("Couldn't make the PDF. Please try again.");
    } finally {
      setMaking(null);
    }
  }

  async function load() {
    if (!userId) return;
    setLoading(true);
    setError("");
    const [li, lp] = await Promise.all([
      offlineGetAll("invoices").catch(() => []),
      offlineGetAll("payments").catch(() => []),
    ]);
    setInvoices((li || []).filter(x => x.user_id === userId || x.team_id === teamId));
    setPayments((lp || []).filter(x => x.user_id === userId || x.team_id === teamId));
    if (online) {
      const [ir, pr, cr] = await Promise.all([
        supabase.from("invoices").select("*").order("issue_date", { ascending: false }),
        supabase.from("payments").select("*").order("payment_date", { ascending: false }),
        supabase.from("credit_notes").select("*").order("issue_date", { ascending: false }),
      ]);
      if (!ir.error) {
        setInvoices(ir.data || []);
        await Promise.all((ir.data || []).map(x => offlineSave("invoices", x).catch(() => {})));
      } else if (!li.length) setError(ir.error.message);
      if (!pr.error) {
        setPayments(pr.data || []);
        await Promise.all((pr.data || []).map(x => offlineSave("payments", x).catch(() => {})));
      }
      if (!cr.error) setCreditNotes(cr.data || []);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [userId, teamId, online]);

  const visible = useMemo(() => {
    const t = query.trim().toLowerCase();
    return invoices
      .filter(x => matchesFilter(x, filter))
      .filter(
        x =>
          !t ||
          [x.invoice_number, x.notes, x.reference, INVOICE_LABELS[x.status], clientName(x)].some(v =>
            String(v || "")
              .toLowerCase()
              .includes(t),
          ),
      );
  }, [invoices, query, filter, clients]);

  // Record a payment. Online it goes straight to the server, which checks it
  // against what's owed; offline it's queued.
  async function recordPayment(inv, { amount, date, method, text }) {
    const owed = round2(Number(inv.balance_due || 0));
    if (!Number.isFinite(amount) || amount <= 0) return setSheetError("Enter the amount received.");
    if (amount > owed + 0.004) return setSheetError(`That's more than the ${money(owed)} still owed.`);
    if (!date || date > today()) return setSheetError("Choose the date the money came in (not in the future).");
    const p = {
      id: genId(),
      idempotency_key: genIdempotencyKey(),
      user_id: userId,
      team_id: inv.team_id || teamId || null,
      invoice_id: inv.id,
      amount: round2(amount),
      payment_date: date,
      method,
      reference: text || null,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };
    if (online) {
      const { error: e } = await supabase.from("payments").insert({ ...p, sync_status: "synced" });
      if (e) return setSheetError(e.message);
      await reloadInvoice(inv.id);
      setNotice(`Payment of ${money(p.amount)} recorded.`);
      return true;
    }
    // Offline: shown straight away, checked by the server when it syncs.
    const paid = round2(Number(inv.amount_paid || 0) + p.amount);
    const updated = {
      ...inv,
      amount_paid: paid,
      balance_due: Math.max(0, round2(Number(inv.total || 0) - paid - Number(inv.amount_credited || 0))),
      status: owed - p.amount <= 0.004 ? "paid" : "part_paid",
    };
    await offlineSave("payments", p);
    await offlineSave("invoices", updated);
    setPayments(x => [p, ...x]);
    setInvoices(x => x.map(i => (i.id === inv.id ? updated : i)));
    await saveAndSync(p, "payments", "insert", setData || (() => {}), online);
    setNotice("Payment saved offline and queued for sync.");
    return true;
  }
  async function submitSheet(values) {
    setSheetError("");
    setSheetBusy(true);
    const { type, inv, payment } = sheet;
    let ok;
    try {
      if (type === "pay") ok = await recordPayment(inv, values);
      else {
        if (!online) return setSheetError("Connect to the internet to do this.");
        if (!values.text) return setSheetError("Give a reason; it's kept on record.");
        const call =
          type === "credit"
            ? supabase.rpc("create_credit_note", { p_invoice_id: inv.id, p_amount: values.amount, p_reason: values.text })
            : type === "void"
              ? supabase.rpc("void_invoice", { p_invoice_id: inv.id, p_reason: values.text })
              : supabase.rpc("void_payment", { p_payment_id: payment.id, p_reason: values.text });
        const { data, error: e } = await call;
        if (e) return setSheetError(e.message);
        await reloadInvoice(inv.id);
        setNotice(
          type === "credit"
            ? `Credit note ${data?.credit_number || ""} issued for ${money(data?.total)}.`
            : type === "void"
              ? `Invoice ${inv.invoice_number} voided.`
              : "Payment reversed.",
        );
        ok = true;
      }
    } finally {
      setSheetBusy(false);
    }
    if (ok) setSheet(null);
  }

  const approved = invoices.filter(x => !["draft", "cancelled"].includes(x.status));
  const outstanding = approved.reduce((s, x) => s + Number(x.balance_due || 0), 0),
    received = payments.filter(p => !p.voided_at).reduce((s, x) => s + Number(x.amount || 0), 0);

  if (editing)
    return (
      <div className="stack-y-4">
        <PageHeader title="Invoices" subtitle="Billing, balances & payments" />
        <InvoiceEditor
          invoice={editing === "new" ? null : editing}
          clients={clients}
          userId={userId}
          teamId={teamId}
          profile={profile}
          onCancel={() => setEditing(null)}
          onDone={(row, approvedNow) => {
            replace(row);
            setEditing(null);
            setNotice(approvedNow ? `Invoice ${row.invoice_number} approved.` : `Draft ${row.invoice_number} saved.`);
          }}
        />
      </div>
    );

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <PageHeader title="Invoices" subtitle="Billing, balances & payments" />
        <Btn
          size="sm"
          onClick={() => (online ? setEditing("new") : setError("Connect to the internet to make an invoice by hand."))}
          className="shrink-0"
        >
          <Plus size={14} /> New
        </Btn>
      </div>
      {!online && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
          <WifiOff size={16} />
          Offline mode — payments save locally and sync later. Approving, crediting and voiding need a connection.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          {notice}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400">Outstanding</p>
          <p className="text-lg font-black">{money(outstanding)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-400">Payments received</p>
          <p className="text-lg font-black">{money(received)}</p>
        </Card>
      </div>
      <AgedDebtors invoices={invoices} clients={clients} quotes={quotes} profile={profile} />
      <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <summary className="text-sm font-bold text-slate-600 cursor-pointer min-h-[40px] flex items-center">Export for accounting</summary>
        <div className="stack-y-2 pb-2">
          <label className="block text-xs font-bold text-slate-500">
            Month
            <input
              type="month"
              value={exportMonth}
              onChange={e => setExportMonth(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(FORMATS).map(([key, f]) => (
              <Btn key={key} size="sm" variant="secondary" onClick={() => exportAccounting(key)}>
                {f.label}
              </Btn>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            A CSV file for that package's invoice import: approved invoices only. Amounts exclude VAT; the VAT type is set per
            line.
          </p>
        </div>
      </details>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search invoices"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-base"
          />
        </div>
        <Btn size="sm" variant="secondary" onClick={load} aria-label="Refresh">
          <RefreshCw size={14} />
        </Btn>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Show">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold min-h-[36px] ${
              filter === f ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <Card className="p-6 text-center text-slate-400">Loading invoices…</Card>
      ) : visible.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-bold">No invoices found</p>
          <p className="text-sm text-slate-500">Invoices made from jobs, or with New, appear here.</p>
        </Card>
      ) : (
        visible.map(inv => {
          const draft = inv.status === "draft";
          const voided = inv.status === "cancelled";
          const settled = ["paid", "credited"].includes(inv.status) || (!draft && !voided && Number(inv.balance_due || 0) <= 0);
          const pays = payments.filter(p => p.invoice_id === inv.id);
          const cns = creditNotes.filter(c => c.invoice_id === inv.id);
          const livePays = pays.filter(p => !p.voided_at);
          const overdue = !draft && !voided && !settled && isOverdue(inv);
          return (
            <Card key={inv.id} className="p-4 stack-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-black truncate">{inv.invoice_number || "Invoice"}</p>
                  <p className="text-sm text-slate-600 truncate">{clientName(inv) || "No customer yet"}</p>
                  <p className={`text-xs font-bold ${overdue ? "text-red-700" : voided ? "text-slate-500" : draft ? "text-amber-700" : "text-slate-500"}`}>
                    {overdue ? `Overdue · ${daysOverdue(inv)} days` : INVOICE_LABELS[inv.status] || String(inv.status || "").replaceAll("_", " ")}
                    {inv.due_date && !draft && !voided && !settled ? ` · due ${inv.due_date}` : ""}
                  </p>
                </div>
                <p className={`font-black ${voided ? "line-through text-slate-400" : ""}`}>{money(inv.total)}</p>
              </div>
              {voided ? (
                <p className="text-xs text-slate-500">Void{inv.void_reason ? `: ${inv.void_reason}` : ""}</p>
              ) : (
                !draft && (
                  <div className="flex justify-between text-xs text-slate-500 gap-2 flex-wrap">
                    <span>Paid: {money(inv.amount_paid)}</span>
                    {Number(inv.amount_credited) > 0 && <span>Credited: {money(inv.amount_credited)}</span>}
                    <span className="font-bold text-slate-700">Owed: {money(inv.balance_due)}</span>
                  </div>
                )
              )}

              {draft && (
                <div className="grid grid-cols-3 gap-2">
                  <Btn size="sm" variant="secondary" onClick={() => (!online ? setError("Connect to the internet to edit an invoice.") : notYetSynced(inv) ? null : setEditing(inv))}>
                    <Pencil size={13} /> Edit
                  </Btn>
                  <Btn size="sm" onClick={() => approve(inv)}>
                    <Stamp size={13} /> Approve
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => removeDraft(inv)}>
                    <Trash2 size={13} /> Delete
                  </Btn>
                </div>
              )}
              {!draft && !voided && !settled && (
                <Btn size="sm" onClick={() => { setSheetError(""); setSheet({ type: "pay", inv }); }}>
                  <CreditCard size={13} />
                  Record payment
                </Btn>
              )}
              {settled && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700">
                  <CheckCircle2 size={13} />
                  {inv.status === "credited" ? "Settled by credit note" : "Paid"}
                </span>
              )}
              {(inv.job_id || jobsForInvoice(inv, jobs).length > 0) && (
                <label className="flex items-center gap-2 text-sm text-slate-600 min-h-[36px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!attach[inv.id]}
                    onChange={e => setAttach(a => ({ ...a, [inv.id]: e.target.checked }))}
                    className="h-5 w-5"
                  />
                  Attach job card
                </label>
              )}
              {overdue && inv.client_id && (
                <Btn size="sm" variant="warning" onClick={() => remind(inv)} disabled={making === `remind:${inv.id}` || !online}>
                  <Bell size={13} />
                  {making === `remind:${inv.id}` ? "Preparing…" : `Remind customer · ${daysOverdue(inv)} days overdue`}
                </Btn>
              )}
              {canMessage && inv.client_id && online && !draft && !voided && (
                <Btn size="sm" variant="secondary" onClick={() => setMessaging(inv)}>
                  <MessageCircle size={13} />
                  WhatsApp / SMS the invoice link
                </Btn>
              )}
              <div className={`grid ${draft ? "grid-cols-2" : "grid-cols-1"} gap-2 pt-1`}>
                <Btn size="sm" variant="secondary" onClick={() => sharePdf(inv, "invoice")} disabled={!!making}>
                  <FileText size={13} />
                  {making === inv.id + "invoice" ? "Making…" : draft ? "Approve & PDF" : "Invoice PDF"}
                </Btn>
                {draft && (
                  <Btn size="sm" variant="ghost" onClick={() => sharePdf(inv, "proforma")} disabled={!!making}>
                    <FileClock size={13} />
                    {making === inv.id + "proforma" ? "Making…" : "Pro forma"}
                  </Btn>
                )}
              </div>
              {isManager && !draft && !voided && !settled && (
                <div className="grid grid-cols-2 gap-2">
                  <Btn size="sm" variant="ghost" onClick={() => { setSheetError(""); setSheet({ type: "credit", inv }); }} disabled={!online}>
                    <FileMinus size={13} /> Credit note
                  </Btn>
                  {livePays.length === 0 && cns.length === 0 && (
                    <Btn size="sm" variant="ghost" onClick={() => { setSheetError(""); setSheet({ type: "void", inv }); }} disabled={!online}>
                      <XCircle size={13} /> Void
                    </Btn>
                  )}
                </div>
              )}
              {(pays.length > 0 || cns.length > 0) && (
                <div>
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-600 underline min-h-[36px]"
                    onClick={() => setOpen(o => ({ ...o, [inv.id]: !o[inv.id] }))}
                    aria-expanded={!!open[inv.id]}
                  >
                    {open[inv.id] ? "Hide" : "Show"} payments and credit notes ({pays.length + cns.length})
                  </button>
                  {open[inv.id] && (
                    <ul className="stack-y-2 mt-1">
                      {pays.map(p => (
                        <li key={p.id} className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-sm flex items-center gap-2">
                          <div className={`flex-1 min-w-0 ${p.voided_at ? "line-through text-slate-400" : ""}`}>
                            <p className="font-bold">
                              {money(p.amount)} · {METHODS[p.method] || p.method}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {p.payment_date}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </p>
                          </div>
                          {p.voided_at ? (
                            <span className="text-xs font-bold text-slate-500">Reversed{p.void_reason ? `: ${p.void_reason}` : ""}</span>
                          ) : (
                            isManager &&
                            online && (
                              <button
                                type="button"
                                onClick={() => { setSheetError(""); setSheet({ type: "reverse", inv, payment: p }); }}
                                className="text-xs font-bold text-red-700 flex items-center gap-1 min-h-[36px] px-2"
                              >
                                <Undo2 size={12} /> Reverse
                              </button>
                            )
                          )}
                        </li>
                      ))}
                      {cns.map(c => (
                        <li key={c.id} className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-sm flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold">
                              Credit note {c.credit_number} · {money(c.total)}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {c.issue_date} · {c.reason}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => shareCreditNote(c)}
                            disabled={!!making}
                            className="text-xs font-bold text-slate-700 flex items-center gap-1 min-h-[36px] px-2"
                          >
                            <FileText size={12} /> {making === `cn:${c.id}` ? "…" : "PDF"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
      <ActionSheet sheet={sheet} onClose={() => setSheet(null)} onSubmit={submitSheet} busy={sheetBusy} error={sheetError} />
      {messaging && (
        <MessageCustomer
          open
          onClose={() => setMessaging(null)}
          kinds={["invoice"]}
          teamId={teamId}
          userId={userId}
          client={clients.find(c => c.id === messaging.client_id)}
          invoice={messaging}
          getLink={async () => {
            const { data } = await supabase.rpc("client_portal_link", { p_client_id: messaging.client_id, p_new: false });
            return data ? `${publicUrl()}/?portal=${data}` : "";
          }}
          onSent={setNotice}
        />
      )}
      {dialog}
    </div>
  );
}
