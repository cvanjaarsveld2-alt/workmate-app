// ═══════════════════════════════════════════════════════════════════════════
// offline/offlineDb.js — User-scoped IndexedDB
// ═══════════════════════════════════════════════════════════════════════════
const DB_PREFIX = "powermate_offline_";
const DB_VERSION = 11;
const STORES = ["clients","followups","quotes","notes","equipment","contacts","expenses","leads","vehicle_checks","activities","breakdowns","repairs","customFaults","serviceReports","syncQueue"];
let _db = null;
let _currentUserId = null;
function dbName(userId) { return userId ? `${DB_PREFIX}${userId}` : `${DB_PREFIX}shared`; }
export function setOfflineUser(userId) { if (_currentUserId === userId && _db) return; if (_db) { try { _db.close(); } catch {} _db = null; } _currentUserId = userId || null; }
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB is not supported by this browser.")); return; }
    const request = indexedDB.open(dbName(_currentUserId), DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" }); });
    };
    request.onsuccess = () => { _db = request.result; resolve(_db); };
    request.onerror = () => reject(request.error);
  });
}
export async function offlineSave(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
}
export async function offlineGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => { const req=db.transaction(store,"readonly").objectStore(store).getAll(); req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); });
}
export async function offlineDelete(store,id) {
  const db=await openDB(); return new Promise(resolve=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});
}
export async function offlineReplaceAll(store, values) {
  const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");const s=tx.objectStore(store);s.clear();for(const v of (values||[])) s.put(v);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
export async function clearAllStores() {
  const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,"readwrite");STORES.forEach(s=>tx.objectStore(s).clear());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
