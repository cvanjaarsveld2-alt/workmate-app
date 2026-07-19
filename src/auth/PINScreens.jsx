// ─── PIN Screens ─────────────────────────────────────────────────────────────
// PINSetupScreen: first-time 6-digit PIN creation
// PINLockScreen:  lock screen with PIN + biometric (Face ID / fingerprint)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, Fingerprint, ScanFace } from "lucide-react";
// FIX #8 — Use the shared constants so MAX_ATTEMPTS, storage keys, and
// lockout config are consistent everywhere in the app.
import {
  PIN_KEY,
  PIN_UNLOCKED_KEY,
  PIN_ATTEMPTS_KEY,
  PIN_LOCKOUT_KEY,
  PIN_MAX_ATTEMPTS,
  PIN_LOCKOUT_MS,
} from "../lib/constants";

const PIN_LENGTH    = 6;
const BIOMETRIC_KEY = "pm_biometric_credential"; // stores credential ID as base64

const RED   = "#8B1A1A";
const LIGHT = "#F7F3F3";

// ─── PIN helpers ─────────────────────────────────────────────────────────────
async function _hashPIN(pin) {
  const data = new TextEncoder().encode(pin + "powermate_salt_v1");
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function savePINHash(pin) {
  localStorage.setItem(PIN_KEY, await _hashPIN(pin));
}
async function verifyPIN(pin) {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) return false;
  return (await _hashPIN(pin)) === stored;
}
export function getPINHash()          { return localStorage.getItem(PIN_KEY); }
       function getPINAttempts()      { return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || "0", 10); }
       function incrementPINAttempts(){ localStorage.setItem(PIN_ATTEMPTS_KEY, String(getPINAttempts() + 1)); }
       function resetPINAttempts()    {
         localStorage.removeItem(PIN_ATTEMPTS_KEY);
         localStorage.removeItem(PIN_LOCKOUT_KEY);
       }
export function isSessionUnlocked()   { return sessionStorage.getItem(PIN_UNLOCKED_KEY) === "1"; }
export function markSessionUnlocked() { sessionStorage.setItem(PIN_UNLOCKED_KEY, "1"); }

// FIX #9 — Implement the time-based lockout that was previously defined in
// constants but never used. After PIN_MAX_ATTEMPTS wrong entries the user
// must wait PIN_LOCKOUT_MS before trying again. A hard reload no longer
// bypasses the lockout because the expiry timestamp persists in localStorage.
function setLockout() {
  const until = Date.now() + PIN_LOCKOUT_MS;
  localStorage.setItem(PIN_LOCKOUT_KEY, String(until));
}
function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(PIN_LOCKOUT_KEY) || "0", 10);
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}
function isLockedOut() {
  return getLockoutRemaining() > 0;
}

// ─── Biometric helpers ────────────────────────────────────────────────────────
function isBiometricAvailable() {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}
function hasBiometricRegistered() { return !!localStorage.getItem(BIOMETRIC_KEY); }
function clearBiometric()         { localStorage.removeItem(BIOMETRIC_KEY); }

function b64ToArray(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function arrayToB64(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function registerBiometric() {
  if (!isBiometricAvailable()) throw new Error("WebAuthn not supported on this device");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "PowerMate" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "powermate-user",
        displayName: "PowerMate User",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7   },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  });
  localStorage.setItem(BIOMETRIC_KEY, arrayToB64(cred.rawId));
  return true;
}

async function verifyBiometric() {
  if (!isBiometricAvailable()) return false;
  const credId = localStorage.getItem(BIOMETRIC_KEY);
  if (!credId) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: b64ToArray(credId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

// ─── Dot indicators ───────────────────────────────────────────────────────────
function PINDots({ entered, shake }) {
  return (
    <motion.div
      className="flex items-center justify-center gap-3"
      animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
      transition={{ duration: 0.35 }}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <motion.div key={i}
          animate={{ scale: i < entered ? 1.15 : 1, background: i < entered ? RED : "#E2E8F0" }}
          transition={{ duration: 0.12 }}
          className="w-3.5 h-3.5 rounded-full" />
      ))}
    </motion.div>
  );
}

function NumKey({ digit, sub, onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => !disabled && onPress(String(digit))}
      disabled={disabled}
      className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm select-none w-[72px] h-[66px] sm:w-[80px] sm:h-[72px]">
      <span className="text-2xl font-bold text-slate-900 leading-none">{digit}</span>
      {sub
        ? <span className="text-[9px] font-bold text-slate-400 tracking-[0.18em] mt-1">{sub}</span>
        : <span className="h-[13px]" />}
    </motion.button>
  );
}

function BackspaceKey({ onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => !disabled && onPress()}
      disabled={disabled}
      className="flex items-center justify-center rounded-2xl select-none w-[72px] h-[66px] sm:w-[80px] sm:h-[72px]"
      style={{ background: "transparent" }}>
      <Delete size={22} className="text-slate-400" />
    </motion.button>
  );
}

const NUMPAD = [
  [{ d: 1, s: "" },     { d: 2, s: "ABC" },  { d: 3, s: "DEF" }],
  [{ d: 4, s: "GHI" },  { d: 5, s: "JKL" },  { d: 6, s: "MNO" }],
  [{ d: 7, s: "PQRS" }, { d: 8, s: "TUV" },  { d: 9, s: "WXYZ" }],
];

function BiometricButton({ onSuccess, onError, isRegistering }) {
  const [state, setState] = useState("idle");
  const ua      = navigator.userAgent.toLowerCase();
  const isApple = /iphone|ipad|mac/.test(ua);
  const label   = isApple ? "Face ID" : "Fingerprint";
  const Icon    = isApple ? ScanFace : Fingerprint;

  async function handleTap() {
    if (state === "scanning") return;
    setState("scanning");
    try {
      const success = isRegistering ? await registerBiometric() : await verifyBiometric();
      if (success) {
        setState("idle");
        onSuccess();
      } else {
        setState("error");
        onError?.("Biometric not recognised — use your PIN");
        setTimeout(() => setState("idle"), 2000);
      }
    } catch (e) {
      setState("error");
      const msg = e.message || "";
      if (msg.includes("cancelled") || msg.includes("NotAllowed")) {
        onError?.("Biometric cancelled — use your PIN");
      } else if (msg.includes("NotSupportedError") || msg.includes("not supported")) {
        onError?.("Biometric not available on this device");
        clearBiometric();
      } else {
        onError?.("Biometric failed — use your PIN");
      }
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const bgColor    = state === "scanning" ? "#F0FDF4" : state === "error" ? "#FEF2F2" : "#F7F3F3";
  const iconColor  = state === "scanning" ? "#16A34A" : state === "error" ? "#DC2626" : RED;
  const textColor  = iconColor;

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={handleTap}
      className="flex flex-col items-center gap-2 rounded-2xl px-6 py-4 transition-colors min-h-[80px] min-w-[120px]"
      style={{ background: bgColor }}>
      <motion.div
        animate={state === "scanning" ? { scale: [1, 1.15, 1] } : {}}
        transition={{ repeat: state === "scanning" ? Infinity : 0, duration: 0.8 }}>
        <Icon size={28} style={{ color: iconColor }} />
      </motion.div>
      <span className="text-xs font-bold" style={{ color: textColor }}>
        {state === "scanning" ? "Scanning…" : state === "error" ? "Failed" : isRegistering ? `Enable ${label}` : label}
      </span>
    </motion.button>
  );
}

// ─── Lockout countdown display ─────────────────────────────────────────────────
function LockoutTimer({ onExpired }) {
  const [remaining, setRemaining] = useState(getLockoutRemaining());
  useEffect(() => {
    if (remaining <= 0) { onExpired(); return; }
    const id = setInterval(() => {
      const r = getLockoutRemaining();
      setRemaining(r);
      if (r <= 0) { clearInterval(id); onExpired(); }
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  const mins = Math.ceil(remaining / 60000);
  return (
    <p className="text-sm font-bold text-red-600 text-center leading-snug">
      Too many attempts — wait {mins} minute{mins !== 1 ? "s" : ""} before trying again
    </p>
  );
}

// ─── PIN Lock Screen ──────────────────────────────────────────────────────────
export function PINLockScreen({ onUnlock, onForgot }) {
  const [entered, setEntered]   = useState("");
  const [shake, setShake]       = useState(false);
  const [error, setError]       = useState("");
  const [lockedOut, setLockedOut] = useState(isLockedOut);
  const [biometricAvailable]    = useState(isBiometricAvailable);
  const [biometricRegistered, setBiometricRegistered] = useState(hasBiometricRegistered);
  const prevError = useRef(null);

  useEffect(() => {
    if (biometricRegistered && biometricAvailable && !lockedOut) {
      const timer = setTimeout(() => triggerBiometric(), 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (error && error !== prevError.current) {
      setShake(true);
      setEntered("");
      setTimeout(() => setShake(false), 400);
    }
    prevError.current = error;
  }, [error]);

  async function triggerBiometric() {
    try {
      const success = await verifyBiometric();
      if (success) { resetPINAttempts(); markSessionUnlocked(); onUnlock(); }
    } catch {}
  }

  function press(digit) {
    if (entered.length >= PIN_LENGTH || lockedOut) return;
    setError("");
    const next = entered + digit;
    setEntered(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => { handlePINSubmit(next); setEntered(""); }, 80);
    }
  }

  function del() { setEntered(e => e.slice(0, -1)); }

  async function handlePINSubmit(pin) {
    // FIX #9 — Check persistent lockout first (survives page reload)
    if (isLockedOut()) { setLockedOut(true); return; }

    const attempts = getPINAttempts();
    const ok = await verifyPIN(pin);
    if (ok) {
      resetPINAttempts();
      markSessionUnlocked();
      onUnlock();
    } else {
      incrementPINAttempts();
      const newAttempts = getPINAttempts();
      if (newAttempts >= PIN_MAX_ATTEMPTS) {
        setLockout();
        setLockedOut(true);
      } else {
        const remaining = PIN_MAX_ATTEMPTS - newAttempts;
        setError(
          remaining <= 2
            ? `Incorrect PIN — ${remaining} attempt${remaining !== 1 ? "s" : ""} left`
            : "Incorrect PIN — try again"
        );
      }
    }
  }

  function handleBiometricSuccess() {
    if (!biometricRegistered) setBiometricRegistered(true);
    resetPINAttempts();
    markSessionUnlocked();
    onUnlock();
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between overflow-auto" style={{ background: LIGHT }}>
      <div className="flex flex-col items-center pt-16 pb-4 px-6">
        <img src="/logo.png" alt="Power Works" className="h-14 object-contain mb-6"
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
        <div className="hidden items-center justify-center rounded-2xl px-5 py-3 mb-6" style={{ background: RED }}>
          <span className="text-white text-lg font-black tracking-wide">POWER<span style={{ color: "#FCA5A5" }}>MATE</span></span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight text-center">Welcome back</h1>
        <p className="mt-1.5 text-sm text-slate-400 text-center leading-snug">
          {biometricRegistered ? "Use biometric or enter your PIN" : "Enter your PIN to open PowerMate"}
        </p>
      </div>

      <div className="w-full px-6">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-8 py-8 flex flex-col items-center gap-5">
          <PINDots entered={entered.length} shake={shake} />
          <AnimatePresence mode="wait">
            {lockedOut ? (
              <motion.div key="lockout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <LockoutTimer onExpired={() => setLockedOut(false)} />
              </motion.div>
            ) : error ? (
              <motion.p key={error} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-sm font-bold text-red-600 text-center leading-snug">
                {error}
              </motion.p>
            ) : (
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-sm text-slate-300 text-center">
                {PIN_LENGTH} digits
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pb-8 pt-6 px-4 w-full max-w-xs mx-auto">
        {NUMPAD.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-3 sm:gap-4 w-full justify-items-center">
            {row.map(key => <NumKey key={key.d} digit={key.d} sub={key.s} onPress={press} disabled={lockedOut} />)}
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full justify-items-center">
          {biometricAvailable && biometricRegistered && !lockedOut ? (
            <BiometricButton onSuccess={handleBiometricSuccess} onError={msg => setError(msg || "Biometric failed — use your PIN")} isRegistering={false} />
          ) : (
            <div className="w-[72px] h-[66px] sm:w-[80px] sm:h-[72px]" />
          )}
          <NumKey digit={0} sub="" onPress={press} disabled={lockedOut} />
          <BackspaceKey onPress={del} disabled={lockedOut} />
        </div>

        {biometricAvailable && !biometricRegistered && !lockedOut && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <BiometricButton onSuccess={handleBiometricSuccess} onError={msg => setError(msg || "Biometric failed")} isRegistering={true} />
            <p className="text-xs text-slate-400 text-center max-w-[220px] leading-snug">
              Tap above to enable Face ID or fingerprint for faster unlock
            </p>
          </div>
        )}

        {onForgot && (
          <button onClick={onForgot}
            className="mt-1 text-sm font-bold py-2 px-5 rounded-xl min-h-[44px]"
            style={{ color: RED }}>
            Forgot PIN? Sign in again
          </button>
        )}
      </div>
    </div>
  );
}

// ─── PIN Setup Screen ─────────────────────────────────────────────────────────
export function PINSetupScreen({ onComplete }) {
  const [stage, setStage]     = useState("create");
  const [first, setFirst]     = useState("");
  const [error, setError]     = useState("");
  const [entered, setEntered] = useState("");
  const [shake, setShake]     = useState(false);
  const prevError = useRef(null);

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
    setError("");
    const next = entered + digit;
    setEntered(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => { handleSubmit(next); setEntered(""); }, 80);
    }
  }

  function del() { setEntered(e => e.slice(0, -1)); }

  async function handleSubmit(pin) {
    if (stage === "create") {
      setFirst(pin);
      setStage("confirm");
    } else {
      if (pin !== first) {
        setError("PINs don't match — try again");
        setStage("create");
        setFirst("");
      } else {
        await savePINHash(pin);
        markSessionUnlocked();
        onComplete();
      }
    }
  }

  const title    = stage === "create" ? "Create your PIN" : "Confirm your PIN";
  const subtitle = stage === "create"
    ? "Choose 6 digits to secure PowerMate"
    : "Enter the same PIN again to confirm";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between overflow-auto" style={{ background: LIGHT }}>
      <div className="flex flex-col items-center pt-16 pb-4 px-6">
        <img src="/logo.png" alt="Power Works" className="h-14 object-contain mb-6"
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
        <div className="hidden items-center justify-center rounded-2xl px-5 py-3 mb-6" style={{ background: RED }}>
          <span className="text-white text-lg font-black tracking-wide">POWER<span style={{ color: "#FCA5A5" }}>MATE</span></span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight text-center">{title}</h1>
        <p className="mt-1.5 text-sm text-slate-400 text-center leading-snug">{subtitle}</p>
      </div>

      <div className="w-full px-6">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-8 py-8 flex flex-col items-center gap-5">
          <PINDots entered={entered.length} shake={shake} />
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p key={error} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-sm font-bold text-red-600 text-center">{error}</motion.p>
            ) : (
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-sm text-slate-300 text-center">{PIN_LENGTH} digits</motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pb-12 pt-6 px-4 w-full max-w-xs mx-auto">
        {NUMPAD.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-3 sm:gap-4 w-full justify-items-center">
            {row.map(key => <NumKey key={key.d} digit={key.d} sub={key.s} onPress={press} />)}
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full justify-items-center">
          <div className="w-[72px] h-[66px] sm:w-[80px] sm:h-[72px]" />
          <NumKey digit={0} sub="" onPress={press} />
          <BackspaceKey onPress={del} />
        </div>
      </div>
    </div>
  );
}
