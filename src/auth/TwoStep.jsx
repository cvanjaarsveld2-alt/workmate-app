// ─── Two-step login (authenticator app, TOTP) ────────────────────────────────
// - TwoStepChallenge: after the password, asks for the 6-digit code when the
//   person has two-step login on.
// - TwoStepEnrol: set it up (QR code + code check). Used in Settings and when
//   a company requires it for its owners/admins.
// - TwoStepSettings: the Settings card (turn on / off).
// The database enforces it too: once set up, admin actions need a session that
// passed the code step (supabase/migrations/*_two_step_login.sql).
import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, LogOut } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, Field } from "../components/ui";
import { BRAND } from "../lib/constants";
import { PRODUCT_NAME } from "../lib/brand";

// { current: "aal1"|"aal2", next: "aal1"|"aal2" } — next "aal2" means a factor
// is set up. Works from the saved session, so it's fine offline.
export async function assuranceLevel() {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { current: data?.currentLevel || "aal1", next: data?.nextLevel || "aal1" };
  } catch {
    return { current: "aal1", next: "aal1" };
  }
}

async function verifiedFactor() {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp || []).find(f => f.status === "verified") || null;
}

const cleanCode = v => String(v || "").replace(/\D/g, "").slice(0, 6);

function CodeField({ value, onChange, onEnter }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-500">6-digit code</label>
      <input
        value={value}
        onChange={e => onChange(cleanCode(e.target.value))}
        onKeyDown={e => e.key === "Enter" && onEnter?.()}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        aria-label="6-digit code"
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-2xl tracking-[0.4em] text-center font-black min-h-[56px]"
      />
    </div>
  );
}

export function TwoStepChallenge({ onDone, onSignOut }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const factor = await verifiedFactor();
      if (!factor) return onDone();
      const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (e) throw e;
      onDone();
    } catch {
      setError("That code didn't work. Check the time on your phone and try the newest code.");
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BRAND.light }}>
      <Card className="w-full max-w-sm p-6 stack-y-4">
        <ShieldCheck size={32} style={{ color: BRAND.primary }} />
        <div>
          <p className="text-xl font-black text-slate-900">Two-step login</p>
          <p className="text-sm text-slate-500">Enter the code from your authenticator app for {PRODUCT_NAME}.</p>
        </div>
        <CodeField value={code} onChange={setCode} onEnter={verify} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Btn className="w-full" onClick={verify} disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Continue"}
        </Btn>
        <button type="button" onClick={onSignOut} className="w-full text-sm font-bold text-slate-500 min-h-[44px] flex items-center justify-center gap-2">
          <LogOut size={14} /> Sign out
        </button>
      </Card>
    </div>
  );
}

export function TwoStepEnrol({ onDone, onCancel, required = false }) {
  const [factor, setFactor] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Clear half-finished set-ups so a new QR code can be issued.
        const { data: list } = await supabase.auth.mfa.listFactors();
        for (const f of list?.all || []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
        const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `${PRODUCT_NAME} ${Date.now()}` });
        if (e) throw e;
        if (live) setFactor({ id: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret });
      } catch (err) {
        if (live) setError(err?.message || "Couldn't start two-step login set-up. Check your connection.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function verify() {
    if (!factor || code.length !== 6) return;
    setBusy(true);
    setError("");
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (e) {
      setError("That code didn't work. Try the newest code in your app.");
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <div className="stack-y-3">
      <p className="text-sm text-slate-600">
        {required ? "Your company requires two-step login for owners and admins. " : ""}
        Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator or similar), then enter the 6-digit code it shows.
      </p>
      <div className="flex justify-center rounded-xl bg-white border border-slate-200 p-3 min-h-[180px] items-center">
        {factor?.qr ? <img src={factor.qr} alt="QR code for your authenticator app" className="h-44 w-44" /> : <p className="text-sm text-slate-400">{error ? "" : "Preparing…"}</p>}
      </div>
      {factor?.secret && (
        <p className="text-xs text-slate-500 text-center break-all">
          Can't scan? Enter this key: <span className="font-mono font-bold text-slate-700">{factor.secret}</span>
        </p>
      )}
      <CodeField value={code} onChange={setCode} onEnter={verify} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {onCancel ? (
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>
            {required ? "Sign out" : "Cancel"}
          </Btn>
        ) : (
          <span />
        )}
        <Btn onClick={verify} disabled={busy || !factor || code.length !== 6}>
          {busy ? "Checking…" : "Turn on"}
        </Btn>
      </div>
    </div>
  );
}

export function TwoStepRequired({ onDone, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: BRAND.light }}>
      <Card className="w-full max-w-sm p-6 stack-y-3">
        <ShieldCheck size={32} style={{ color: BRAND.primary }} />
        <p className="text-xl font-black text-slate-900">Set up two-step login</p>
        <TwoStepEnrol required onDone={onDone} onCancel={onSignOut} />
      </Card>
    </div>
  );
}

export function TwoStepSettings() {
  const [level, setLevel] = useState(null);
  const [mode, setMode] = useState("view"); // view | enrol | disable
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => assuranceLevel().then(setLevel);
  useEffect(() => {
    refresh();
  }, []);
  const on = level?.next === "aal2";

  async function turnOff() {
    setMsg("");
    try {
      const factor = await verifiedFactor();
      if (!factor) return refresh();
      if (level.current !== "aal2") {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) return setMsg("That code didn't work.");
      }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) return setMsg(error.message);
      setMode("view");
      setCode("");
      setMsg("Two-step login is off.");
      refresh();
    } catch (e) {
      setMsg(e?.message || "Couldn't turn it off.");
    }
  }

  if (!level) return null;
  return (
    <Card className="p-4 stack-y-3">
      <div className="flex items-center gap-3">
        {on ? <ShieldCheck size={18} className="text-green-600" /> : <ShieldOff size={18} className="text-slate-400" />}
        <div className="flex-1">
          <p className="text-base font-bold text-slate-800">Two-step login</p>
          <p className="text-xs text-slate-500">{on ? "On — a code from your authenticator app is needed to sign in" : "Off — protect your account with a code from your phone"}</p>
        </div>
      </div>
      {mode === "view" && (
        <Btn size="sm" variant={on ? "ghost" : "secondary"} onClick={() => setMode(on ? "disable" : "enrol")}>
          {on ? "Turn off" : "Turn on"}
        </Btn>
      )}
      {mode === "enrol" && (
        <TwoStepEnrol
          onDone={() => {
            setMode("view");
            setMsg("Two-step login is on.");
            refresh();
          }}
          onCancel={() => setMode("view")}
        />
      )}
      {mode === "disable" && (
        <div className="stack-y-2">
          {level.current !== "aal2" && <Field label="Code from your app" value={code} onChange={v => setCode(cleanCode(v))} placeholder="123456" />}
          <div className="grid grid-cols-2 gap-2">
            <Btn size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Btn>
            <Btn size="sm" variant="danger" onClick={turnOff}>
              Turn off
            </Btn>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </Card>
  );
}
