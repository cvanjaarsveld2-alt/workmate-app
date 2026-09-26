// ─── Company setup (first sign-in) ────────────────────────────────────────────
// Shown to someone signed in who isn't in a company yet. An invite link joins
// them straight away; otherwise they set up a new company (becoming its master
// account) and walk through the details every document uses, or join an
// existing company with its invite code. Every step after creating the
// company can be skipped and changed later in Settings → Company Details.
import React, { useEffect, useRef, useState } from "react";
import { Building2, Users, Upload, Share2, Check, ArrowRight } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, Field } from "../components/ui";
import { BRAND } from "../lib/constants";
import { PRODUCT_NAME } from "../lib/brand";
import { DEFAULT_PROFILE, compressLogo, loadCompanyProfile, saveCompanyProfile } from "../lib/companyProfile";
import { clearJoinCode, normaliseCode, pendingJoinCode } from "../lib/joinCode";
import { TERMS_VERSION, legalHref } from "../legal/LegalPage";

const STEPS = ["Company", "Logo", "Contact", "Banking", "Documents", "Team"];

async function joinWithCode(code, userId) {
  const { data, error } = await supabase.rpc("join_team_by_code", { p_invite_code: code, p_user_id: userId });
  if (error) {
    const m = error.message || "";
    throw new Error(
      m.includes("Invalid") ? "That invite code isn't valid. Check it with your company." : m.includes("Already") ? "You're already in this company." : m,
    );
  }
  const team = typeof data === "string" ? JSON.parse(data) : data;
  await supabase.rpc("migrate_user_data_to_team", { p_user_id: userId, p_team_id: team.id }).then(
    () => {},
    () => {},
  );
  return team;
}

export function CompanySetup({ userId, onDone, onSignOut }) {
  const [mode, setMode] = useState("choose"); // choose | join | create | wizard
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [termsOnFile, setTermsOnFile] = useState(true);
  const [teamId, setTeamId] = useState(null);
  const [inviteCode, setInviteCode] = useState("");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...DEFAULT_PROFILE });
  const fileRef = useRef(null);
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  // An invite link joins straight away.
  useEffect(() => {
    const pending = pendingJoinCode();
    supabase
      .from("users")
      .select("terms_accepted_at")
      .eq("id", userId)
      .maybeSingle()
      .then(
        ({ data }) => setTermsOnFile(!!data?.terms_accepted_at),
        () => {},
      );
    if (!pending) return;
    setBusy(true);
    joinWithCode(pending, userId).then(
      () => {
        clearJoinCode();
        onDone();
      },
      err => {
        // A sign-up code (for a new company) isn't a company invite: carry on.
        clearJoinCode();
        if (!/isn't valid/.test(err.message)) setError(err.message);
        setBusy(false);
      },
    );
  }, [userId]);

  async function join() {
    setBusy(true);
    setError("");
    try {
      await joinWithCode(normaliseCode(code), userId);
      if (!termsOnFile) await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function create() {
    if (!name.trim()) return setError("Enter your company's name.");
    if (!termsOnFile && !agreed) return setError("Please accept the terms and privacy policy.");
    setBusy(true);
    setError("");
    const { data, error: e } = await supabase.rpc("create_team_for_user", { p_name: name.trim(), p_user_id: userId });
    if (e) {
      setBusy(false);
      return setError(e.message || "Couldn't create the company.");
    }
    const team = typeof data === "string" ? JSON.parse(data) : data;
    if (!termsOnFile) await supabase.rpc("accept_terms", { p_version: TERMS_VERSION }).then(() => {}, () => {});
    setTeamId(team.id);
    setInviteCode(team.invite_code || "");
    const profile = await loadCompanyProfile(team.id);
    // New companies start without the mining-specific Jack Selector.
    setForm({ ...profile, trading_name: profile.trading_name || name.trim(), disabled_modules: ["jack_selector"] });
    setMode("wizard");
    setBusy(false);
  }

  async function saveAndNext() {
    setBusy(true);
    setError("");
    if (step < STEPS.length - 1) {
      const r = await saveCompanyProfile(teamId, form);
      if (!r.ok) {
        setBusy(false);
        return setError(r.error);
      }
    }
    setBusy(false);
    if (step >= STEPS.length - 1) return onDone();
    setStep(s => s + 1);
  }

  async function onLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      set("logo_data")((await compressLogo(file)).dataUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  const link = inviteCode ? `${window.location.origin}/?join=${inviteCode}` : "";
  async function shareInvite() {
    const text = `Join ${form.trading_name || name} on ${PRODUCT_NAME}: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: `Join ${form.trading_name || name}`, text });
      else await navigator.clipboard.writeText(text);
    } catch {}
  }

  const shell = children => (
    <div className="min-h-screen px-4 py-8" style={{ background: BRAND.light }}>
      <div className="mx-auto max-w-md stack-y-4">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto h-12 w-12 rounded-2xl" />
          <p className="mt-2 text-sm font-bold text-slate-500">{PRODUCT_NAME}</p>
        </div>
        {children}
        {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        <button type="button" onClick={onSignOut} className="w-full text-center text-xs font-bold text-slate-400 min-h-[44px]">
          Sign out
        </button>
      </div>
    </div>
  );

  const terms = !termsOnFile && (
    <label className="flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
      <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5" />
      <span>
        I accept the <a href={legalHref("terms")} target="_blank" rel="noreferrer" className="font-bold underline">Terms</a>,{" "}
        <a href={legalHref("privacy")} target="_blank" rel="noreferrer" className="font-bold underline">Privacy Policy</a> and{" "}
        <a href={legalHref("dpa")} target="_blank" rel="noreferrer" className="font-bold underline">Data Processing Agreement</a> for my company.
      </span>
    </label>
  );

  if (mode === "choose")
    return shell(
      <>
        <h1 className="text-2xl font-black text-slate-900 text-center">Welcome</h1>
        <p className="text-sm text-slate-500 text-center">Is your company already using {PRODUCT_NAME}?</p>
        <Card className="p-0 overflow-hidden">
          <button type="button" onClick={() => setMode("create")} disabled={busy} className="w-full flex items-center gap-3 p-4 text-left min-h-[72px]">
            <Building2 size={22} style={{ color: BRAND.primary }} />
            <span className="flex-1">
              <span className="block font-black text-slate-900">Set up my company</span>
              <span className="block text-xs text-slate-500">You'll be the master account and can invite your team</span>
            </span>
            <ArrowRight size={16} className="text-slate-300" />
          </button>
        </Card>
        <Card className="p-0 overflow-hidden">
          <button type="button" onClick={() => setMode("join")} disabled={busy} className="w-full flex items-center gap-3 p-4 text-left min-h-[72px]">
            <Users size={22} style={{ color: BRAND.primary }} />
            <span className="flex-1">
              <span className="block font-black text-slate-900">Join my company</span>
              <span className="block text-xs text-slate-500">Use the invite code or link your company sent you</span>
            </span>
            <ArrowRight size={16} className="text-slate-300" />
          </button>
        </Card>
        {busy && <p className="text-center text-sm text-slate-500">Joining your company…</p>}
      </>,
    );

  if (mode === "join")
    return shell(
      <Card className="p-5 stack-y-3">
        <p className="text-lg font-black text-slate-900">Join my company</p>
        <Field label="Invite code" value={code} onChange={v => setCode(v.toUpperCase())} placeholder="12-character code" />
        <Btn className="w-full" onClick={join} disabled={busy || !code.trim()}>
          {busy ? "Joining…" : "Join"}
        </Btn>
        <button type="button" onClick={() => setMode("choose")} className="w-full text-sm font-bold text-slate-500 min-h-[44px]">
          Back
        </button>
      </Card>,
    );

  if (mode === "create")
    return shell(
      <Card className="p-5 stack-y-3">
        <p className="text-lg font-black text-slate-900">Set up my company</p>
        <Field label="Company name" value={name} onChange={setName} placeholder="e.g. Acme Hydraulics (Pty) Ltd" maxLength={100} />
        {terms}
        <Btn className="w-full" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create company"}
        </Btn>
        <button type="button" onClick={() => setMode("choose")} className="w-full text-sm font-bold text-slate-500 min-h-[44px]">
          Back
        </button>
      </Card>,
    );

  // ── Wizard ──
  const body = [
    <>
      <Field label="Trading name" value={form.trading_name} onChange={set("trading_name")} maxLength={120} />
      <Field label="Registered name" value={form.legal_name} onChange={set("legal_name")} placeholder="e.g. Acme Hydraulics (Pty) Ltd" maxLength={160} />
      <Field label="Registration no." value={form.registration_no} onChange={set("registration_no")} maxLength={40} />
      <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 min-h-[52px]">
        <span className="font-bold text-slate-700">Registered for VAT</span>
        <input type="checkbox" checked={form.vat_registered !== false} onChange={e => set("vat_registered")(e.target.checked)} className="h-6 w-6" aria-label="Registered for VAT" />
      </label>
      {form.vat_registered !== false && <Field label="VAT no." value={form.vat_no} onChange={set("vat_no")} maxLength={20} />}
    </>,
    <>
      <div className="h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-white overflow-hidden">
        {form.logo_data ? <img src={form.logo_data} alt="Logo" className="max-h-20 max-w-full object-contain" /> : <Building2 size={28} className="text-slate-300" />}
      </div>
      <Btn variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> {form.logo_data ? "Change logo" : "Upload logo"}
      </Btn>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} aria-label="Upload logo" />
      <label className="flex items-center gap-3">
        <input type="color" value={form.brand_color || "#8B1A1A"} onChange={e => set("brand_color")(e.target.value)} className="h-12 w-16 rounded-lg border border-slate-200" aria-label="Brand colour" />
        <span className="text-sm text-slate-500">Brand colour for your documents</span>
      </label>
    </>,
    <>
      <Field label="Address" value={form.address} onChange={set("address")} multiline maxLength={400} />
      <Field label="Phone" value={form.phone} onChange={set("phone")} type="tel" maxLength={40} />
      <Field label="Email" value={form.email} onChange={set("email")} type="email" maxLength={120} />
      <Field label="Website" value={form.website} onChange={set("website")} maxLength={120} />
      <Field label="What you offer (one line)" value={form.offering} onChange={set("offering")} placeholder="e.g. hydraulic repairs and equipment hire" maxLength={200} />
      <Field label="Finance email (expense claims)" value={form.finance_email} onChange={set("finance_email")} type="email" maxLength={120} />
    </>,
    <>
      <Field label="Bank" value={form.bank_name} onChange={set("bank_name")} maxLength={60} />
      <Field label="Account name" value={form.bank_account_name} onChange={set("bank_account_name")} maxLength={120} />
      <Field label="Account number" value={form.bank_account_no} onChange={set("bank_account_no")} maxLength={30} />
      <Field label="Branch code" value={form.bank_branch_code} onChange={set("bank_branch_code")} maxLength={20} />
      <Field label="Account type" value={form.bank_account_type} onChange={set("bank_account_type")} placeholder="Cheque" maxLength={30} />
    </>,
    <>
      <Field label="Quotes valid for (days)" value={String(form.quote_validity_days ?? "")} onChange={set("quote_validity_days")} type="number" />
      <Field label="Payment terms (days)" value={String(form.payment_terms_days ?? "")} onChange={set("payment_terms_days")} type="number" />
      <Field label="Invoice prefix" value={form.invoice_prefix} onChange={set("invoice_prefix")} maxLength={12} />
      <Field label="Next invoice no." value={String(form.next_invoice_number ?? "")} onChange={set("next_invoice_number")} type="number" />
      <Field label="Quote terms" value={form.quote_terms} onChange={set("quote_terms")} multiline maxLength={6000} />
      <Field label="Invoice terms" value={form.invoice_terms} onChange={set("invoice_terms")} multiline maxLength={6000} />
    </>,
    <>
      <p className="text-sm text-slate-600">Send this link to your team. They sign up with it and join your company automatically.</p>
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm break-all font-mono">{link}</div>
      <Btn variant="secondary" className="w-full" onClick={shareInvite}>
        <Share2 size={15} /> Share invite link
      </Btn>
      <p className="text-xs text-slate-500">You can find it again in Settings → Team.</p>
    </>,
  ][step];

  return shell(
    <Card className="p-5 stack-y-3">
      <div className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <div key={s} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? BRAND.primary : "#E2E8F0" }} />
        ))}
      </div>
      <p className="text-xs font-bold text-slate-500">
        Step {step + 1} of {STEPS.length}
      </p>
      <p className="text-lg font-black text-slate-900">{STEPS[step]}</p>
      {body}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Btn variant="ghost" onClick={() => (step >= STEPS.length - 1 ? onDone() : setStep(s => s + 1))} disabled={busy}>
          Skip
        </Btn>
        <Btn onClick={saveAndNext} disabled={busy}>
          {step >= STEPS.length - 1 ? (
            <>
              <Check size={15} /> Finish
            </>
          ) : busy ? (
            "Saving…"
          ) : (
            "Save & continue"
          )}
        </Btn>
      </div>
    </Card>,
  );
}
