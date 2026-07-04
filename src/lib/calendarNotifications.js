// ─── Calendar Notification Scheduler ─────────────────────────────────────────
// Schedules local browser notifications for calendar event reminders.
// Uses the ServiceWorker showNotification API with a setTimeout for precision.
// All scheduled timers are stored in localStorage so they can be restored on
// app reload. Falls back gracefully on browsers without notification support.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pm_cal_notif_timers";

// ── Preset reminder options ───────────────────────────────────────────────────
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

// ── Notification permission ───────────────────────────────────────────────────
export async function requestCalendarNotifPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

export function notifPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// ── Show a notification immediately (via SW if available) ────────────────────
async function showNotif(title, body, tag, url = "/") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag,
        data: { url },
        vibrate: [100, 50, 100],
      });
    } else {
      new Notification(title, { body, icon: "/icon-192.png", tag });
    }
  } catch (e) {
    console.warn("[CalNotif] showNotif failed:", e);
  }
}

// ── In-memory timer map: notifId -> timeoutId ─────────────────────────────────
const activeTimers = new Map();

// ── Schedule one notification ─────────────────────────────────────────────────
// notifId: stable ID (eventId + "_" + reminderIndex)
// fireAt:  Date object of when to fire
// title, body: strings
function scheduleOne(notifId, fireAt, title, body, eventId) {
  // Cancel any existing timer for this id
  if (activeTimers.has(notifId)) {
    clearTimeout(activeTimers.get(notifId));
    activeTimers.delete(notifId);
  }

  const msUntil = fireAt.getTime() - Date.now();
  if (msUntil <= 0) return; // already past

  const tid = setTimeout(() => {
    showNotif(title, body, notifId, "/?screen=Calendar");
    activeTimers.delete(notifId);
    // Remove from persisted list
    persistRemoveOne(notifId);
  }, msUntil);

  activeTimers.set(notifId, tid);
}

// ── Persist scheduled items so they survive a page refresh ───────────────────
function persistedList() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function persistSave(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function persistRemoveOne(notifId) {
  persistSave(persistedList().filter(i => i.notifId !== notifId));
}

function persistRemoveEvent(eventId) {
  persistSave(persistedList().filter(i => i.eventId !== eventId));
}

// ── Public: schedule all reminders for one event ─────────────────────────────
export function scheduleEventReminders(event) {
  if (!event?.reminders?.length) return;
  if (!event.start_date) return;

  // Build start datetime
  const startStr = event.start_date + "T" + (event.start_time || "09:00:00");
  const startDt = new Date(startStr);
  if (isNaN(startDt.getTime())) return;

  // Cancel any existing timers for this event first
  cancelEventReminders(event.id);

  const persisted = persistedList().filter(i => i.eventId !== event.id);

  event.reminders.forEach((reminder, idx) => {
    const notifId = `${event.id}_${idx}`;
    const fireAt = new Date(startDt.getTime() - (reminder.minutes || 0) * 60 * 1000);
    const label = reminder.label || `${reminder.minutes} min before`;

    const title = reminder.minutes === 0
      ? `Now: ${event.title}`
      : `Reminder: ${event.title}`;
    const body = [
      label,
      event.start_time ? `at ${event.start_time.slice(0, 5)}` : "",
      event.location ? `@ ${event.location}` : "",
      event.client_name ? `Client: ${event.client_name}` : "",
    ].filter(Boolean).join(" · ");

    scheduleOne(notifId, fireAt, title, body, event.id);

    persisted.push({
      notifId, eventId: event.id,
      fireAt: fireAt.toISOString(),
      title, body,
    });
  });

  persistSave(persisted);
}

// ── Public: cancel all reminders for an event (on delete/edit) ───────────────
export function cancelEventReminders(eventId) {
  // Cancel active timers
  for (const [notifId, tid] of activeTimers.entries()) {
    if (notifId.startsWith(eventId + "_")) {
      clearTimeout(tid);
      activeTimers.delete(notifId);
    }
  }
  persistRemoveEvent(eventId);
}

// ── Public: restore timers after page load ────────────────────────────────────
// Call once on app startup after events are loaded from local storage.
export function restoreCalendarTimers(events = []) {
  // Rebuild from the live events array (most authoritative source)
  events.forEach(ev => {
    if (ev?.reminders?.length) scheduleEventReminders(ev);
  });
}

// ── Public: schedule all events at once (full refresh) ───────────────────────
export function scheduleAllEventReminders(events = []) {
  // Cancel everything first, then reschedule
  for (const [, tid] of activeTimers.entries()) clearTimeout(tid);
  activeTimers.clear();
  persistSave([]);
  events.forEach(ev => scheduleEventReminders(ev));
}
