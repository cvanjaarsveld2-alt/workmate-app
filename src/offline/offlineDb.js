// ═══════════════════════════════════════════════════════════════════════════
// offline/offlineDb.js
// ───────────────────────────────────────────────────────────────────────────
// IndexedDB wrapper for PowerMate offline storage.
// Supports saving individual records AND reading all records per table.
// This replaces whatever was here before — the old version had offlineGetAll
// imported in App.jsx but never implemented properly.
// ═══════════════════════════════════════════════════════════════════════════

const DB_NAME = "powermate_offline";
const DB_VERSION = 2;
const STORES = ["clients", "followups", "quotes", "notes", "equipment", "syncQueue"];

let _db = null;

// ─── Open / initialize the database ─────────────────────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

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

// ─── Save a single record (upsert by id) ────────────────────────────────────
export async function offlineSave(store, record) {
  if (!record || !record.id) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => {
        console.warn(`[PowerMate offline] Save to ${store} failed:`, e.target.error);
        reject(e.target.error);
      };
    });
  } catch (e) {
    console.warn(`[PowerMate offline] offlineSave failed for ${store}:`, e);
  }
}

// ─── Get all records from a store ───────────────────────────────────────────
// THIS IS THE FUNCTION THAT WAS MISSING — fixes the offline read bug
export async function offlineGetAll(store) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => {
        console.warn(`[PowerMate offline] Read from ${store} failed:`, e.target.error);
        resolve([]); // return empty rather than crash
      };
    });
  } catch (e) {
    console.warn(`[PowerMate offline] offlineGetAll failed for ${store}:`, e);
    return [];
  }
}

// ─── Delete a single record ──────────────────────────────────────────────────
export async function offlineDelete(store, id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // fail silently
    });
  } catch (e) {
    console.warn(`[PowerMate offline] offlineDelete failed for ${store}:`, e);
  }
}

// ─── Clear all records from a store (used when syncing fresh data) ───────────
export async function offlineClear(store) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.warn(`[PowerMate offline] offlineClear failed for ${store}:`, e);
  }
}

// ─── Get total record count (useful for monitoring) ──────────────────────────
export async function offlineCount(store) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).count();
      req.onsuccess = (e) => resolve(e.target.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch (e) {
    return 0;
  }
}
