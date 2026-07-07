// ─── PIN Screens ─────────────────────────────────────────────────────────────
// PINSetupScreen: first-time 6-digit PIN creation
// PINLockScreen:  lock screen with PIN + biometric (Face ID / fingerprint)
//
// Biometric uses WebAuthn (built into the browser — no third-party service).
// On first biometric use: registers a passkey credential tied to this device.
// On subsequent opens: calls navigator.credentials.get() to verify.
// Falls back to PIN if biometric is unavailable or cancelled.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, Fingerprint, ScanFace } from "lucide-react";

const PIN_LENGTH    = 6;
const MAX_ATTEMPTS  = 6;
const STORAGE_KEY   = "pm_pin_hash";
const ATTEMPTS_KEY  = "pm_pin_attempts";
const SESSION_KEY   = "pm_session_unlocked";
const BIOMETRIC_KEY = "pm_biometric_credential"; // stores credential ID as base64

const RED   = "#8B1A1A";
const LIGHT = "#F7F3F3";

// ─── PIN helpers (inlined — no external dependency) ──────────────────────────
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
export function getPINHash()          { return localStorage.getItem(STORAGE_KEY); }
       function getPINAttempts()      { return parseInt(localStorage.getItem(ATTEMPTS_KEY) || "0", 10); }
       function incrementPINAttempts(){ localStorage.setItem(ATTEMPTS_KEY, String(getPINAttempts() + 1)); }
       function resetPINAttempts()    { localStorage.removeItem(ATTEMPTS_KEY); }
export function isSessionUnlocked()   { return sessionStorage.getItem(SESSION_KEY) === "1"; }
export function markSessionUnlocked() { sessionStorage.setItem(SESSION_KEY, "1"); }

// ─── Biometric helpers ────────────────────────────────────────────────────────
function isBiometricAvailable() {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}

function hasBiometricRegistered() {
  return !!localStorage.getItem(BIOMETRIC_KEY);
}

function clearBiometric() {
  localStorage.removeItem(BIOMETRIC_KEY);
}

// Convert base64 to Uint8Array
function b64ToArray(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Convert ArrayBuffer to base64url
function arrayToB64(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Register a new biometric credential on this device
async function registerBiometric() {
  if (!isBiometricAvailable()) throw new Error("WebAuthn not supported on this device");

  // Random challenge — just for registration ceremony
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: "PowerMate",
        // id must match the current domain — leave unset to use current domain automatically
      },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "powermate-user",
        displayName: "PowerMate User",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7  }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // device biometric only (no USB keys)
        userVerification: "required",         // must use biometric/PIN
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  });

  // Store the credential ID so we can call get() with it next time
  localStorage.setItem(BIOMETRIC_KEY, arrayToB64(cred.rawId));
  return true;
}

// Verify biometric — returns true if user authenticated successfully
async function verifyBiometric() {
  if (!isBiometricAvailable()) return false;
  const credId = localStorage.getItem(BIOMETRIC_KEY);
  if (!credId) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: "public-key",
          id: b64ToArray(credId),
          transports: ["internal"], // device biometric only
        }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    // If we get here without an error, biometric succeeded
    return !!assertion;
  } catch (e) {
    // User cancelled or biometric failed
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

// ─── Numpad key ───────────────────────────────────────────────────────────────
function NumKey({ digit, sub, onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => !disabled && onPress(String(digit))}
      disabled={disabled}
      className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm select-none"
      style={{ width: 80, height: 72 }}>
      <span className="text-2xl font-bold text-slate-900 leading-none">{digit}</span>
      {sub
        ? <span className="text-[9px] font-bold text-slate-400 tracking-[0.18em] mt-1">{sub}</span>
        : <span className="h-[13px]" />}
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
      className="flex items-center justify-center rounded-2xl select-none"
      style={{ width: 80, height: 72, background: "transparent" }}>
      <Delete size={22} className="text-slate-400" />
    </motion.button>
  );
}

const NUMPAD = [
  [{ d: 1, s: "" },     { d: 2, s: "ABC" },  { d: 3, s: "DEF" }],
  [{ d: 4, s: "GHI" },  { d: 5, s: "JKL" },  { d: 6, s: "MNO" }],
  [{ d: 7, s: "PQRS" }, { d: 8, s: "TUV" },  { d: 9, s: "WXYZ" }],
];

// ─── Biometric button ─────────────────────────────────────────────────────────
function BiometricButton({ onSuccess, onError, isRegistering }) {
  const [state, setState] = useState("idle"); // idle | scanning | error

  // Detect Face ID vs fingerprint — rough heuristic from UA
  const ua = navigator.userAgent.toLowerCase();
  const isApple = /iphone|ipad|mac/.test(ua);
  const label  = isApple ? "Face ID" : "Fingerprint";
  const Icon   = isApple ? ScanFace : Fingerprint;

  async function handleTap() {
    if (state === "scanning") return;
    setState("scanning");
    try {
      let success;
      if (isRegistering) {
        success = await registerBiometric();
      } else {
        success = await verifyBiometric();
      }
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

  const bgColor = state === "scanning" ? "#F0FDF4"
    : state === "error" ? "#FEF2F2"
    : "#F7F3F3";
  const iconColor = state === "scanning" ? "#16A34A"
    : state === "error" ? "#DC2626"
    : RED;
  const textColor = state === "scanning" ? "#16A34A"
    : state === "error" ? "#DC2626"
    : RED;

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
        {state === "scanning" ? "Scanning…"
          : state === "error" ? "Failed"
          : isRegistering ? `Enable ${label}`
          : label}
      </span>
    </motion.button>
  );
}

// ─── PIN Lock Screen (with biometric) ─────────────────────────────────────────
export function PINLockScreen({ onUnlock, onForgot }) {
  const [entered, setEntered] = useState("");
  const [shake, setShake]     = useState(false);
  const [error, setError]     = useState("");
  const [biometricAvailable]  = useState(isBiometricAvailable);
  const [biometricRegistered, setBiometricRegistered] = useState(hasBiometricRegistered);
  const prevError = useRef(null);

  // Auto-trigger biometric on open if already registered
  useEffect(() => {
    if (biometricRegistered && biometricAvailable) {
      // Small delay so screen renders first
      const timer = setTimeout(() => triggerBiometric(), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Shake + clear on new error
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
      if (success) {
        resetPINAttempts();
        markSessionUnlocked();
        onUnlock();
      }
      // If not success, user just uses PIN — no error shown for silent auto-attempt
    } catch {}
  }

  function press(digit) {
    if (entered.length >= PIN_LENGTH) return;
    setError("");
    const next = entered + digit;
    setEntered(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => { handlePINSubmit(next); setEntered(""); }, 80);
    }
  }

  function del() { setEntered(e => e.slice(0, -1)); }

  async function handlePINSubmit(pin) {
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

  function handleBiometricSuccess() {
    if (biometricRegistered) {
      // Verifying — already handled in verifyBiometric
      resetPINAttempts();
      markSessionUnlocked();
      onUnlock();
    } else {
      // Registering — credential saved, now unlock
      setBiometricRegistered(true);
      resetPINAttempts();
      markSessionUnlocked();
      onUnlock();
    }
  }

  function handleBiometricError(msg) {
    setError(msg || "Biometric failed — use your PIN");
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between overflow-auto" style={{ background: LIGHT }}>
      {/* Logo */}
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

      {/* PIN dots + error */}
      <div className="w-full px-6">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-8 py-8 flex flex-col items-center gap-5">
          <PINDots entered={entered.length} shake={shake} />
          <AnimatePresence mode="wait">
            {error ? (
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

      {/* Numpad + biometric */}
      <div className="flex flex-col items-center gap-3 pb-8 pt-6 px-6">
        {NUMPAD.map((row, ri) => (
          <div key={ri} className="flex gap-4">
            {row.map(key => <NumKey key={key.d} digit={key.d} sub={key.s} onPress={press} />)}
          </div>
        ))}
        {/* Bottom row */}
        <div className="flex gap-4">
          {/* Biometric OR empty */}
          {biometricAvailable && biometricRegistered ? (
            <BiometricButton
              onSuccess={handleBiometricSuccess}
              onError={handleBiometricError}
              isRegistering={false}
            />
          ) : (
            <div style={{ width: 80, height: 72 }} />
          )}
          <NumKey digit={0} sub="" onPress={press} />
          <BackspaceKey onPress={del} />
        </div>

        {/* Enable biometric (first time) */}
        {biometricAvailable && !biometricRegistered && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <BiometricButton
              onSuccess={handleBiometricSuccess}
              onError={handleBiometricError}
              isRegistering={true}
            />
            <p className="text-xs text-slate-400 text-center max-w-[220px] leading-snug">
              Tap above to enable Face ID or fingerprint for faster unlock
            </p>
          </div>
        )}

        {/* Forgot PIN */}
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
  const [stage, setStage] = useState("create");
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");
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

      <div className="flex flex-col items-center gap-3 pb-12 pt-6 px-6">
        {NUMPAD.map((row, ri) => (
          <div key={ri} className="flex gap-4">
            {row.map(key => <NumKey key={key.d} digit={key.d} sub={key.s} onPress={press} />)}
          </div>
        ))}
        <div className="flex gap-4">
          <div style={{ width: 80, height: 72 }} />
          <NumKey digit={0} sub="" onPress={press} />
          <BackspaceKey onPress={del} />
        </div>
      </div>
    </div>
  );
}
