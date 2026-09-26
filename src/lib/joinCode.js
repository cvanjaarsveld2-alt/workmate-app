// ─── Invite links ─────────────────────────────────────────────────────────────
// /?join=CODE opens the app with a company's invite code. It's kept on the
// device until used, so it survives sign-up and email confirmation, then the
// company setup step joins the company with it.
const KEY = "pm_join_code";
const clean = code => String(code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);

export function captureJoinCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = clean(params.get("join"));
    if (!code) return;
    localStorage.setItem(KEY, code);
    params.delete("join");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  } catch {}
}
export function pendingJoinCode() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}
export function clearJoinCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
export const normaliseCode = clean;
