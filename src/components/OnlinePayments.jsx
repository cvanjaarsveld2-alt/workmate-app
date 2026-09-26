// ─── Online payments (PayFast) ────────────────────────────────────────────────
// The master account connects the company's own PayFast account so customers
// can pay invoices from their portal by card or instant EFT. The merchant key
// and passphrase are stored on the server and never shown again.
import React, { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, Field } from "./ui";

export function OnlinePayments({ teamId }) {
  const [state, setState] = useState(null);
  const [form, setForm] = useState({ merchant_id: "", merchant_key: "", passphrase: "", sandbox: true, enabled: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!teamId || !navigator.onLine) return;
    supabase.rpc("get_payfast_settings", { p_team_id: teamId }).then(({ data }) => {
      if (!data) return;
      setState(data);
      setForm(f => ({ ...f, merchant_id: data.merchant_id || "", sandbox: data.sandbox !== false, enabled: !!data.enabled }));
    });
  }, [teamId]);

  async function save() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("set_payfast_settings", {
      p_team_id: teamId,
      p_merchant_id: form.merchant_id.trim() || null,
      p_merchant_key: form.merchant_key.trim() || null,
      p_passphrase: form.passphrase || null,
      p_sandbox: form.sandbox,
      p_enabled: form.enabled,
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setState(data);
    setForm(f => ({ ...f, merchant_key: "", passphrase: "" }));
    setMessage(data.enabled ? (data.sandbox ? "Saved. Test mode: no real money moves." : "Saved. Customers can pay online.") : "Saved. Online payments are off.");
  }

  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const toggle = (k, label, hint) => (
    <label className="flex items-center gap-3 min-h-[52px] cursor-pointer">
      <span className="flex-1">
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <input type="checkbox" checked={!!form[k]} onChange={e => set(k)(e.target.checked)} aria-label={label} className="h-6 w-6 shrink-0" />
    </label>
  );
  return (
    <Card className="p-4 stack-y-3">
      <div className="flex items-start gap-2">
        <CreditCard size={18} className="text-slate-500 mt-0.5" />
        <div>
          <p className="text-base font-black text-slate-800">Online payments</p>
          <p className="text-xs text-slate-500 leading-snug mt-0.5">
            Customers pay invoices by card or instant EFT from their portal link, and the invoice is marked paid
            automatically. Uses your own PayFast account (payfast.co.za → Settings → Integration).
          </p>
        </div>
      </div>
      {state && (
        <p className={`text-sm font-bold ${state.enabled ? "text-emerald-700" : "text-slate-500"}`}>
          {state.enabled ? (state.sandbox ? "On, in test mode" : "On") : "Off"}
          {state.has_key ? " · merchant key saved" : ""}
          {state.has_passphrase ? " · passphrase saved" : ""}
        </p>
      )}
      <Field label="Merchant ID" value={form.merchant_id} onChange={set("merchant_id")} maxLength={12} />
      <Field label={state?.has_key ? "Merchant key (leave blank to keep)" : "Merchant key"} value={form.merchant_key} onChange={set("merchant_key")} maxLength={40} />
      <Field label={state?.has_passphrase ? "Passphrase (leave blank to keep)" : "Passphrase"} value={form.passphrase} onChange={set("passphrase")} type="password" maxLength={100} />
      {toggle("sandbox", "Test mode (PayFast sandbox)", "Try it with PayFast's test card before taking real payments.")}
      {toggle("enabled", "Customers can pay online")}
      {message && <p className="text-sm text-slate-700">{message}</p>}
      <Btn className="w-full" size="sm" onClick={save} disabled={busy || !navigator.onLine}>
        {busy ? "Saving…" : "Save payment settings"}
      </Btn>
    </Card>
  );
}
