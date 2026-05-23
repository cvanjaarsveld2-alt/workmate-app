// ─── Supabase Sync Engine ─────────────────────────────────────────────────────
import { supabase } from "../supabase";
import { logEvent } from "./helpers";

// Race guard — prevents concurrent sync pushes
let _syncInProgress = false;

export async function pushSyncQueue(syncQueue, setData) {
  if (_syncInProgress) return;
  _syncInProgress = true;

  try {
    const pending = (syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;

    // Deduplicate — keep only the latest entry per (table, id, action)
    const seen    = new Map();
    const deduped = [];
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i];
      const key  = `${item.table}:${item.data?.id}:${item.action}`;
      if (seen.has(key)) continue;
      seen.set(key, true);
      deduped.unshift(item);
    }

    const results = await Promise.allSettled(
      deduped.map(async item => {
        const table = item.table;

        // Strip base64 media before pushing — only URLs go to DB
        let payload = item.data;
        if (payload?.media) {
          payload = {
            ...payload,
            media: payload.media.map(m => ({ ...m, base64: undefined })),
          };
        }

        if (item.action === "insert" || item.action === "upsert") {
          const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
          if (error) throw error;
        } else if (item.action === "update") {
          const { error } = await supabase.from(table).update(payload).eq("id", payload.id);
          if (error) throw error;
        } else if (item.action === "delete") {
          const { error } = await supabase.from(table).delete().eq("id", payload.id);
          if (error) throw error;
        }
        return item.id;
      })
    );

    const ok     = results.filter(r => r.status === "fulfilled").map(r => r.value);
    const failed = results.filter(r => r.status === "rejected");

    if (failed.length > 0) {
      console.warn("[PowerMate] Sync failures:", failed.length);
      logEvent("sync_failed", {
        count:  failed.length,
        errors: failed.slice(0, 3).map(f => f.reason?.message || "unknown"),
      });
      // Notify the UI
      window.dispatchEvent(new CustomEvent("powermate:sync_failed", {
        detail: { count: failed.length, message: failed[0]?.reason?.message || "Unknown error" },
      }));
    }

    if (ok.length > 0) logEvent("sync_succeeded", { count: ok.length });

    // Mark succeeded items as synced
    const succeededEntityIds = deduped
      .filter(item => ok.includes(item.id))
      .map(item => item.data?.id)
      .filter(Boolean);

    const succeededQueueIds = new Set();
    pending.forEach(item => {
      if (succeededEntityIds.includes(item.data?.id)) succeededQueueIds.add(item.id);
    });

    setData(d => ({
      ...d,
      syncQueue:  (d.syncQueue  || []).filter(i => !succeededQueueIds.has(i.id)),
      clients:    (d.clients    || []).map(c => succeededEntityIds.includes(c.id) ? { ...c, sync_status: "synced" } : c),
      quotes:     (d.quotes     || []).map(q => succeededEntityIds.includes(q.id) ? { ...q, sync_status: "synced" } : q),
      followups:  (d.followups  || []).map(f => succeededEntityIds.includes(f.id) ? { ...f, sync_status: "synced" } : f),
      notes:      (d.notes      || []).map(n => succeededEntityIds.includes(n.id) ? { ...n, sync_status: "synced" } : n),
      equipment:  (d.equipment  || []).map(e => succeededEntityIds.includes(e.id) ? { ...e, sync_status: "synced" } : e),
    }));

  } finally {
    _syncInProgress = false;
  }
}
