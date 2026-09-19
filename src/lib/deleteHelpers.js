// ─── Delete Helpers ───────────────────────────────────────────────────────────
// Every screen that deletes a record MUST use these helpers to ensure
// the record is removed from BOTH React state AND IndexedDB.
//
// Previously, screens only removed records from state and queued a server
// delete — the IndexedDB copy survived and the record would reappear
// after reload (especially offline).
//
// Usage (replace existing delete logic in any screen):
//   import { deleteRecord } from "../lib/deleteHelpers";
//   await deleteRecord("clients", clientId, userId, setData);
// ─────────────────────────────────────────────────────────────────────────────
import { offlineDelete, offlineGetAll, offlineReplaceAll } from "../offline/offlineDb";
import { triggerImmediateSync } from "./sync";
import { genId } from "./helpers";

export async function deleteRecord(table, recordId, userId, setData) {
  if (!recordId) return;

  // 1. Create and durably persist the server delete BEFORE publishing it
  // to React. React state is a view; IndexedDB is the durable queue source of truth.
  const queueItem = {
    id: genId(),
    table,
    action: "delete",
    data: { id: recordId, user_id: userId },
    status: "pending",
    created_at: new Date().toISOString(),
  };
  const existingQueue = await offlineGetAll("syncQueue");
  const nextQueue = [
    queueItem,
    ...(existingQueue || []).filter(q => q.data?.id !== recordId),
  ];
  await offlineReplaceAll("syncQueue", nextQueue);
  setData(d => ({
    ...d,
    [table]: (d[table] || []).filter(r => r.id !== recordId),
    syncQueue: nextQueue,
  }));

  // 2. Remove from IndexedDB immediately (prevents resurrection on reload).
  // offlineDelete now throws on a genuine IndexedDB failure (Phase I) instead of
  // silently pretending it worked — but the server-side delete below is the real,
  // authoritative fix and must still happen even if this local cleanup step fails
  // (the queued delete already landed in React/sync-queue state above). A failed
  // local delete just means the record could locally resurrect until the next
  // full pull replaces this store wholesale — logged, not silent, but not allowed
  // to block the actual delete from reaching the server either.
  try { await offlineDelete(table, recordId); }
  catch (e) { console.error("[deleteHelpers] local IndexedDB delete failed — will self-heal on next pull; server delete still proceeding", table, recordId, e); }

  // 3. Push to server
  triggerImmediateSync();
}
