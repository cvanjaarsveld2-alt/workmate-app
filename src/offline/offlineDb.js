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

export async function offlineSave(store, value) {
  try { const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(e){ console.warn("[offline] save failed",store,e); }
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
  try { const db=await openDB(); return new Promise(resolve=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();}); }
  catch { return; }
}
export async function offlineReplaceAll(store,values) {
  try { const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");const s=tx.objectStore(store);s.clear();for(const v of (values||[]))s.put(v);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(e){ console.warn("[offline] replace failed",store,e); }
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
