// ─── Customer portal (/?portal=TOKEN) ─────────────────────────────────────────
// The customer's own page with the company: what they owe and how to pay,
// invoices (PDF), a statement, quotes to accept, jobs, machines and service
// plans. Opens without signing in; everything comes from get_client_portal,
// which checks the link.
import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { buildDocumentPDF, documentFilename, money, shareDocumentPDF } from "../lib/documentPDF";
import { invoiceToDocument } from "../lib/documentData";
import { owing, statementRows } from "../lib/portal";
import { frequencyLabel } from "../lib/servicePlans";

const d = v => (v ? new Date(String(v).length <= 10 ? v + "T12:00:00" : v).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "");
const TABS = ["Invoices", "Statement", "Quotes", "Jobs", "Machines"];

export function CustomerPortalPage({ token }) {
  const [data, setData] = useState(undefined);
  const [tab, setTab] = useState("Invoices");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [canPay, setCanPay] = useState(false);
  const justPaid = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1";

  useEffect(() => {
    supabase.rpc("get_client_portal", { p_token: token }).then(
      ({ data: r }) => setData(r || null),
      () => setData(null),
    );
    supabase.rpc("portal_can_pay", { p_token: token }).then(({ data: ok }) => setCanPay(ok === true), () => {});
  }, [token]);

  if (data === undefined) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-slate-600">
        This link isn't working any more. Please ask for a new one.
      </div>
    );

  const co = data.company || {};
  const color = co.brand_color || "#8B1A1A";
  const name = co.trading_name || co.legal_name || "";
  const today = new Date().toISOString().slice(0, 10);
  const owed = owing(data.invoices);
  const profile = { ...co, trading_name: co.trading_name, logo_data: co.logo_data };
  const client = {
    company: data.client?.name,
    contact: data.client?.contact,
    email: data.client?.email,
    phone: data.client?.phone,
    vat_number: data.client?.vat_no,
    billing_address: data.client?.address,
    id: "portal-client",
  };

  async function invoicePdf(inv) {
    setBusy(inv.id);
    setError("");
    try {
      const doc = invoiceToDocument({ ...inv, client_id: client.id }, "invoice", { clients: [client], profile });
      const blob = await buildDocumentPDF(doc, profile);
      await shareDocumentPDF(blob, documentFilename(doc, profile), `Invoice ${inv.invoice_number}`);
    } catch (e) {
      setError(e.message || "Couldn't make the PDF.");
    }
    setBusy("");
  }

  // PayFast's payment page takes a posted form; the edge function signs it.
  async function pay(inv) {
    setBusy(`pay:${inv.id}`);
    setError("");
    const { data: r, error: e } = await supabase.functions.invoke("payfast", {
      body: { action: "checkout", token, invoice_id: inv.id, return_url: `${window.location.origin}/?portal=${token}` },
    });
    if (e || !r?.url) {
      setBusy("");
      return setError(r?.paid ? "This invoice is already paid." : "Online payment isn't available right now. Please pay by EFT.");
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = r.url;
    for (const [k, v] of r.fields) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  async function openQuote(q) {
    setBusy(q.id);
    const { data: t } = await supabase.rpc("portal_quote_link", { p_token: token, p_quote_id: q.id });
    setBusy("");
    if (t) window.location.href = `/?quote=${t}`;
    else setError("That quote can't be opened. Please contact us.");
  }

  const card = "rounded-2xl bg-white border border-slate-200 p-4";
  const pill = (text, cls) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{text}</span>;
  const rows = statementRows(data.invoices, data.payments);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-2" style={{ background: color }} />
      <div className="mx-auto max-w-2xl px-4 py-6 stack-y-4">
        <div className="flex items-center justify-between gap-3">
          {co.logo_data ? <img src={co.logo_data} alt={name} className="max-h-14 max-w-[200px] object-contain" /> : <p className="text-xl font-black" style={{ color }}>{name}</p>}
          <div className="text-right text-xs text-slate-500">
            {co.phone && <p>{co.phone}</p>}
            {co.email && <p>{co.email}</p>}
          </div>
        </div>
        {justPaid && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Thank you for your payment. It shows here as soon as PayFast confirms it, usually within a minute.
          </div>
        )}
        <div className={card}>
          <p className="text-xs font-bold tracking-widest" style={{ color }}>
            YOUR ACCOUNT
          </p>
          <h1 className="text-xl font-black text-slate-900">{data.client?.name}</h1>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">Amount owing</p>
              <p className="text-2xl font-black text-slate-900">{money(owed.total)}</p>
            </div>
            {owed.overdue > 0 && (
              <div>
                <p className="text-xs text-slate-500">Past due</p>
                <p className="text-2xl font-black text-red-700">{money(owed.overdue)}</p>
              </div>
            )}
          </div>
          {owed.total > 0 && co.bank_account_no && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-bold">Pay by EFT</p>
              <p>
                {co.bank_name} · {co.bank_account_name || co.legal_name || name}
              </p>
              <p>
                Account {co.bank_account_no}
                {co.bank_branch_code ? ` · branch ${co.bank_branch_code}` : ""}
                {co.bank_account_type ? ` · ${co.bank_account_type}` : ""}
              </p>
              <p className="text-xs text-slate-500 mt-1">Use the invoice number as the reference.</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold min-h-[44px] ${tab === t ? "text-white" : "bg-white border border-slate-200 text-slate-600"}`}
              style={tab === t ? { background: color } : {}}
            >
              {t}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}

        {tab === "Invoices" &&
          (data.invoices.length === 0 ? (
            <p className="text-sm text-slate-500">No invoices yet.</p>
          ) : (
            data.invoices.map(i => {
              const bal = Number(i.balance_due ?? i.total) || 0;
              const late = bal > 0 && i.due_date && i.due_date < today;
              return (
                <div key={i.id} className={card + " flex items-center gap-3"}>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{i.invoice_number}</p>
                    <p className="text-xs text-slate-500">
                      {d(i.issue_date)}
                      {i.due_date ? ` · due ${d(i.due_date)}` : ""}
                    </p>
                    <p className="mt-1">
                      {bal <= 0 ? pill("Paid", "bg-emerald-50 text-emerald-700") : late ? pill(`Owing ${money(bal)} · overdue`, "bg-red-100 text-red-700") : pill(`Owing ${money(bal)}`, "bg-amber-50 text-amber-800")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900">{money(i.total)}</p>
                    <button type="button" onClick={() => invoicePdf(i)} disabled={busy === i.id} className="text-sm font-bold underline min-h-[40px]" style={{ color }}>
                      {busy === i.id ? "Making…" : "PDF"}
                    </button>
                    {canPay && bal > 0 && (
                      <button
                        type="button"
                        onClick={() => pay(i)}
                        disabled={!!busy}
                        className="block ml-auto mt-1 rounded-xl px-3 py-2 text-sm font-black text-white min-h-[40px]"
                        style={{ background: color }}
                      >
                        {busy === `pay:${i.id}` ? "Opening…" : "Pay now"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ))}

        {tab === "Statement" && (
          <div className={card + " overflow-x-auto"}>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing on your account yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Details</th>
                    <th className="py-1 pr-2 text-right">Amount</th>
                    <th className="py-1 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, n) => (
                    <tr key={n} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{d(r.date)}</td>
                      <td className="py-1.5 pr-2">{r.what}</td>
                      <td className={`py-1.5 pr-2 text-right whitespace-nowrap ${r.credit ? "text-emerald-700" : ""}`}>
                        {r.credit ? `-${money(r.credit)}` : money(r.debit)}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap font-bold">{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length > 0 && (
              <button type="button" onClick={() => window.print()} className="mt-3 text-sm font-bold underline" style={{ color }}>
                Print or save as PDF
              </button>
            )}
          </div>
        )}

        {tab === "Quotes" &&
          (data.quotes.length === 0 ? (
            <p className="text-sm text-slate-500">No quotes yet.</p>
          ) : (
            data.quotes.map(q => (
              <div key={q.id} className={card + " flex items-center gap-3"}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 truncate">{q.title || `Quotation ${q.number}`}</p>
                  <p className="text-xs text-slate-500">
                    {q.number} · {d(q.date)}
                    {q.expiry_date ? ` · valid until ${d(q.expiry_date)}` : ""}
                  </p>
                  <p className="mt-1">{q.accepted_at ? pill("Accepted", "bg-emerald-50 text-emerald-700") : pill(q.status || "Sent", "bg-slate-100 text-slate-600")}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900">{money(q.value)}</p>
                  <button type="button" onClick={() => openQuote(q)} disabled={busy === q.id} className="text-sm font-bold underline min-h-[40px]" style={{ color }}>
                    {q.can_accept ? "View & accept" : "View"}
                  </button>
                </div>
              </div>
            ))
          ))}

        {tab === "Jobs" &&
          (data.jobs.length === 0 ? (
            <p className="text-sm text-slate-500">No jobs yet.</p>
          ) : (
            data.jobs.map((j, n) => (
              <div key={n} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900">{j.title || "Job"}</p>
                  {pill(String(j.status || "").replace(/_/g, " "), j.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}
                </div>
                <p className="text-xs text-slate-500">
                  {[j.job_number, j.completed_at ? `done ${d(j.completed_at)}` : j.scheduled_date ? `booked for ${d(j.scheduled_date)}` : "", j.location].filter(Boolean).join(" · ")}
                </p>
                {j.work_done && <p className="text-sm text-slate-700 mt-1 whitespace-pre-line">{j.work_done}</p>}
              </div>
            ))
          ))}

        {tab === "Machines" && (
          <>
            {data.service_plans.length > 0 && (
              <div className={card}>
                <p className="font-bold text-slate-900 mb-1">Service plans</p>
                {data.service_plans.map((s, n) => (
                  <p key={n} className="text-sm text-slate-700">
                    {s.title} · {frequencyLabel(s)} · next {d(s.next_due)}
                  </p>
                ))}
              </div>
            )}
            {data.equipment.length === 0 ? (
              <p className="text-sm text-slate-500">No machines on record.</p>
            ) : (
              data.equipment.map((e, n) => (
                <div key={n} className={card}>
                  <p className="font-bold text-slate-900">{[e.name, e.make, e.model].filter(Boolean).join(" ")}</p>
                  <p className="text-xs text-slate-500">
                    {[e.serial && `Serial ${e.serial}`, e.location, e.service_due && `service due ${d(e.service_due)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))
            )}
          </>
        )}

        <p className="text-center text-xs text-slate-400 pt-4">
          {name}
          {co.vat_no ? ` · VAT ${co.vat_no}` : ""}
          {co.registration_no ? ` · Reg ${co.registration_no}` : ""}
        </p>
      </div>
    </div>
  );
}
