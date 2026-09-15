// ─── PowerMate Sync Engine ───────────────────────────────────────────────────
// Full, paginated reconciliation + durable offline queue + realtime updates.
import { supabase } from "../supabase";
import { logEvent } from "./helpers";
import { offlineSave, offlineDelete, offlineReplaceAll } from "../offline/offlineDb";
import { logCrash } from "../components/ErrorBoundary";

const SYNC_TABLES = [
  "clients", "followups", "quotes", "contacts", "notes", "equipment",
  "expenses", "leads", "vehicle_checks", "activities", "breakdown_reports", "repair_reports",
  "custom_faults", "service_reports", "team_notifications", "jobs", "invoices", "payments",
];
const TEAM_TABLES = new Set([
  "clients", "followups", "quotes", "contacts", "notes", "equipment",
  "leads", "activities", "breakdown_reports", "repair_reports", "custom_faults", "service_reports",
  "jobs", "invoices", "payments",
]);
const LOCAL_STORE = {
  breakdown_reports: "breakdowns",
  repair_reports: "repairs",
  custom_faults: "customFaults",
  service_reports: "serviceReports",
  team_notifications: "teamNotifications",
};
const localStoreName = (table) => LOCAL_STORE[table] || table;
const MAX_SYNC_ATTEMPTS = 5;
const PAGE_SIZE = 1000;
const RECONCILE_MS = 30000;
let _syncInProgress = false;
let _globalSetData = null;
let _globalQueueRef = null;

// Only send columns that exist in the production schema. Some newer/local
// workflow fields are intentionally kept offline and must not be sent to
// legacy tables where PostgREST would reject the payload with PGRST204.
const REMOTE_EXCLUDED_FIELDS = {
  quotes: new Set(["contact_id", "from_user_id", "to_user_id", "job_id", "invoice_id"]),
  followups: new Set(["invoice_id", "job_id"]),
};

function sanitizeRemotePayload(table, data) {
  const out = { ...(data || {}) };
  for (const field of REMOTE_EXCLUDED_FIELDS[table] || []) delete out[field];
  return out;
}
function cleanUUIDs(data) {
  const fields=["id","user_id","team_id","client_id","contact_id","linked_note_id","linked_breakdown_id","assigned_to_user_id","from_user_id","to_user_id","quote_id","job_id","invoice_id"];
  const out={...(data||{})};
  fields.forEach(f=>{if(out[f]===""||out[f]===undefined)out[f]=null;});
  return out;
}
function cleanNumerics(data) {
  const out={...(data||{})};
  ["estimated_value","value","amount","amount_zar","quote_value","vat_amount","exchange_rate","duration_mins","subtotal","vat","total","amount_paid","balance_due"].forEach(f=>{
    if(!(f in out))return;
    const v=out[f];
    if(v===""||v===undefined)out[f]=null;
    else if(v!==null&&typeof v==="string"&&Number.isNaN(Number.parseFloat(v)))out[f]=null;
  });
  return out;
}

export async function pushItem(item) {
  try {
    const table=item?.table;
    if(!table||!item?.data)throw new Error("Invalid sync item");
    let payload=sanitizeRemotePayload(table,cleanNumerics(cleanUUIDs(item.data)));
    if(payload.media)payload={...payload,media:payload.media.map(m=>({...m,base64:undefined}))};
    if(["insert","upsert","update"].includes(item.action)){
      if(TEAM_TABLES.has(table)&&!payload.user_id){
        const {data:authData}=await supabase.auth.getUser();
        if(authData?.user?.id)payload.user_id=authData.user.id;
      }
      if(item.action==="update"&&payload.id){
        const {data:existing,error:existingError}=await supabase.from(table).select("*").eq("id",payload.id).maybeSingle();
        if(!existingError&&existing)payload={...existing,...payload};
        payload=sanitizeRemotePayload(table,cleanNumerics(cleanUUIDs(payload)));
      }
      const {error}=await supabase.from(table).upsert({...payload,sync_status:"synced"},{onConflict:"id"});
      if(error)throw error;
    }else if(item.action==="delete"){
      const {error}=await supabase.from(table).delete().eq("id",payload.id);
      if(error)throw error;
    }else throw new Error(`Unknown sync action: ${item.action}`);
    return {ok:true};
  }catch(error){
    const detail={code:error?.code,message:error?.message||"Unknown sync error",details:error?.details,hint:error?.hint};
    console.warn(`[Sync] FAILED ${item?.table} ${item?.action}`,detail);
    try{logCrash({screen:`Sync (${item?.table} ${item?.action})`,message:`${detail.message}${detail.code?` [${detail.code}]`:""}${detail.details?` — ${detail.details}`:""}`});}catch{}
    return {ok:false,error:detail};
  }
}

export async function saveAndSync(item,table,action,setData,isOnline){
  await offlineSave(localStoreName(table),item);
  if(isOnline){
    const result=await pushItem({table,action,data:item});
    if(result.ok){
      const synced={...item,sync_status:"synced"};
      await offlineSave(localStoreName(table),synced);
      setData(current=>({...current,[localStoreName(table)]: (current[localStoreName(table)]||[]).map(row=>row.id===item.id?synced:row),syncQueue:(current.syncQueue||[]).filter(q=>q.data?.id!==item.id)}));
      return synced;
    }
  }
  const queueItem={id:`sq_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,table,action,data:item,status:"pending",created_at:new Date().toISOString(),attempts:0};
  setData(current=>({...current,syncQueue:[queueItem,...(current.syncQueue||[]).filter(q=>!(q.table===table&&q.data?.id===item.id))]}));
  return {...item,sync_status:"pending"};
}

function collapseQueue(queue){
  const groups=new Map();
  for(const item of queue){const key=`${item.table}:${item.data?.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  const winners=[];const discarded=new Set();
  for(const [,ops] of groups){
    ops.sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
    const last=ops[ops.length-1],hasInsert=ops.some(op=>op.action==="insert"),hasDelete=ops.some(op=>op.action==="delete");
    if(hasInsert&&hasDelete){ops.forEach(op=>discarded.add(op.id));continue;}
    if(hasDelete)winners.push({...last,action:"delete"});
    else winners.push({...last,action:hasInsert?"upsert":"update",data:ops.reduce((record,op)=>({...record,...(op.data||{})}),{})});
    const winner=winners[winners.length-1];ops.forEach(op=>{if(op.id!==winner.id)discarded.add(op.id);});
  }
  return {winners,discarded};
}

export async function pushSyncQueue(syncQueue,setData){
  if(_syncInProgress)return;_syncInProgress=true;
  try{
    const pending=(syncQueue||[]).filter(item=>item.status==="pending");if(!pending.length)return;
    const {winners,discarded}=collapseQueue(pending);
    const results=await Promise.allSettled(winners.map(async item=>({queueId:item.id,entityId:item.data?.id,table:item.table,action:item.action,...(await pushItem(item))})));
    const outcomes=results.map(r=>r.status==="fulfilled"?r.value:{ok:false,error:{message:"Unexpected sync failure"}});
    const succeeded=outcomes.filter(r=>r.ok),failed=outcomes.filter(r=>!r.ok);
    for(const result of succeeded)if(result.action==="delete")offlineDelete(localStoreName(result.table),result.entityId).catch(()=>{});
    if(failed.length){logEvent("sync_failed",{count:failed.length});window.dispatchEvent(new CustomEvent("powermate:sync_failed",{detail:{count:failed.length,message:`${failed.length} item${failed.length===1?"":"s"} failed to sync`}}));}
    if(succeeded.length)logEvent("sync_succeeded",{count:succeeded.length});
    const succeededIds=new Set(succeeded.map(r=>r.queueId)),failedIds=new Set(failed.map(r=>r.queueId)),succeededKeys=new Set(succeeded.map(r=>`${r.table}:${r.entityId}`));
    setData(current=>{
      const nextQueue=(current.syncQueue||[]).filter(item=>!succeededIds.has(item.id)&&!(discarded.has(item.id)&&succeededKeys.has(`${item.table}:${item.data?.id}`))).map(item=>{
        if(!failedIds.has(item.id))return item;
        const attempts=(item.attempts||0)+1;
        return attempts>=MAX_SYNC_ATTEMPTS?{...item,attempts,status:"failed"}:{...item,attempts,status:"pending"};
      });
      const next={...current,syncQueue:nextQueue};
      for(const result of succeeded){const key=localStoreName(result.table);if(result.action==="delete")next[key]=(next[key]||[]).filter(row=>row.id!==result.entityId);else if(result.entityId)next[key]=(next[key]||[]).map(row=>row.id===result.entityId?{...row,sync_status:"synced"}:row);}
      return next;
    });
  }finally{_syncInProgress=false;}
}

async function pullAll(makeQuery){
  const rows=[];
  for(let page=0;;page+=1){const {data,error}=await makeQuery().range(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE-1);if(error)return {data:null,error};const batch=data||[];rows.push(...batch);if(batch.length<PAGE_SIZE)return {data:rows,error:null};}
}
async function pullTable(table,uid){let query=supabase.from(table).select("*");if(table==="team_notifications")query=query.eq("to_user_id",uid);else if(!TEAM_TABLES.has(table))query=query.eq("user_id",uid);return pullAll(()=>query.order("created_at",{ascending:false}));}
export async function pullFromSupabase(uid,setData){
  if(!uid)return false;
  try{
    const results=await Promise.all(SYNC_TABLES.map(table=>pullTable(table,uid))),next={};
    for(let i=0;i<SYNC_TABLES.length;i++){const table=SYNC_TABLES[i],result=results[i];if(result.error){console.warn(`[Sync] pull failed: ${table}`,result.error);continue;}next[localStoreName(table)]=result.data||[];await offlineReplaceAll(localStoreName(table),result.data||[]);}
    setData(current=>({...current,...next}));return true;
  }catch(e){console.warn("[Sync] pull failed",e);return false;}
}
export function registerSyncHandlers(setData,queueRef){_globalSetData=setData;_globalQueueRef=queueRef;}
export function triggerImmediateSync(){if(_globalSetData&&_globalQueueRef)pushSyncQueue(_globalQueueRef.current||[],_globalSetData).catch(()=>{});}
export function setupRealtimeSync(uid,setData){
  if(!uid)return()=>{};
  const channels=SYNC_TABLES.map(table=>{
    let channel=supabase.channel(`powermate-${uid}-${table}`);
    channel=channel.on("postgres_changes",{event:"*",schema:"public",table},payload=>{
      const local=localStoreName(table);
      if(table==="team_notifications"&&payload.new?.to_user_id!==uid)return;
      if(TEAM_TABLES.has(table)&&payload.new?.team_id==null)return;
      setData(current=>{
        const rows=current[local]||[];
        if(payload.eventType==="DELETE")return {...current,[local]:rows.filter(r=>r.id!==payload.old?.id)};
        const row=payload.new;if(!row?.id)return current;
        const idx=rows.findIndex(r=>r.id===row.id);
        return {...current,[local]:idx>=0?rows.map((r,i)=>i===idx?row:r):[row,...rows]};
      });
    });
    channel.subscribe();return channel;
  });
  const timer=setInterval(()=>{if(document.visibilityState!=="hidden"&&navigator.onLine)pullFromSupabase(uid,setData).catch(()=>{});},RECONCILE_MS);
  return()=>{clearInterval(timer);channels.forEach(c=>supabase.removeChannel(c));};
}
