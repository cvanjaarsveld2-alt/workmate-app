// ─── Auth Screen ──────────────────────────────────────────────────────────────
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "../lib/brand";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabase";
import { BRAND } from "../lib/constants";
import { Card, Btn, Field } from "../components/ui";

import { TERMS_VERSION, legalHref } from "../legal/LegalPage";
import { pendingJoinCode, normaliseCode } from "../lib/joinCode";

export function AuthScreen() {
  const [mode, setMode]       = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState({ text: "", type: "error" });
  const [fullName, setFullName] = useState("");
  const [code, setCode]       = useState(() => pendingJoinCode());
  const [agreed, setAgreed]   = useState(false);

  function clearMsg() { setMsg({ text: "", type: "error" }); }

  async function login() {
    if (!email || !password) {
      setMsg({ text: "Please enter your email and password.", type: "error" });
      return;
    }
    setLoading(true);
    // Normalise the identifier only; never trim or alter the password.
    const emailLower = email.trim().toLowerCase();
    setEmail(emailLower);
    const { error } = await supabase.auth.signInWithPassword({ email: emailLower, password });
    if (error) {
      const code = String(error.code || "").toLowerCase();
      const message = String(error.message || "").toLowerCase();
      const text =
        code === "invalid_credentials" || message.includes("invalid login credentials")
          ? "Incorrect email or password. Please check the email address and password and try again."
          : code === "email_not_confirmed"
          ? "This account has not been confirmed yet. Please confirm the email address first."
          : code === "user_banned"
          ? `This account is currently disabled. Please contact your ${PRODUCT_NAME} administrator.`
          : code === "over_request_rate_limit"
          ? "Too many sign-in attempts. Please wait a moment and try again."
          : message.includes("network") || message.includes("fetch")
          ? "No internet connection. Please check your network and try again."
          : "Sign in failed. Please try again.";
      setMsg({ text, type: "error" });
    }
    setLoading(false);
  }

  async function signup() {
    const emailLower = email.trim().toLowerCase();
    if (!fullName.trim() || !emailLower || !password) {
      setMsg({ text: "Please enter your name, email and a password.", type: "error" });
      return;
    }
    if (password.length < 8) {
      setMsg({ text: "Password must be at least 8 characters.", type: "error" });
      return;
    }
    if (password !== confirmPw) {
      setMsg({ text: "Passwords do not match.", type: "error" });
      return;
    }
    if (!agreed) {
      setMsg({ text: "Please accept the terms and privacy policy.", type: "error" });
      return;
    }
    setLoading(true);
    const invite = normaliseCode(code);
    // Remembered so company setup can join the company after sign-in.
    try {
      if (invite) localStorage.setItem("pm_join_code", invite);
    } catch {}
    const { data, error } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim(), invite_code: invite, terms_version: TERMS_VERSION },
      },
    });
    if (error) {
      const m = (error.message || "").toLowerCase();
      const text = m.includes("already")
        ? "An account with this email already exists. Try signing in instead."
        : m.includes("invite code") || m.includes("sign-up code") || m.includes("database error saving new user")
          ? "Sign-up needs a valid invite code. Ask your company for their invite link, or contact us for a sign-up code."
          : error.message || "Sign up failed. Please try again.";
      setMsg({ text, type: "error" });
      setLoading(false);
      return;
    }
    if (data?.session) {
      setMsg({ text: "Welcome! Setting up your account…", type: "success" });
    } else {
      setMsg({ text: "Check your email to confirm your account, then sign in.", type: "success" });
      setMode("signin");
      setPassword("");
      setConfirmPw("");
    }
    setLoading(false);
  }

  // Invited users (created by an admin) start without a password they know, so
  // the reset email doubles as "set my password". The message is the same
  // whether or not the address exists, so it can't be used to probe accounts.
  async function sendReset() {
    const emailLower = email.trim().toLowerCase();
    if (!emailLower) {
      setMsg({ text: "Enter your email address first.", type: "error" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(emailLower, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error && /rate|too many/i.test(error.message || "")) {
      setMsg({ text: "Too many requests. Please wait a few minutes and try again.", type: "error" });
      return;
    }
    setMsg({ text: `If that email has a ${PRODUCT_NAME} account, a link to set your password is on its way. Open it on this device.`, type: "success" });
  }

  function switchMode(newMode) {
    setMode(newMode);
    clearMsg();
    setPassword("");
    setConfirmPw("");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/icon.svg" alt="" className="mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-black" style={{ color: BRAND.primary }}>{PRODUCT_NAME}</h1>
          <p className="mt-1 text-sm text-slate-400">{PRODUCT_TAGLINE}</p>
        </div>

        <Card className="p-6 stack-y-4">
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${mode === "signin" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}>
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${mode === "signup" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}>
              Sign Up
            </button>
          </div>

          {mode === "signup" && (
            <Field label="Your name" value={fullName} onChange={setFullName} placeholder="Name and surname" />
          )}
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@company.co.za" type="email" />

          {mode === "signin" && (
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-500">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && login()}
                placeholder="••••••••"
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pr-12 text-base outline-hidden focus:border-red-300 focus:bg-white transition-colors min-h-[52px]" />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          )}

          {msg.text && (
            <div className={`rounded-xl p-3.5 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {msg.text}
            </div>
          )}

          {mode === "signup" && (
            <>
              <Field label="Password (8+ characters)" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
              <Field label="Confirm password" value={confirmPw} onChange={setConfirmPw} type="password" placeholder="••••••••" />
              <Field
                label="Invite or sign-up code"
                value={code}
                onChange={v => setCode(v.toUpperCase())}
                placeholder="From your company's invite link"
              />
              <label className="flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0"
                  aria-label="I accept the terms and privacy policy"
                />
                <span>
                  I accept the{" "}
                  <a href={legalHref("terms")} target="_blank" rel="noreferrer" className="font-bold underline">
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href={legalHref("privacy")} target="_blank" rel="noreferrer" className="font-bold underline">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
              <Btn className="w-full" size="lg" onClick={signup} disabled={loading}>
                {loading ? "Please wait…" : "Create account"}
              </Btn>
              <button
                type="button"
                onClick={sendReset}
                disabled={loading}
                className="w-full text-center text-xs font-bold text-slate-500 min-h-[44px]"
              >
                Already added by your company? Email me a link to set my password
              </button>
            </>
          )}

          {mode === "signin" && (
            <Btn className="w-full" size="lg" onClick={login} disabled={loading}>
              {loading ? "Please wait…" : "Sign In"}
            </Btn>
          )}

          {mode === "signin" && (
            <button type="button" onClick={sendReset} disabled={loading}
              className="w-full text-center text-sm font-bold text-slate-500 min-h-[44px]">
              Forgot password?
            </button>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">© 2026 {PRODUCT_NAME}</p>
      </motion.div>
    </div>
  );
}

// Shown after the user opens a password-reset / invite link. Supabase has already
// signed them in from the link; this makes them choose a password before entering.
export function SetPasswordScreen({ onDone }) {
  const [password, setPassword]   = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState("");

  async function save() {
    if (password.length < 8) { setMsg("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setMsg("Passwords do not match."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg(/weak|pwned|leaked/i.test(error.message || "")
        ? "That password is too weak or has appeared in a data breach. Please choose another."
        : error.message || "Could not save your password. Please try again.");
      return;
    }
    onDone();
  }

  const inputCls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pr-12 text-base outline-hidden focus:border-red-300 focus:bg-white transition-colors min-h-[52px]";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: BRAND.light }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/icon.svg" alt="" className="mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-black" style={{ color: BRAND.primary }}>Set your password</h1>
          <p className="mt-1 text-sm text-slate-400">Choose a password for signing in to {PRODUCT_NAME}</p>
        </div>
        <Card className="p-6 stack-y-4">
          <div className="relative">
            <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)" autoComplete="new-password" className={inputCls} />
            <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <input type={showPw ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()} placeholder="Confirm new password" autoComplete="new-password" className={inputCls} />
          {msg && <div className="rounded-xl p-3.5 text-sm font-medium bg-red-50 text-red-700">{msg}</div>}
          <Btn className="w-full" size="lg" onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save password"}
          </Btn>
        </Card>
      </div>
    </div>
  );
}
