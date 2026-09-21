// ─── Receipt Scanner ──────────────────────────────────────────────────────────
// Capture a receipt photo (camera or gallery), compress, upload to Storage,
// and call the scan-receipt Edge Function for AI extraction.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import { Camera, Loader2, X, Sparkles } from "lucide-react";
import { supabase } from "../supabase";
import { genId } from "../lib/helpers";
import { Card } from "../components/ui";

async function compressImage(file, maxDim = 1600, quality = 0.85) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read the selected image"));
      image.src = sourceUrl;
    });

    let { width, height } = img;
    if (width > height && width > maxDim) {
      height = (height * maxDim) / width;
      width = maxDim;
    } else if (height > maxDim) {
      width = (width * maxDim) / height;
      height = maxDim;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not prepare the image for scanning");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        result => result ? resolve(result) : reject(new Error("Could not compress the image")),
        "image/jpeg",
        quality,
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not prepare the image for AI scanning"));
    reader.readAsDataURL(blob);
  });
}

export function ReceiptScanner({ userId, onExtracted, onCancel, slipType = "till" }) {
  const [stage, setStage]       = useState("idle"); // idle | uploading | scanning
  const [preview, setPreview]   = useState(null);
  const [error, setError]       = useState("");
  const [debug, setDebug]       = useState([]); // visible step log for iOS
  const [uploadedPath, setUploadedPath] = useState(null);
  const previewUrlRef = useRef(null);
  const uploadedPathRef = useRef(null);
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // Auto-open camera immediately on mount — no choice screen needed
  React.useEffect(() => {
    const t = setTimeout(() => cameraRef.current?.click(), 100);
    return () => clearTimeout(t);
  }, []);

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    setDebug(d => [...d, `${t} · ${msg}`].slice(-8));
    if (import.meta.env.DEV) console.log("[ReceiptScanner]", msg);
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setError("");
    setDebug([]);
    setUploadedPath(null);
    uploadedPathRef.current = null;
    try {
      log("Compressing image…");
      const compressedBlob = await compressImage(file);
      log(`Compressed (${Math.round(compressedBlob.size / 1024)} KB)`);

      // WebKit/iOS can throw the opaque "Load failed" error for fetch(data:image/...).
      // Upload the Blob directly; only convert it to base64 for the AI request.
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(compressedBlob);
      previewUrlRef.current = previewUrl;
      setPreview(previewUrl);
      setStage("uploading");

      // iOS/WebKit was failing during direct browser-to-Storage uploads.
      // Send the compressed image to the authenticated Edge Function instead.
      // The server stores it first, then runs AI, so the browser never uploads to Storage.
      setStage("scanning");
      log("Preparing secure receipt scan…");
      const imageBase64 = await blobToDataUrl(compressedBlob);
      log(`Prepared image (${Math.round(imageBase64.length / 1024)} KB)`);
      log(`Sending to secure scanner (${slipType})…`);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      log("Calling secure receipt scanner…");
      const { data: extracted, error: functionError } = await supabase.functions.invoke("scan-receipt", {
        body: { imageBase64, slipType },
      });

      if (functionError) {
        log("Receipt scanner returned an error");
        const errBody = functionError.context?.body || {};
        if (errBody.receipt_url) {
          setUploadedPath(errBody.receipt_url);
          uploadedPathRef.current = errBody.receipt_url;
          log("Receipt saved ✓ — AI reading failed");
        }
        throw new Error(errBody.error || functionError.message || "Receipt scan failed");
      }

      if (!extracted) {
        throw new Error("Receipt scanner returned no data");
      }

      log("Receipt scanner replied (OK)");
      if (extracted.receipt_url) {
        setUploadedPath(extracted.receipt_url);
        uploadedPathRef.current = extracted.receipt_url;
      }
      log("Got extracted data ✓");

    } catch (e) {
      console.error("Receipt scan error:", e);
      const message = e?.message || "Automatic receipt scanning failed";
      if (uploadedPathRef.current) {
        setError(`Receipt saved safely, but automatic reading failed: ${message}`);
        log("Receipt is saved — manual entry is safe");
      } else {
        setError(message);
      }
      setStage("idle");
    }
  }

  const busy = stage === "uploading" || stage === "scanning";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: "#8B1A1A" }} />
          <p className="text-base font-black text-slate-800">{slipType === "payment" ? "Scan Payment Slip" : "Scan Till Slip"}</p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <X size={18} />
        </button>
      </div>

      {preview && (
        <div className="rounded-xl overflow-hidden border border-slate-200 relative">
          <img src={preview} alt="Receipt" className="w-full max-h-56 object-contain bg-slate-50" />
          {busy && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
              <Loader2 size={28} className="animate-spin mb-2" />
              <p className="text-sm font-bold">{stage === "uploading" ? "Uploading…" : "AI reading receipt…"}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <p className="text-xs text-red-500 mt-0.5">
            {uploadedPath ? "Your photo is already stored. You will not lose it." : "No receipt was stored yet."}
          </p>
          {uploadedPath && (
            <button
              type="button"
              onClick={() => onExtracted({ receipt_url: uploadedPath, scan_failed: true })}
              className="w-full rounded-xl bg-white border-2 border-red-200 py-3 text-sm font-bold text-red-700 min-h-[48px]"
            >
              Keep receipt & enter details manually
            </button>
          )}
        </div>
      )}

      {debug.length > 0 && (busy || error) && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Debug log</p>
          <div className="space-y-0.5">
            {debug.map((line, i) => (
              <p key={i} className="text-xs font-mono text-slate-600 break-all">{line}</p>
            ))}
          </div>
        </div>
      )}

      {!busy && (
        <>
          {!preview && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                <Camera size={30} style={{ color: "#8B1A1A" }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Opening camera…</p>
                <p className="text-xs text-slate-400 mt-1">
                  {slipType === "payment" ? "Point at the card payment slip" : "Point at the till slip"}
                </p>
              </div>
              <button onClick={() => cameraRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                style={{ background: "#8B1A1A" }}>
                <Camera size={16} /> Open Camera
              </button>
              <button onClick={() => galleryRef.current?.click()}
                className="text-xs font-bold text-slate-400 py-2 px-4 min-h-[44px]">
                Use a photo from my gallery instead
              </button>
              <button onClick={onCancel} className="text-xs text-slate-300 py-1">
                Cancel
              </button>
            </div>
          )}
          {preview && (
            <button onClick={() => cameraRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold border-2 border-slate-200 text-slate-600 min-h-[52px]">
              <Camera size={16} /> Retake photo
            </button>
          )}
        </>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; handleFile(file); }} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
    </Card>
  );
}
