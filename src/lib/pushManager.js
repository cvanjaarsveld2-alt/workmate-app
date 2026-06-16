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

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const reg = await navigator.serviceWorker.ready;

    // Reuse an existing subscription if present
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) return { ok: false, reason: "bad-subscription" };

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
      console.warn("Failed to save push subscription:", error);
      return { ok: false, reason: "save-failed" };
    }

    return { ok: true };
  } catch (e) {
    console.error("Push subscribe error:", e);
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
