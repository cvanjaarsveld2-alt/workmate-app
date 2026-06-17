// ─── Receipt Scanner ──────────────────────────────────────────────────────────
// Capture a receipt photo (camera or gallery), compress, upload to Storage,
// and call the scan-receipt Edge Function for AI extraction.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Camera, Image as ImageIcon, Loader2, X, Sparkles } from "lucide-react";
import { supabase } from "../supabase";
import { genId } from "../lib/helpers";
import { Card, Btn } from "../components/ui";

const FUNCTION_URL = "https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/scan-receipt";

async function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
        else if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ReceiptScanner({ userId, onExtracted, onCancel, slipType = "till" }) {
  const [stage, setStage]       = useState("idle"); // idle | uploading | scanning
  const [preview, setPreview]   = useState(null);
  const [error, setError]       = useState("");
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    try {
      const compressed = await compressImage(file);
      setPreview(compressed);
      setStage("uploading");

      // Upload to Storage (private bucket — store the PATH, sign on read)
      // Both slip types live in the same private 'receipts' bucket, but in
      // different subfolders so they're easy to tell apart on inspection.
      const subfolder = slipType === "payment" ? "payment-slips" : "receipts";
      const path = `receipts/${userId}/${subfolder}/${genId()}.jpg`;
      const blob = await (await fetch(compressed)).blob();
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, blob, {
        contentType: "image/jpeg", upsert: false,
      });
      if (upErr) throw new Error("Upload failed: " + upErr.message);

      // Call AI scan — with a hard 60 second timeout so an iOS silent-hang
      // becomes a visible error instead of an endless spinner.
      setStage("scanning");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let res;
      try {
        res = await fetch(FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ imageBase64: compressed, slipType }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === "AbortError") {
          throw new Error("AI scan timed out after 60s — the function may not be deployed correctly.");
        }
        throw new Error("Network error: " + (fetchErr.message || "couldn't reach the AI"));
      }
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `AI scan failed (HTTP ${res.status})`);
      }

      const extracted = await res.json();
      // Store the storage PATH (not a public URL); display code signs it on demand.
      onExtracted({ ...extracted, receipt_url: path });
    } catch (e) {
      console.error("Receipt scan error:", e);
      setError(e.message || "Something went wrong");
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
        <div className="rounded-xl bg-red-50 border border-red-200 p-3">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <p className="text-xs text-red-500 mt-0.5">Try again, or enter the details manually.</p>
        </div>
      )}

      {!busy && (
        <>
          <p className="text-sm text-slate-500">
            {slipType === "payment"
              ? "Take a clear photo of the card payment slip — AI will read the amount to verify it matches the till total."
              : "Take a clear photo of the slip — AI will read the amount, date, vendor and category for you to confirm."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 py-4 hover:border-red-300 hover:bg-red-50 transition-colors min-h-[88px]">
              <Camera size={24} style={{ color: "#8B1A1A" }} />
              <span className="text-sm font-bold text-slate-700">Camera</span>
            </button>
            <button onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 py-4 hover:border-red-300 hover:bg-red-50 transition-colors min-h-[88px]">
              <ImageIcon size={24} style={{ color: "#8B1A1A" }} />
              <span className="text-sm font-bold text-slate-700">Gallery</span>
            </button>
          </div>
          <button onClick={onCancel} className="w-full text-sm font-bold text-slate-400 py-2">
            Enter manually instead
          </button>
        </>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
    </Card>
  );
}
