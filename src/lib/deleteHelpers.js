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
import { offlineDelete } from "../offline/offlineDb";
import { triggerImmediateSync } from "./sync";
import { genId } from "./helpers";

export async function deleteRecord(table, recordId, userId, setData) {
  if (!recordId) return;

  // 1. Remove from React state + queue the server delete
  setData(d => ({
    ...d,
    [table]: (d[table] || []).filter(r => r.id !== recordId),
    syncQueue: [
      {
        id: genId(),
        table,
        action: "delete",
        data: { id: recordId, user_id: userId },
        status: "pending",
        created_at: new Date().toISOString(),
      },
      // Remove any pending inserts/updates for this record (they're now moot)
      ...(d.syncQueue || []).filter(q => q.data?.id !== recordId),
    ],
  }));

  // 2. Remove from IndexedDB immediately (prevents resurrection on reload)
  await offlineDelete(table, recordId);

  // 3. Push to server
  triggerImmediateSync();
}
