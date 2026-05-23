// ─── Auth Screen ──────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabase";
import { BRAND } from "../lib/constants";
import { Card, Btn, Field } from "../components/ui";

export function AuthScreen() {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState({ text: "", type: "error" });

  async function login() {
    if (!email || !password) {
      setMsg({ text: "Please enter your email and password.", type: "error" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const text =
        error.message?.includes("Invalid login") || error.message?.includes("invalid")
          ? "Incorrect email or password. Please try again."
          : error.message?.includes("network") || error.message?.includes("fetch")
          ? "No internet connection. Please check your network and try again."
          : "Sign in failed. Please try again.";
      setMsg({ text, type: "error" });
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src={BRAND.logo} alt="PW" className="mb-4 h-16 object-contain" onError={e => e.target.style.display = "none"} />
          <h1 className="text-2xl font-black" style={{ color: BRAND.primary }}>PowerMate</h1>
          <p className="mt-1 text-sm text-slate-400">Power Works Field Service CRM</p>
        </div>
        <Card className="p-6 space-y-4">
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@powerworks.com" type="email" />
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
          {msg.text && (
            <div className={`rounded-xl p-3.5 text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {msg.text}
            </div>
          )}
          <Btn className="w-full" size="lg" onClick={login} disabled={loading}>
            {loading ? "Please wait…" : "Sign In"}
          </Btn>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Power Works (Pty) Ltd</p>
      </motion.div>
    </div>
  );
}
