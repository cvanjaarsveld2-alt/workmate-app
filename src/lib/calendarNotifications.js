// ─── Calendar Notification Scheduler ─────────────────────────────────────────
// Durable calendar reminders. The service worker persists scheduled reminders
// in IndexedDB so they survive page reloads and service-worker suspension.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pm_cal_notif_timers";

export const REMINDER_PRESETS = [
  { label: "At time of event",  minutes: 0 },
  { label: "5 minutes before",  minutes: 5 },
  { label: "15 minutes before", minutes: 15 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before",     minutes: 60 },
  { label: "2 hours before",    minutes: 120 },
  { label: "1 day before",      minutes: 1440 },
  { label: "2 days before",     minutes: 2880 },
  { label: "1 week before",     minutes: 10080 },
];

export async function requestCalendarNotifPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function notifPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function showNotif(title, body, tag, url = "/") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        data: { url },
        vibrate: [100, 50, 100],
      });
    } else {
      new Notification(title, { body, icon: "/icons/icon-192.png", tag });
    }
  } catch (e) {
    console.warn("[CalNotif] showNotif failed:", e);
  }
}

const activeTimers = new Map();

function scheduleOne(notifId, fireAt, title, body) {
  if (activeTimers.has(notifId)) {
    clearTimeout(activeTimers.get(notifId));
    activeTimers.delete(notifId);
  }

  const msUntil = fireAt.getTime() - Date.now();
  if (msUntil <= 0) return;

  const tid = setTimeout(() => {
    showNotif(title, body, notifId, "/?screen=Calendar");
    activeTimers.delete(notifId);
    persistRemoveOne(notifId);
  }, msUntil);

  activeTimers.set(notifId, tid);
}

function persistedList() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function persistSave(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function persistRemoveOne(notifId) {
  persistSave(persistedList().filter(i => i.notifId !== notifId));
}

function persistRemoveEvent(eventId) {
  persistSave(persistedList().filter(i => i.eventId !== eventId));
}

function scheduleDurableReminder(item) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage({
      type: "SCHEDULE_NOTIFICATIONS",
      items: [item],
      replace: false,
    });
  }).catch(() => {});
}

function cancelDurableReminder(notifId) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage({ type: "CANCEL_NOTIFICATION", id: notifId });
  }).catch(() => {});
}

export function scheduleEventReminders(event) {
  if (!event?.reminders?.length || !event.start_date) return;

  const startStr = event.start_date + "T" + (event.start_time || "09:00:00");
  const startDt = new Date(startStr);
  if (isNaN(startDt.getTime())) return;

  cancelEventReminders(event.id);
  const persisted = persistedList().filter(i => i.eventId !== event.id);

  event.reminders.forEach((reminder, idx) => {
    const notifId = `${event.id}_${idx}`;
    const fireAt = new Date(startDt.getTime() - (reminder.minutes || 0) * 60 * 1000);
    const label = reminder.label || `${reminder.minutes} min before`;
    const title = reminder.minutes === 0 ? `Now: ${event.title}` : `Reminder: ${event.title}`;
    const body = [
      label,
      event.start_time ? `at ${event.start_time.slice(0, 5)}` : "",
      event.location ? `@ ${event.location}` : "",
      event.client_name ? `Client: ${event.client_name}` : "",
    ].filter(Boolean).join(" · ");

    scheduleOne(notifId, fireAt, title, body);

    if (fireAt.getTime() > Date.now()) {
      scheduleDurableReminder({
        id: notifId,
        eventId: event.id,
        fireAt: fireAt.toISOString(),
        title,
        body,
        tag: notifId,
        url: "/?screen=Calendar",
      });
      persisted.push({ notifId, eventId: event.id, fireAt: fireAt.toISOString(), title, body });
    }
  });

  persistSave(persisted);
}

export function cancelEventReminders(eventId) {
  const ids = new Set();
  for (const [notifId, tid] of activeTimers.entries()) {
    if (notifId.startsWith(eventId + "_")) {
      clearTimeout(tid);
      activeTimers.delete(notifId);
      ids.add(notifId);
    }
  }

  // Also cancel persisted/durable reminders even when no in-memory timer exists.
  persistedList().filter(i => i.eventId === eventId).forEach(i => ids.add(i.notifId));
  ids.forEach(cancelDurableReminder);
  persistRemoveEvent(eventId);
}

export function restoreCalendarTimers(events = []) {
  events.forEach(ev => {
    if (ev?.reminders?.length) scheduleEventReminders(ev);
  });
}

export function scheduleAllEventReminders(events = []) {
  for (const [, tid] of activeTimers.entries()) clearTimeout(tid);
  activeTimers.clear();
  persistedList().forEach(i => cancelDurableReminder(i.notifId));
  persistSave([]);
  events.forEach(ev => scheduleEventReminders(ev));
}
