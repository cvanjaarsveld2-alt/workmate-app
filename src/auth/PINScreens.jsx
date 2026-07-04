// ─── PIN Screens ─────────────────────────────────────────────────────────────
// PINSetupScreen: first-time 6-digit PIN creation
// PINLockScreen:  lock screen shown on every app open
//
// Design matches the PowerMate app: light #F7F3F3 background, deep red brand
// colour, white card panel, PowerWorks logo, rounded rectangle keys — NOT a
// dark phone lock-screen style. This feels like it belongs to the same app.
//
// All PIN helpers are inlined — no dependency on pinHelpers.js.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete } from "lucide-react";

const PIN_LENGTH   = 6;
const MAX_ATTEMPTS = 6;
const STORAGE_KEY  = "pm_pin_hash";
const ATTEMPTS_KEY = "pm_pin_attempts";
const SESSION_KEY  = "pm_session_unlocked";

// ─── Inlined PIN helpers ──────────────────────────────────────────────────────
async function _hashPIN(pin) {
  const data = new TextEncoder().encode(pin + "powermate_salt_v1");
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function savePINHash(pin) {
  localStorage.setItem(STORAGE_KEY, await _hashPIN(pin));
}
async function verifyPIN(pin) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  return (await _hashPIN(pin)) === stored;
}
function getPINHash()          { return localStorage.getItem(STORAGE_KEY); }
function getPINAttempts()      { return parseInt(localStorage.getItem(ATTEMPTS_KEY) || "0", 10); }
function incrementPINAttempts(){ localStorage.setItem(ATTEMPTS_KEY, String(getPINAttempts() + 1)); }
function resetPINAttempts()    { localStorage.removeItem(ATTEMPTS_KEY); }
function isSessionUnlocked()   { return sessionStorage.getItem(SESSION_KEY) === "1"; }
function markSessionUnlocked() { sessionStorage.setItem(SESSION_KEY, "1"); }

// ─── Brand colours (match the rest of the app) ───────────────────────────────
const RED   = "#8B1A1A";
const LIGHT = "#F7F3F3";

// ─── Dot indicators ───────────────────────────────────────────────────────────
function PINDots({ entered, shake }) {
  return (
    <motion.div
      className="flex items-center justify-center gap-3"
      animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
      transition={{ duration: 0.35 }}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            scale:      i < entered ? 1.15 : 1,
            background: i < entered ? RED : "#E2E8F0",
          }}
          transition={{ duration: 0.12 }}
          className="w-3.5 h-3.5 rounded-full"
        />
      ))}
    </motion.div>
  );
}

// ─── Numpad key — rounded rectangle, white card style ────────────────────────
function NumKey({ digit, sub, onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => !disabled && onPress(String(digit))}
      disabled={disabled}
      className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm select-none transition-colors active:bg-slate-50"
      style={{ width: 80, height: 72 }}
    >
      <span className="text-2xl font-bold text-slate-900 leading-none">{digit}</span>
      {sub
        ? <span className="text-[9px] font-bold text-slate-400 tracking-[0.18em] mt-1">{sub}</span>
        : <span className="h-[13px]" />
      }
    </motion.button>
  );
}

// ─── Backspace key ────────────────────────────────────────────────────────────
function BackspaceKey({ onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => !disabled && onPress()}
      disabled={disabled}
      className="flex items-center justify-center rounded-2xl select-none transition-colors active:bg-slate-100"
      style={{ width: 80, height: 72, background: "transparent" }}
    >
      <Delete size={22} className="text-slate-400" />
    </motion.button>
  );
}

// ─── Numpad layout ────────────────────────────────────────────────────────────
const NUMPAD = [
  [{ d: 1, s: "" },     { d: 2, s: "ABC" },  { d: 3, s: "DEF" }],
  [{ d: 4, s: "GHI" },  { d: 5, s: "JKL" },  { d: 6, s: "MNO" }],
  [{ d: 7, s: "PQRS" }, { d: 8, s: "TUV" },  { d: 9, s: "WXYZ" }],
];

// ─── Shared PIN entry view ────────────────────────────────────────────────────
function PINView({ title, subtitle, onSubmit, error, onForgot }) {
  const [entered, setEntered] = useState("");
  const [shake, setShake]     = useState(false);
  const prevError              = useRef(null);

  // Shake + clear on new error
  useEffect(() => {
    if (error && error !== prevError.current) {
      setShake(true);
      setEntered("");
      setTimeout(() => setShake(false), 400);
    }
    prevError.current = error;
  }, [error]);

  function press(digit) {
    if (entered.length >= PIN_LENGTH) return;
    const next = entered + digit;
    setEntered(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => { onSubmit(next); setEntered(""); }, 80);
    }
  }

  function del() {
    setEntered(e => e.slice(0, -1));
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between overflow-auto"
      style={{ background: LIGHT }}
    >
      {/* ── Top: logo + headings ── */}
      <div className="flex flex-col items-center pt-16 pb-4 px-6">
        {/* PowerWorks logo */}
        <img
          src="/logo.png"
          alt="Power Works"
          className="h-14 object-contain mb-6"
          onError={e => {
            e.target.style.display = "none";
            e.target.nextSibling.style.display = "flex";
          }}
        />
        {/* Fallback wordmark if logo doesn't load */}
        <div
          className="hidden items-center justify-center rounded-2xl px-5 py-3 mb-6"
          style={{ background: RED }}
        >
          <span className="text-white text-lg font-black tracking-wide">POWER<span style={{ color: "#FCA5A5" }}>MATE</span></span>
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight text-center">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-slate-400 text-center leading-snug">{subtitle}</p>
        )}
      </div>

      {/* ── Middle: white card with dots + error ── */}
      <div className="w-full px-6">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-8 py-8 flex flex-col items-center gap-5">
          <PINDots entered={entered.length} shake={shake} />

          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key={error}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm font-bold text-red-600 text-center leading-snug"
              >
                {error}
              </motion.p>
            ) : (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-slate-300 text-center"
              >
                {PIN_LENGTH} digits
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Bottom: numpad ── */}
      <div className="flex flex-col items-center gap-3 pb-12 pt-6 px-6">
        {/* Rows 1–3 */}
        {NUMPAD.map((row, ri) => (
          <div key={ri} className="flex gap-4">
            {row.map(key => (
              <NumKey key={key.d} digit={key.d} sub={key.s} onPress={press} />
            ))}
          </div>
        ))}

        {/* Bottom row: empty · 0 · backspace */}
        <div className="flex gap-4">
          {/* Empty placeholder */}
          <div style={{ width: 80, height: 72 }} />
          <NumKey digit={0} sub="" onPress={press} />
          <BackspaceKey onPress={del} />
        </div>

        {/* Forgot PIN */}
        {onForgot && (
          <button
            onClick={onForgot}
            className="mt-3 text-sm font-bold py-2 px-5 rounded-xl min-h-[44px] transition-colors"
            style={{ color: RED }}
          >
            Forgot PIN? Sign in again
          </button>
        )}
      </div>
    </div>
  );
}

// ─── PIN Setup Screen ─────────────────────────────────────────────────────────
export function PINSetupScreen({ onComplete }) {
  const [stage, setStage] = useState("create");
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");

  function handleCreate(pin) {
    setFirst(pin);
    setStage("confirm");
    setError("");
  }

  async function handleConfirm(pin) {
    if (pin !== first) {
      setError("PINs don't match — try again");
      setStage("create");
      setFirst("");
      return;
    }
    await savePINHash(pin);
    markSessionUnlocked();
    onComplete();
  }

  return (
    <PINView
      title={stage === "create" ? "Create your PIN" : "Confirm your PIN"}
      subtitle={stage === "create"
        ? "Choose 6 digits to secure PowerMate"
        : "Enter the same PIN again to confirm"}
      onSubmit={stage === "create" ? handleCreate : handleConfirm}
      error={error}
    />
  );
}

// ─── PIN Lock Screen ──────────────────────────────────────────────────────────
export function PINLockScreen({ onUnlock, onForgot }) {
  const [error, setError] = useState("");

  async function handleSubmit(pin) {
    const attempts = getPINAttempts();
    if (attempts >= MAX_ATTEMPTS) {
      setError(`Too many attempts — tap "Forgot PIN" below`);
      return;
    }
    const ok = await verifyPIN(pin);
    if (ok) {
      resetPINAttempts();
      markSessionUnlocked();
      onUnlock();
    } else {
      incrementPINAttempts();
      const remaining = MAX_ATTEMPTS - getPINAttempts();
      setError(
        remaining <= 2
          ? `Incorrect PIN — ${remaining} attempt${remaining !== 1 ? "s" : ""} left`
          : "Incorrect PIN — try again"
      );
    }
  }

  return (
    <PINView
      title="Welcome back"
      subtitle="Enter your PIN to open PowerMate"
      onSubmit={handleSubmit}
      error={error}
      onForgot={onForgot}
    />
  );
}

// ─── Re-exports for App.jsx ───────────────────────────────────────────────────
export { getPINHash, isSessionUnlocked, markSessionUnlocked };
