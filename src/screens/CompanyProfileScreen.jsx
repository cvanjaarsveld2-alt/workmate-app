// ─── Company profile ──────────────────────────────────────────────────────────
// The details every quote, pro forma and invoice is printed with. Each company
// using the app sets its own; only the master account can change them.
import React, { useEffect, useRef, useState } from "react";
import { Building2, Upload, Trash2, FileText, Lock, WifiOff } from "lucide-react";
import { Card, Btn, Field, PageHeader, Toast } from "../components/ui";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { compressLogo, saveCompanyProfile, useCompanyProfile } from "../lib/companyProfile";
import { offeredModules } from "../lib/modules";
import { supabase } from "../supabase";
import { buildCompanyZip } from "../lib/companyExport";
import { useTeamPlan } from "../lib/plan";
import { OnlinePayments } from "../components/OnlinePayments";
import { XeroConnection } from "../components/XeroConnection";
import { addDays, buildDocumentPDF, documentFilename, shareDocumentPDF } from "../lib/documentPDF";

const today = () => new Date().toISOString().slice(0, 10);

function Section({ title, hint, children }) {
  return (
    <Card className="p-4 stack-y-3">
      <div>
        <p className="text-base font-black text-slate-800">{title}</p>
        {hint && <p className="text-xs text-slate-500 leading-snug mt-0.5">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function ReadOnly({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-bold text-slate-800 text-right whitespace-pre-line wrap-break-word min-w-0">
        {value}
      </span>
    </div>
  );
}

export function CompanyProfileScreen({ teamId, isOwner }) {
  const profile = useCompanyProfile(teamId);
  const online = useOnlineStatus();
  const [form, setForm] = useState(profile);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);
  const plan = useTeamPlan(teamId, online);
  const [deletionAsked, setDeletionAsked] = useState(null);
  useEffect(() => {
    if (!online || !teamId) return;
    supabase
      .from("team_plans")
      .select("deletion_requested_at")
      .eq("team_id", teamId)
      .maybeSingle()
      .then(
        ({ data }) => setDeletionAsked(data?.deletion_requested_at || null),
        () => {},
      );
  }, [teamId, online, plan]);

  async function downloadAll() {
    setError("");
    setToast("Preparing your data…");
    const { data, error: e } = await supabase.rpc("export_company_data", { p_team_id: teamId });
    if (e) return setError(e.message);
    const blob = await buildCompanyZip(data);
    const name = `${(form.trading_name || "company").replace(/[^A-Za-z0-9]+/g, "_")}_data_${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setToast("Company data downloaded");
  }
  async function askDeletion(cancel) {
    if (!cancel && !window.confirm("Ask us to delete ALL of your company's data? Download a copy first. We delete it after the notice period in the terms, and it can't be undone after that."))
      return;
    const { error: e } = await supabase.rpc("request_company_deletion", { p_team_id: teamId, p_cancel: !!cancel });
    if (e) return setError(e.message);
    setDeletionAsked(cancel ? null : new Date().toISOString());
    setToast(cancel ? "Deletion request cancelled" : "Deletion requested");
  }

  useEffect(() => {
    if (!dirty) setForm(profile);
  }, [profile, dirty]);

  const set = k => v => {
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
  };

  async function onLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl } = await compressLogo(file);
      set("logo_data")(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    setError("");
    setSaving(true);
    const r = await saveCompanyProfile(teamId, form);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setDirty(false);
    setForm(r.profile);
    setToast("Company details saved");
  }

  async function preview() {
    const doc = {
      kind: "invoice",
      number: `${form.invoice_prefix || ""}${String(form.next_invoice_number || 1).padStart(5, "0")}`,
      date: today(),
      dueDate: addDays(today(), form.payment_terms_days),
      client: {
        name: "Sample Customer (Pty) Ltd",
        contact: "Jane Smith",
        address: "1 Example Road\nJohannesburg\n2000",
        email: "accounts@example.co.za",
        vat: "4000000000",
      },
      items: [
        { description: "Service and inspection", qty: 1, unitPrice: 4500 },
        { description: "Hydraulic hose assembly", qty: 2, unitPrice: 850 },
      ],
      vatInclusive: false,
      notes: "Sample invoice showing how your documents will look.",
    };
    try {
      const blob = await buildDocumentPDF(doc, form);
      const r = await shareDocumentPDF(blob, "Sample_" + documentFilename(doc, form));
      if (r !== "cancelled") setToast(r === "shared" ? "Sample shared" : "Sample PDF downloaded");
    } catch (err) {
      console.error("Sample PDF failed:", err);
      setError("Couldn't build the sample PDF.");
    }
  }

  if (!isOwner) {
    return (
      <div className="stack-y-4">
        <PageHeader title="Company Details" subtitle="Printed on every quote, pro forma and invoice" />
        <Card className="p-4 flex gap-3 items-start">
          <Lock size={18} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600 leading-snug">
            Only the master account can change these details. Ask them if something needs updating.
          </p>
        </Card>
        <Card className="p-4">
          {profile.logo_data && (
            <img src={profile.logo_data} alt="Company logo" className="max-h-16 max-w-[220px] object-contain mb-3" />
          )}
          <ReadOnly label="Trading name" value={profile.trading_name} />
          <ReadOnly label="Registered name" value={profile.legal_name} />
          <ReadOnly label="Registration no." value={profile.registration_no} />
          <ReadOnly label="VAT" value={profile.vat_registered === false ? "Not registered" : profile.vat_no} />
          <ReadOnly label="Address" value={profile.address} />
          <ReadOnly label="Phone" value={profile.phone} />
          <ReadOnly label="Email" value={profile.email} />
          <ReadOnly label="Finance email" value={profile.finance_email} />
          <ReadOnly label="Bank" value={profile.bank_name} />
          <ReadOnly label="Quotes valid for" value={`${profile.quote_validity_days} days`} />
          <ReadOnly label="Payment terms" value={`${profile.payment_terms_days} days`} />
          {Number(profile.labour_rate) > 0 && <ReadOnly label="Labour rate" value={`R ${Number(profile.labour_rate).toFixed(2)} per hour`} />}
        </Card>
      </div>
    );
  }

  return (
    <div className="stack-y-4 pb-8">
      <PageHeader title="Company Details" subtitle="Printed on every quote, pro forma and invoice" />
      {!online && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2 items-center">
          <WifiOff size={15} />
          You're offline. Changes can be saved once you're back online.
        </div>
      )}
      {form.vat_registered !== false && !form.vat_no && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800 leading-snug">
          Add your VAT number to issue <b>tax invoices</b>. Without it, invoices are titled "Invoice".
        </div>
      )}

      <Section title="Logo" hint="PNG with a transparent background looks best. It's resized automatically.">
        <div className="flex items-center gap-3">
          <div className="h-20 flex-1 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-white overflow-hidden">
            {form.logo_data ? (
              <img src={form.logo_data} alt="Company logo" className="max-h-16 max-w-full object-contain" />
            ) : (
              <Building2 size={28} className="text-slate-300" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Btn size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              {form.logo_data ? "Change" : "Upload"}
            </Btn>
            {form.logo_data && (
              <Btn size="sm" variant="ghost" onClick={() => set("logo_data")(null)}>
                <Trash2 size={14} />
                Remove
              </Btn>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={onLogo}
          aria-label="Upload logo"
        />
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-500">Brand colour</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.brand_color || "#8B1A1A"}
              onChange={e => set("brand_color")(e.target.value)}
              aria-label="Brand colour"
              className="h-12 w-16 rounded-lg border border-slate-200 bg-white"
            />
            <span className="text-sm text-slate-500">Used for headings and the table header.</span>
          </div>
        </div>
      </Section>

      <Section title="Company">
        <Field label="Trading name" value={form.trading_name} onChange={set("trading_name")} maxLength={120} />
        <Field
          label="Registered name"
          value={form.legal_name}
          onChange={set("legal_name")}
          placeholder="e.g. Example Holdings (Pty) Ltd"
          maxLength={160}
        />
        <Field
          label="Registration no."
          value={form.registration_no}
          onChange={set("registration_no")}
          placeholder="2015/123456/07"
          maxLength={40}
        />
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border-2 border-slate-100 px-4 py-3 min-h-[56px] cursor-pointer">
          <span>
            <span className="block text-base font-bold text-slate-800">Registered for VAT</span>
            <span className="block text-xs text-slate-500 leading-snug">
              {form.vat_registered !== false
                ? "15% VAT is added to quotes and invoices."
                : "No VAT is added. Documents show one total and say you're not VAT registered."}
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.vat_registered !== false}
            onChange={e => set("vat_registered")(e.target.checked)}
            aria-label="Registered for VAT"
            className="h-6 w-6 shrink-0"
          />
        </label>
        {form.vat_registered !== false && (
          <Field label="VAT no." value={form.vat_no} onChange={set("vat_no")} placeholder="4123456789" maxLength={20} />
        )}
        <Field label="Address" value={form.address} onChange={set("address")} multiline maxLength={400} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" value={form.phone} onChange={set("phone")} type="tel" maxLength={40} />
          <Field label="Email" value={form.email} onChange={set("email")} type="email" maxLength={120} />
        </div>
        <Field label="Website" value={form.website} onChange={set("website")} maxLength={120} />
        <Field
          label="What you offer (one line)"
          value={form.offering}
          onChange={set("offering")}
          placeholder="e.g. jacks, tyre handlers and industrial equipment"
          maxLength={200}
        />
        <p className="text-xs text-slate-500 -mt-1">Used in sales emails and WhatsApp messages: "our …".</p>
        <Field
          label="Finance email (expense claims)"
          value={form.finance_email}
          onChange={set("finance_email")}
          type="email"
          placeholder="accounts@yourcompany.co.za"
          maxLength={120}
        />
      </Section>

      <Section title="Banking details" hint="Shown on pro formas and invoices so customers know where to pay.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank" value={form.bank_name} onChange={set("bank_name")} placeholder="e.g. FNB" maxLength={60} />
          <Field
            label="Account type"
            value={form.bank_account_type}
            onChange={set("bank_account_type")}
            placeholder="Cheque"
            maxLength={30}
          />
        </div>
        <Field label="Account name" value={form.bank_account_name} onChange={set("bank_account_name")} maxLength={120} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account number" value={form.bank_account_no} onChange={set("bank_account_no")} maxLength={30} />
          <Field label="Branch code" value={form.bank_branch_code} onChange={set("bank_branch_code")} maxLength={20} />
        </div>
        <Field label="SWIFT code (optional)" value={form.bank_swift} onChange={set("bank_swift")} maxLength={15} />
      </Section>

      <OnlinePayments teamId={teamId} />
      <XeroConnection teamId={teamId} isOwner />

      <Section title="Documents">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Quotes valid for (days)"
            value={String(form.quote_validity_days ?? "")}
            onChange={set("quote_validity_days")}
            type="number"
          />
          <Field
            label="Payment terms (days)"
            value={String(form.payment_terms_days ?? "")}
            onChange={set("payment_terms_days")}
            type="number"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Labour rate per hour (R, excl. VAT)"
            value={String(form.labour_rate || "")}
            onChange={set("labour_rate")}
            type="number"
          />
          <Field
            label="Labour cost per hour (R)"
            value={String(form.labour_cost || "")}
            onChange={set("labour_cost")}
            type="number"
          />
        </div>
        <p className="text-xs text-slate-500 -mt-1">
          The rate is charged for timesheet hours on jobs invoiced without a quote. The cost is what an hour of a
          technician's time costs you, for job profit.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice prefix" value={form.invoice_prefix} onChange={set("invoice_prefix")} maxLength={12} />
          <Field
            label="Next invoice no."
            value={String(form.next_invoice_number ?? "")}
            onChange={set("next_invoice_number")}
            type="number"
          />
        </div>
        <p className="text-xs text-slate-500 leading-snug">
          Next invoice: <b>{`${form.invoice_prefix || ""}${String(form.next_invoice_number || 1).padStart(5, "0")}`}</b>.
          Numbers are handed out in order as invoices sync, so they never repeat. Only change the next number when
          carrying on from another system.
        </p>
      </Section>

      <Section title="Security">
        <label className="flex items-center gap-3 min-h-[52px] cursor-pointer">
          <span className="flex-1">
            <span className="block text-sm font-bold text-slate-800">Require two-step login for owners and admins</span>
            <span className="block text-xs text-slate-500">They'll be asked to set up an authenticator app before they can continue.</span>
          </span>
          <input
            type="checkbox"
            checked={!!form.require_admin_mfa}
            onChange={e => set("require_admin_mfa")(e.target.checked)}
            aria-label="Require two-step login for owners and admins"
            className="h-6 w-6 shrink-0"
          />
        </label>
      </Section>

      <Section title="Reminders" hint="Sent once a day, so nothing slips through.">
        {[
          ["auto_reminders", "Remind my team", "Overdue invoices, quotes with no answer after 3 days, services coming up and low stock."],
          ["email_customer_reminders", "Email customers about overdue invoices", "A polite reminder with their account link at 1, 7, 14 and 30 days overdue. Needs the customer's email on the client."],
        ].map(([k, label, hint]) => (
          <label key={k} className="flex items-center gap-3 min-h-[52px] cursor-pointer">
            <span className="flex-1">
              <span className="block text-sm font-bold text-slate-800">{label}</span>
              <span className="block text-xs text-slate-500">{hint}</span>
            </span>
            <input
              type="checkbox"
              checked={k === "auto_reminders" ? form[k] !== false : !!form[k]}
              onChange={e => set(k)(e.target.checked)}
              aria-label={label}
              className="h-6 w-6 shrink-0"
            />
          </label>
        ))}
      </Section>

      <Section title="Modules" hint="Switch off what your company doesn't use. It disappears for everyone in your company.">
        {offeredModules(profile.disabled_modules).map(m => {
          const on = !(form.disabled_modules || []).includes(m.key);
          return (
            <label key={m.key} className="flex items-center gap-3 min-h-[52px] cursor-pointer">
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-800">{m.label}</span>
                <span className="block text-xs text-slate-500">{m.hint}</span>
              </span>
              <input
                type="checkbox"
                checked={on}
                aria-label={m.label}
                onChange={e =>
                  set("disabled_modules")(
                    e.target.checked
                      ? (form.disabled_modules || []).filter(k => k !== m.key)
                      : [...(form.disabled_modules || []), m.key],
                  )
                }
                className="h-6 w-6 shrink-0"
              />
            </label>
          );
        })}
      </Section>

      <Section title="Terms and conditions" hint="Printed at the end of each document. Leave blank to leave them out.">
        <Field label="Quote terms" value={form.quote_terms} onChange={set("quote_terms")} multiline maxLength={6000} />
        <Field
          label="Invoice terms"
          value={form.invoice_terms}
          onChange={set("invoice_terms")}
          multiline
          maxLength={6000}
        />
      </Section>

      <Section title="Your company's data" hint="Download everything your company has stored, or ask us to delete it (POPIA).">
        <Btn variant="secondary" onClick={downloadAll} disabled={!online}>
          Download all company data
        </Btn>
        {deletionAsked ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 stack-y-2">
            <p>Deletion requested on {new Date(deletionAsked).toLocaleDateString("en-ZA")}. We'll delete your data after the notice period.</p>
            <Btn size="sm" variant="ghost" onClick={() => askDeletion(true)}>
              Cancel the request
            </Btn>
          </div>
        ) : (
          <Btn variant="ghost" onClick={() => askDeletion(false)} disabled={!online}>
            Ask us to delete your company's data
          </Btn>
        )}
      </Section>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Btn variant="secondary" onClick={preview}>
          <FileText size={15} />
          Sample PDF
        </Btn>
        <Btn onClick={save} disabled={!dirty || saving || !online}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
