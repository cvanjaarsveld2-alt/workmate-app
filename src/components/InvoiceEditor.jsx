// ─── Invoice editor ───────────────────────────────────────────────────────────
// Make an invoice by hand, or change a draft: customer, dates, reference,
// lines (with discounts and VAT per line) and notes. "Approve" issues it: from
// then on it can't be changed (the server enforces this), only credited or
// voided. Online only, like Sage and Xero: approving needs the server to give
// the invoice its number and check it.
import React, { useState } from "react";
import { supabase } from "../supabase";
import { offlineSave } from "../offline/offlineDb";
import { Btn, Card, ClientSelector, Field } from "./ui";
import { QuoteLineItems } from "./QuoteLineItems";
import { lineTotals, parseLines } from "../lib/lineTotals";
import { addDays } from "../lib/documentPDF";
import { withTeamId } from "../lib/teamId";
import { genId, todayISO } from "../lib/helpers";

// Lines as the editor shows them (text inputs, a key per line).
const editorLines = raw =>
  parseLines(raw).map((l, n) => ({
    ...l,
    id: l.id || `li_${n}_${Math.random().toString(36).slice(2, 6)}`,
    qty: String(l.qty ?? l.quantity ?? 1),
    unitPrice: String(l.unitPrice ?? l.unit_price ?? l.price ?? ""),
  }));

// What's saved: numbers as numbers, empty lines dropped, no UI-only keys.
export function cleanLines(lines) {
  return lines
    .filter(l => String(l.description || "").trim() || Number(l.unitPrice))
    .map(({ id: _id, ...l }) => {
      const out = {
        ...l,
        description: String(l.description || "").trim().slice(0, 500),
        qty: Number(l.qty) || (l.qty === "0" ? 0 : 1),
        unitPrice: Number(l.unitPrice) || 0,
      };
      const d = Number(l.discount);
      if (d > 0) out.discount = Math.min(d, 100);
      else delete out.discount;
      if (l.vat === "zero" || l.vat === "exempt") out.vat = l.vat;
      else delete out.vat;
      return out;
    });
}

export function InvoiceEditor({ invoice = null, clients = [], userId, teamId, profile = {}, onDone, onCancel }) {
  const vatRegistered = profile.vat_registered !== false;
  const terms = profile.payment_terms_days ?? 30;
  const [form, setForm] = useState(() => {
    const issue = invoice?.issue_date || todayISO();
    return {
      client_id: invoice?.client_id || null,
      issue_date: issue,
      due_date: invoice?.due_date || addDays(issue, terms),
      reference: invoice?.reference || "",
      notes: invoice?.notes || "",
    };
  });
  const [lines, setLines] = useState(() => {
    const l = editorLines(invoice?.line_items);
    return l.length ? l : [{ id: "li_new", description: "", qty: "1", unitPrice: "" }];
  });
  const [incl, setIncl] = useState(invoice ? invoice.vat_inclusive === true : false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  async function save(approve) {
    setErr("");
    const clean = cleanLines(lines);
    if (!clean.length) return setErr("Add at least one line with a description or price.");
    if (approve && !form.client_id) return setErr("Choose the customer before approving the invoice.");
    if (form.due_date && form.due_date < form.issue_date) return setErr("The due date can't be before the invoice date.");
    const t = lineTotals(clean, { vatInclusive: incl, vatRegistered });
    if (approve && t.total <= 0) return setErr("An invoice needs an amount before it can be approved.");
    setBusy(approve ? "approve" : "save");
    const fields = {
      client_id: form.client_id || null,
      issue_date: form.issue_date,
      due_date: form.due_date || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim(),
      line_items: clean,
      vat_inclusive: incl,
      subtotal: t.subtotal,
      vat: t.vat,
      total: t.total,
      status: approve ? "sent" : "draft",
    };
    const q = invoice
      ? supabase.from("invoices").update(fields).eq("id", invoice.id)
      : supabase.from("invoices").insert(
          withTeamId(
            {
              id: genId(),
              user_id: userId,
              ...fields,
              amount_paid: 0,
              balance_due: t.total,
              created_at: new Date().toISOString(),
              sync_status: "synced",
            },
            teamId,
          ),
        );
    const { data, error } = await q.select("*").single();
    setBusy("");
    if (error) return setErr(error.message || "Couldn't save the invoice.");
    await offlineSave("invoices", { ...data, sync_status: "synced" }).catch(() => {});
    onDone?.(data, approve);
  }

  return (
    <div data-testid="invoice-editor">
    <Card className="p-4 stack-y-3">
      <p className="text-base font-black text-slate-800">
        {invoice ? `Edit draft ${invoice.invoice_number || ""}` : "New invoice"}
      </p>
      <ClientSelector label="Customer" value={form.client_id} onChange={v => set("client_id")(v || null)} clients={clients} placeholder="Select customer…" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice date" type="date" value={form.issue_date} onChange={v => {
          set("issue_date")(v);
          if (!invoice) set("due_date")(addDays(v || todayISO(), terms));
        }} />
        <Field label="Due date" type="date" value={form.due_date} onChange={set("due_date")} />
      </div>
      <Field label="Customer's order no. / reference" value={form.reference} onChange={set("reference")} maxLength={100} />
      <QuoteLineItems items={lines} onChange={setLines} vatInclusive={incl} vatRegistered={vatRegistered} onVatToggle={setIncl} />
      <Field label="Notes" value={form.notes} onChange={set("notes")} multiline maxLength={2000} />
      {err && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Btn variant="secondary" onClick={() => save(false)} disabled={!!busy}>
          {busy === "save" ? "Saving…" : "Save draft"}
        </Btn>
        <Btn onClick={() => save(true)} disabled={!!busy}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </Btn>
      </div>
      <p className="text-xs text-slate-500">
        A draft can be changed or deleted. Once approved, the invoice is final: it can only be credited or voided.
      </p>
      <Btn variant="ghost" size="sm" onClick={onCancel} disabled={!!busy}>
        Cancel
      </Btn>
    </Card>
    </div>
  );
}
