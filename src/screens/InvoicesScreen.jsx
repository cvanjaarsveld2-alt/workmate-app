import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Card, Btn, PageHeader } from "../components/ui";
import { CreditCard, RefreshCw } from "lucide-react";

export function InvoicesScreen({ userId, teamId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    if (!userId) return;
    setLoading(true); setError("");
    const { data, error: e } = await supabase.from("invoices").select("*").order("issue_date", { ascending: false });
    if (e) setError(e.message); else setInvoices(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId, teamId]);

  async function recordPayment(invoice) {
    const raw = window.prompt(`Payment received for ${invoice.invoice_number || "invoice"}. Enter amount (R):`, String(Number(invoice.balance_due || invoice.total || 0)));
    if (raw === null) return;
    const amount = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid payment amount."); return; }
    setSaving(invoice.id); setError("");
    const { error: pe } = await supabase.from("payments").insert({ user_id: userId, team_id: invoice.team_id || teamId || null, invoice_id: invoice.id, amount, method: "eft", payment_date: new Date().toISOString().slice(0,10) });
    if (pe) { setError(pe.message); setSaving(null); return; }
    const paid = Number(invoice.amount_paid || 0) + amount;
    const balance = Math.max(0, Number(invoice.total || 0) - paid);
    const status = balance === 0 ? "paid" : "part_paid";
    const { data, error: ie } = await supabase.from("invoices").update({ amount_paid: paid, balance_due: balance, status }).eq("id", invoice.id).select("*").single();
    if (ie) setError(ie.message); else setInvoices(rows => rows.map(r => r.id === invoice.id ? data : r));
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" subtitle="Billing, balances & payments" />
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end"><Btn size="sm" variant="secondary" onClick={load}><RefreshCw size={14}/> Refresh</Btn></div>
      {loading ? <Card className="p-6 text-center text-slate-400">Loading invoices…</Card> : invoices.length === 0 ? (
        <Card className="p-6 text-center"><p className="font-bold text-slate-700">No invoices yet</p><p className="text-sm text-slate-400 mt-1">Invoices generated from jobs will appear here.</p></Card>
      ) : invoices.map(inv => (
        <Card key={inv.id} className="p-4 space-y-3">
          <div className="flex items-start gap-3"><div className="flex-1"><p className="font-black text-slate-900">{inv.invoice_number || "Invoice"}</p><p className="text-sm text-slate-500">{inv.status.replace("_", " ")}</p></div><p className="font-black text-slate-900">R {Number(inv.total || 0).toFixed(2)}</p></div>
          <div className="flex justify-between text-xs text-slate-500"><span>Paid: R {Number(inv.amount_paid || 0).toFixed(2)}</span><span>Balance: R {Number(inv.balance_due || 0).toFixed(2)}</span></div>
          {Number(inv.balance_due || 0) > 0 && !["cancelled"].includes(inv.status) && <Btn size="sm" onClick={() => recordPayment(inv)} disabled={saving === inv.id}><CreditCard size={13}/> Record payment</Btn>}
        </Card>
      ))}
    </div>
  );
}
