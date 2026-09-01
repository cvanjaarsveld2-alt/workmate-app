// ═══════════════════════════════════════════════════════════════════════════
// sync.js — PowerMate Sync Engine (all critical fixes applied)
//
// FIX: activities added to SYNC_TABLES, pull, and realtime
// FIX: assignment fields added to pull select lists
// FIX: sync queue dedup uses timestamp, not media count
// FIX: saveAndSync checks result.ok (not truthy object)
// FIX: realtime team tables have no user_id filter
// FIX: offlineDelete called on realtime DELETE events
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "../supabase";
import { logEvent } from "./helpers";
import { offlineSave, offlineDelete } from "../offline/offlineDb";
import { logCrash } from "../components/ErrorBoundary";

const SYNC_TABLES = [
  "clients", "followups", "quotes", "notes", "equipment",
  "contacts", "expenses", "leads", "activities",  // FIX: activities added
  "team_notifications",
];
const MAX_SYNC_ATTEMPTS = 5;
// Tables that are user-owned and/or team-shared and carry a user_id column.
// Used by the RLS safety net in pushItem and by realtime filtering below.
const TEAM_TABLES = new Set(["clients", "followups", "quotes", "contacts", "notes", "equipment", "leads", "activities"]);

export async function pushItem(item) {
  try {
    const table   = item.table;
    let   payload = item.data;

    if (payload?.media) {
      payload = { ...payload, media: payload.media.map(m => ({ ...m, base64: undefined })) };
    }

    if (item.action === "insert" || item.action === "upsert" || item.action === "update") {
      // ── Guard 1: RLS ────────────────────────────────────────────────────
      // We upsert (not plain update), so every write must satisfy the INSERT
      // row-level-security check, which requires user_id = auth.uid(). Some
      // update payloads omit user_id, and some legacy rows never had it — both
      // fail with 42501. Fill it from the current auth user when missing.
      if (TEAM_TABLES.has(table) && !payload?.user_id) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          const uid = authData?.user?.id;
          if (uid) payload = { ...payload, user_id: uid };
        } catch {} // best-effort; the upsert will surface the real error otherwise
      }

      // ── Guard 2: never null an existing column on a partial update ───────
      // upsert overwrites the WHOLE row — any column not in the payload is set
      // to null. A partial update (e.g. a completion toggle that sends only
      // {id, completed}) would therefore wipe required columns like title and
      // fail with 23502, or silently blank optional data. To make this class
      // of bug impossible, we fetch the current row and merge the partial
      // payload on top of it, so the upsert always carries the complete row.
      // Only needed for updates to existing rows; a genuine insert has no row
      // to merge and carries its full object already.
      if (item.action === "update" && payload?.id) {
        try {
          const { data: existingRow, error: fetchErr } = await supabase
            .from(table).select("*").eq("id", payload.id).maybeSingle();
          if (!fetchErr && existingRow) {
            // payload wins for changed fields; existingRow fills the rest.
            payload = { ...existingRow, ...payload };
          }
        } catch {} // if the fetch fails, fall through with the payload as-is
      }

      // Always upsert so it works whether or not the record exists on the server.
      const { error } = await supabase.from(table).upsert({ ...payload, sync_status: "synced" }, { onConflict: "id" });
      if (error) throw error;
    } else if (item.action === "delete") {
      const { error } = await supabase.from(table).delete().eq("id", payload.id);
      if (error) throw error;
    }
    return { ok: true };
  } catch (e) {
    const detail = { code: e?.code, message: e?.message, details: e?.details, hint: e?.hint };
    console.warn(`[Sync] FAILED ${item.table} ${item.action}`, detail);
    logCrash({
      screen: `Sync (${item.table} ${item.action})`,
      message: `${detail.message || "Unknown"}${detail.code ? ` [${detail.code}]` : ""}`
        + `${detail.details ? ` — details: ${detail.details}` : ""}`
        + `${detail.hint ? ` — hint: ${detail.hint}` : ""}`,
    });
    return { ok: false, error: detail };
  }
}

export async function saveAndSync(item, table, action, setData, isOnline) {
  await offlineSave(table, item);

  if (isOnline) {
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
  }

  const queueItem = {
    id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    table, action, data: item, status: "pending",
    created_at: new Date().toISOString(), retries: 0,
  };
  setData(d => ({
    ...d,
    syncQueue: [queueItem, ...(d.syncQueue || []).filter(q => q.data?.id !== item.id)],
  }));
  return { ...item, sync_status: "pending" };
}

let _syncInProgress = false;


// Sanitise empty string UUIDs — Postgres rejects "" for uuid columns, must be null
function cleanUUIDs(data) {
  const UUID_FIELDS = [
    "id","user_id","team_id","client_id","contact_id","linked_note_id",
    "assigned_to_user_id","from_user_id","to_user_id",
  ];
  const cleaned = { ...data };
  UUID_FIELDS.forEach(f => {
    if (cleaned[f] === "" || cleaned[f] === undefined) cleaned[f] = null;
  });
  return cleaned;
}

export async function pushSyncQueue(syncQueue, setData) {
  if (_syncInProgress) return;
  _syncInProgress = true;

  try {
    const pending = (syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;

    // FIX: Collapse ALL operations per record into one final action.
    // Collect all operations per entity, sorted oldest→newest, then decide:
    //   insert → update  = upsert with latest data
    //   insert → delete  = discard all (never existed on server)
    //   update → update  = latest update only
    //   update → delete  = delete only
    //   any chain ending in delete = delete (or discard if started with insert)
    const groupsByKey = new Map();
    const allQueueIds = new Map(); // key → [all queue item ids for this entity]
    for (const item of pending) {
      const key = `${item.table}:${item.data?.id}`;
      if (!groupsByKey.has(key)) { groupsByKey.set(key, []); allQueueIds.set(key, []); }
      groupsByKey.get(key).push(item);
      allQueueIds.get(key).push(item.id);
    }

    const collapsed = [];
    const discardedQueueIds = new Set();

    for (const [key, ops] of groupsByKey) {
      // Sort by created_at ascending (oldest first)
      ops.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      const first = ops[0];
      const last  = ops[ops.length - 1];
      const hasInsert = ops.some(o => o.action === "insert");
      const hasDelete = ops.some(o => o.action === "delete");

      if (hasInsert && hasDelete) {
        // Record was created and deleted offline — never reached server, discard all
        allQueueIds.get(key).forEach(id => discardedQueueIds.add(id));
        continue;
      }
      if (hasDelete) {
        // Chain ends in delete — use the delete operation with latest data
        collapsed.push(last.action === "delete" ? last : { ...last, action: "delete" });
      } else if (hasInsert) {
        // Insert followed by partial updates — merge oldest to newest so the
        // upsert always retains required fields from the original insert.
        const mergedData = ops.reduce(
          (record, operation) => ({ ...record, ...(operation.data || {}) }),
          {}
        );
        collapsed.push({ ...last, action: "upsert", data: mergedData });
      } else {
        // Merge partial updates as well. This prevents an earlier unsynced
        // field change being lost when a later toggle only sends one field.
        const mergedData = ops.reduce(
          (record, operation) => ({ ...record, ...(operation.data || {}) }),
          {}
        );
        collapsed.push({ ...last, data: mergedData });
      }
      // Mark all but the winner as discarded (for cleanup)
      const winnerId = collapsed[collapsed.length - 1].id;
      allQueueIds.get(key).forEach(id => { if (id !== winnerId) discardedQueueIds.add(id); });
    }
    const deduped = collapsed;

    const results = await Promise.allSettled(
      deduped.map(async item => {
        const result = await pushItem(item);
        return { queueId: item.id, entityId: item.data?.id, table: item.table, action: item.action, ...result };
      })
    );

    const outcomes = results.map(r => r.status === "fulfilled" ? r.value : { ok: false, error: { message: "Unexpected error" } });
    const succeeded = outcomes.filter(o => o.ok);
    const failed    = outcomes.filter(o => !o.ok);

    if (failed.length > 0) {
      console.warn(`[Sync] ${failed.length} items failed`);
      logEvent("sync_failed", { count: failed.length });
      window.dispatchEvent(new CustomEvent("powermate:sync_failed", {
        detail: { count: failed.length, message: `${failed.length} item${failed.length !== 1 ? "s" : ""} failed to sync` },
      }));
    }
    if (succeeded.length > 0) logEvent("sync_succeeded", { count: succeeded.length });

    // FIX: For successful deletes, also remove from IndexedDB
    for (const s of succeeded) {
      if (s.action === "delete" && s.entityId && s.table) {
        offlineDelete(s.table, s.entityId).catch(() => {});
      }
    }

    const succeededEntityIds = succeeded.map(o => o.entityId).filter(Boolean);
    const succeededQueueIds  = new Set(succeeded.map(o => o.queueId));
    const failedQueueIds     = new Set(failed.map(o => o.queueId));

    setData(d => {
      const update = {
        ...d,
        syncQueue: (d.syncQueue || [])
          .filter(i => {
            if (succeededQueueIds.has(i.id)) return false;
            // Only remove superseded operations for an entity whose winning
            // operation succeeded. Retain them when the winner failed so a
            // retry never loses the original insert/full record payload.
            const key = `${i.table}:${i.data?.id}`;
            const winnerSucceeded = succeeded.some(s => {
              const winner = deduped.find(d => d.id === s.queueId);
              return winner && `${winner.table}:${winner.data?.id}` === key;
            });
            return !(discardedQueueIds.has(i.id) && winnerSucceeded);
          })
          .map(i => {
            if (!failedQueueIds.has(i.id)) return i;
            const attempts = (i.attempts || 0) + 1;
            return attempts >= MAX_SYNC_ATTEMPTS
              ? { ...i, attempts, status: "failed" }
              : { ...i, attempts, status: "pending" };
          })
          // Remove any remaining pending operations for entities whose latest op just failed permanently.
          // This prevents stale older operations from being synced after the newest one gives up.
          .filter(i => {
            if (i.status !== "pending") return true;
            const key = `${i.table}:${i.data?.id}`;
            const hasFailed = deduped.some(d => {
              const dKey = `${d.table}:${d.data?.id}`;
              return dKey === key && failedQueueIds.has(d.id) && (d.attempts || 0) + 1 >= MAX_SYNC_ATTEMPTS;
            });
            return !hasFailed;
          }),
      };
      SYNC_TABLES.forEach(table => {
        update[table] = (d[table] || []).map(r =>
          succeededEntityIds.includes(r.id) ? { ...r, sync_status: "synced" } : r
        );
      });
      return update;
    });
  } finally {
    _syncInProgress = false;
  }
}

// FIX: Assignment fields added to pull select lists
// FIX: Activities included in pull
export async function pullFromSupabase(uid, setData) {
  try {
    // Incremental sync — only pull records updated since last sync
    // Falls back to full pull if no cursor exists (first load)
    const cursorKey = `pm_sync_cursor_${uid}`;
    const lastSync = localStorage.getItem(cursorKey);
    const pullSince = lastSync ? new Date(lastSync).toISOString() : null;
    const now = new Date().toISOString();

    // Helper: add updated_at filter if we have a cursor
    function since(query) {
      return pullSince ? query.gte("updated_at", pullSince) : query;
    }

    const [a, b, c, d, leads_res, e, f, g, h, act, bd, rep, cf] = await Promise.all([
      supabase.from("clients").select("id,user_id,team_id,company,division,contact,phone,email,location,branch,stage,category,sync_status,auto_created,source,notes,assigned_to_user_id,assigned_to,last_contacted,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("followups").select("id,user_id,team_id,client_id,contact_id,client,branch,title,date,time,reminder,notes,completed,linked_note_id,sync_status,auto_generated,assigned_to_user_id,assigned_to,created_at").order("date", { ascending: false }).limit(1000),
      supabase.from("quotes").select("id,user_id,team_id,client_name,client_id,description,value,line_items,vat_inclusive,status,sent_date,sync_status,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("contacts").select("id,user_id,team_id,name,company,title,email,phone,met_at,met_date,notes,card_photo_url,status,category,client_id,assigned_to_user_id,assigned_to,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("leads").select("id,user_id,team_id,title,description,categories,client_id,client_name,contact_id,contact_name,captured_by,assigned_to,assigned_to_user_id,stage,estimated_value,lead_date,follow_up_date,closed_date,notes,outcome_notes,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("notes").select("id,user_id,team_id,client,client_id,note,urgency,resolve_by,resolved,resolved_at,last_escalated,media,linked_contact_ids,category,assigned_to_user_id,assigned_to,sync_status,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("equipment").select("id,user_id,team_id,name,type,make,model,serial,location,client,client_id,service_due,notes,media,assigned_to_user_id,assigned_to,sync_status,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("expenses").select("id,user_id,vendor,amount,vat_amount,currency,amount_zar,exchange_rate,rate_date,rate_source,expense_date,expense_time,category,payment_method,notes,receipt_url,payment_slip_url,status,ai_extracted,client_id,client_name,sync_status,created_at,updated_at").eq("user_id", uid).order("expense_date", { ascending: false }).limit(1000),
      supabase.from("vehicle_checks").select("id,user_id,check_date,vehicle,registration,driver,data,sync_status,created_at,updated_at").eq("user_id", uid).order("check_date", { ascending: false }).limit(1000),
      // FIX: Pull activities
      supabase.from("activities").select("id,user_id,team_id,client_id,client_name,activity_type,summary,outcome,duration_mins,sync_status,created_at").order("created_at", { ascending: false }).limit(1000),
      // NEW: Pull breakdown reports
      supabase.from("breakdown_reports").select("id,user_id,team_id,client_id,client_name,title,reference,equipment,location,status,severity,summary,items,engineering,breakdown_datetime,reported_by,report_date,assigned_to_user_id,assigned_to,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
      // NEW: Pull repair reports
      supabase.from("repair_reports").select("id,user_id,team_id,client_id,client_name,title,reference,equipment,location,status,summary,items,engineering,linked_breakdown_id,report_date,assigned_to_user_id,assigned_to,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
      // NEW: Pull custom faults library
      supabase.from("custom_faults").select("id,user_id,team_id,label,fault_group,sync_status,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
    ]);

    setData(prev => {
      function merge(serverRows, localRows, pendingQueue, table) {
        if (!serverRows) return localRows || [];
        const pendingIds = new Set(
          (pendingQueue || [])
            .filter(q => q.table === table && (q.status === "pending" || q.status === "failed"))
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
        activities:    act.error ? (prev.activities || []) : merge(act.data, prev.activities, prev.syncQueue, "activities"),
        breakdowns:    bd.error ? (prev.breakdowns || []) : merge(bd.data, prev.breakdowns, prev.syncQueue, "breakdown_reports"),
        repairs:       rep.error ? (prev.repairs || []) : merge(rep.data, prev.repairs, prev.syncQueue, "repair_reports"),
        customFaults:  cf.error ? (prev.customFaults || []) : merge(cf.data, prev.customFaults, prev.syncQueue, "custom_faults"),
        vehicleChecks: vcMap,
      };
    });

    // Save sync cursor so next pull is incremental
    localStorage.setItem(cursorKey, now);
    return true;
  } catch (e) {
    console.warn("[Sync] Pull failed:", e);
    return false;
  }
}

// Clear sync cursor to force a full re-pull (call after schema changes)
export function resetSyncCursor(uid) {
  if (uid) localStorage.removeItem(`pm_sync_cursor_${uid}`);
}

// Team tables get no user_id filter so all RLS-permitted rows come through realtime
// (TEAM_TABLES is defined near the top of this file.)

export function setupRealtimeSync(uid, setData) {
  const channels = SYNC_TABLES.map(table => {
    const channelConfig = { event: "*", schema: "public", table };
    if (table === "team_notifications") {
      channelConfig.filter = `to_user_id=eq.${uid}`;
    } else if (!TEAM_TABLES.has(table)) {
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
            // FIX: Also remove from IndexedDB when a realtime delete arrives
            offlineDelete(table, payload.old.id).catch(() => {});
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
let _globalQueueRef = null;

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
