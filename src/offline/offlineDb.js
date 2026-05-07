const DB_NAME = "powermate_offline_db";
const DB_VERSION = 1;

const STORES = [
  "companies",
  "branches",
  "contacts",
  "followups",
  "notes",
  "quotes",
  "reports",
  "equipment",
  "syncQueue",
];

export function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

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

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function offlineSave(storeName, item) {
  const db = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");

    tx.objectStore(storeName).put(item);

    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

export async function offlineGetAll(storeName) {
  const db = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");

    const request = tx.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
