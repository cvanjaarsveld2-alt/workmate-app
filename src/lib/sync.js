// ─── PowerMate Sync Engine ───────────────────────────────────────────────────
// Durable offline queue + dependency-safe reconciliation + realtime protection.
import { supabase } from "../supabase";
import { logEvent, uploadPhotoToSupabaseWithPath, genId } from "./helpers";
import { offlineSave, offlineDelete, offlineGetAll, offlineReplaceAll } from "../offline/offlineDb";
import { logCrash } from "../components/ErrorBoundary";

const SYNC_TABLES=["clients","followups","quotes","contacts","notes","equipment","expenses","leads","vehicle_checks","activities","breakdown_reports","repair_reports","custom_faults","service_reports","team_notifications","jobs","invoices","payments","email_quotes"];
const TEAM_TABLES=new Set(["clients","followups","quotes","contacts","notes","equipment","leads","activities","breakdown_reports","repair_reports","custom_faults","service_reports","jobs","invoices","payments"]);
const LOCAL_STORE={breakdown_reports:"breakdowns",repair_reports:"repairs",custom_faults:"customFaults",service_reports:"serviceReports",team_notifications:"teamNotifications"};
const localStoreName=table=>LOCAL_STORE[table]||table;
const MAX_SYNC_ATTEMPTS=8,PAGE_SIZE=1000,RECONCILE_MS=30000;
// _syncInProgress is a simple mutex so two overlapping sync passes never race each other.
// _syncRerunRequested remembers that *something* asked for another pass while one was
// already running — without it, a save that lands mid-sync would silently be dropped
// until the next unrelated trigger (or the 30s reconcile) happened to pick it up.
let _syncInProgress=false,_syncRerunRequested=false,_globalSetData=null,_globalQueueRef=null;

const REMOTE_EXCLUDED_FIELDS={quotes:new Set(["contact_id","from_user_id","to_user_id","job_id","invoice_id"]),followups:new Set(["invoice_id","job_id"]),expenses:new Set(["assigned_to_user_id","contact_id"])};
const DEPENDENCIES={followups:[{field:"quote_id",pending:"sync_pending_quote_id",table:"quotes"},{field:"client_id",pending:"sync_pending_client_id",table:"clients"},{field:"linked_note_id",pending:"sync_pending_note_id",table:"notes"},{field:"team_id",pending:"sync_pending_team_id",table:"teams"}],jobs:[{field:"quote_id",pending:"sync_pending_quote_id",table:"quotes"},{field:"client_id",pending:"sync_pending_client_id",table:"clients"}],invoices:[{field:"quote_id",pending:"sync_pending_quote_id",table:"quotes"},{field:"job_id",pending:"sync_pending_job_id",table:"jobs"},{field:"client_id",pending:"sync_pending_client_id",table:"clients"}],payments:[{field:"invoice_id",pending:"sync_pending_invoice_id",table:"invoices"}]};
const SYNC_PRIORITY={clients:10,quotes:20,contacts:30,notes:30,equipment:30,expenses:30,leads:30,vehicle_checks:30,activities:30,breakdown_reports:30,repair_reports:30,custom_faults:30,service_reports:30,team_notifications:30,email_quotes:35,followups:40,jobs:50,invoices:60,payments:70};
function sanitizeRemotePayload(table,data){const out={...(data||{})};for(const field of REMOTE_EXCLUDED_FIELDS[table]||[])delete out[field];return out;}
function cleanUUIDs(data){const fields=["id","user_id","team_id","client_id","contact_id","linked_note_id","linked_breakdown_id","assigned_to_user_id","from_user_id","to_user_id","quote_id","job_id","invoice_id","sync_pending_quote_id","sync_pending_job_id","sync_pending_client_id","sync_pending_note_id","sync_pending_team_id","sync_pending_invoice_id"];const out={...(data||{})};fields.forEach(f=>{if(out[f]===""||out[f]===undefined)out[f]=null;});return out;}
function cleanNumerics(data){const out={...(data||{})};["estimated_value","value","amount","amount_zar","quote_value","vat_amount","exchange_rate","duration_mins","subtotal","vat","total","amount_paid","balance_due","extracted_amount"].forEach(f=>{if(!(f in out))return;const v=out[f];if(v===""||v===undefined)out[f]=null;else if(v!==null&&typeof v==="string"&&Number.isNaN(Number.parseFloat(v)))out[f]=null;});return out;}
const ARRAY_CONFLICT_FIELDS={jobs:["photos","parts_used"],breakdown_reports:["items"],repair_reports:["items"]};
function arraysDiffer(a,b){try{return JSON.stringify(a??[])!==JSON.stringify(b??[]);}catch{return true;}}
function assertNoStaleArrayOverwrite(table,existing,incoming){
  const fields=ARRAY_CONFLICT_FIELDS[table]||[];
  for(const field of fields){
    if(!Array.isArray(existing?.[field])||!Array.isArray(incoming?.[field]))continue;
    if(arraysDiffer(existing[field],incoming[field])){
      const error=new Error("This "+table.replaceAll("_"," ")+" was changed on another device while this device was offline. The newer server array was not overwritten.");
      error.code="PWR_ARRAY_CONFLICT";
      error.details="Conflict in "+table+"."+field;
      throw error;
    }
  }
}
function normalizeVehicleCheckPayload(data){const source=data||{};const out={id:source.id,user_id:source.user_id,check_date:source.check_date,vehicle:source.vehicle??null,registration:source.registration??null,driver:source.driver??null,data:source.data??{},sync_status:source.sync_status??"pending",updated_at:source.updated_at??new Date().toISOString()};if(typeof out.data==="string"){try{out.data=JSON.parse(out.data);}catch{out.data={};}}if(!out.id)throw new Error("vehicle_checks record is missing id");if(!out.check_date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(out.check_date)))throw new Error("vehicle_checks record has an invalid check_date");return out;}
// Postgres/Postgrest columns should never receive a raw base64 data: URI — a photo
// that never made it to Storage has no business being smuggled into a text column as
// a "url". This is the last line of defence: anywhere in the payload, a data: URI
// gets removed rather than shipped to the database (the real fix is uploading it,
// which retryPendingMedia below does — this just guarantees we never leak or bloat
// a row if that upload hasn't happened yet).
function stripEmbeddedBase64(value,depth=0){
  if(depth>6||value==null)return value;
  if(typeof value==="string")return value.startsWith("data:")?null:value;
  if(Array.isArray(value))return value.map(v=>stripEmbeddedBase64(v,depth+1));
  if(typeof value==="object"){
    const out={};
    for(const k of Object.keys(value)){if(k==="base64")continue;out[k]=stripEmbeddedBase64(value[k],depth+1);}
    return out;
  }
  return value;
}
// ─── Phase G: schema-mismatch handling ─────────────────────────────────────
// PREVIOUSLY: on PGRST204 ("column not found in schema cache") this silently
// dropped the offending field and retried, then reported the sync as a plain
// success once the reduced payload went through. That is a real, permanent
// data-loss bug dressed up as "Saved": the record's sync_status was set to
// "synced" and the queue item was removed, so the dropped field's value was
// gone for good — even in the common case where the "mismatch" was just
// PostgREST's schema cache being a few seconds stale after a migration and
// would have resolved itself on the very next retry.
//
// FIXED: no more silent drop-and-retry. A PGRST204 is thrown as-is (never
// swallowed), which pushItem classifies as SCHEMA_ERROR. That keeps the
// queue item "pending" with the FULL original payload intact — if the
// mismatch was transient schema-cache lag, the next normal retry (seconds
// later, via the existing backoff) sends every field and self-heals with
// zero data loss. If the column genuinely doesn't exist (a real code/schema
// drift bug), retries keep failing identically and the item is surfaced as
// "failed" with the real column name in the diagnostic after the normal
// attempt budget — visibly wrong rather than silently "Saved".
async function upsertWithSchemaRecovery(table,payload){
  const{error}=await supabase.from(table).upsert(payload,{onConflict:"id"});
  if(error)throw error;
}

// ─── Phase F: unique-constraint races, through the REAL app path ──────────
// jobInvoiceAutomation.js already treats a losing 23505 race as success on its
// direct (non-queue) call path, but every real screen (JobsScreen.jsx) saves
// through saveAndSync -> pushItem -> pushOne, which never went through that
// code at all — a losing race there just retried the identical payload
// against jobs_quote_id_uidx / invoices_job_id_uidx forever (now: until
// classifySyncError's PERMANENT_CODES/UNIQUE_CONSTRAINT budget runs out),
// because a unique-constraint violation isn't transient — it fails the exact
// same way every time. This is the one piece of "the row I'm trying to
// create already exists" that DOES need bespoke handling per constraint,
// wired in here so it applies no matter which code path triggered the sync.
const IDEMPOTENT_UNIQUE_RECOVERY={
  jobs_quote_id_uidx:{table:"jobs",lookup:p=>({quote_id:p.quote_id})},
  invoices_job_id_uidx:{table:"invoices",lookup:p=>({job_id:p.job_id})},
  payments_idempotency_key_uidx:{table:"payments",lookup:p=>({idempotency_key:p.idempotency_key})},
};
// job_number/invoice_number are generated client-side from Date.now() — collision-
// resistant, not collision-proof. A genuine collision here isn't "this record
// already exists", it's "pick a different number" — so this regenerates once and
// retries, rather than surfacing a confusing permanent failure for something the
// user never needs to know happened.
const NUMBER_REGEN={
  jobs_job_number_scope_uidx:{table:"jobs",field:"job_number",prefix:"JOB"},
  invoices_invoice_number_scope_uidx:{table:"invoices",field:"invoice_number",prefix:"INV"},
};
function regenerateNumber(prefix){const year=new Date().getFullYear();return`${prefix}-${year}-${String(Date.now()).slice(-6)}${Math.floor(Math.random()*10)}`;}
async function upsertWithIdempotentRecovery(table,payload){
  try{
    await upsertWithSchemaRecovery(table,payload);
    return{duplicate:false};
  }catch(error){
    if(error?.code!=="23505")throw error;
    const constraint=String(error.message||"").match(/violates unique constraint "([^"]+)"/)?.[1];
    const recovery=constraint&&IDEMPOTENT_UNIQUE_RECOVERY[constraint];
    if(recovery&&recovery.table===table){
      let query=supabase.from(table).select("*");
      for(const[col,val]of Object.entries(recovery.lookup(payload)))query=query.eq(col,val);
      const{data,error:lookupError}=await query.maybeSingle();
      // The constraint fired, so a matching row provably exists — if we can't read it
      // back (e.g. an RLS edge case), surface the ORIGINAL violation rather than
      // silently pretending nothing happened.
      if(!lookupError&&data)return{duplicate:true,canonical:data};
      throw error;
    }
    const regen=constraint&&NUMBER_REGEN[constraint];
    if(regen&&regen.table===table){
      await upsertWithSchemaRecovery(table,{...payload,[regen.field]:regenerateNumber(regen.prefix)});
      return{duplicate:false};
    }
    // An unrecognized unique violation is a real, permanent conflict we don't have a
    // specific recovery for — surface it as-is (classifySyncError marks 23505 as
    // non-retryable, so this fails fast instead of burning the retry budget).
    throw error;
  }
}
async function stageMissingDependencies(table,payload){const deps=DEPENDENCIES[table]||[];if(!deps.length)return payload;let out={...payload};for(const dep of deps){const id=out[dep.field];if(!id||out[dep.pending])continue;const{data,error}=await supabase.from(dep.table).select("id").eq("id",id).maybeSingle();if(!error&&data)continue;if(dep.pending in out){out[dep.pending]=id;out[dep.field]=null;}}return out;}
async function pushOne(table,action,rawData){let payload=sanitizeRemotePayload(table,cleanNumerics(cleanUUIDs(rawData)));if(table==="vehicle_checks")payload=normalizeVehicleCheckPayload(payload);if(payload.media)payload={...payload,media:payload.media.map(m=>({...m,base64:undefined}))};payload=stripEmbeddedBase64(payload);if(["insert","upsert","update"].includes(action)){if(table==="vehicle_checks"){const{data:authData,error:authError}=await supabase.auth.getUser();if(authError)throw authError;if(authData?.user?.id)payload.user_id=authData.user.id;else throw new Error("Cannot sync vehicle check without an authenticated user");}else if(TEAM_TABLES.has(table)&&!payload.user_id){const{data:authData}=await supabase.auth.getUser();if(authData?.user?.id)payload.user_id=authData.user.id;}if(action==="update"&&payload.id){const{data:existing,error:existingError}=await supabase.from(table).select("*").eq("id",payload.id).maybeSingle();if(!existingError&&existing){assertNoStaleArrayOverwrite(table,existing,payload);payload={...existing,...payload};}}payload=sanitizeRemotePayload(table,cleanNumerics(cleanUUIDs(payload)));if(table==="vehicle_checks")payload=normalizeVehicleCheckPayload(payload);payload=await stageMissingDependencies(table,payload);return await upsertWithIdempotentRecovery(table,{...payload,sync_status:"synced"});}if(action==="delete"){const{error}=await supabase.from(table).delete().eq("id",payload.id);if(error)throw error;return;}throw new Error(`Unknown sync action: ${action}`);}
// A failure with no Postgrest/Postgres error code is almost always the network itself
// (offline, DNS hiccup, request timeout) rather than the server rejecting the data.
// Those should never count against a record's limited retry budget — a technician
// out of signal for an hour shouldn't come back to permanently "failed" records.
function isNetworkFailure(error){if(error?.code)return false;const msg=String(error?.message||"").toLowerCase();return!msg||/fetch|network|timeout|offline|connection/.test(msg);}

import { classifySyncError } from "./syncError.js";

export async function pushItem(item){try{const table=item?.table;if(!table||!item?.data)throw new Error("Invalid sync item");const result=await pushOne(table,item.action,item.data);return{ok:true,duplicate:!!result?.duplicate,canonical:result?.canonical||null};}catch(error){const detail={code:error?.code,message:error?.message||"Unknown sync error",details:error?.details,hint:error?.hint};const classification=classifySyncError(error);detail.syncErrorCode=classification.code;console.warn(`[Sync] FAILED ${item?.table} ${item?.action}`,detail);if(classification.code!=="NETWORK_ERROR"){try{logCrash({screen:`Sync (${item?.table} ${item?.action})`,message:`[${classification.code}] ${detail.message}${detail.code?` (${detail.code})`:""}${detail.details?` — ${detail.details}`:""}`});}catch{}}return{ok:false,error:detail,networkError:classification.code==="NETWORK_ERROR",classification};}}
async function persistQueue(queue){await offlineReplaceAll("syncQueue",queue);}
// Phase I: offlineSave below now throws instead of silently swallowing an IndexedDB
// failure (see offlineDb.js). That is intentional and NOT caught here: previously,
// even if this very first local write failed, saveAndSync carried on as if it had
// succeeded and every caller went on to show the user "Saved" / "saved offline and
// queued for sync" regardless. Now, a genuine local-write failure propagates as a
// rejected promise instead — callers that don't already wrap saveAndSync in a
// try/catch will surface a visible error (or, at minimum, stop short of the
// misleading "Saved" message) rather than silently lying about what happened.
function applyLocalRecord(current, local, item) {
  // Keep React state in lockstep with the durable local write. This makes
  // saveAndSync safe for new records as well as updates; callers no longer
  // need to hand-build syncQueue entries or remember to insert into state.
  if (local === "vehicleChecks") {
    const date = item?.check_date;
    if (!date) return current;
    return {
      ...current,
      vehicleChecks: { ...(current.vehicleChecks || {}), [date]: item.data ?? item },
    };
  }
  const rows = Array.isArray(current[local]) ? current[local] : [];
  const index = rows.findIndex(row => row?.id === item?.id);
  const next = index >= 0
    ? rows.map((row, i) => i === index ? item : row)
    : [item, ...rows];
  return { ...current, [local]: next };
}

export async function saveAndSync(item, table, action, setData, isOnline) {
  const local = localStoreName(table);
  const now = new Date().toISOString();
  const queueItem = {
    id: newQueueId(),
    table,
    action,
    data: item,
    status: "pending",
    created_at: now,
    attempts: 0,
    next_attempt_at: null,
  };

  // Durable local-first write. Do this before touching React state so a failed
  // IndexedDB write can never look like a successful save.
  await offlineSave(local, { ...item, sync_status: "pending" });

  // The queue is also durable before we publish the state change. A crash
  // between these operations therefore cannot lose the sync intent.
  await offlineSave("syncQueue", queueItem);

  setData(current => ({
    ...applyLocalRecord(current, local, { ...item, sync_status: "pending" }),
    syncQueue: [
      queueItem,
      ...(current.syncQueue || []).filter(q => !(q.table === table && q.data?.id === item?.id)),
    ],
  }));

  if (!isOnline) return { ...item, sync_status: "pending" };

  const result = await pushItem({ table, action, data: item });
  if (!result.ok) return { ...item, sync_status: "pending" };

  // A unique-constraint race can return the canonical server row. Reconcile
  // to that row rather than leaving an orphan client-generated record locally.
  const canonical = result.duplicate && result.canonical ? result.canonical : { ...item, sync_status: "synced" };
  const synced = { ...canonical, sync_status: "synced" };

  if (result.duplicate && canonical.id && canonical.id !== item.id) {
    await offlineDelete(local, item.id);
  }
  await offlineSave(local, synced);
  await offlineReplaceAll(
    "syncQueue",
    (await offlineGetAll("syncQueue")).filter(q => !(q.table === table && q.data?.id === item.id)),
  );

  setData(current => ({
    ...applyLocalRecord(current, local, synced),
    ...(result.duplicate && canonical.id !== item.id && local !== "vehicleChecks" && {
      [local]: (current[local] || []).filter(row => row.id !== item.id),
    }),
    syncQueue: (current.syncQueue || []).filter(q => !(q.table === table && q.data?.id === item.id)),
  }));

  return synced;
}
function collapseQueue(queue){const groups=new Map();for(const item of queue){const key=`${item.table}:${item.data?.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}const winners=[],discarded=new Set();for(const[,ops]of groups){ops.sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));const last=ops[ops.length-1],hasInsert=ops.some(op=>op.action==="insert"),hasDelete=ops.some(op=>op.action==="delete");if(hasInsert&&hasDelete){ops.forEach(op=>discarded.add(op.id));continue;}if(hasDelete)winners.push({...last,action:"delete"});else winners.push({...last,action:hasInsert?"upsert":"update",data:ops.reduce((record,op)=>({...record,...(op.data||{})}),{})});const winner=winners[winners.length-1];ops.forEach(op=>{if(op.id!==winner.id)discarded.add(op.id);});}return{winners,discarded};}
function sortSyncItems(items){return[...items].sort((a,b)=>{const pa=SYNC_PRIORITY[a.table]??100,pb=SYNC_PRIORITY[b.table]??100;if(pa!==pb)return pa-pb;return new Date(a.created_at||0)-new Date(b.created_at||0);});}
function dependencyReady(item,queue){const deps=DEPENDENCIES[item.table]||[];for(const dep of deps){const id=item.data?.[dep.field];if(!id)continue;const parentQueued=queue.some(q=>q.status==="pending"&&q.table===dep.table&&q.data?.id===id&&q.action!=="delete");if(parentQueued)return false;}return true;}
function backoffMs(attempts){return Math.min(60000,1000*Math.pow(2,Math.max(0,attempts-1))+Math.floor(Math.random()*750));}
function newQueueId(){return`sq_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;}
// Once a parent record (client/quote/job/invoice) exhausts its retries and is marked
// "failed", dependencyReady() stops blocking its children — otherwise a permanently
// broken parent would freeze every record under it forever. That means a child can get
// pushed with its foreign key stripped out (stageMissingDependencies stashes the real id
// under sync_pending_*). Nothing ever put that id back — until now: whenever a sync pass
// succeeds, this checks every staged sync_pending_* value against the server, and as soon
// as the parent genuinely exists there, restores the real link and re-queues the child so
// the correction actually reaches Supabase. Without this, that foreign key is gone for good.
async function reattachStagedDependencies(setData){
  if(!setData)return;
  try{
    for(const table of Object.keys(DEPENDENCIES)){
      const deps=DEPENDENCIES[table];
      const local=localStoreName(table);
      let rows;
      try{rows=await offlineGetAll(local);}catch{continue;}
      for(const row of rows){
        const patch={};
        let changed=false;
        for(const dep of deps){
          const pendingVal=row[dep.pending];
          if(!pendingVal)continue;
          try{
            const{data,error}=await supabase.from(dep.table).select("id").eq("id",pendingVal).maybeSingle();
            if(!error&&data){patch[dep.field]=pendingVal;patch[dep.pending]=null;changed=true;}
          }catch{/* transient — will be retried on the next successful sync pass */}
        }
        if(!changed)continue;
        const updated={...row,...patch,sync_status:"pending"};
        await offlineSave(local,updated);
        const queueItem={id:newQueueId(),table,action:"update",data:updated,status:"pending",created_at:new Date().toISOString(),attempts:0,next_attempt_at:null};
        setData(current=>({...current,[local]:(current[local]||[]).map(r=>r.id===updated.id?updated:r),syncQueue:[queueItem,...(current.syncQueue||[]).filter(q=>!(q.table===table&&q.data?.id===updated.id))]}));
        await offlineSave("syncQueue",queueItem);
      }
    }
  }catch(e){console.warn("[Sync] reattachStagedDependencies failed",e);}
}
export async function pushSyncQueue(syncQueue,setData){
  // The React queue is a fast in-memory view, not the source of truth. Always
  // merge it with IndexedDB before draining so a save that happened between
  // setData() and React's next effect cannot be missed.
  if(!Array.isArray(syncQueue))syncQueue=[];
  try{
    const durable=await offlineGetAll("syncQueue");
    const merged=new Map();
    for(const item of durable||[])if(item?.id)merged.set(item.id,item);
    for(const item of syncQueue||[])if(item?.id)merged.set(item.id,item);
    syncQueue=[...merged.values()];
  }catch(e){console.warn("[Sync] durable queue read failed; using in-memory queue",e);}
  
  // Never spend retry attempts while offline — every attempt below is a real network
  // call, and burning through MAX_SYNC_ATTEMPTS just because there was no signal would
  // permanently "fail" perfectly good records. Anything that asks us to sync while
  // offline is simply deferred, untouched, to the next call once connectivity returns.
  if(!navigator.onLine)return;
  if(_syncInProgress){_syncRerunRequested=true;return;}
  _syncInProgress=true;
  try{
    const now=Date.now();
    const pending=(syncQueue||[]).filter(item=>item.status==="pending"&&(!item.next_attempt_at||new Date(item.next_attempt_at).getTime()<=now));
    if(!pending.length)return;
    const{winners,discarded}=collapseQueue(pending);
    const queueSnapshot=syncQueue||[];
    const ordered=sortSyncItems(winners);
    const outcomes=[];
    for(const item of ordered){
      if(!navigator.onLine)break; // connectivity dropped mid-pass — stop spending attempts
      if(!dependencyReady(item,queueSnapshot)){outcomes.push({queueId:item.id,entityId:item.data?.id,table:item.table,action:item.action,ok:false,blocked:true,error:{code:"SYNC_DEPENDENCY_WAIT",message:`Waiting for ${item.table} dependencies`}});continue;}
      const result=await pushItem(item);
      outcomes.push({queueId:item.id,entityId:item.data?.id,table:item.table,action:item.action,...result});
    }
    const succeeded=outcomes.filter(r=>r.ok),failed=outcomes.filter(r=>!r.ok&&!r.blocked),blocked=outcomes.filter(r=>r.blocked);
    for(const result of succeeded)if(result.action==="delete")offlineDelete(localStoreName(result.table),result.entityId).catch(()=>{});
    // Phase F: a "duplicate" outcome means pushOne discovered this exact row already
    // exists server-side (a losing race on jobs_quote_id_uidx / invoices_job_id_uidx /
    // payments_idempotency_key_uidx that pushOne already resolved to the winning
    // "canonical" row) — the LOCAL copy under the old client-generated id is now an
    // orphan duplicate of that canonical row, not a second real record. Reconcile local
    // storage to match: drop the orphan, keep the canonical row. This has to happen in
    // both IndexedDB (offlineDelete/offlineSave — durable across a browser restart) and
    // in-memory state, not just one; the normal "flip sync_status" path further down
    // only touches in-memory state because there's no id to reconcile in that case.
    for(const result of succeeded){
      if(!result.duplicate||!result.canonical)continue;
      const key=localStoreName(result.table);
      if(result.canonical.id!==result.entityId)offlineDelete(key,result.entityId).catch(()=>{});
      offlineSave(key,result.canonical).catch(()=>{});
    }
    if(failed.length){logEvent("sync_failed",{count:failed.length});window.dispatchEvent(new CustomEvent("powermate:sync_failed",{detail:{count:failed.length,message:`${failed.length} item${failed.length===1?"":"s"} failed to sync`,items:failed.map(f=>({table:f.table,entityId:f.entityId,syncErrorCode:f.error?.syncErrorCode||null}))}}));}
    if(succeeded.length)logEvent("sync_succeeded",{count:succeeded.length});
    const succeededIds=new Set(succeeded.map(r=>r.queueId)),failedIds=new Set(failed.map(r=>r.queueId));
    const nextQueue=(queueSnapshot||[]).filter(item=>!succeededIds.has(item.id)&&!discarded.has(item.id)).map(item=>{
      if(!failedIds.has(item.id))return item;
      const outcome=failed.find(r=>r.queueId===item.id);
      const classification=outcome?.classification||classifySyncError({code:outcome?.error?.code,message:outcome?.error?.message});
      const networkError=classification.code==="NETWORK_ERROR";
      // Network failures don't consume an attempt or ever reach "failed" — only real,
      // server-confirmed rejections do. They still back off so we're not hammering a
      // dead connection in a tight loop.
      const attempts=classification.consumesAttempt?(item.attempts||0)+1:(item.attempts||0);
      // Phase E: a PERMANENT classification (bad payload, RLS denial, an unrecognized
      // unique conflict) will fail exactly the same way on every future retry — there is
      // no reason to spend the full MAX_SYNC_ATTEMPTS budget (and the wall-clock time of
      // several backoff cycles) proving that 8 times before surfacing it. It goes
      // straight to "failed", visibly, on the first confirmed occurrence. A RETRYABLE
      // classification (timeout, schema-cache lag, rate limit, expired auth) keeps the
      // existing backoff-then-eventually-fail behaviour, since it might genuinely
      // resolve itself.
      if(!networkError&&(!classification.retryable||attempts>=MAX_SYNC_ATTEMPTS))return{...item,attempts,status:"failed",last_error:outcome?.error||null};
      return{...item,attempts,status:"pending",next_attempt_at:new Date(Date.now()+backoffMs(Math.max(1,attempts))).toISOString(),last_error:outcome?.error||null};
    });
    await persistQueue(nextQueue);
    setData(current=>{
      const next={...current,syncQueue:nextQueue};
      for(const result of succeeded){
        const key=localStoreName(result.table);
        if(result.action==="delete")next[key]=(next[key]||[]).filter(row=>row.id!==result.entityId);
        else if(result.duplicate&&result.canonical){
          // Replace the orphan (old id) with the canonical (server-winning) row rather
          // than just relabelling the orphan as "synced" — it isn't the real record.
          const rows=(next[key]||[]).filter(row=>row.id!==result.entityId);
          next[key]=[{...result.canonical,sync_status:"synced"},...rows.filter(row=>row.id!==result.canonical.id)];
        }
        else if(result.entityId)next[key]=(next[key]||[]).map(row=>row.id===result.entityId?{...row,sync_status:"synced"}:row);
      }
      return next;
    });
    if(succeeded.length)reattachStagedDependencies(setData).catch(()=>{});
    // Retry blocked (dependency-waiting) items soon regardless of whether unrelated
    // items also failed this pass — previously an unrelated failure elsewhere in the
    // queue would silently suppress this retry, leaving a perfectly resolvable child
    // record waiting on the next 30s reconcile tick (or longer) for no good reason.
    if(blocked.length)setTimeout(()=>{if(_globalSetData&&_globalQueueRef)pushSyncQueue(_globalQueueRef.current||[],_globalSetData).catch(()=>{});},1500);
  }finally{
    _syncInProgress=false;
    if(_syncRerunRequested){
      _syncRerunRequested=false;
      if(_globalSetData&&_globalQueueRef)setTimeout(()=>pushSyncQueue(_globalQueueRef.current||[],_globalSetData).catch(()=>{}),50);
    }
  }
}
async function pullAll(makeQuery){const rows=[];for(let page=0;;page+=1){const{data,error}=await makeQuery().range(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE-1);if(error)return{data:null,error};const batch=data||[];rows.push(...batch);if(batch.length<PAGE_SIZE)return{data:rows,error:null};}}
async function pullTable(table,uid){let query=supabase.from(table).select("*");if(table==="team_notifications")query=query.eq("to_user_id",uid);else if(!TEAM_TABLES.has(table))query=query.eq("user_id",uid);return pullAll(()=>query.order("created_at",{ascending:false}));}
function dirtyQueueForTable(table){return(_globalQueueRef?.current||[]).filter(q=>(q.status==="pending"||q.status==="failed")&&q.table===table);}
export async function pullFromSupabase(uid,setData){
  if(!uid)return false;
  try{
    // Pull protection uses the durable queue, not only the React ref. This
    // closes the race where a server pull happens between a local save and
    // React publishing the new queue into _globalQueueRef.
    const durableQueue=await offlineGetAll("syncQueue");
    const results=await Promise.all(SYNC_TABLES.map(table=>pullTable(table,uid))),next={};
    for(let i=0;i<SYNC_TABLES.length;i++){
      const table=SYNC_TABLES[i],result=results[i];
      if(result.error){console.warn(`[Sync] pull failed: ${table}`,result.error);continue;}
      const local=localStoreName(table);
      const dirty=(durableQueue||[]).filter(q=>(q.status==="pending"||q.status==="failed")&&q.table===table);
      const localRows=await offlineGetAll(local);
      const dirtyById=new Map(dirty.map(q=>[q.data?.id,q]));
      const serverRows=(result.data||[]).filter(row=>!(dirtyById.get(row.id)?.action==="delete"));
      for(const row of localRows){
        const q=dirtyById.get(row.id);
        if(q&&q.action!=="delete"&&!serverRows.some(r=>r.id===row.id))serverRows.push(row);
      }
      next[local]=serverRows;
      await offlineReplaceAll(local,serverRows);
    }
    setData(current=>({...current,...next}));
    return true;
  }catch(e){console.warn("[Sync] pull failed",e);return false;}
}
export function registerSyncHandlers(setData,queueRef){_globalSetData=setData;_globalQueueRef=queueRef;}
export function triggerImmediateSync(){if(_globalSetData&&_globalQueueRef)pushSyncQueue(_globalQueueRef.current||[],_globalSetData).catch(()=>{});}

// ─── Media upload retry ──────────────────────────────────────────────────────
// Photos are attached to a record as base64 first (so saving never blocks on a slow
// upload), then a screen tries to upload them to Storage. If that upload never
// happens — the device was offline at save time, the upload timed out, a tab was
// closed mid-upload — the record still syncs its *other* fields (pushOne strips
// base64 before it ever reaches Postgres, by design: raw image data has no place in
// a database row). Previously nothing ever came back to finish that upload: the photo
// just sat in IndexedDB forever, invisible to every other device and to the server.
// This scans local records for exactly that state and finishes the job — patching
// in the real Storage URL and pushing a corrective update once it succeeds. It's
// intentionally independent of the sync queue: a record can already be fully synced
// while still having an outstanding photo, so this can't rely on a queue entry
// existing to know there's work to do.
function queueMediaCorrection(table,updated,setData){
  const local=localStoreName(table);
  const queueItem={id:newQueueId(),table,action:"update",data:updated,status:"pending",created_at:new Date().toISOString(),attempts:0,next_attempt_at:null};
  setData(current=>({...current,[local]:(current[local]||[]).map(r=>r.id===updated.id?updated:r),syncQueue:[queueItem,...(current.syncQueue||[]).filter(q=>!(q.table===table&&q.data?.id===updated.id))]}));
  return offlineSave("syncQueue",queueItem);
}
// notes / equipment: a flat media:[{id,base64,url,uploadStatus}] array on the record.
async function retryFlatMedia(table,setData){
  const local=localStoreName(table);
  let rows;
  try{rows=await offlineGetAll(local);}catch{return false;}
  let any=false;
  for(const row of rows){
    const media=Array.isArray(row.media)?row.media:[];
    const pending=media.map((m,i)=>[m,i]).filter(([m])=>m&&!m.url&&(m.base64||m.file)&&m.uploadStatus!=="done");
    if(!pending.length)continue;
    const nextMedia=[...media];
    let changed=false;
    for(const[m,i]of pending){
      try{
        const uploaded=await uploadPhotoToSupabaseWithPath(m.file||m.base64,`${table}/${row.id}/${m.id}`);
        if(uploaded){nextMedia[i]={...m,url:uploaded.url,storage_path:uploaded.path,base64:undefined,file:undefined,uploadStatus:"done"};changed=true;any=true;}
      }catch(e){console.warn(`[Sync] media retry failed for ${table}/${row.id}/${m.id}`,e);}
    }
    if(!changed)continue;
    const updated={...row,media:nextMedia,sync_status:"pending"};
    await offlineSave(local,updated);
    await queueMediaCorrection(table,{...updated,media:updated.media.map(x=>({...x,base64:undefined}))},setData);
  }
  return any;
}
// breakdown / repair reports: photos live nested at items[].photos[]; a failed upload
// at save time was stored with the raw base64 sitting directly in the "url" field
// (the record's only copy of that image), so a data: URI there IS the pending upload.
async function retryReportMedia(table,uid,setData){
  const local=localStoreName(table);
  let rows;
  try{rows=await offlineGetAll(local);}catch{return false;}
  let any=false;
  for(const row of rows){
    const items=Array.isArray(row.items)?row.items:[];
    let changed=false;
    const nextItems=[];
    for(const it of items){
      const photos=Array.isArray(it.photos)?it.photos:[];
      const nextPhotos=[];
      for(const p of photos){
        if(p&&typeof p.url==="string"&&p.url.startsWith("data:")){
          try{
            const uploaded=await uploadPhotoToSupabaseWithPath(p.url,`${local}/${uid}/${row.id}/${p.id}.jpg`);
            if(uploaded){nextPhotos.push({...p,url:uploaded.url,storage_path:uploaded.path});changed=true;any=true;}
            else nextPhotos.push(p);
          }catch(e){console.warn(`[Sync] report media retry failed for ${table}/${row.id}/${p.id}`,e);nextPhotos.push(p);}
        }else nextPhotos.push(p);
      }
      nextItems.push({...it,photos:nextPhotos});
    }
    if(!changed)continue;
    const updated={...row,items:nextItems,sync_status:"pending"};
    await offlineSave(local,updated);
    await queueMediaCorrection(table,updated,setData);
  }
  return any;
}
async function retryVehicleCheckMedia(uid,setData){
  const local=localStoreName("vehicle_checks");
  let rows;
  try{rows=await offlineGetAll(local);}catch{return false;}
  let any=false;
  for(const row of rows){
    const data=row?.data||{};
    let changed=false;
    const nextItems={...(data.items||{})};
    for(const[item,value] of Object.entries(nextItems)){
      if(typeof value?.photo==="string"&&value.photo.startsWith("data:")){
        try{
          const uploaded=await uploadPhotoToSupabaseWithPath(value.photo,`vehicle-checks/${uid}/${row.check_date}/item-${item.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}-${genId()}.jpg`);
          if(uploaded){nextItems[item]={...value,photo:uploaded.url,storage_path:uploaded.path};changed=true;any=true;}
        }catch(e){console.warn("[Sync] vehicle item photo retry failed",e);}
      }
    }
    const nextPhotos=Array.isArray(data.photos)?[...data.photos]:[];
    for(let i=0;i<nextPhotos.length;i++){
      const p=nextPhotos[i];
      const source=p?._base64 || (typeof p?.url==="string"&&p.url.startsWith("data:")?p.url:null);
      if(!source)continue;
      try{
        const uploaded=await uploadPhotoToSupabaseWithPath(source,`vehicle-checks/${uid}/${row.check_date}/photo-${p.id||genId()}.jpg`);
        if(uploaded){nextPhotos[i]={...p,url:uploaded.url,storage_path:uploaded.path,_base64:null};changed=true;any=true;}
      }catch(e){console.warn("[Sync] vehicle photo retry failed",e);}
    }
    if(!changed)continue;
    const updated={...row,data:{...data,items:nextItems,photos:nextPhotos},sync_status:"pending"};
    await offlineSave(local,updated);
    await queueMediaCorrection("vehicle_checks",updated,setData);
  }
  return any;
}

// Call on reconnect, periodically (piggybacked on the realtime reconcile timer below),
// and after a manual "Sync Now" — anywhere a normal sync retry already happens.
export async function retryPendingMedia(uid,setData){
  if(!navigator.onLine||!setData)return false;
  try{
    const results=await Promise.all([
      retryFlatMedia("notes",setData),
      retryFlatMedia("equipment",setData),
      retryReportMedia("breakdown_reports",uid,setData),
      retryReportMedia("repair_reports",uid,setData),
      retryVehicleCheckMedia(uid,setData),
    ]);
    const any=results.some(Boolean);
    if(any)triggerImmediateSync();
    return any;
  }catch(e){console.warn("[Sync] retryPendingMedia failed",e);return false;}
}

export function setupRealtimeSync(uid,setData){
  if(!uid)return()=>{};
  let stopped=false;
  let channels=[];
  const start=async()=>{
    // Resolve the authoritative team from the database. If this cannot be
    // resolved, team-scoped realtime rows are never trusted merely because
    // they contain a team_id; only rows owned/assigned to this user are safe.
    let currentTeamId=null;
    try{
      const {data,error}=await supabase.rpc("current_team_id");
      if(!error&&data) currentTeamId=Array.isArray(data)?data[0]??null:data;
    }catch{}
    if(stopped)return;
    channels=SYNC_TABLES.map(table=>{
      let channel=supabase.channel(`powermate-${uid}-${table}`);
      channel=channel.on("postgres_changes",{event:"*",schema:"public",table},payload=>{
        const local=localStoreName(table);
        if(table==="team_notifications"&&payload.new?.to_user_id!==uid)return;
        const row=payload.new;
        const oldRow=payload.old;
        const teamId=row?.team_id??oldRow?.team_id;
        if(TEAM_TABLES.has(table)){
          if(!teamId)return;
          if(currentTeamId ? teamId!==currentTeamId : !(row?.user_id===uid||row?.assigned_to_user_id===uid))return;
        }
        const dirty=dirtyQueueForTable(table);
        const id=row?.id||oldRow?.id;
        if(dirty.some(q=>q.data?.id===id))return;
        setData(current=>{
          const rows=current[local]||[];
          if(payload.eventType==="DELETE")return{...current,[local]:rows.filter(r=>r.id!==oldRow?.id)};
          if(!row?.id)return current;
          const idx=rows.findIndex(r=>r.id===row.id);
          return{...current,[local]:idx>=0?rows.map((r,i)=>i===idx?row:r):[row,...rows]};
        });
      });
      channel.subscribe();
      return channel;
    });
  };
  start().catch(()=>{});
  const timer=setInterval(()=>{if(document.visibilityState!=="hidden"&&navigator.onLine){pullFromSupabase(uid,setData).catch(()=>{});retryPendingMedia(uid,setData).catch(()=>{});}},RECONCILE_MS);
  return()=>{stopped=true;clearInterval(timer);channels.forEach(c=>supabase.removeChannel(c));};
}
