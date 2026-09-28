// ─── Inbox: receipts and bills emailed in ────────────────────────────────────
// On the Expenses screen. Shows the company's forwarding address and what has
// arrived; each item is checked (the AI's reading can be corrected) and then
// approved into an expense or rejected. Online only: the items live on the
// server. See docs/EMAIL_INBOX.md.
import React, { useCallback, useEffect, useState } from "react";
import { Copy, FileText, Inbox, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import { offlineSave } from "../offline/offlineDb";
import { activeTeamId } from "../lib/companyProfile";
import { CATEGORIES } from "../lib/expenseAccounting";
import { convertToZAR } from "../lib/exchangeRate";
import {
  DOCUMENT_LABELS, OPEN_STATUSES, inboxAddress, isPdfPath, itemState, possibleDuplicate, reviewForm, reviewProblem,
} from "../lib/inbox";
import { Btn, Field, SelectField } from "./ui";

const when = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const rand = v => (Number(v) > 0 ? `R${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");

function FilePreview({ item }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (item.file_path) {
      supabase.storage.from("receipts").createSignedUrl(item.file_path, 60 * 60)
        .then(({ data }) => live && setUrl(data?.signedUrl || null), () => {});
    }
    return () => { live = false; };
  }, [item.file_path]);

  if (!item.file_path) {
    return item.body_excerpt ? (
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{item.body_excerpt}</pre>
    ) : null;
  }
  if (!url) return <div className="h-24 rounded-lg bg-slate-50" />;
  if (isPdfPath(item.file_path) || /heic/.test(item.content_type || "")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-3 text-sm font-bold text-slate-700 min-h-[48px]">
        <FileText size={16} /> Open {item.file_name || "the file"}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={item.file_name || "Receipt"} className="max-h-64 w-full rounded-lg bg-slate-50 object-contain" />
    </a>
  );
}

function Review({ item, userId, expenses, onApproved, onRejected, onToast }) {
  const [form, setForm] = useState(() => reviewForm(item));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const dup = possibleDuplicate(form, expenses);

  async function approve() {
    const problem = reviewProblem(form);
    if (problem) return setErr(problem);
    setErr("");
    setBusy("approve");
    const fields = { ...form, currency: (form.currency || "ZAR").toUpperCase() };
    if (fields.currency !== "ZAR") {
      try {
        const z = await convertToZAR(Number(fields.amount), fields.currency, fields.expense_date, userId);
        if (z?.amount_zar) Object.assign(fields, { amount_zar: z.amount_zar, rate_source: z.rate_source });
      } catch {
        // Saved without a rand value; it can be added by editing the expense.
      }
    }
    const { data, error } = await supabase.rpc("approve_inbox_item", { p_id: item.id, p_fields: fields });
    setBusy("");
    if (error) return setErr(error.message || "Couldn't approve it.");
    await offlineSave("expenses", { ...data, sync_status: "synced" }).catch(() => {});
    onApproved(item, data);
  }

  async function reject() {
    setBusy("reject");
    const { error } = await supabase.rpc("review_inbox_item", { p_id: item.id, p_action: "reject" });
    setBusy("");
    if (error) return setErr(error.message || "Couldn't reject it.");
    onRejected(item);
    onToast("Removed from the inbox");
  }

  return (
    <div className="stack-y-3 px-3 pb-3">
      <FilePreview item={item} />
      {item.error && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{item.error}</p>}
      <Field label="Supplier / shop" value={form.vendor} onChange={set("vendor")} maxLength={200} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount (incl. VAT)" value={form.amount} onChange={set("amount")} maxLength={20} />
        <Field label="VAT" value={form.vat_amount} onChange={set("vat_amount")} maxLength={20} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date on the slip" type="date" value={form.expense_date} onChange={set("expense_date")} />
        <Field label="Currency" value={form.currency} onChange={v => set("currency")(v.toUpperCase().slice(0, 3))} maxLength={3} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
        <SelectField label="Paid by" value={form.payment_method} onChange={set("payment_method")} options={["Card", "Cash", "Account"]} />
      </div>
      <Field label="Supplier's VAT number" value={form.vat_number} onChange={set("vat_number")} maxLength={30} />
      <Field label="Notes" value={form.notes} onChange={set("notes")} maxLength={2000} />
      {dup && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
          Possible duplicate: {dup.vendor || "an expense"} for {rand(dup.amount_zar || dup.amount)} on {dup.expense_date} is already saved.
        </p>
      )}
      {err && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Btn size="sm" variant="ghost" onClick={reject} disabled={!!busy}>{busy === "reject" ? "Removing…" : "Not an expense"}</Btn>
        <Btn size="sm" onClick={approve} disabled={!!busy}>{busy === "approve" ? "Saving…" : "Approve"}</Btn>
      </div>
    </div>
  );
}

export function ReceiptInbox({ userId, expenses = [], setData, onToast = () => {} }) {
  const teamId = activeTeamId();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [token, setToken] = useState("");
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(false);
  const address = inboxAddress(token);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const load = useCallback(async () => {
    if (!teamId || !online) return;
    setLoading(true);
    const [addr, list] = await Promise.all([
      supabase.rpc("inbox_address", { p_team: teamId }),
      supabase.from("inbox_items").select("*").eq("team_id", teamId).in("status", OPEN_STATUSES)
        .order("received_at", { ascending: false }).limit(100),
    ]);
    setLoading(false);
    if (!addr.error && typeof addr.data === "string") setToken(addr.data);
    setItems(list.error ? null : list.data || []);
  }, [teamId, online]);

  useEffect(() => { load(); }, [load]);

  // Email-in only works for a company, online, once the platform has it set up.
  if (!teamId || !online || items === null || (!address && items.length === 0)) return null;

  const drop = item => { setItems(list => list.filter(i => i.id !== item.id)); setOpenId(null); };
  const approved = (item, expense) => {
    drop(item);
    setData?.(d => ({ ...d, expenses: [expense, ...(d.expenses || []).filter(e => e.id !== expense.id)] }));
    onToast("Added to your expenses ✓");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      onToast("Address copied");
    } catch {
      onToast(address);
    }
  };

  return (
    <details className="rounded-2xl border border-slate-200 bg-white px-3 py-2" data-testid="receipt-inbox" open={items.length > 0}>
      <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 text-sm font-bold text-slate-700">
        <span className="flex items-center gap-2"><Inbox size={16} /> Emailed receipts &amp; bills</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${items.length ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
          {items.length ? `${items.length} to check` : "Empty"}
        </span>
      </summary>
      <div className="stack-y-2 pb-2">
        {address && (
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-xs text-slate-500">
              Forward receipts and supplier invoices to this address, or set an email rule to forward them automatically.
              They wait here until someone approves them.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{address}</code>
              <button type="button" onClick={copy} aria-label="Copy the address"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                <Copy size={15} />
              </button>
              <button type="button" onClick={load} aria-label="Check for new mail" disabled={loading}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        )}
        {items.length === 0 && <p className="text-sm text-slate-500">Nothing waiting. New emails show up here within a minute.</p>}
        <ul className="stack-y-2">
          {items.map(item => {
            const x = item.extracted || {};
            const state = itemState(item);
            const open = openId === item.id;
            return (
              <li key={item.id} className="rounded-xl border border-slate-100">
                <button type="button" onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}
                  className="flex min-h-[56px] w-full items-start justify-between gap-2 px-3 py-2.5 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-800">{x.vendor || item.from_name || item.from_email || "Unknown sender"}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {DOCUMENT_LABELS[x.document_type] || "Document"} · {when(item.received_at)}{item.subject ? ` · ${item.subject}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black text-slate-900">{x.amount ? `${x.currency && x.currency !== "ZAR" ? x.currency + " " : "R"}${Number(x.amount).toFixed(2)}` : ""}</span>
                    <span className={`block text-[11px] font-bold ${state === "ready" ? "text-green-700" : state === "new" ? "text-slate-500" : "text-amber-700"}`}>
                      {state === "ready" ? "Ready to check" : state === "new" ? "Reading…" : "Enter details"}
                    </span>
                  </span>
                </button>
                {open && (
                  <Review item={item} userId={userId} expenses={expenses}
                    onApproved={approved} onRejected={drop} onToast={onToast} />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
