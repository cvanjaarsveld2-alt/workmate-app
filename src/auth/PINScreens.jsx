// ─── PIN Screens ──────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { BRAND } from "../lib/constants";
import {
  hashPIN,
  getPINHash,
  setSessionUnlocked,
  incrementPINAttempts,
  resetPINAttempts,
  getLockoutRemaining,
  setLockout,
  PIN_MAX_ATTEMPTS,
  PIN_LOCKOUT_MS,
} from "../lib/pinHelpers";
import { logEvent } from "../lib/helpers";
import { PIN_KEY } from "../lib/constants";

// ─── PINKeypad ────────────────────────────────────────────────────────────────
export function PINKeypad({ pin, onDigit, onBack }) {
  return (
    <>
      <div className="flex justify-center gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}
            className={`w-4 h-4 rounded-full transition-all ${i < pin.length ? "scale-125" : ""}`}
            style={{ background: i < pin.length ? BRAND.primary : "#E2E8F0" }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((d, i) => (
          <button key={i}
            onClick={() => { if (d === "⌫") onBack(); else if (d !== "") onDigit(String(d)); }}
            className={`h-[60px] rounded-2xl text-xl font-black transition-all active:scale-95 ${d === "" ? "invisible" : "bg-white shadow-sm border border-slate-100 text-slate-800 hover:border-red-200"}`}>
            {d}
          </button>
        ))}
      </div>
    </>
  );
}

// ─── PINSetupScreen ───────────────────────────────────────────────────────────
export function PINSetupScreen({ onComplete }) {
  const [pin, setPIN]     = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep]   = useState("set");
  const [error, setError] = useState("");

  function handleDigit(d) {
    if (step === "set") {
      const next = (pin + d).slice(0, 6);
      setPIN(next);
      if (next.length === 6) { setStep("confirm"); setError(""); }
    } else {
      const next = (confirm + d).slice(0, 6);
      setConfirm(next);
      if (next.length === 6) {
        if (next === pin) savePIN(pin);
        else { setError("PINs don't match. Try again."); setConfirm(""); setPIN(""); setStep("set"); }
      }
    }
  }

  async function savePIN(p) {
    localStorage.setItem(PIN_KEY, await hashPIN(p));
    setSessionUnlocked();
    onComplete();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: BRAND.primary }}>
            <Shield size={28} color="white" />
          </div>
          <h1 className="text-xl font-black text-slate-900">{step === "set" ? "Set Your PIN" : "Confirm PIN"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === "set" ? "Choose a 6-digit PIN to secure the app" : "Re-enter your PIN to confirm"}
          </p>
        </div>
        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
        <PINKeypad
          pin={step === "set" ? pin : confirm}
          onDigit={handleDigit}
          onBack={() => { if (step === "set") setPIN(p => p.slice(0, -1)); else setConfirm(c => c.slice(0, -1)); }}
        />
      </motion.div>
    </div>
  );
}

// ─── PINLockScreen ────────────────────────────────────────────────────────────
export function PINLockScreen({ onUnlock, onForgot }) {
  const [pin, setPIN]         = useState("");
  const [error, setError]     = useState("");
  const [shake, setShake]     = useState(false);
  const [lockoutMs, setLockoutMs] = useState(getLockoutRemaining());

  useEffect(() => {
    if (lockoutMs <= 0) return;
    const t = setInterval(() => {
      const r = getLockoutRemaining();
      setLockoutMs(r);
      if (r <= 0) { setError(""); resetPINAttempts(); }
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutMs]);

  async function handleDigit(d) {
    if (lockoutMs > 0) return;
    const next = (pin + d).slice(0, 6);
    setPIN(next);
    if (next.length === 6) {
      if (await hashPIN(next) === getPINHash()) {
        resetPINAttempts();
        setSessionUnlocked();
        onUnlock();
      } else {
        const attempts = incrementPINAttempts();
        if (attempts >= PIN_MAX_ATTEMPTS) {
          setLockout();
          setLockoutMs(PIN_LOCKOUT_MS);
          setError("Too many attempts. Locked for 5 minutes.");
          logEvent("pin_locked_out", { attempts });
        } else {
          setError(`Incorrect PIN — ${PIN_MAX_ATTEMPTS - attempts} attempt${PIN_MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} left`);
        }
        setShake(true);
        setTimeout(() => { setShake(false); setPIN(""); }, 700);
      }
    }
  }

  const lockedOut = lockoutMs > 0;
  const minutes   = Math.ceil(lockoutMs / 60000);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: BRAND.light }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <img src={BRAND.logo} alt="PW" className="mx-auto mb-4 h-12 object-contain" onError={e => e.target.style.display = "none"} />
          <h1 className="text-xl font-black text-slate-900">{lockedOut ? "Locked Out" : "Enter PIN"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {lockedOut ? `Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}` : "Unlock PowerMate"}
          </p>
        </div>
        <motion.div animate={shake ? { x: [-8, 8, -8, 8, 0] } : {}} transition={{ duration: 0.4 }}>
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</div>}
          <PINKeypad
            pin={pin}
            onDigit={handleDigit}
            onBack={() => !lockedOut && setPIN(p => p.slice(0, -1))}
          />
        </motion.div>
        <button onClick={onForgot} className="mt-6 w-full text-center text-sm font-bold text-slate-400 hover:text-red-600 transition-colors py-3">
          Forgot PIN? Sign in again
        </button>
      </motion.div>
    </div>
  );
}
