// ─── Media Components ─────────────────────────────────────────────────────────
import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image, Video, X } from "lucide-react";
import { compressImage } from "../lib/helpers";
import { genId } from "../lib/helpers";
import { MAX_FILE_SIZE_MB } from "../lib/constants";

// ─── MediaPicker ──────────────────────────────────────────────────────────────
export function MediaPicker({ onAdd, disabled = false }) {
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);

  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        console.warn(`File too large: ${file.name}`);
        continue;
      }
      try {
        const base64  = await compressImage(file);
        const isVideo = file.type.startsWith("video/");
        onAdd({ id: genId(), base64, isVideo, name: file.name, type: file.type, uploadStatus: "pending" });
      } catch (e) {
        console.warn("Could not process file:", e);
      }
    }
  }

  return (
    <div className="flex gap-2">
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3.5 text-sm font-bold text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40 min-h-[48px]">
        <Camera size={16} /> Camera
      </button>
      <button type="button" onClick={() => galleryRef.current?.click()} disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3.5 text-sm font-bold text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40 min-h-[48px]">
        <Image size={16} /> Gallery
      </button>
    </div>
  );
}

// ─── MediaGallery ─────────────────────────────────────────────────────────────
export function MediaGallery({ media = [], onDelete, readonly = false }) {
  const [lightbox, setLightbox] = useState(null);
  if (!media.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {media.map((m, i) => (
          <div key={m.id || i} className="relative group">
            {m.isVideo
              ? (
                <div className="w-20 h-20 rounded-xl bg-slate-900 flex items-center justify-center cursor-pointer border-2 border-slate-200"
                  onClick={() => setLightbox(m)}>
                  <Video size={22} className="text-white" />
                </div>
              ) : (
                <img src={m.url || m.base64} alt="attachment"
                  onClick={() => setLightbox(m)}
                  className="w-20 h-20 rounded-xl object-cover cursor-pointer border-2 border-slate-100 hover:border-red-300 transition-colors" />
              )
            }
            {m.uploadStatus === "pending" && (
              <span className="absolute bottom-1 left-1 rounded-full bg-amber-500 w-2.5 h-2.5" title="Not uploaded" />
            )}
            {!readonly && onDelete && (
              <button onClick={() => onDelete(m.id)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md">
                <X size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/20">
              <X size={24} />
            </button>
            {lightbox.isVideo
              ? <video src={lightbox.url || lightbox.base64} controls className="max-w-full max-h-full rounded-xl" onClick={e => e.stopPropagation()} />
              : <img src={lightbox.url || lightbox.base64} alt="full" className="max-w-full max-h-full rounded-xl object-contain" />
            }
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
