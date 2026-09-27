// ─── Xero ─────────────────────────────────────────────────────────────────────
// The master account connects the company's Xero organisation; finished
// invoices are then created in Xero every night, or now with "Sync now".
// Admins can see the status and sync. See supabase/functions/xero.
import React, { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, Field } from "./ui";

const RETURN_MESSAGES = {
  connected: "Xero is connected. Your invoices will go across tonight, or tap Sync now.",
  cancelled: "Xero wasn't connected.",
  expired: "That took too long. Please try connecting again.",
  failed: "Xero didn't accept the connection. Please try again.",
  "no-organisation": "Your Xero sign-in has no organisation to connect.",
};

export function XeroConnection({ teamId, isOwner }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState(() => {
    try {
      return RETURN_MESSAGES[new URLSearchParams(window.location.search).get("xero")] || "";
    } catch {
      return "";
    }
  });

  async function load() {
    if (!teamId || !navigator.onLine) return;
    const { data } = await supabase.rpc("xero_status", { p_team_id: teamId });
    if (data) {
      setStatus(data);
      setCode(data.sales_account_code || "200");
    }
  }
  useEffect(() => {
    load();
  }, [teamId]);

  async function connect() {
    setBusy(true);
    setMessage("");
    const { data: state, error } = await supabase.rpc("xero_start", { p_team_id: teamId });
    if (error) {
      setBusy(false);
      return setMessage(error.message);
    }
    const { data, error: e } = await supabase.functions.invoke("xero", { body: { action: "authorize_url", state } });
    setBusy(false);
    if (e || !data?.url) return setMessage("Xero isn't available yet. The app provider needs to switch it on.");
    window.location.href = data.url;
  }

  async function sync() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("xero", { body: { action: "sync", team_id: teamId } });
    setBusy(false);
    if (error || data?.error) return setMessage(data?.error || "Sync didn't work. Try again later.");
    setMessage(data.sent || data.failed ? `${data.sent} sent to Xero${data.failed ? `, ${data.failed} not accepted (see below)` : ""}.` : "Everything is already in Xero.");
    load();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Xero? Invoices already sent stay in Xero.")) return;
    const { error } = await supabase.rpc("xero_disconnect", { p_team_id: teamId });
    if (error) return setMessage(error.message);
    setMessage("Xero disconnected.");
    load();
  }

  async function saveCode() {
    const { error } = await supabase.rpc("xero_set_account", { p_team_id: teamId, p_code: code.trim() });
    setMessage(error ? error.message : "Sales account saved.");
  }

  if (!status) return null; // not the master account or an admin, or offline
  const errors = status.last_sync_result?.errors || [];
  return (
    <Card className="p-4 stack-y-3">
      <div className="flex items-start gap-2">
        <Link2 size={18} className="text-slate-500 mt-0.5" />
        <div>
          <p className="text-base font-black text-slate-800">Xero</p>
          <p className="text-xs text-slate-500 leading-snug mt-0.5">
            Every finished invoice is created in Xero as an approved sales invoice, with the customer as the contact. Xero
            applies the VAT rate of the sales account.
          </p>
        </div>
      </div>
      {status.connected ? (
        <>
          <p className="text-sm font-bold text-emerald-700">
            Connected to {status.organisation || "Xero"}
            {status.last_sync_at ? ` · last sync ${new Date(status.last_sync_at).toLocaleString("en-ZA")}` : ""}
          </p>
          {status.waiting > 0 && <p className="text-sm text-slate-600">{status.waiting} invoice{status.waiting === 1 ? "" : "s"} waiting to go across.</p>}
          {errors.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 stack-y-1">
              {errors.map((e, i) => (
                <p key={i}>{String(e)}</p>
              ))}
            </div>
          )}
          <Btn className="w-full" size="sm" onClick={sync} disabled={busy}>
            {busy ? "Syncing…" : "Sync now"}
          </Btn>
          {isOwner && (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <Field label="Xero sales account code" value={code} onChange={setCode} maxLength={10} />
                <Btn size="sm" variant="secondary" onClick={saveCode}>
                  Save
                </Btn>
              </div>
              <Btn className="w-full" size="sm" variant="ghost" onClick={disconnect}>
                Disconnect Xero
              </Btn>
            </>
          )}
        </>
      ) : isOwner ? (
        <Btn className="w-full" size="sm" onClick={connect} disabled={busy}>
          {busy ? "Opening Xero…" : "Connect to Xero"}
        </Btn>
      ) : (
        <p className="text-sm text-slate-500">Not connected. The master account can connect Xero.</p>
      )}
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </Card>
  );
}
