// ─── StorageImage ─────────────────────────────────────────────────────────────
// <img> for a photo kept in private Supabase Storage. Saved links go stale:
// signed links expire, and public links stopped working when the bucket was
// made private. This asks for a fresh signed link before showing the image,
// and shows a plain placeholder if the photo can't be loaded (e.g. offline).
import React, { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { createFreshMediaUrl } from "../lib/helpers";

export function StorageImage({ src, bucket = "powermate-media", alt = "", className = "", fallbackText = "Photo unavailable" }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setUrl(null);
    if (!src) return;
    // data:/blob: URLs (a photo not yet uploaded) can be shown as they are.
    if (/^(data|blob):/.test(src)) {
      setUrl(src);
      return;
    }
    createFreshMediaUrl(src, bucket)
      .then(fresh => { if (alive) fresh ? setUrl(fresh) : setFailed(true); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [src, bucket]);

  if (failed)
    return (
      <div className={`flex flex-col items-center justify-center gap-1.5 text-slate-400 ${className}`}>
        <ImageOff size={22} />
        <span className="text-xs font-bold">{navigator.onLine ? fallbackText : "Connect to load the photo"}</span>
      </div>
    );
  if (!url) return <div className={`animate-pulse bg-slate-100 ${className}`} />;
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
