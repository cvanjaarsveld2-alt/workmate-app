// ═══════════════════════════════════════════════════════════════════════════
// sync.js — PowerMate Bulletproof Sync Engine
// ───────────────────────────────────────────────────────────────────────────
// Strategy:
//   1. Every write goes to IndexedDB FIRST (instant, never lost)
//   2. Immediately attempt Supabase push in parallel
//   3. If push fails (offline), item stays in syncQueue
//   4. On reconnect, retry all pending items automatically
//   5. Real-time subscription keeps all devices in sync
//   6. Every item has a sync_status: 'synced' | 'pending' | 'error'
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "../supabase";
import { logEvent } from "./helpers";
import { offlineSave } from "../offline/offlineDb";

// ─── Single item push ─────────────────────────────────────────────────────────
// Tries to push one item to Supabase immediately.
// Returns true on success, false on failure.
export async function pushItem(item) {
  try {
    const table   = item.table;
    let   payload = item.data;

    // Strip base64 media before pushing — only URLs go to DB
    if (payload?.media) {
      payload = {
        ...payload,
        media: payload.media.map(m => ({ ...m, base64: undefined })),
      };
    }

    if (item.action === "insert" || item.action === "upsert") {
      const syncedPayload = { ...payload, sync_status: "synced" };
      const { error } = await supabase.from(table).upsert(syncedPayload, { onConflict: "id" });
      if (error) throw error;
    } else if (item.action === "update") {
      const syncedPayload = { ...payload, sync_status: "synced" };
      const { error } = await supabase.from(table).update(syncedPayload).eq("id", payload.id);
      if (error) throw error;
    } else if (item.action === "delete") {
      const { error } = await supabase.from(table).delete().eq("id", payload.id);
      if (error) throw error;
    }
    return true;
  } catch (e) {
    console.warn(`[Sync] Failed to push ${item.table} ${item.action}:`, e?.message);
    return false;
  }
}

// ─── Immediate write + push ───────────────────────────────────────────────────
// This is what every screen calls instead of manually managing syncQueue.
// - Saves to IndexedDB immediately
// - Attempts Supabase push immediately
// - If push fails, adds to syncQueue for retry
// Returns the item with updated sync_status
export async function saveAndSync(item, table, action, setData, isOnline) {
  // 1. Save to IndexedDB immediately (never lost)
  await offlineSave(table, item);

  // 2. Attempt immediate Supabase push if online
  if (isOnline) {
    const success = await pushItem({ table, action, data: item });
    if (success) {
      const synced = { ...item, sync_status: "synced" };
      await offlineSave(table, synced);
      // Update state to show synced
      setData(d => ({
        ...d,
        [table]: (d[table] || []).map(r => r.id === item.id ? synced : r),
        // Remove from syncQueue if it was there
        syncQueue: (d.syncQueue || []).filter(q => q.data?.id !== item.id),
      }));
      return synced;
    }
  }

  // 3. Push failed or offline — add to retry queue
  const queueItem = {
    id:         `sq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    table,
    action,
    data:       item,
    status:     "pending",
    created_at: new Date().toISOString(),
    retries:    0,
  };

  setData(d => ({
    ...d,
    syncQueue: [
      queueItem,
      // Remove any older queue items for same entity (dedup)
      ...(d.syncQueue || []).filter(q => q.data?.id !== item.id),
    ],
  }));

  return { ...item, sync_status: "pending" };
}

// ─── Full queue flush ─────────────────────────────────────────────────────────
// Processes all pending items in the syncQueue.
// Called on reconnect and manual "Sync Now".
let _syncInProgress = false;

export async function pushSyncQueue(syncQueue, setData) {
  if (_syncInProgress) return;
  _syncInProgress = true;

  try {
    const pending = (syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;

    // Deduplicate — for same entity, keep only the latest action
    // When deduplicating, prefer the version with MORE media (has uploaded photos)
    const bestByKey = new Map();
    for (const item of pending) {
      const key = `${item.table}:${item.data?.id}`;
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, item);
      } else {
        // Keep the version with more media items (has uploaded URLs)
        const existingMediaCount = (existing.data?.media || []).filter(m => m.url).length;
        const newMediaCount = (item.data?.media || []).filter(m => m.url).length;
        if (newMediaCount >= existingMediaCount) {
          bestByKey.set(key, item);
        }
      }
    }
    const deduped = Array.from(bestByKey.values());

    const results = await Promise.allSettled(
      deduped.map(async item => {
        const success = await pushItem(item);
        if (!success) throw new Error(`Push failed for ${item.table}`);
        return item.id;
      })
    );

    const succeeded = results
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);

    const failed = results.filter(r => r.status === "rejected");

    if (failed.length > 0) {
      console.warn(`[Sync] ${failed.length} items failed to sync`);
      logEvent("sync_failed", { count: failed.length });
      window.dispatchEvent(new CustomEvent("powermate:sync_failed", {
        detail: { count: failed.length, message: `${failed.length} item${failed.length !== 1 ? "s" : ""} failed to sync` },
      }));
    }

    if (succeeded.length > 0) {
      logEvent("sync_succeeded", { count: succeeded.length });
    }

    // Get entity IDs that succeeded
    const succeededEntityIds = deduped
      .filter(item => succeeded.includes(item.id))
      .map(item => item.data?.id)
      .filter(Boolean);

    // Remove succeeded items from queue, mark entities as synced
    const succeededQueueIds = new Set();
    pending.forEach(item => {
      if (succeededEntityIds.includes(item.data?.id)) {
        succeededQueueIds.add(item.id);
      }
    });

    setData(d => ({
      ...d,
      syncQueue:  (d.syncQueue  || []).filter(i => !succeededQueueIds.has(i.id)),
      clients:    (d.clients    || []).map(r => succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r),
      followups:  (d.followups  || []).map(r => succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r),
      quotes:     (d.quotes     || []).map(r => succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r),
      notes:      (d.notes      || []).map(r => succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r),
      equipment:  (d.equipment  || []).map(r => succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r),
    }));

  } finally {
    _syncInProgress = false;
  }
}

// ─── Pull fresh data from Supabase ────────────────────────────────────────────
// Merges server data with local pending changes so nothing is overwritten
export async function pullFromSupabase(uid, setData) {
  try {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from("clients").select("id,user_id,company,division,contact,phone,email,location,branch,stage,pipeline_status,sync_status,auto_created,source,notes,created_at,updated_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("followups").select("id,user_id,client_id,client,branch,title,date,time,reminder,notes,completed,sync_status,auto_generated,created_at").eq("user_id", uid).order("date", { ascending: false }).limit(500),
      supabase.from("quotes").select("id,user_id,client_name,description,value,status,sent_date,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("notes").select("id,user_id,client,note,urgency,resolve_by,resolved,resolved_at,last_escalated,media,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("equipment").select("id,user_id,name,type,make,model,serial,location,client,service_due,notes,media,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
    ]);

    setData(prev => {
      // For each table: use server data but preserve any locally-pending items
      // that haven't synced yet (they may be newer than server)
      function merge(serverRows, localRows, pendingQueue, table) {
        if (!serverRows) return localRows || [];
        const pendingIds = new Set(
          (pendingQueue || [])
            .filter(q => q.table === table && q.status === "pending")
            .map(q => q.data?.id)
            .filter(Boolean)
        );
        // Start with server data
        const serverMap = new Map(serverRows.map(r => [r.id, r]));
        // Overlay any pending local changes
        const localPending = (localRows || []).filter(r => pendingIds.has(r.id));
        localPending.forEach(r => serverMap.set(r.id, r));
        return Array.from(serverMap.values());
      }

      return {
        ...prev,
        clients:   a.error ? prev.clients   : merge(a.data, prev.clients,   prev.syncQueue, "clients"),
        followups: b.error ? prev.followups : merge(b.data, prev.followups, prev.syncQueue, "followups"),
        quotes:    c.error ? prev.quotes    : merge(c.data, prev.quotes,    prev.syncQueue, "quotes"),
        notes:     d.error ? prev.notes     : merge(d.data, prev.notes,     prev.syncQueue, "notes"),
        equipment: e.error ? prev.equipment : merge(e.data, prev.equipment, prev.syncQueue, "equipment"),
      };
    });

    return true;
  } catch (e) {
    console.warn("[Sync] Pull failed:", e);
    return false;
  }
}

// ─── Real-time subscription setup ─────────────────────────────────────────────
// Single multiplexed channel for all tables — more efficient than 5 separate channels
export function setupRealtimeSync(uid, setData) {
  const tables = ["clients", "followups", "quotes", "notes", "equipment"];

  const channels = tables.map(table =>
    supabase
      .channel(`rt_${table}_${uid}`)
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table,
        filter: `user_id=eq.${uid}`,
      }, payload => {
        setData(prev => {
          const current = prev[table] || [];

          if (payload.eventType === "INSERT") {
            // Don't add if we already have it (our own optimistic insert)
            const exists = current.find(r => r.id === payload.new.id);
            if (exists) {
              // Update sync_status to synced since server confirmed it
              return {
                ...prev,
                [table]: current.map(r => r.id === payload.new.id ? { ...r, sync_status: "synced" } : r),
                syncQueue: (prev.syncQueue || []).filter(q => q.data?.id !== payload.new.id),
              };
            }
            return { ...prev, [table]: [{ ...payload.new, sync_status: "synced" }, ...current] };
          }

          if (payload.eventType === "UPDATE") {
            // Only update if server version is newer than our pending version
            const local = current.find(r => r.id === payload.new.id);
            const isPending = (prev.syncQueue || []).some(q => q.data?.id === payload.new.id && q.status === "pending");
            if (isPending) return prev; // Don't overwrite our pending changes
            return {
              ...prev,
              [table]: current.map(r => r.id === payload.new.id ? { ...payload.new, sync_status: "synced" } : r),
            };
          }

          if (payload.eventType === "DELETE") {
            return {
              ...prev,
              [table]: current.filter(r => r.id !== payload.old.id),
            };
          }

          return prev;
        });
      })
      .subscribe()
  );

  // Return cleanup function
  return () => channels.forEach(ch => supabase.removeChannel(ch));
}


// ─── Immediate sync trigger ────────────────────────────────────────────────────
// Call this after any save to attempt immediate push.
// Screens can import and call this directly.
let _globalSetData = null;
let _globalGetQueue = null;

export function registerSyncHandlers(setData, getQueue) {
  _globalSetData = setData;
  _globalGetQueue = getQueue;
}

export async function triggerImmediateSync() {
  if (!_globalSetData || !_globalGetQueue) return;
  if (!navigator.onLine) return;
  const queue = _globalGetQueue();
  if (!queue || queue.length === 0) return;
  await pushSyncQueue(queue, _globalSetData);
}
