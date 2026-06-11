// ═══════════════════════════════════════════════════════════════════════════
// sync.js — PowerMate Bulletproof Sync Engine
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "../supabase";
import { logEvent } from "./helpers";
import { offlineSave } from "../offline/offlineDb";

const SYNC_TABLES = ["clients", "followups", "quotes", "notes", "equipment", "contacts"];

export async function pushItem(item) {
  try {
    const table   = item.table;
    let   payload = item.data;

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

export async function saveAndSync(item, table, action, setData, isOnline) {
  await offlineSave(table, item);

  if (isOnline) {
    const success = await pushItem({ table, action, data: item });
    if (success) {
      const synced = { ...item, sync_status: "synced" };
      await offlineSave(table, synced);
      setData(d => ({
        ...d,
        [table]: (d[table] || []).map(r => r.id === item.id ? synced : r),
        syncQueue: (d.syncQueue || []).filter(q => q.data?.id !== item.id),
      }));
      return synced;
    }
  }

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
      ...(d.syncQueue || []).filter(q => q.data?.id !== item.id),
    ],
  }));

  return { ...item, sync_status: "pending" };
}

let _syncInProgress = false;

export async function pushSyncQueue(syncQueue, setData) {
  if (_syncInProgress) return;
  _syncInProgress = true;

  try {
    const pending = (syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;

    const bestByKey = new Map();
    for (const item of pending) {
      const key = `${item.table}:${item.data?.id}`;
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, item);
      } else {
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

    const succeededEntityIds = deduped
      .filter(item => succeeded.includes(item.id))
      .map(item => item.data?.id)
      .filter(Boolean);

    const succeededQueueIds = new Set();
    pending.forEach(item => {
      if (succeededEntityIds.includes(item.data?.id)) {
        succeededQueueIds.add(item.id);
      }
    });

    setData(d => {
      const update = { ...d, syncQueue: (d.syncQueue || []).filter(i => !succeededQueueIds.has(i.id)) };
      SYNC_TABLES.forEach(table => {
        update[table] = (d[table] || []).map(r => succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r);
      });
      return update;
    });

  } finally {
    _syncInProgress = false;
  }
}

export async function pullFromSupabase(uid, setData) {
  try {
    const [a, b, c, d, e, f] = await Promise.all([
      supabase.from("clients").select("id,user_id,company,division,contact,phone,email,location,branch,stage,pipeline_status,sync_status,auto_created,source,notes,created_at,updated_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("followups").select("id,user_id,client_id,client,branch,title,date,time,reminder,notes,completed,sync_status,auto_generated,created_at").eq("user_id", uid).order("date", { ascending: false }).limit(500),
      supabase.from("quotes").select("id,user_id,client_name,description,value,status,sent_date,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("notes").select("id,user_id,client,client_id,note,urgency,resolve_by,resolved,resolved_at,last_escalated,media,linked_contact_ids,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("equipment").select("id,user_id,name,type,make,model,serial,location,client,service_due,notes,media,sync_status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("contacts").select("id,user_id,name,company,title,email,phone,met_at,met_date,notes,card_photo_url,status,client_id,sync_status,created_at,updated_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
    ]);

    setData(prev => {
      function merge(serverRows, localRows, pendingQueue, table) {
        if (!serverRows) return localRows || [];
        const pendingIds = new Set(
          (pendingQueue || [])
            .filter(q => q.table === table && q.status === "pending")
            .map(q => q.data?.id)
            .filter(Boolean)
        );
        const serverMap = new Map(serverRows.map(r => [r.id, r]));
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
        contacts:  f.error ? prev.contacts  : merge(f.data, prev.contacts,  prev.syncQueue, "contacts"),
      };
    });

    return true;
  } catch (e) {
    console.warn("[Sync] Pull failed:", e);
    return false;
  }
}

export function setupRealtimeSync(uid, setData) {
  const channels = SYNC_TABLES.map(table =>
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
            const exists = current.find(r => r.id === payload.new.id);
            if (exists) {
              return {
                ...prev,
                [table]: current.map(r => r.id === payload.new.id ? { ...r, sync_status: "synced" } : r),
                syncQueue: (prev.syncQueue || []).filter(q => q.data?.id !== payload.new.id),
              };
            }
            return { ...prev, [table]: [{ ...payload.new, sync_status: "synced" }, ...current] };
          }

          if (payload.eventType === "UPDATE") {
            const isPending = (prev.syncQueue || []).some(q => q.data?.id === payload.new.id && q.status === "pending");
            if (isPending) return prev;
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

  return () => channels.forEach(ch => supabase.removeChannel(ch));
}

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
