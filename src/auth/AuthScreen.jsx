// ─── Auth Screen ──────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabase";
import { BRAND } from "../lib/constants";
import { Card, Btn, Field } from "../components/ui";
import { Wordmark } from "../components/Wordmark";

const ALLOWED_DOMAIN = "pwrstart.com";

export function AuthScreen() {
  const [mode, setMode]       = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState({ text: "", type: "error" });

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
          ? "This account is currently disabled. Please contact your PowerMate administrator."
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
    if (!email || !password) {
      setMsg({ text: "Please enter your email and password.", type: "error" });
      return;
    }
    // Domain check (client-side, friendly error)
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.endsWith("@" + ALLOWED_DOMAIN)) {
      setMsg({ text: `Sign up is only available for @${ALLOWED_DOMAIN} email addresses.`, type: "error" });
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
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: emailLower, password });
    if (error) {
      const text = error.message?.toLowerCase().includes("already")
        ? "An account with this email already exists. Try signing in instead."
        : error.message?.toLowerCase().includes("domain") || error.message?.toLowerCase().includes("not allowed")
        ? `Sign up is only available for @${ALLOWED_DOMAIN} email addresses.`
        : error.message || "Sign up failed. Please try again.";
      setMsg({ text, type: "error" });
      setLoading(false);
      return;
    }
    // Some Supabase projects require email confirmation; data.user will exist but session may be null
    if (data?.session) {
      // Logged in immediately
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
    setMsg({ text: "If that email has a PowerMate account, a link to set your password is on its way. Open it on this device.", type: "success" });
  }

  function switchMode(newMode) {
    setMode(newMode);
    clearMsg();
    setPassword("");
    setConfirmPw("");
  }

  return (
    <div className="pm-graphite flex min-h-screen flex-col items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Wordmark variant="graphite" size="lg" />
          <div className="mt-5 h-0.5 w-12" style={{ background: "var(--pm-hivis)" }} />
          <h1 className="mt-4 font-display text-3xl font-extrabold uppercase tracking-wider text-white">PowerMate</h1>
          <p className="mt-1 font-display text-sm font-bold uppercase tracking-wider text-white/70">Field Service · Sales · Reporting</p>
        </div>

        <Card className="p-6 space-y-4">
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${mode === "signin" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${mode === "signup" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
              Sign Up
            </button>
          </div>

          <Field label="Email" value={email} onChange={setEmail} placeholder={`you@${ALLOWED_DOMAIN}`} type="email" />

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
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pr-12 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[52px]" />
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
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-center">
              <p className="text-sm font-bold text-slate-700 mb-1">Accounts are invite-only</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                New accounts are created by your administrator. Already invited? Enter your email above and set your password.
              </p>
            </div>
          )}

          {mode === "signup" && (
            <Btn className="w-full" size="lg" onClick={sendReset} disabled={loading}>
              {loading ? "Please wait…" : "Email me a link to set my password"}
            </Btn>
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

        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Power Works (Pty) Ltd</p>
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

  const inputCls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 pr-12 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[52px]";
  return (
    <div className="pm-graphite flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Wordmark variant="graphite" size="lg" />
          <h1 className="mt-6 font-display text-3xl font-extrabold uppercase tracking-wider text-white">Set your password</h1>
          <p className="mt-1 text-sm text-white/70">Choose a password for signing in to PowerMate</p>
        </div>
        <Card className="p-6 space-y-4">
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
