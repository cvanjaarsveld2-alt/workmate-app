// ─── Offline Media Queue ──────────────────────────────────────────────────────
// Stores photo/video uploads in IndexedDB so they survive app restarts.
// When connectivity returns, the queue is processed and URLs are patched
// back into the parent record.
//
// Usage:
//   import { queueMediaUpload, processMediaQueue } from "./mediaQueue";
//   await queueMediaUpload({ recordTable, recordId, fieldPath, file, userId });
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "../supabase";
import { uploadPhotoToSupabase, genId } from "./helpers";

const DB_NAME_PREFIX = "pm_media_queue_";
const STORE_NAME = "queue";
const DB_VERSION = 1;

let _db = null;
let _userId = null;

export function setMediaQueueUser(userId) {
  if (_userId !== userId) { _db = null; _userId = userId; }
}

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`${DB_NAME_PREFIX}${_userId || "shared"}`, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

// Add a file to the queue
export async function queueMediaUpload({ recordTable, recordId, mediaIndex, file, path, userId }) {
  if (!file || !(file instanceof Blob)) return null;

  const item = {
    id: genId(),
    recordTable,
    recordId,
    mediaIndex, // which index in the media array to patch
    path,
    fileName: file.name || "upload",
    mimeType: file.type || "image/jpeg",
    size: file.size,
    status: "pending",
    created_at: new Date().toISOString(),
    retries: 0,
  };

  // Store the file blob separately (can't JSON stringify it)
  item._blob = file;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    // Store blob as a real Blob (IndexedDB supports this natively)
    const record = { ...item };
    delete record._blob;
    store.put({ ...record, blob: file });
    tx.oncomplete = () => resolve(item.id);
    tx.onerror = e => reject(e.target.error);
  });
}

export async function getPendingUploads() {
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = e => resolve((e.target.result || []).filter(r => r.status === "pending"));
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function markDone(id) {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
  });
}

async function markFailed(id, retries) {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = e => {
      const item = e.target.result;
      if (item) store.put({ ...item, status: retries >= 5 ? "failed" : "pending", retries });
    };
    tx.oncomplete = () => resolve();
  });
}

// Process the queue — call this when connectivity is restored
export async function processMediaQueue(setData) {
  if (!navigator.onLine) return;
  const pending = await getPendingUploads();
  if (pending.length === 0) return;

  console.log(`[MediaQueue] Processing ${pending.length} pending uploads`);

  for (const item of pending) {
    try {
      if (!item.blob) { await markFailed(item.id, 99); continue; }

      // Upload to Supabase Storage
      const url = await uploadPhotoToSupabase(item.blob, item.path);
      if (!url) { await markFailed(item.id, (item.retries || 0) + 1); continue; }

      // Patch the URL back into the record's media array
      if (item.recordTable && item.recordId && setData) {
        setData(d => ({
          ...d,
          [item.recordTable]: (d[item.recordTable] || []).map(r => {
            if (r.id !== item.recordId) return r;
            const media = [...(r.media || [])];
            if (media[item.mediaIndex]) {
              media[item.mediaIndex] = { ...media[item.mediaIndex], url, base64: undefined };
            }
            return { ...r, media };
          }),
        }));

        // Also persist the URL update to Supabase
        await supabase.from(item.recordTable)
          .select("media").eq("id", item.recordId).single()
          .then(async ({ data: row }) => {
            if (!row) return;
            const media = [...(row.media || [])];
            if (media[item.mediaIndex]) {
              media[item.mediaIndex] = { ...media[item.mediaIndex], url };
              await supabase.from(item.recordTable)
                .update({ media }).eq("id", item.recordId);
            }
          }).catch(() => {});
      }

      await markDone(item.id);
      console.log(`[MediaQueue] ✓ Uploaded ${item.fileName}`);
    } catch (e) {
      console.warn(`[MediaQueue] Failed ${item.fileName}:`, e);
      await markFailed(item.id, (item.retries || 0) + 1);
    }
  }
}

export async function getQueueCount() {
  const pending = await getPendingUploads();
  return pending.length;
}
