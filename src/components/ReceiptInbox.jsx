// ─── Inbox: receipts, bills and business email ───────────────────────────────
// On the Expenses screen. Items arrive two ways: emailed to the company's
// forwarding address (receipts and bills), or found by the mail agent in a
// connected mailbox (also quote requests, customer mail and supplier
// documents). Each item is checked (the AI's reading can be corrected) and
// filed where it belongs, or removed. Online only: the items live on the
// server. See docs/EMAIL_INBOX.md and docs/MAIL_AGENT.md.
import React, { useCallback, useEffect, useState } from "react";
import { Bot, Copy, FileText, Inbox, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import { offlineSave } from "../offline/offlineDb";
import { activeTeamId } from "../lib/companyProfile";
import { CATEGORIES } from "../lib/expenseAccounting";
import { convertToZAR } from "../lib/exchangeRate";
import {
  DOCUMENT_LABELS, FILE_AS, KIND_LABELS, OPEN_STATUSES, actionForKind, filedTo, filingForm, filingProblem, documentLabel, inboxAddress, isDocumentPath,
  itemState, possibleDuplicate, reviewForm, reviewProblem,
} from "../lib/inbox";
import { Btn, ClientSelector, Field, SelectField } from "./ui";
import { MailboxAgent } from "./MailboxAgent";

const when = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const rand = v => (Number(v) > 0 ? `R${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");

// Messages for coming back from "Sign in with Microsoft/Google".
const MAILBOX_RESULT = {
  connected: "Mailbox connected. The first check runs within 5 minutes.",
  cancelled: "Connecting the mailbox was cancelled.",
  expired: "That took too long. Start connecting the mailbox again.",
  failed: "The mailbox couldn't be connected. Try again.",
  "no-offline-access": "The mailbox didn't allow ongoing access. Try again and accept all the permissions.",
};

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
  if (isDocumentPath(item.file_path)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-3 text-sm font-bold text-slate-700 min-h-[48px]">
        <FileText size={16} /> Open {item.file_name || `the ${documentLabel(item.file_path)}`}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={item.file_name || "Receipt"} className="max-h-64 w-full rounded-lg bg-slate-50 object-contain" />
    </a>
  );
}

function ExpenseFields({ form, set }) {
  return (
    <>
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
    </>
  );
}

function FilingFields({ action, form, set, clients, orders }) {
  if (action === "lead") {
    return (
      <>
        <Field label="Lead title" value={form.title} onChange={set("title")} maxLength={200} />
        <Field label="What they asked for" value={form.description} onChange={set("description")} multiline maxLength={4000} />
        <ClientSelector label="Customer (if already one)" value={form.client_id || null} onChange={v => set("client_id")(v || "")} clients={clients} placeholder="New customer" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Company" value={form.company} onChange={set("company")} maxLength={200} />
          <Field label="Contact" value={form.contact_name} onChange={set("contact_name")} maxLength={200} />
        </div>
      </>
    );
  }
  if (action === "customer_note") {
    return (
      <>
        <ClientSelector label="Customer" value={form.client_id || null} onChange={v => set("client_id")(v || "")} clients={clients} placeholder="Select customer…" />
        <Field label="Summary" value={form.summary} onChange={set("summary")} maxLength={500} />
      </>
    );
  }
  return (
    <>
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-500" htmlFor="inbox-po">Purchase order</label>
        <select id="inbox-po" value={form.purchase_order_id || ""} onChange={e => set("purchase_order_id")(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base outline-hidden focus:border-red-300 focus:bg-white min-h-[56px]">
          <option value="">Choose…</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Supplier's reference" value={form.supplier_ref} onChange={set("supplier_ref")} maxLength={60} />
        <Field label="Expected delivery" type="date" value={form.expected_date} onChange={set("expected_date")} />
      </div>
      <Field label="Summary" value={form.summary} onChange={set("summary")} maxLength={500} />
    </>
  );
}

function Review({ item, userId, expenses, clients, orders, onFiled, onRejected, onToast }) {
  const [action, setAction] = useState(() => actionForKind(item.kind));
  const [form, setForm] = useState(() => reviewForm(item));
  const [filing, setFiling] = useState(() => filingForm(item));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const setF = k => v => setFiling(f => ({ ...f, [k]: v }));
  const dup = action === "expense" ? possibleDuplicate(form, expenses) : null;
  const spec = FILE_AS.find(f => f.action === action) || FILE_AS[0];

  async function file() {
    setErr("");
    if (action === "expense") {
      const problem = reviewProblem(form);
      if (problem) return setErr(problem);
      setBusy("file");
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
      return onFiled(item, { expense: data, message: "Added to your expenses ✓" });
    }
    const problem = filingProblem(action, filing);
    if (problem) return setErr(problem);
    setBusy("file");
    const { error } = await supabase.rpc("file_inbox_item", { p_id: item.id, p_action: action, p_fields: filing });
    setBusy("");
    if (error) return setErr(error.message || "Couldn't file it.");
    onFiled(item, { message: { lead: "Lead created ✓", customer_note: "Filed on the customer ✓", purchase_order: "Added to the purchase order ✓" }[action] });
  }

  async function reject() {
    setBusy("reject");
    const { error } = await supabase.rpc("review_inbox_item", { p_id: item.id, p_action: "reject" });
    setBusy("");
    if (error) return setErr(error.message || "Couldn't remove it.");
    onRejected(item);
    onToast("Removed from the inbox");
  }

  return (
    <div className="stack-y-3 px-3 pb-3">
      {item.extracted?.summary && <p className="text-sm text-slate-700">{item.extracted.summary}</p>}
      <FilePreview item={item} />
      {item.file_path && item.body_excerpt && item.kind !== "expense" && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{item.body_excerpt}</pre>
      )}
      {item.error && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{item.error}</p>}
      <SelectField label="What is this?" value={spec.label} onChange={label => setAction((FILE_AS.find(f => f.label === label) || FILE_AS[0]).action)}
        options={FILE_AS.map(f => f.label)} />
      {action === "expense" ? <ExpenseFields form={form} set={set} /> : <FilingFields action={action} form={filing} set={setF} clients={clients} orders={orders} />}
      {dup && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
          Possible duplicate: {dup.vendor || "an expense"} for {rand(dup.amount_zar || dup.amount)} on {dup.expense_date} is already saved.
        </p>
      )}
      {err && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Btn size="sm" variant="ghost" onClick={reject} disabled={!!busy}>{busy === "reject" ? "Removing…" : "Not needed"}</Btn>
        <Btn size="sm" onClick={file} disabled={!!busy}>{busy === "file" ? "Saving…" : spec.button}</Btn>
      </div>
    </div>
  );
}

export function ReceiptInbox({ userId, expenses = [], clients = [], isOwner = false, setData, onToast = () => {} }) {
  const teamId = activeTeamId();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [token, setToken] = useState("");
  const [items, setItems] = useState(null);
  const [filedByAgent, setFiledByAgent] = useState([]);
  const [orders, setOrders] = useState([]);
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

  // Back from "Sign in with Microsoft/Google".
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const r = url.searchParams.get("mailbox");
      if (!r) return;
      onToast(MAILBOX_RESULT[r] || MAILBOX_RESULT.failed);
      url.searchParams.delete("mailbox");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // no URL handling (tests)
    }
  }, []);

  const load = useCallback(async () => {
    if (!teamId || !online) return;
    setLoading(true);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [addr, list, auto, pos] = await Promise.all([
      supabase.rpc("inbox_address", { p_team: teamId }),
      supabase.from("inbox_items").select("*").eq("team_id", teamId).in("status", OPEN_STATUSES)
        .order("received_at", { ascending: false }).limit(100),
      supabase.from("inbox_items").select("id, kind, subject, from_name, from_email, extracted, reviewed_at, expense_id, lead_id, activity_id, purchase_order_id, status")
        .eq("team_id", teamId).eq("auto_filed", true).gte("reviewed_at", since).order("reviewed_at", { ascending: false }).limit(20),
      supabase.from("purchase_orders").select("id, po_number, supplier_name, status").eq("team_id", teamId)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    setLoading(false);
    if (!addr.error && typeof addr.data === "string") setToken(addr.data);
    setItems(list.error ? null : list.data || []);
    setFiledByAgent(auto.error ? [] : auto.data || []);
    setOrders((pos.data || []).filter(o => o.status !== "cancelled").map(o => ({ id: o.id, label: `${o.po_number || "PO"} · ${o.supplier_name || ""}` })));
  }, [teamId, online]);

  useEffect(() => { load(); }, [load]);

  if (!teamId || !online || items === null) return null;

  const drop = item => { setItems(list => list.filter(i => i.id !== item.id)); setOpenId(null); };
  const filed = (item, { expense, message }) => {
    drop(item);
    if (expense) setData?.(d => ({ ...d, expenses: [expense, ...(d.expenses || []).filter(e => e.id !== expense.id)] }));
    onToast(message);
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
        <span className="flex items-center gap-2"><Inbox size={16} /> Inbox: receipts, bills &amp; email</span>
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
        {items.length === 0 && <p className="text-sm text-slate-500">Nothing waiting. New mail shows up here within a few minutes.</p>}
        <ul className="stack-y-2">
          {items.map(item => {
            const x = item.extracted || {};
            const state = itemState(item);
            const open = openId === item.id;
            const label = item.kind && item.kind !== "expense" ? KIND_LABELS[item.kind] : DOCUMENT_LABELS[x.document_type] || "Document";
            return (
              <li key={item.id} className="rounded-xl border border-slate-100">
                <button type="button" onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}
                  className="flex min-h-[56px] w-full items-start justify-between gap-2 px-3 py-2.5 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-800">{x.vendor || item.from_name || item.from_email || "Unknown sender"}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {item.source === "mailbox" && <Bot size={11} className="mr-0.5 inline" aria-label="Found by the mail agent" />}
                      {label} · {when(item.received_at)}{item.subject ? ` · ${item.subject}` : ""}
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
                  <Review item={item} userId={userId} expenses={expenses} clients={clients} orders={orders}
                    onFiled={filed} onRejected={drop} onToast={onToast} />
                )}
              </li>
            );
          })}
        </ul>
        {filedByAgent.length > 0 && (
          <details className="rounded-xl bg-slate-50 px-2.5 py-1.5">
            <summary className="flex min-h-[40px] cursor-pointer items-center text-xs font-bold text-slate-600">
              Filed by the agent this week ({filedByAgent.length})
            </summary>
            <ul className="stack-y-1 pb-1.5">
              {filedByAgent.map(i => (
                <li key={i.id} className="text-xs text-slate-600">
                  {KIND_LABELS[i.kind] || "Item"}: {(i.extracted || {}).vendor || i.from_name || i.from_email} · {i.subject} → {filedTo(i)}
                </li>
              ))}
            </ul>
          </details>
        )}
        <MailboxAgent teamId={teamId} isOwner={isOwner} onToast={onToast} onChecked={load} />
      </div>
    </details>
  );
}
