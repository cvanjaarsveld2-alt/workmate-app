// ─── Push Subscription Manager ────────────────────────────────────────────────
// Subscribes the current device to Web Push and stores the subscription in
// Supabase so the server can send notifications when the app is closed.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "../supabase";

// Your PUBLIC VAPID key (safe to expose). Private key lives in Supabase secrets.
const VAPID_PUBLIC_KEY = "BCxYG8jIB0ECrnVeZXR1QMZwjtgP53DKbc_xwqYfJYmk-hE5UhK-F-PYHNckCzaHmYhe-TFigaGfVRa_2AHPyRo";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// True only where background push can actually work.
export function pushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Detect iOS Safari that hasn't been installed to the home screen — the one
// case where push silently won't work, so we can tell the user honestly.
export function iosNeedsInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  return isIOS && !standalone;
}

// Subscribe this device and persist the subscription to Supabase.
export async function subscribeToPush(userId) {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (iosNeedsInstall()) return { ok: false, reason: "ios-needs-install" };

  // Helper: wrap any promise with a timeout so an iOS silent-hang fails visibly.
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: " + label)), ms)),
  ]);

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    // Wait for the service worker, but don't hang forever.
    let reg;
    try {
      reg = await withTimeout(navigator.serviceWorker.ready, 10000, "service worker activation");
    } catch (e) {
      console.error("[Push] Service worker never became ready:", e);
      return { ok: false, reason: "sw-not-ready" };
    }

    // Reuse an existing subscription if present
    let sub;
    try {
      sub = await reg.pushManager.getSubscription();
    } catch (e) {
      console.warn("[Push] getSubscription failed:", e);
    }

    if (!sub) {
      try {
        sub = await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }),
          15000,
          "push subscribe (likely VAPID key mismatch or Apple Push service)"
        );
      } catch (e) {
        console.error("[Push] subscribe() failed:", e.message || e);
        return { ok: false, reason: "subscribe-failed", detail: e.message };
      }
    }

    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      console.error("[Push] Bad subscription shape:", json);
      return { ok: false, reason: "bad-subscription" };
    }

    // Upsert into Supabase (unique on user_id + endpoint)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 300),
          last_seen: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" }
      );

    if (error) {
      console.error("[Push] Failed to save subscription:", error);
      return { ok: false, reason: "save-failed", detail: error.message };
    }

    return { ok: true };
  } catch (e) {
    console.error("[Push] Unexpected error:", e);
    return { ok: false, reason: e.message || "error" };
  }
}

// Unsubscribe this device (used when turning notifications off).
export async function unsubscribeFromPush(userId) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.toJSON().endpoint;
      await sub.unsubscribe();
      if (endpoint) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", endpoint);
      }
    }
    return { ok: true };
  } catch (e) {
    console.warn("Unsubscribe error:", e);
    return { ok: false };
  }
}
