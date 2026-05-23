// ─── Notification Helpers ─────────────────────────────────────────────────────
import { todayISO } from "./helpers";

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied")  return false;
  return (await Notification.requestPermission()) === "granted";
}

export async function scheduleNotificationsViaSW(items) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: "SCHEDULE_NOTIFICATIONS", items });
  } catch (e) {
    console.warn("SW schedule failed", e);
  }
}

export function buildNotificationItems(followups = [], equipment = [], notes = []) {
  const items    = [];
  const todayStr = todayISO();

  // ── Morning summary ──
  const todayFollowups = followups.filter(f => f.date === todayStr && !f.completed);
  if (todayFollowups.length > 0) {
    const fireAt = new Date(todayStr + "T07:00:00");
    if (fireAt > new Date()) {
      items.push({
        id:    "morning_" + todayStr,
        title: "📋 PowerMate — Today's Follow-ups",
        body:  `You have ${todayFollowups.length} follow-up${todayFollowups.length !== 1 ? "s" : ""} today.`,
        fireAt: fireAt.toISOString(),
        tag:   "morning_summary",
      });
    }
  }

  // ── Per follow-up reminders ──
  followups.filter(f => f.date >= todayStr && !f.completed).forEach(f => {
    if (f.reminder === "none") return;
    const base = new Date(`${f.date}T${f.time || "09:00"}:00`);
    let fireAt = base;
    switch (f.reminder) {
      case "15_before": fireAt = new Date(base.getTime() - 15 * 60000); break;
      case "30_before": fireAt = new Date(base.getTime() - 30 * 60000); break;
      case "1h_before": fireAt = new Date(base.getTime() - 60 * 60000); break;
      case "1d_before": {
        const d = new Date(f.date + "T09:00:00");
        d.setDate(d.getDate() - 1);
        fireAt = d;
        break;
      }
      case "morning": fireAt = new Date(f.date + "T07:00:00"); break;
      default: break;
    }
    if (fireAt > new Date()) {
      items.push({
        id:    "fu_" + f.id,
        title: "🔔 " + f.title,
        body:  f.client ? `Client: ${f.client}` : "Tap to view.",
        fireAt: fireAt.toISOString(),
        tag:   "fu_" + f.id,
      });
    }
  });

  // ── Equipment service reminders ──
  equipment.filter(e => e.service_due).forEach(eq => {
    const due  = new Date(eq.service_due + "T09:00:00");
    const warn = new Date(due);
    warn.setDate(warn.getDate() - 3);
    if (warn > new Date()) {
      items.push({
        id:    "ew_" + eq.id,
        title: "⚠️ Service Due Soon: " + eq.name,
        body:  `Service due in 3 days.`,
        fireAt: warn.toISOString(),
        tag:   "ew_" + eq.id,
      });
    }
    if (due > new Date()) {
      items.push({
        id:    "ed_" + eq.id,
        title: "🔧 Service Due Today: " + eq.name,
        body:  `${eq.make || ""} ${eq.model || ""}`.trim(),
        fireAt: due.toISOString(),
        tag:   "ed_" + eq.id,
      });
    }
  });

  // ── Note resolve-by reminders ──
  notes.filter(n => n.resolve_by && !n.resolved).forEach(n => {
    const fireAt = new Date(n.resolve_by + "T09:00:00");
    if (fireAt > new Date()) {
      const urg   = n.urgency || "Normal";
      const emoji = urg === "Critical" ? "🚨" : urg === "Urgent" ? "⚠️" : "📌";
      items.push({
        id:    "note_" + n.id,
        title: `${emoji} Unresolved Note: ${n.client || "General"}`,
        body:  (n.note || "").slice(0, 80),
        fireAt: fireAt.toISOString(),
        tag:   "note_" + n.id,
      });
    }
  });

  return items;
}
