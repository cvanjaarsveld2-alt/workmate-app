// ─── PIN Screens ─────────────────────────────────────────────────────────────
// PINSetupScreen: first-time 6-digit PIN creation
// PINLockScreen:  lock screen shown on every app open (iPhone lock style)
//
// Design intent: clean black/dark lock-screen aesthetic, large tap targets,
// no backspace button (like iOS — tap a filled dot to clear, or just keep
// going and it auto-handles errors on submit). Smooth feedback on wrong PIN.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { savePINHash, verifyPIN, getPINHash, resetPINAttempts, getPINAttempts, incrementPINAttempts, isSessionUnlocked, markSessionUnlocked } from "../lib/pinHelpers";

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 6;

// ─── Dot indicator ─────────────────────────────────────────────────────────
function PINDots({ entered, length = PIN_LENGTH, shake = false }) {
  return (
    <motion.div
      className="flex items-center justify-center gap-4"
      animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
      transition={{ duration: 0.4 }}>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className="w-4 h-4 rounded-full transition-all duration-150"
          style={{
            background: i < entered
              ? "#FFFFFF"
              : "rgba(255,255,255,0.25)",
            transform: i < entered ? "scale(1.1)" : "scale(1)",
          }}
        />
      ))}
    </motion.div>
  );
}

// ─── Numpad key ────────────────────────────────────────────────────────────
function NumKey({ digit, sub, onPress, disabled }) {
  return (
    <button
      onClick={() => !disabled && onPress(String(digit))}
      disabled={disabled}
      className="flex flex-col items-center justify-center w-20 h-20 rounded-full transition-all active:scale-95 select-none"
      style={{
        background: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
      <span className="text-3xl font-light text-white leading-none">{digit}</span>
      {sub && <span className="text-[9px] font-bold text-white/50 tracking-[0.2em] mt-0.5">{sub}</span>}
    </button>
  );
}

// ─── Numpad layout ─────────────────────────────────────────────────────────
const NUMPAD = [
  [{ d: 1, s: "" },    { d: 2, s: "ABC" },  { d: 3, s: "DEF" }],
  [{ d: 4, s: "GHI" }, { d: 5, s: "JKL" }, { d: 6, s: "MNO" }],
  [{ d: 7, s: "PQRS"},{ d: 8, s: "TUV" }, { d: 9, s: "WXYZ"}],
  [null,               { d: 0, s: "" },     null],
];

// ─── Shared PIN input view ──────────────────────────────────────────────────
function PINView({ title, subtitle, onSubmit, error, onForgot }) {
  const [entered, setEntered] = useState("");
  const [shake, setShake]     = useState(false);
  const prevError = useRef(null);

  useEffect(() => {
    if (error && error !== prevError.current) {
      setShake(true);
      setEntered("");
      setTimeout(() => setShake(false), 500);
    }
    prevError.current = error;
  }, [error]);

  function press(digit) {
    if (entered.length >= PIN_LENGTH) return;
    const next = entered + digit;
    setEntered(next);
    if (next.length === PIN_LENGTH) {
      // Small delay so the last dot fills visually before submission
      setTimeout(() => {
        onSubmit(next);
        setEntered("");
      }, 80);
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between py-16 px-6"
      style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>

      {/* Top — logo + title */}
      <div className="flex flex-col items-center gap-6 pt-8">
        <img
          src="/icon-192.png"
          alt="PowerMate"
          className="w-16 h-16 rounded-2xl shadow-2xl"
          onError={e => { e.target.style.display = "none"; }}
        />
        <div className="text-center">
          <p className="text-white text-2xl font-semibold tracking-tight">{title}</p>
          {subtitle && <p className="text-white/50 text-sm mt-1">{subtitle}</p>}
        </div>
      </div>

      {/* Middle — dots + error */}
      <div className="flex flex-col items-center gap-4">
        <PINDots entered={entered.length} shake={shake} />
        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key={error}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-sm font-medium text-center max-w-[260px]">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom — numpad */}
      <div className="flex flex-col items-center gap-3">
        {NUMPAD.map((row, ri) => (
          <div key={ri} className="flex gap-6 items-center">
            {row.map((key, ki) =>
              key
                ? <NumKey key={ki} digit={key.d} sub={key.s} onPress={press} />
                : <div key={ki} className="w-20 h-20" />
            )}
          </div>
        ))}

        {onForgot && (
          <button
            onClick={onForgot}
            className="mt-4 text-white/50 text-sm font-medium hover:text-white/80 transition-colors py-2 px-4">
            Forgot PIN? Sign in again
          </button>
        )}
      </div>
    </div>
  );
}

// ─── PIN Setup Screen ──────────────────────────────────────────────────────
export function PINSetupScreen({ onComplete }) {
  const [stage, setStage]   = useState("create"); // "create" | "confirm"
  const [first, setFirst]   = useState("");
  const [error, setError]   = useState("");

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
      title={stage === "create" ? "Create a PIN" : "Confirm your PIN"}
      subtitle={stage === "create" ? "6 digits to secure PowerMate" : "Enter the same PIN again"}
      onSubmit={stage === "create" ? handleCreate : handleConfirm}
      error={error}
    />
  );
}

// ─── PIN Lock Screen ───────────────────────────────────────────────────────
export function PINLockScreen({ onUnlock, onForgot }) {
  const [error, setError] = useState("");

  async function handleSubmit(pin) {
    const attempts = getPINAttempts();
    if (attempts >= MAX_ATTEMPTS) {
      setError(`Too many attempts — tap "Forgot PIN" to sign in again`);
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
      setError(remaining <= 2
        ? `Incorrect PIN — ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining`
        : "Incorrect PIN — try again"
      );
    }
  }

  return (
    <PINView
      title="Enter PIN"
      subtitle="Unlock PowerMate"
      onSubmit={handleSubmit}
      error={error}
      onForgot={onForgot}
    />
  );
}
