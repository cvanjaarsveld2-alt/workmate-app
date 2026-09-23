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
  scopedPinKey,
} from "../lib/constants";

const PIN_LENGTH    = 6;
const BIOMETRIC_KEY = "pm_biometric_credential"; // stores credential ID as base64

const RED   = "#8B1A1A";
const LIGHT = "#F7F3F3";

// ─── PIN helpers ─────────────────────────────────────────────────────────────
// FIX (Build 8, Phase 3) — every helper below now takes the signed-in user's
// id and reads/writes the per-user key (scopedPinKey), instead of the one
// global key every account on the device used to share. See constants.js.
async function _digestHex(value) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function _randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
// Legacy (v2 and older) format: one SHA-256 round. Only used to verify PINs
// saved by earlier builds, which are then rewritten as v3.
async function _hashPINLegacy(pin, salt) {
  return _digestHex(pin + salt);
}
// v3: PBKDF2-SHA256 with a per-install salt. A 6-digit PIN has only a million
// possibilities, so a single fast hash could be brute-forced in well under a
// second by anyone who copies localStorage off the device. The work factor
// makes each guess cost ~0.1–0.5 s on a phone. Iterations are stored with the
// hash so they can be raised later; older hashes upgrade on the next unlock.
const PIN_PBKDF2_ITERATIONS = 600000;
async function _hashPINv3(pin, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function _safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function savePINHash(pin, userId) {
  const salt = _randomSalt();
  const hash = await _hashPINv3(pin, salt, PIN_PBKDF2_ITERATIONS);
  localStorage.setItem(scopedPinKey(PIN_KEY, userId), `v3$${PIN_PBKDF2_ITERATIONS}$${salt}$${hash}`);
}
async function verifyPIN(pin, userId) {
  const key = scopedPinKey(PIN_KEY, userId);
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  if (stored.startsWith("v3$")) {
    const [, iterStr, salt, hash] = stored.split("$");
    const iterations = parseInt(iterStr, 10);
    if (!salt || !hash || !(iterations > 0)) return false;
    const ok = _safeEqual(await _hashPINv3(pin, salt, iterations), hash);
    if (ok && iterations < PIN_PBKDF2_ITERATIONS) await savePINHash(pin, userId);
    return ok;
  }
  // Everything below is a pre-v3 format: verify it once, then upgrade to v3.
  let ok = false;
  if (stored.startsWith("v2$")) {
    const [, salt, hash] = stored.split("$");
    ok = !!salt && !!hash && _safeEqual(await _hashPINLegacy(pin, salt), hash);
  } else if (/^v2[0-9a-f]{96}$/i.test(stored)) {
    // Short-lived malformed v2 format (v2 + salt + hash, without separators).
    ok = _safeEqual(await _hashPINLegacy(pin, stored.slice(2, 34)), stored.slice(34));
  } else {
    // Build 8 hash with the old static salt.
    ok = _safeEqual(await _digestHex(pin + "powermate_salt_v1"), stored);
  }
  if (ok) await savePINHash(pin, userId);
  return ok;
}
export function getPINHash(userId)          { return localStorage.getItem(scopedPinKey(PIN_KEY, userId)); }
export function getPINAttempts(userId)      { return parseInt(localStorage.getItem(scopedPinKey(PIN_ATTEMPTS_KEY, userId)) || "0", 10); }
export function incrementPINAttempts(userId){ localStorage.setItem(scopedPinKey(PIN_ATTEMPTS_KEY, userId), String(getPINAttempts(userId) + 1)); }
export function resetPINAttempts(userId)    {
  localStorage.removeItem(scopedPinKey(PIN_ATTEMPTS_KEY, userId));
  localStorage.removeItem(scopedPinKey(PIN_LOCKOUT_KEY, userId));
}
export function isSessionUnlocked(userId)   { return sessionStorage.getItem(scopedPinKey(PIN_UNLOCKED_KEY, userId)) === "1"; }
export function markSessionUnlocked(userId) { sessionStorage.setItem(scopedPinKey(PIN_UNLOCKED_KEY, userId), "1"); }

// FIX #9 — Implement the time-based lockout that was previously defined in
// constants but never used. After PIN_MAX_ATTEMPTS wrong entries the user
// must wait PIN_LOCKOUT_MS before trying again. A hard reload no longer
// bypasses the lockout because the expiry timestamp persists in localStorage.
function setLockout(userId) {
  const until = Date.now() + PIN_LOCKOUT_MS;
  localStorage.setItem(scopedPinKey(PIN_LOCKOUT_KEY, userId), String(until));
}
function getLockoutRemaining(userId) {
  const until = parseInt(localStorage.getItem(scopedPinKey(PIN_LOCKOUT_KEY, userId)) || "0", 10);
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}
function isLockedOut(userId) {
  return getLockoutRemaining(userId) > 0;
}

// ─── Biometric helpers ────────────────────────────────────────────────────────
// Local app-unlock convenience only: a WebAuthn platform-authenticator check
// ("is this the same device/finger/face that enrolled") that unlocks the app
// screen the same way a correct PIN would. It is never sent to Supabase and
// never stands in for supabase.auth — signing in still requires the real
// account credentials; this only gates re-entry to an already-authenticated
// session on this device, exactly like the PIN it's an alternative to.
function isBiometricAvailable() {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}
function hasBiometricRegistered(userId) { return !!localStorage.getItem(scopedPinKey(BIOMETRIC_KEY, userId)); }
function clearBiometric(userId)         { localStorage.removeItem(scopedPinKey(BIOMETRIC_KEY, userId)); }

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

async function registerBiometric(userId) {
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
  localStorage.setItem(scopedPinKey(BIOMETRIC_KEY, userId), arrayToB64(cred.rawId));
  return true;
}

async function verifyBiometric(userId) {
  if (!isBiometricAvailable()) return false;
  const credId = localStorage.getItem(scopedPinKey(BIOMETRIC_KEY, userId));
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

function BiometricButton({ userId, onSuccess, onError, isRegistering }) {
  const [state, setState] = useState("idle");
  const ua      = navigator.userAgent.toLowerCase();
  const isApple = /iphone|ipad|mac/.test(ua);
  const label   = isApple ? "Face ID" : "Fingerprint";
  const Icon    = isApple ? ScanFace : Fingerprint;

  async function handleTap() {
    if (state === "scanning") return;
    setState("scanning");
    try {
      const success = isRegistering ? await registerBiometric(userId) : await verifyBiometric(userId);
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
        clearBiometric(userId);
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
function LockoutTimer({ userId, onExpired }) {
  const [remaining, setRemaining] = useState(() => getLockoutRemaining(userId));
  useEffect(() => {
    if (remaining <= 0) { onExpired(); return; }
    const id = setInterval(() => {
      const r = getLockoutRemaining(userId);
      setRemaining(r);
      if (r <= 0) { clearInterval(id); onExpired(); }
    }, 1000);
    return () => clearInterval(id);
  }, []);  

  const mins = Math.ceil(remaining / 60000);
  return (
    <p className="text-sm font-bold text-red-600 text-center leading-snug">
      Too many attempts — wait {mins} minute{mins !== 1 ? "s" : ""} before trying again
    </p>
  );
}

// ─── PIN Lock Screen ──────────────────────────────────────────────────────────
// FIX (Build 8, Phase 3) — `userId` is required so every check below reads and
// writes THIS signed-in user's PIN/attempts/lockout/biometric state, never a
// previous user's on a shared device (see scopedPinKey in constants.js).
export function PINLockScreen({ userId, onUnlock, onForgot }) {
  const [entered, setEntered]   = useState("");
  const [shake, setShake]       = useState(false);
  const [error, setError]       = useState("");
  const [lockedOut, setLockedOut] = useState(() => isLockedOut(userId));
  const [biometricAvailable]    = useState(isBiometricAvailable);
  const [biometricRegistered, setBiometricRegistered] = useState(() => hasBiometricRegistered(userId));
  const prevError = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (biometricRegistered && biometricAvailable && !lockedOut) {
      const timer = setTimeout(() => triggerBiometric(), 500);
      return () => clearTimeout(timer);
    }
  }, []);  

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
      const success = await verifyBiometric(userId);
      if (success) { resetPINAttempts(userId); markSessionUnlocked(userId); onUnlock(); }
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
    // Prevent double-submission from rapid taps while the async hash check runs.
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      // FIX #9 — Check persistent lockout first (survives page reload)
      if (isLockedOut(userId)) { setLockedOut(true); return; }

      const ok = await verifyPIN(pin, userId);
      if (ok) {
        resetPINAttempts(userId);
        markSessionUnlocked(userId);
        onUnlock();
      } else {
        // Clamp the local counter so repeated/cross-event submissions can
        // never push it beyond the configured attempt ceiling.
        const currentAttempts = Math.min(getPINAttempts(userId), PIN_MAX_ATTEMPTS - 1);
        localStorage.setItem(
          scopedPinKey(PIN_ATTEMPTS_KEY, userId),
          String(currentAttempts + 1)
        );
        const newAttempts = getPINAttempts(userId);
      if (newAttempts >= PIN_MAX_ATTEMPTS) {
        setLockout(userId);
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
    } finally {
      submittingRef.current = false;
    }
  }

  function handleBiometricSuccess() {
    if (!biometricRegistered) setBiometricRegistered(true);
    resetPINAttempts(userId);
    markSessionUnlocked(userId);
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
                <LockoutTimer userId={userId} onExpired={() => setLockedOut(false)} />
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
            <BiometricButton userId={userId} onSuccess={handleBiometricSuccess} onError={msg => setError(msg || "Biometric failed — use your PIN")} isRegistering={false} />
          ) : (
            <div className="w-[72px] h-[66px] sm:w-[80px] sm:h-[72px]" />
          )}
          <NumKey digit={0} sub="" onPress={press} disabled={lockedOut} />
          <BackspaceKey onPress={del} disabled={lockedOut} />
        </div>

        {biometricAvailable && !biometricRegistered && !lockedOut && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <BiometricButton userId={userId} onSuccess={handleBiometricSuccess} onError={msg => setError(msg || "Biometric failed")} isRegistering={true} />
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
export function PINSetupScreen({ userId, onComplete }) {
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
        await savePINHash(pin, userId);
        markSessionUnlocked(userId);
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
