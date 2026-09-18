// ─── Offline Media Queue (compatibility shim) ────────────────────────────────
// This used to be a separate IndexedDB-backed upload queue, but nothing in the
// app ever called queueMediaUpload() to put anything into it — every screen
// attaches photos directly to their record's `media`/`photos` field instead,
// so the queue here was always empty and processMediaQueue() never had
// anything to do. It has been replaced by sync.js's retryPendingMedia(), which
// works against the data that screens actually write (base64 already sitting
// on the record) instead of a parallel, never-populated store.
//
// This file is kept only so nothing that still imports the old names breaks.
// New code should import { retryPendingMedia } from "./sync" directly.
// ─────────────────────────────────────────────────────────────────────────────
import { retryPendingMedia } from "./sync";

export function setMediaQueueUser() {
  // No-op: retryPendingMedia reads from the per-user offline stores in
  // offlineDb.js, which are already scoped by setOfflineUser().
}

export async function processMediaQueue(setData, uid) {
  return retryPendingMedia(uid, setData);
}

export async function getQueueCount() {
  return 0;
}
