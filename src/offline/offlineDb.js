// ═══════════════════════════════════════════════════════════════════════════
// offline/offlineDb.js — User-scoped IndexedDB
//
// PowerMate offline storage
// - Each authenticated user gets a separate IndexedDB database.
// - Supports all application data stores, including the job-to-payment workflow.
// - Sync queue is durable across browser restarts.
// - Full replacements are used when a server pull is authoritative.
// ═══════════════════════════════════════════════════════════════════════════

const DB_PREFIX = "powermate_offline_";
const DB_VERSION = 14;

const STORES = [
  "clients", "followups", "quotes", "notes", "equipment", "contacts", "expenses",
  "leads", "vehicle_checks", "activities", "breakdowns", "repairs", "customFaults",
  "serviceReports", "teamNotifications", "jobs", "invoices", "payments", "syncQueue",
  "email_quotes",
];

let _db = null;
let _currentUserId = null;

function dbName(userId) { return userId ? `${DB_PREFIX}${userId}` : `${DB_PREFIX}shared`; }

export function setOfflineUser(userId) {
  if (_currentUserId === userId && _db) return;
  if (_db) { try { _db.close(); } catch {} _db = null; }
  _currentUserId = userId || null;
}

// FIX (Build 8, Phase 2) — lets callers (e.g. logout()) assert which user's
// database they're about to act on, so a clear/delete can't silently land on
// the wrong (shared/null) database after the offline-user pointer has
// already moved. See the ordering fix in App.jsx's logout().
export function getCurrentOfflineUser() {
  return _currentUserId;
}

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB is not supported by this browser.")); return; }
    const name = dbName(_currentUserId);
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };
    request.onsuccess = () => {
      _db = request.result;
      _db.onversionchange = () => { try { _db.close(); } catch {} _db = null; };
      resolve(_db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn("[offline] IndexedDB upgrade blocked", name);
  });
}

// ─── Phase I: offline write failures must not masquerade as success ───────
// PREVIOUSLY: offlineSave/offlineDelete/offlineReplaceAll each caught EVERY
// error (IndexedDB unsupported, quota exceeded, the DB blocked by another
// tab mid-upgrade, a corrupted store) and just console.warn'd — the caller
// got back a resolved `undefined` indistinguishable from a real success.
// saveAndSync (sync.js) and every screen that calls these treats that as
// "the record is safely on this device", and several show the user a literal
// "Saved" / "saved offline and queued for sync" message right after — which
// was a LIE whenever the underlying write actually failed. That's silent
// data loss with a success message on top of it: worse than a normal error,
// because nothing about the UI told the user (or the sync engine) anything
// was wrong.
//
// FIXED: these three (the ones that ever attempt to persist a WRITE) no
// longer swallow the error — they log it (for Diagnostics) and then
// re-throw, so the failure propagates to the caller as a real rejected
// promise instead of a fake success. saveAndSync no longer catches this
// silently either (see sync.js), so a genuine IndexedDB failure now surfaces
// as a visible error rather than a false "Saved". offlineGetAll/offlineGet/
// offlineCount are READS — returning an empty/null default on failure (as
// before) is the right behaviour there: an empty result is visibly "no data
// shown", not a false claim that something was written.
export async function offlineSave(store, value) {
  try { const db=await openDB(); return await new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(e){ console.error("[offline] SAVE FAILED — record was NOT persisted locally",store,e); throw e; }
}
export async function offlineGetAll(store) {
  try { const db=await openDB(); return new Promise((resolve,reject)=>{const req=db.transaction(store,"readonly").objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);}); }
  catch(e){ console.warn("[offline] getAll failed",store,e); return []; }
}
export async function offlineGet(store,id) {
  try { const db=await openDB(); return new Promise((resolve,reject)=>{const req=db.transaction(store,"readonly").objectStore(store).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);}); }
  catch { return null; }
}
export async function offlineDelete(store,id) {
  try { const db=await openDB(); return await new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
  catch(e){ console.error("[offline] DELETE FAILED — record may still exist locally",store,id,e); throw e; }
}
export async function offlineReplaceAll(store,values) {
  try { const db=await openDB(); return await new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");const s=tx.objectStore(store);s.clear();for(const v of (values||[]))s.put(v);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(e){ console.error("[offline] REPLACE FAILED — local store may be stale/incomplete",store,e); throw e; }
}

export function deleteUserDatabase(userId) {
  if (_db && _currentUserId === userId) { try { _db.close(); } catch {} _db=null; }
  try { indexedDB.deleteDatabase(dbName(userId)); } catch {}
}
export async function offlineCount(store) {
  try { const db=await openDB(); return new Promise(resolve=>{const tx=db.transaction(store,"readonly");const req=tx.objectStore(store).count();req.onsuccess=e=>resolve(e.target.result||0);req.onerror=()=>resolve(0);}); }
  catch { return 0; }
}
export async function clearAllStores() {
  try { const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,"readwrite");STORES.forEach(s=>tx.objectStore(s).clear());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(e){ console.warn("[offline] clearAllStores failed",e); }
}
