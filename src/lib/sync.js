// ═══════════════════════════════════════════════════════════════════════════
// sync.js — PowerMate Bulletproof Sync Engine
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "../supabase";
import { logEvent } from "./helpers";
import { offlineSave } from "../offline/offlineDb";
import { logCrash } from "../components/ErrorBoundary";

const SYNC_TABLES = ["clients", "followups", "quotes", "notes", "equipment", "contacts", "expenses", "leads", "team_notifications"];
const MAX_SYNC_ATTEMPTS = 5;

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
    return { ok: true };
  } catch (e) {
    const detail = {
      code: e?.code, message: e?.message, details: e?.details, hint: e?.hint,
    };
    console.warn(`[Sync] FAILED ${item.table} ${item.action}`, detail, "\n  payload:", item.data);
    logCrash({
      screen: `Sync (${item.table} ${item.action})`,
      message: `${detail.message || "Unknown error"}${detail.code ? ` [${detail.code}]` : ""}${detail.hint ? ` — hint: ${detail.hint}` : ""}`,
    });
    return { ok: false, error: detail };
  }
}

export async function saveAndSync(item, table, action, setData, isOnline) {
  await offlineSave(table, item);

  if (isOnline) {
    // FIX #2 — pushItem returns {ok: boolean}, not a boolean.
    // The previous `if (success)` was always truthy even on failure because
    // JS objects are always truthy. This meant failed syncs were silently
    // discarded: the record was marked "synced" and removed from the queue.
    const result = await pushItem({ table, action, data: item });
    if (result.ok) {
      const synced = { ...item, sync_status: "synced" };
      await offlineSave(table, synced);
      setData(d => ({
        ...d,
        [table]: (d[table] || []).map(r => r.id === item.id ? synced : r),
        syncQueue: (d.syncQueue || []).filter(q => q.data?.id !== item.id),
      }));
      return synced;
    }
    // Fall through to queue the item for retry
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
        const result = await pushItem(item);
        return { queueId: item.id, entityId: item.data?.id, ...result };
      })
    );

    const outcomes = results.map(r => r.status === "fulfilled" ? r.value : { ok: false, error: { message: "Unexpected error" } });

    const succeeded = outcomes.filter(o => o.ok);
    const failed    = outcomes.filter(o => !o.ok);

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

    const succeededEntityIds = succeeded.map(o => o.entityId).filter(Boolean);
    const succeededQueueIds  = new Set(succeeded.map(o => o.queueId));
    const failedQueueIds     = new Set(failed.map(o => o.queueId));

    setData(d => {
      const update = {
        ...d,
        syncQueue: (d.syncQueue || [])
          .filter(i => !succeededQueueIds.has(i.id))
          .map(i => {
            if (!failedQueueIds.has(i.id)) return i;
            const attempts = (i.attempts || 0) + 1;
            return attempts >= MAX_SYNC_ATTEMPTS
              ? { ...i, attempts, status: "failed" }
              : { ...i, attempts, status: "pending" };
          }),
      };
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
    const [a, b, c, d, leads_res, e, f, g, h] = await Promise.all([
      supabase.from("clients").select("id,user_id,team_id,company,division,contact,phone,email,location,branch,stage,sync_status,auto_created,source,notes,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("followups").select("id,user_id,team_id,client_id,client,branch,title,date,time,reminder,notes,completed,linked_note_id,sync_status,auto_generated,created_at").order("date", { ascending: false }).limit(500),
      supabase.from("quotes").select("id,user_id,team_id,client_name,description,value,status,sent_date,sync_status,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("contacts").select("id,user_id,team_id,name,company,title,email,phone,met_at,met_date,notes,card_photo_url,status,client_id,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("leads").select("id,user_id,team_id,title,description,categories,client_id,client_name,contact_id,contact_name,captured_by,assigned_to,stage,estimated_value,lead_date,follow_up_date,closed_date,notes,outcome_notes,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("notes").select("id,user_id,team_id,client,client_id,note,urgency,resolve_by,resolved,resolved_at,last_escalated,media,linked_contact_ids,sync_status,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("equipment").select("id,user_id,team_id,name,type,make,model,serial,location,client,service_due,notes,media,sync_status,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("expenses").select("id,user_id,vendor,amount,vat_amount,currency,amount_zar,exchange_rate,rate_date,rate_source,expense_date,expense_time,category,payment_method,notes,receipt_url,payment_slip_url,status,ai_extracted,sync_status,created_at,updated_at").eq("user_id", uid).order("expense_date", { ascending: false }).limit(500),
      supabase.from("vehicle_checks").select("id,user_id,check_date,vehicle,registration,driver,data,sync_status,created_at,updated_at").eq("user_id", uid).order("check_date", { ascending: false }).limit(365),
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

      const vcRows = h.error ? null : (h.data || []);
      const vcMap  = vcRows
        ? vcRows.reduce((acc, row) => {
            try { acc[row.check_date] = typeof row.data === "string" ? JSON.parse(row.data) : row.data; }
            catch { acc[row.check_date] = row.data || {}; }
            return acc;
          }, {})
        : prev.vehicleChecks;

      return {
        ...prev,
        clients:       a.error ? prev.clients       : merge(a.data, prev.clients,       prev.syncQueue, "clients"),
        followups:     b.error ? prev.followups     : merge(b.data, prev.followups,     prev.syncQueue, "followups"),
        quotes:        c.error ? prev.quotes        : merge(c.data, prev.quotes,        prev.syncQueue, "quotes"),
        contacts:      d.error ? prev.contacts      : merge(d.data, prev.contacts,      prev.syncQueue, "contacts"),
        leads:         leads_res.error ? prev.leads : merge(leads_res.data, prev.leads, prev.syncQueue, "leads"),
        notes:         e.error ? prev.notes         : merge(e.data, prev.notes,         prev.syncQueue, "notes"),
        equipment:     f.error ? prev.equipment     : merge(f.data, prev.equipment,     prev.syncQueue, "equipment"),
        expenses:      g.error ? prev.expenses      : merge(g.data, prev.expenses,      prev.syncQueue, "expenses"),
        vehicleChecks: vcMap,
      };
    });

    return true;
  } catch (e) {
    console.warn("[Sync] Pull failed:", e);
    return false;
  }
}

// FIX #12 — Team tables: remove user_id filter so realtime events from other
// team members are also received. RLS on Supabase ensures only permitted rows
// are returned; the filter here was over-restricting the realtime stream.
const TEAM_TABLES = new Set(["clients", "followups", "quotes", "contacts", "notes", "equipment", "leads"]);

export function setupRealtimeSync(uid, setData) {
  const channels = SYNC_TABLES.map(table => {
    const channelConfig = {
      event:  "*",
      schema: "public",
      table,
    };
    // Private tables stay filtered to the current user; shared tables receive
    // all RLS-permitted rows so team members' changes propagate immediately.
    if (!TEAM_TABLES.has(table)) {
      channelConfig.filter = `user_id=eq.${uid}`;
    }

    return supabase
      .channel(`rt_${table}_${uid}`)
      .on("postgres_changes", channelConfig, payload => {
        setData(prev => {
          const dataKey = table === "team_notifications" ? "teamNotifications" : table;
          const current = prev[dataKey] || [];

          if (payload.eventType === "INSERT") {
            const exists = current.find(r => r.id === payload.new.id);
            if (exists) {
              return {
                ...prev,
                [dataKey]: current.map(r => r.id === payload.new.id ? { ...r, sync_status: "synced" } : r),
                syncQueue: (prev.syncQueue || []).filter(q => q.data?.id !== payload.new.id),
              };
            }
            return { ...prev, [dataKey]: [{ ...payload.new, sync_status: "synced" }, ...current] };
          }

          if (payload.eventType === "UPDATE") {
            const isPending = (prev.syncQueue || []).some(q => q.data?.id === payload.new.id && q.status === "pending");
            if (isPending) return prev;
            return {
              ...prev,
              [dataKey]: current.map(r => r.id === payload.new.id ? { ...payload.new, sync_status: "synced" } : r),
            };
          }

          if (payload.eventType === "DELETE") {
            return {
              ...prev,
              [dataKey]: current.filter(r => r.id !== payload.old.id),
            };
          }

          return prev;
        });
      })
      .subscribe();
  });

  return () => channels.forEach(ch => supabase.removeChannel(ch));
}

let _globalSetData = null;
let _globalQueueRef = null; // FIX #11 — use a ref object, not a closure rebuilt every render

export function registerSyncHandlers(setData, queueRef) {
  _globalSetData  = setData;
  _globalQueueRef = queueRef;
}

export async function triggerImmediateSync() {
  if (!_globalSetData || !_globalQueueRef) return;
  if (!navigator.onLine) return;
  const queue = _globalQueueRef.current;
  if (!queue || queue.length === 0) return;
  await pushSyncQueue(queue, _globalSetData);
}
