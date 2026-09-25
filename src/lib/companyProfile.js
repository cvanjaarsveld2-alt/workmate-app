// ─── Company profile ──────────────────────────────────────────────────────────
// One profile per company (team): logo, registered details, bank details and
// terms, printed on every quote, pro forma and invoice. Everyone in the team
// reads it; only the master account can change it (enforced by RLS on
// public.team_profiles). A copy is kept on the device so documents can be
// built with no signal.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export const DEFAULT_PROFILE = {
  trading_name: "",
  legal_name: "",
  registration_no: "",
  vat_no: "",
  vat_registered: true,
  address: "",
  phone: "",
  email: "",
  website: "",
  offering: "",
  finance_email: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_no: "",
  bank_branch_code: "",
  bank_account_type: "",
  bank_swift: "",
  quote_validity_days: 30,
  payment_terms_days: 30,
  quote_terms: "",
  invoice_terms: "",
  invoice_prefix: "INV-",
  next_invoice_number: 1,
  brand_color: "#8B1A1A",
  logo_data: null,
  // Nothing off unless the company chose it (new companies start without
  // Jack Selector: see CompanySetup).
  disabled_modules: [],
  require_admin_mfa: false,
  // Per hour, excluding VAT: what the company charges for labour, and what an
  // hour of a technician's time costs it (for job costing).
  labour_rate: 0,
  labour_cost: 0,
  // Daily reminders to the team (overdue invoices, quotes with no answer,
  // services due, low stock), and overdue-invoice emails to customers.
  auto_reminders: true,
  email_customer_reminders: false,
};
export const EDITABLE_FIELDS = Object.keys(DEFAULT_PROFILE);

const cacheKey = teamId => `pm_company_profile__${teamId}`;
const ACTIVE_TEAM_KEY = "pm_active_team";

// The company the signed-in person works for, so code outside React (PDFs,
// message templates) can use its name and logo. Set by App when the team loads.
export function setActiveTeamId(teamId) {
  try {
    if (teamId) localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
    else localStorage.removeItem(ACTIVE_TEAM_KEY);
  } catch {}
}
export function activeTeamId() {
  try {
    return localStorage.getItem(ACTIVE_TEAM_KEY) || null;
  } catch {
    return null;
  }
}
export const activeProfile = () => readCachedProfile(activeTeamId());
// "Acme Hydraulics"; falls back to the registered name, then "".
export const companyName = (p = activeProfile()) => p.trading_name || p.legal_name || "";
// "Acme Hydraulics (Pty) Ltd" for sign-offs and documents.
export const companyLegalName = (p = activeProfile()) => p.legal_name || p.trading_name || "";
// "our jacks, tyre handlers and industrial equipment" / "our products and services".
export const companyOffering = (p = activeProfile()) => (p.offering ? `our ${p.offering}` : "our products and services");

export function readCachedProfile(teamId) {
  if (!teamId) return { ...DEFAULT_PROFILE };
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(teamId)) || "null");
    return { ...DEFAULT_PROFILE, ...(cached && typeof cached === "object" ? cached : {}) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function writeCache(teamId, profile) {
  try {
    localStorage.setItem(cacheKey(teamId), JSON.stringify(profile));
  } catch {}
}

export async function loadCompanyProfile(teamId) {
  const cached = readCachedProfile(teamId);
  if (!teamId || (typeof navigator !== "undefined" && !navigator.onLine)) return cached;
  const { data, error } = await supabase.from("team_profiles").select("*").eq("team_id", teamId).maybeSingle();
  if (error || !data) return cached;
  const profile = { ...DEFAULT_PROFILE };
  for (const k of EDITABLE_FIELDS) if (data[k] !== null && data[k] !== undefined) profile[k] = data[k];
  profile.logo_data = data.logo_data || null;
  const changed = JSON.stringify(profile) !== JSON.stringify(cached);
  writeCache(teamId, profile);
  if (changed && typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("pm:company-profile", { detail: { teamId, profile } }));
  return profile;
}

// Trim text, turn blanks into nulls, clamp numbers. Mirrors the table's checks
// so the master sees a clear message instead of a database error.
export function cleanProfile(input) {
  const out = {};
  for (const k of EDITABLE_FIELDS) {
    const v = input[k];
    if (["quote_validity_days", "payment_terms_days", "next_invoice_number"].includes(k)) {
      const n = Math.round(Number(v));
      out[k] = Number.isFinite(n) ? n : DEFAULT_PROFILE[k];
    } else if (k === "labour_rate" || k === "labour_cost") {
      const n = Math.round(Number(v) * 100) / 100;
      out[k] = Number.isFinite(n) && n > 0 ? n : 0;
    } else if (k === "disabled_modules") {
      out[k] = Array.isArray(v) ? [...new Set(v.map(String))] : [];
    } else if (k === "vat_registered") {
      out[k] = v !== false;
    } else if (k === "require_admin_mfa" || k === "email_customer_reminders") {
      out[k] = v === true;
    } else if (k === "auto_reminders") {
      out[k] = v !== false;
    } else if (k === "logo_data") {
      out[k] = v || null;
    } else {
      const t = String(v ?? "").trim();
      out[k] = t || (k === "invoice_prefix" ? "" : k === "brand_color" ? DEFAULT_PROFILE.brand_color : null);
    }
  }
  return out;
}

export function validateProfile(p) {
  if (p.quote_validity_days < 1 || p.quote_validity_days > 365) return "Quotes must be valid for 1 to 365 days.";
  if (p.payment_terms_days < 0 || p.payment_terms_days > 365) return "Payment terms must be 0 to 365 days.";
  if (p.next_invoice_number < 1) return "The next invoice number must be 1 or more.";
  if (!/^[A-Za-z0-9/_-]{0,12}$/.test(p.invoice_prefix || "")) return "Invoice prefix: up to 12 letters, digits, - / or _.";
  if (!/^#[0-9A-Fa-f]{6}$/.test(p.brand_color || "")) return "Brand colour must look like #8B1A1A.";
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return "The email address doesn't look right.";
  if (p.finance_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.finance_email)) return "The finance email doesn't look right.";
  return "";
}

export async function saveCompanyProfile(teamId, input) {
  const profile = cleanProfile(input);
  const problem = validateProfile(profile);
  if (problem) return { ok: false, error: problem };
  const { error } = await supabase.from("team_profiles").upsert({ team_id: teamId, ...profile }, { onConflict: "team_id" });
  if (error) {
    const denied = error.code === "42501" || /row-level security/i.test(error.message || "");
    return { ok: false, error: denied ? "Only the master account can change company details." : error.message };
  }
  const saved = { ...DEFAULT_PROFILE, ...profile };
  writeCache(teamId, saved);
  window.dispatchEvent(new CustomEvent("pm:company-profile", { detail: { teamId, profile: saved } }));
  return { ok: true, profile: saved };
}

// Logo → small PNG/JPEG data URL (max 800×300), well under the 600 KB limit.
export function compressLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file (PNG or JPEG)."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't open that image."));
      img.onload = () => {
        const scale = Math.min(1, 800 / img.width, 300 / img.height);
        const w = Math.max(1, Math.round(img.width * scale)),
          h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        // PNG keeps a transparent background; photos compress better as JPEG.
        const png = file.type === "image/png" || file.type === "image/svg+xml";
        if (!png) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        let out = png ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
        if (out.length > 580000) out = canvas.toDataURL("image/jpeg", 0.8);
        if (out.length > 580000) return reject(new Error("That logo is too detailed. Try a simpler or smaller image."));
        resolve({ dataUrl: out, width: w, height: h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Profile for the current team: instant from the device, refreshed from the
// server, and updated live when the master saves changes.
export function useCompanyProfile(teamId) {
  const [profile, setProfile] = useState(() => readCachedProfile(teamId));
  useEffect(() => {
    let live = true;
    setProfile(readCachedProfile(teamId));
    loadCompanyProfile(teamId).then(
      p => live && setProfile(p),
      () => {},
    );
    const onSaved = e => e.detail?.teamId === teamId && setProfile(e.detail.profile);
    window.addEventListener("pm:company-profile", onSaved);
    return () => {
      live = false;
      window.removeEventListener("pm:company-profile", onSaved);
    };
  }, [teamId]);
  return profile;
}
