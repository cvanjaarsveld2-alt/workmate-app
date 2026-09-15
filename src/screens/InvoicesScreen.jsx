import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { Card, Btn, PageHeader } from "../components/ui";
import { CreditCard, RefreshCw, Search, CheckCircle2, AlertCircle } from "lucide-react";

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  part_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

function money(value) {
  return `R ${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoicesScreen({ userId, teamId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    if (!userId) return;
    setLoading(true); setError("");
    const { data, error: e } = await supabase.from("invoices").select("*").order("issue_date", { ascending: false });
    if (e) setError(e.message); else setInvoices(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId, teamId]);

  const visibleInvoices = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter(inv => [inv.invoice_number, inv.notes, inv.status].filter(Boolean).some(v => String(v).toLowerCase().includes(term)));
  }, [invoices, query]);

  async function recordPayment(invoice) {
    const balance = Math.max(0, Number(invoice.balance_due || 0));
    const raw = window.prompt(`Payment received for ${invoice.invoice_number || "invoice"}. Enter amount (R):`, String(balance));
    if (raw === null) return;
    const amount = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid payment amount."); return; }
    if (amount > balance + 0.01) { setError(`Payment cannot exceed the outstanding balance of ${money(balance)}.`); return; }

    const method = window.prompt("Payment method (eft / cash / card):", "eft");
    if (method === null) return;
    const cleanMethod = method.trim().toLowerCase() || "eft";
    const reference = window.prompt("Payment reference (optional):", "");
    if (reference === null) return;

    setSaving(invoice.id); setError("");
    const { error: pe } = await supabase.from("payments").insert({
      user_id: userId,
      team_id: invoice.team_id || teamId || null,
      invoice_id: invoice.id,
      amount,
      method: cleanMethod,
      reference: reference.trim() || null,
      payment_date: new Date().toISOString().slice(0, 10),
    });
    if (pe) { setError(pe.message); setSaving(null); return; }

    // The database trigger recalculates amount_paid, balance_due and status.
    // Reload the authoritative invoice instead of calculating it twice in the UI.
    const { data, error: ie } = await supabase.from("invoices").select("*").eq("id", invoice.id).single();
    if (ie) setError(ie.message);
    else setInvoices(rows => rows.map(r => r.id === invoice.id ? data : r));
    setSaving(null);
  }

  const outstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);
  const paid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" subtitle="Billing, balances & payments" />
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-xs font-bold text-slate-400">Outstanding</p><p className="text-lg font-black text-slate-900 mt-1">{money(outstanding)}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold text-slate-400">Payments received</p><p className="text-lg font-black text-slate-900 mt-1">{money(paid)}</p></Card>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search invoices" className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none" /></div>
        <Btn size="sm" variant="secondary" onClick={load}><RefreshCw size={14}/> Refresh</Btn>
      </div>
      {loading ? <Card className="p-6 text-center text-slate-400">Loading invoices…</Card> : visibleInvoices.length === 0 ? (
        <Card className="p-6 text-center"><p className="font-bold text-slate-700">No invoices found</p><p className="text-sm text-slate-400 mt-1">Invoices generated from completed jobs will appear here.</p></Card>
      ) : visibleInvoices.map(inv => {
        const status = STATUS_LABELS[inv.status] || String(inv.status || "Unknown").replaceAll("_", " ");
        const isPaid = Number(inv.balance_due || 0) <= 0 || inv.status === "paid";
        return (
          <Card key={inv.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3"><div className="flex-1 min-w-0"><p className="font-black text-slate-900 truncate">{inv.invoice_number || "Invoice"}</p><p className="text-sm text-slate-500">{status}</p></div><p className="font-black text-slate-900">{money(inv.total)}</p></div>
            <div className="flex justify-between text-xs text-slate-500"><span>Paid: {money(inv.amount_paid)}</span><span>Balance: {money(inv.balance_due)}</span></div>
            <div className="flex gap-2 items-center">
              {isPaid ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700"><CheckCircle2 size={13}/> Paid</span> : <Btn size="sm" onClick={() => recordPayment(inv)} disabled={saving === inv.id}><CreditCard size={13}/>{saving === inv.id ? "Saving…" : "Record payment"}</Btn>}
              {inv.due_date && !isPaid && <span className="text-xs text-slate-400">Due {inv.due_date}</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
