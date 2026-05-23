// ─── PIN Security Helpers ─────────────────────────────────────────────────────
import {
  PIN_KEY,
  PIN_UNLOCKED_KEY,
  PIN_ATTEMPTS_KEY,
  PIN_LOCKOUT_KEY,
  PIN_MAX_ATTEMPTS,
  PIN_LOCKOUT_MS,
} from "./constants";

export async function hashPIN(pin) {
  const data = new TextEncoder().encode(pin + "powerworks_salt_2026");
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export const getPINHash       = ()  => localStorage.getItem(PIN_KEY);
export const isSessionUnlocked = () => sessionStorage.getItem(PIN_UNLOCKED_KEY) === "true";
export const setSessionUnlocked = () => sessionStorage.setItem(PIN_UNLOCKED_KEY, "true");

export function getPINAttempts() {
  return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || "0", 10);
}

export function incrementPINAttempts() {
  const n = getPINAttempts() + 1;
  localStorage.setItem(PIN_ATTEMPTS_KEY, String(n));
  return n;
}

export function resetPINAttempts() {
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCKOUT_KEY);
}

export function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(PIN_LOCKOUT_KEY) || "0", 10);
  return until > Date.now() ? until - Date.now() : 0;
}

export function setLockout() {
  localStorage.setItem(PIN_LOCKOUT_KEY, String(Date.now() + PIN_LOCKOUT_MS));
}

export { PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MS };
