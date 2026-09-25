// ─── Business Card Scanner ────────────────────────────────────────────────────
// Camera/gallery picker + AI extraction via Supabase Edge Function
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";
import { supabase, SUPABASE_FUNCTIONS_URL } from "../supabase";
import { genId } from "../lib/helpers";

const EDGE_FUNCTION_URL = `${SUPABASE_FUNCTIONS_URL}/scan-business-card`;

async function compressImage(file, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = img.width / img.height;
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          w = maxWidth;
          h = maxWidth / ratio;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => {
            if (!blob) return reject(new Error("Compression failed"));
            const fr = new FileReader();
            fr.onloadend = () => resolve({ blob, dataUrl: fr.result });
            fr.readAsDataURL(blob);
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadCardImage(blob, userId) {
  // Storage RLS requires the first path segment to be the authenticated user's ID.
  const fileName = `${userId}/contacts/${genId()}.jpg`;
  const { data, error } = await supabase.storage
    .from("powermate-media")
    .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("[CardScanner] Photo upload failed:", error);
    throw new Error("Photo upload failed: " + (error.message || "unknown storage error"));
  }
  // Store the object path: signed links expire, and the bucket is private.
  // Screens sign a fresh link when they show the card (useStoredPhoto).
  return data.path;
}

async function extractCardData(imageBase64) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Card scanning failed");
  return result.data;
}

export function CardScanner({ userId, onExtracted, onCancel }) {
  const [step, setStep] = useState("choose");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  React.useEffect(() => {
    const t = setTimeout(() => cameraInputRef.current?.click(), 100);
    return () => clearTimeout(t);
  }, []);

  async function handleFileSelected(file) {
    if (!file) return;
    setStep("processing");
    setError("");
    try {
      setProgress("Optimizing photo…");
      const { blob, dataUrl } = await compressImage(file);
      setProgress("Uploading…");
      const uploadPromise = uploadCardImage(blob, userId).catch(err => {
        console.error("[CardScanner] Photo upload failed, continuing without photo:", err);
        return { failed: true, message: err.message };
      });
      setProgress("Reading the card…");
      const extracted = await extractCardData(dataUrl);
      setProgress("Almost done…");
      const uploadResult = await uploadPromise;
      const photoUrl = uploadResult?.failed ? null : uploadResult;
      onExtracted({
        ...extracted,
        card_photo_url: photoUrl,
        _photo_upload_error: uploadResult?.failed ? uploadResult.message : null,
      });
    } catch (e) {
      console.error("Scan failed:", e);
      setError(e.message || "Something went wrong");
      setStep("error");
    }
  }

  const triggerCamera = () => cameraInputRef.current?.click();
  const triggerGallery = () => galleryInputRef.current?.click();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden"
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => handleFileSelected(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleFileSelected(e.target.files?.[0])}
      />
      <div
        className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"
        style={{ background: "#F7F3F3" }}
      >
        <p className="text-base font-black text-slate-900">Scan Business Card</p>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:bg-white">
          <X size={18} />
        </button>
      </div>
      <div className="p-4">
        <AnimatePresence mode="wait">
          {step === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-6 flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                <Camera size={30} style={{ color: "#8B1A1A" }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Opening camera…</p>
                <p className="text-xs text-slate-400 mt-1">Point at a business card and take the photo</p>
              </div>
              <button
                onClick={triggerCamera}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white min-h-[52px]"
                style={{ background: "#8B1A1A" }}
              >
                <Camera size={16} /> Open Camera
              </button>
              <button
                onClick={triggerGallery}
                className="text-xs font-bold text-slate-400 py-2 px-4 min-h-[44px]"
              >
                Use a photo from my gallery instead
              </button>
            </motion.div>
          )}
          {step === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 flex flex-col items-center text-center"
            >
              <Loader2 size={42} className="text-red-600 animate-spin mb-4" />
              <p className="text-base font-bold text-slate-900">{progress || "Processing…"}</p>
              <p className="text-xs text-slate-500 mt-1">Takes a few seconds</p>
            </motion.div>
          )}
          {step === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800">Couldn't scan the card</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setStep("choose");
                    setError("");
                  }}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                  style={{ background: "#8B1A1A" }}
                >
                  Try Again
                </button>
                <button
                  onClick={onCancel}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-slate-600 bg-slate-100 min-h-[48px]"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
