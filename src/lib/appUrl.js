// ─── The app's public address ─────────────────────────────────────────────────
// Links that leave the phone (customer portal, quote acceptance, invites, QR
// labels, PayFast return pages, email links) must use the public website. In
// the browser that's where the app is running; inside the iPhone/Android app
// (Capacitor) the page is served from the phone itself, so the address comes
// from VITE_PUBLIC_APP_URL, which the native build requires.
export const isNativeApp = () => {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

export function publicUrl() {
  const configured = String(import.meta.env?.VITE_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (isNativeApp() && configured) return configured;
  return window.location.origin;
}
