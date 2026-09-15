// ═══════════════════════════════════════════════════════════════════════════
// offline/offlineDb.js — User-scoped IndexedDB
//
// PowerMate offline storage
// - Each authenticated user gets a separate IndexedDB database.
// - Supports all application data stores.
// - Sync queue is durable across browser restarts.
// - Full replacements are used when a server pull is authoritative.
// ═══════════════════════════════════════════════════════════════════════════

const DB_PREFIX = "powermate_offline_";
const DB_VERSION = 10;

const STORES = [
  "clients",
  "followups",
  "quotes",
  "notes",
  "equipment",
  "contacts",
  "expenses",
  "leads",
  "vehicle_checks",
  "activities",
  "breakdowns",
  "repairs",
  "customFaults",
  "syncQueue",
];

let _db = null;
let _currentUserId = null;

function dbName(userId) {
  return userId
    ? `${DB_PREFIX}${userId}`
    : `${DB_PREFIX}shared`;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export function setOfflineUser(userId) {
  if (_currentUserId === userId && _db) {
    return;
  }

  if (_db) {
    try {
      _db.close();
    } catch {}

    _db = null;
  }

  _currentUserId = userId || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────

function openDB() {
  if (_db) {
    return Promise.resolve(_db);
  }

  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not supported by this browser."));
      return;
    }

    const name = dbName(_currentUserId);
    const request = indexedDB.open(name, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, {
            keyPath: "id",
          });
        }
      });
    };

    request.onsuccess = (event) => {
      _db = event.target.result;

      _db.onversionchange = () => {
        try {
          _db.close();
        } catch {}

        _db = null;
      };

      resolve(_db);
    };

    request.onerror = (event) => {
      const error = event.target.error;

      console.warn(
        "[PowerMate offline] IndexedDB open failed:",
        error
      );

      reject(error);
    };

    request.onblocked = () => {
      console.warn(
        "[PowerMate offline] IndexedDB upgrade is blocked by another connection."
      );
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE / UPSERT
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineSave(store, record) {
  if (!store || !record || !record.id) {
    return false;
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);

      objectStore.put(record);

      tx.oncomplete = () => {
        resolve(true);
      };

      tx.onerror = (event) => {
        console.warn(
          `[offline] Save to ${store} failed:`,
          event.target.error
        );

        resolve(false);
      };

      tx.onabort = (event) => {
        console.warn(
          `[offline] Save to ${store} aborted:`,
          event.target.error
        );

        resolve(false);
      };
    });
  } catch (error) {
    console.warn(
      `[offline] offlineSave failed for ${store}:`,
      error
    );

    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE ENTIRE STORE
//
// Used after an authoritative full server pull.
//
// IMPORTANT:
// This clears stale local records that no longer exist on the server.
// Pending local records should be restored by the sync engine afterwards.
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineReplaceAll(store, records = []) {
  if (!store) {
    return false;
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);

      objectStore.clear();

      for (const record of records) {
        if (record && record.id) {
          objectStore.put(record);
        }
      }

      tx.oncomplete = () => {
        resolve(true);
      };

      tx.onerror = (event) => {
        console.warn(
          `[offline] offlineReplaceAll failed for ${store}:`,
          event.target.error
        );

        resolve(false);
      };

      tx.onabort = (event) => {
        console.warn(
          `[offline] offlineReplaceAll aborted for ${store}:`,
          event.target.error
        );

        resolve(false);
      };
    });
  } catch (error) {
    console.warn(
      `[offline] offlineReplaceAll failed for ${store}:`,
      error
    );

    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineGetAll(store) {
  if (!store) {
    return [];
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const objectStore = tx.objectStore(store);
      const request = objectStore.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      request.onerror = () => {
        resolve([]);
      };

      tx.onerror = () => {
        resolve([]);
      };
    });
  } catch (error) {
    console.warn(
      `[offline] offlineGetAll failed for ${store}:`,
      error
    );

    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ONE
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineGet(store, id) {
  if (!store || !id) {
    return null;
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const request = tx.objectStore(store).get(id);

      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (error) {
    console.warn(
      `[offline] offlineGet failed for ${store}/${id}:`,
      error
    );

    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineDelete(store, id) {
  if (!store || !id) {
    return false;
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");

      tx.objectStore(store).delete(id);

      tx.oncomplete = () => {
        resolve(true);
      };

      tx.onerror = () => {
        resolve(false);
      };

      tx.onabort = () => {
        resolve(false);
      };
    });
  } catch (error) {
    console.warn(
      `[offline] offlineDelete failed for ${store}/${id}:`,
      error
    );

    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR ONE STORE
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineClear(store) {
  if (!store) {
    return false;
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");

      tx.objectStore(store).clear();

      tx.oncomplete = () => {
        resolve(true);
      };

      tx.onerror = () => {
        resolve(false);
      };

      tx.onabort = () => {
        resolve(false);
      };
    });
  } catch (error) {
    console.warn(
      `[offline] offlineClear failed for ${store}:`,
      error
    );

    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNT
// ─────────────────────────────────────────────────────────────────────────────

export async function offlineCount(store) {
  if (!store) {
    return 0;
  }

  try {
    const db = await openDB();

    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const request = tx.objectStore(store).count();

      request.onsuccess = (event) => {
        resolve(event.target.result || 0);
      };

      request.onerror = () => {
        resolve(0);
      };
    });
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR ALL USER DATA
//
// Call this when the user logs out.
//
// Because the DB itself is user-scoped, this only clears the currently
// authenticated user's local database.
// ─────────────────────────────────────────────────────────────────────────────

export async function clearAllStores() {
  try {
    const db = await openDB();

    return await Promise.all(
      STORES.map(
        (store) =>
          new Promise((resolve) => {
            try {
              const tx = db.transaction(store, "readwrite");

              tx.objectStore(store).clear();

              tx.oncomplete = () => resolve(true);
              tx.onerror = () => resolve(false);
              tx.onabort = () => resolve(false);
            } catch {
              resolve(false);
            }
          })
      )
    );
  } catch (error) {
    console.warn(
      "[offline] clearAllStores failed:",
      error
    );

    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER DATABASE
//
// Used when completely removing local data for a specific user.
// ─────────────────────────────────────────────────────────────────────────────

export function deleteUserDatabase(userId) {
  if (!userId) {
    return;
  }

  if (_db && _currentUserId === userId) {
    try {
      _db.close();
    } catch {}

    _db = null;
  }

  try {
    indexedDB.deleteDatabase(dbName(userId));
  } catch (error) {
    console.warn(
      "[offline] Failed to delete user database:",
      error
    );
  }
}
