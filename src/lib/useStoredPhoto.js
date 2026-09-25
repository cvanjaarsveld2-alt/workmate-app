// ─── Stored photos ────────────────────────────────────────────────────────────
// Photos live in private Supabase Storage, and saved links go stale: signed
// links expire, and public links stopped working when the bucket was made
// private. useStoredPhoto asks for a fresh signed link and preloads the image,
// so a screen can show the photo once it's really there, or leave it out
// entirely when it can't load (a teammate without access to the uploader's
// files, or no signal) instead of showing an empty box with a broken image.
import { useEffect, useState } from "react";
import { createFreshMediaUrl } from "./helpers";

// status: "loading" | "ready" | "unavailable"
export function useStoredPhoto(src, bucket = "powermate-media") {
  const [state, setState] = useState({ url: null, status: src ? "loading" : "unavailable" });

  useEffect(() => {
    let alive = true;
    if (!src) {
      setState({ url: null, status: "unavailable" });
      return;
    }
    setState({ url: null, status: "loading" });
    const preload = url =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = reject;
        img.src = url;
      });
    // data:/blob: URLs (a photo not yet uploaded) need no signing.
    (/^(data|blob):/.test(src) ? Promise.resolve(src) : createFreshMediaUrl(src, bucket))
      .then(url => (url ? preload(url) : Promise.reject(new Error("no url"))))
      .then(url => alive && setState({ url, status: "ready" }))
      .catch(() => alive && setState({ url: null, status: "unavailable" }));
    return () => {
      alive = false;
    };
  }, [src, bucket]);

  return state;
}
