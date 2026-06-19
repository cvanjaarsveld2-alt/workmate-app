// ─── Image Viewer ────────────────────────────────────────────────────────────
// Full-screen image overlay. Tap anywhere or hit X to close.
// Browser pinch-zoom and pan work natively — no fancy controls needed.
// Multiple images: dots at the bottom let you switch.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

/**
 * @param {Object[]} images - Array of { url, caption? } — or a single string URL is also accepted.
 * @param {number}   startIndex - Which one to show first.
 * @param {Function} onClose - Called when the viewer dismisses.
 */
export function ImageViewer({ images, startIndex = 0, onClose }) {
  const list = (Array.isArray(images) ? images : [images])
    .filter(Boolean)
    .map(it => typeof it === "string" ? { url: it } : it);
  const [idx, setIdx] = useState(Math.min(startIndex, Math.max(0, list.length - 1)));

  // Esc to close.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && idx > 0) setIdx(i => i - 1);
      if (e.key === "ArrowRight" && idx < list.length - 1) setIdx(i => i + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, list.length, onClose]);

  if (list.length === 0) return null;
  const current = list[idx];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-black flex flex-col"
      onClick={onClose}>

      {/* Close button (top-right) — bigger touch target than X icon alone */}
      <button onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white">
        <X size={22} />
      </button>

      {/* Caption */}
      {current.caption && (
        <div className="absolute top-4 left-4 right-16 z-10 text-white text-sm font-bold px-3 py-2 rounded-lg bg-black/40 backdrop-blur truncate">
          {current.caption}
        </div>
      )}

      {/* Image — fills the viewport, browser handles pinch-zoom & pan */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          src={current.url}
          alt={current.caption || ""}
          className="max-w-full max-h-full object-contain"
          style={{ touchAction: "pinch-zoom" }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Dots — only shown when there's more than one image */}
      {list.length > 1 && (
        <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center gap-2">
          {list.map((_, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              className="w-2.5 h-2.5 rounded-full transition-all"
              style={{ background: i === idx ? "#fff" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>
      )}

      {/* Subtle "tap to close" hint at the bottom */}
      <p className="absolute bottom-2 left-0 right-0 z-10 text-center text-xs text-white/40">
        Tap to close
      </p>
    </motion.div>
  );
}
