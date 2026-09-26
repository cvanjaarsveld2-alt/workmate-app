// ─── Photos with captions ─────────────────────────────────────────────────────
// Camera/gallery photos with a caption each, used by detailed-quote sections
// and job cards. New photos are kept as base64 on the record until sync
// uploads them (src/lib/sync.js uploadPhotosBeforePush) and stores the path.
import React from "react";
import { X } from "lucide-react";
import { MediaPicker } from "./MediaComponents";
import { genId } from "../lib/helpers";
import { useStoredPhoto } from "../lib/useStoredPhoto";

function Thumb({ photo }) {
  const stored = useStoredPhoto(photo.base64 ? null : photo.storage_path);
  const src = photo.base64 || stored.url;
  return src ? (
    <img src={src} alt={photo.caption || "Photo"} className="h-24 w-full object-cover rounded-lg" />
  ) : (
    <div className="h-24 w-full rounded-lg bg-slate-100 flex items-center justify-center text-[11px] text-slate-500 text-center px-1">
      {stored.status === "loading" ? "Loading…" : "Photo saved"}
    </div>
  );
}

export function CaptionedPhotos({ photos = [], onChange, max = 12 }) {
  const list = (Array.isArray(photos) ? photos : []).filter(p => p && typeof p === "object");
  return (
    <div className="stack-y-2">
      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {list.map(p => (
            <div key={p.id} className="relative">
              <Thumb photo={p} />
              <button
                type="button"
                onClick={() => onChange(list.filter(x => x.id !== p.id))}
                aria-label="Remove photo"
                className="absolute top-1 right-1 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X size={14} />
              </button>
              <input
                value={p.caption || ""}
                onChange={e => onChange(list.map(x => (x.id === p.id ? { ...x, caption: e.target.value } : x)))}
                placeholder="Caption"
                maxLength={200}
                aria-label="Photo caption"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      )}
      {list.length < max && (
        <MediaPicker
          onAdd={m => {
            if (m.isVideo || !m.base64) return;
            onChange(
              [...list, { id: m.id || genId(), base64: m.base64, caption: "", uploadStatus: "pending" }].slice(0, max),
            );
          }}
        />
      )}
    </div>
  );
}
