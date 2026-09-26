// ─── Photos for PDFs ──────────────────────────────────────────────────────────
// Loads each quote photo (from the device copy, or a fresh signed link to
// Storage) and scales it to at most 1200px JPEG, so a quote with ten photos
// stays around 1–2 MB and can be sent by WhatsApp or email.
import { createFreshMediaUrl } from "./helpers";

function toJpeg(src, maxDim = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function photoData(p) {
  try {
    if (p.data) return p.data;
    if (p.base64) return await toJpeg(p.base64);
    if (!p.storage_path || !navigator.onLine) return null;
    const url = await createFreshMediaUrl({ storage_path: p.storage_path });
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blobUrl = URL.createObjectURL(await res.blob());
    try {
      return await toJpeg(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null;
  }
}

const resolveList = list =>
  Promise.all((list || []).map(async p => ({ caption: p.caption, data: await photoData(p) })));

// Fills in image data for quote-section and job-card photos.
export async function resolveDocumentPhotos(doc) {
  const [sections, jobCards] = await Promise.all([
    Promise.all((doc.sections || []).map(async sec => ({ ...sec, photos: await resolveList(sec.photos) }))),
    Promise.all((doc.jobCards || []).map(async jc => ({ ...jc, photos: await resolveList(jc.photos) }))),
  ]);
  return { ...doc, ...(doc.sections ? { sections } : {}), ...(doc.jobCards ? { jobCards } : {}) };
}
