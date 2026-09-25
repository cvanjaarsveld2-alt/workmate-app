// ─── The signed-in person ─────────────────────────────────────────────────────
// Their name, for signing off messages and emails. Set by App from the user
// record; falls back to the part of their email before the @.
import { companyLegalName, companyName } from "./companyProfile";

const KEY = "pm_my_name";

export function setMyName(name) {
  try {
    if (name) localStorage.setItem(KEY, String(name).trim());
  } catch {}
}
export function myName() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}
// "Regards,\nJane Smith\nAcme Hydraulics (Pty) Ltd"
export function emailSignature(greeting = "Regards,") {
  return [greeting, myName(), companyLegalName()].filter(Boolean).join("\n");
}
// WhatsApp is shorter: "Kind regards\nJane · Acme Hydraulics"
export function chatSignature() {
  const who = [myName().split(" ")[0], companyName()].filter(Boolean).join(" · ");
  return who ? `Kind regards\n${who}` : "Kind regards";
}
