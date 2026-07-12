// ═══════════════════════════════════════════════════════════════════════════
// offline/offlineDb.js — User-scoped IndexedDB
//
// FIX: Cross-account data exposure
// Previously all users shared one database ("powermate_offline").
// Now each user gets their own database ("powermate_offline_<userId>").
// On logout, clearAllStores() wipes the current user's offline data.
//
// FIX: Deleted records never removed
// offlineDelete() existed but was never called. Now exported and
// documented — callers MUST call it on every local delete.
// ═══════════════════════════════════════════════════════════════════════════

const DB_PREFIX  = "powermate_offline_";
const DB_VERSION = 6;
const STORES = [
  "clients", "followups", "quotes", "notes", "equipment",
  "contacts", "expenses", "leads", "vehicle_checks",
  "activities",  // NEW: interaction logging
  "syncQueue",
];

let _db = null;
let _currentUserId = null;

function dbName(userId) {
  // User-scoped database name. Falls back to shared if no userId (should not happen in practice).
  return userId ? `${DB_PREFIX}${userId}` : `${DB_PREFIX}shared`;
}

// ── Initialize / switch user ──────────────────────────────────────────────────
// Call this on login (before loading data) and on logout (to close the old DB).
export function setOfflineUser(userId) {
  if (_currentUserId === userId && _db) return; // already set
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
  _currentUserId = userId;
}

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const name = dbName(_currentUserId);
    const req = indexedDB.open(name, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      });
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => {
      console.warn("[PowerMate offline] IndexedDB open failed:", e.target.error);
      reject(e.target.error);
    };
  });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function offlineSave(store, record) {
  if (!record || !record.id) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => {
        console.warn(`[offline] Save to ${store} failed:`, e.target.error);
        reject(e.target.error);
      };
    });
  } catch (e) {
    console.warn(`[offline] offlineSave failed for ${store}:`, e);
  }
}

export async function offlineGetAll(store) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    console.warn(`[offline] offlineGetAll failed for ${store}:`, e);
    return [];
  }
}

// FIX: This function existed but was NEVER CALLED by any screen.
// Every screen that deletes a record MUST call this immediately.
export async function offlineDelete(store, id) {
  if (!id) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch (e) {
    console.warn(`[offline] offlineDelete failed for ${store}/${id}:`, e);
  }
}

export async function offlineClear(store) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch (e) {
    console.warn(`[offline] offlineClear failed for ${store}:`, e);
  }
}

// ── Clear ALL stores (call on logout) ─────────────────────────────────────────
export async function clearAllStores() {
  try {
    const db = await openDB();
    await Promise.all(
      STORES.map(store => new Promise(resolve => {
        try {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).clear();
          tx.oncomplete = () => resolve();
          tx.onerror    = () => resolve();
        } catch { resolve(); }
      }))
    );
  } catch (e) {
    console.warn("[offline] clearAllStores failed:", e);
  }
}

// ── Delete the entire database for a user (nuclear option) ────────────────────
export function deleteUserDatabase(userId) {
  if (_db && _currentUserId === userId) {
    try { _db.close(); } catch {}
    _db = null;
  }
  try { indexedDB.deleteDatabase(dbName(userId)); } catch {}
}

export async function offlineCount(store) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(store, "readonly");
      const req = tx.objectStore(store).count();
      req.onsuccess = (e) => resolve(e.target.result || 0);
      req.onerror   = () => resolve(0);
    });
  } catch { return 0; }
}
