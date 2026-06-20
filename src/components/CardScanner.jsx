// ─── Business Card Scanner ────────────────────────────────────────────────────
// Camera/gallery picker + AI extraction via Supabase Edge Function
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image as ImageIcon, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabase";
import { genId } from "../lib/helpers";

const EDGE_FUNCTION_URL = "https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/scan-business-card";

// ─── Compress image before upload ────────────────────────────────────────────
async function compressImage(file, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
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
          (blob) => {
            if (!blob) return reject(new Error("Compression failed"));
            const fr = new FileReader();
            fr.onloadend = () => resolve({ blob, dataUrl: fr.result });
            fr.readAsDataURL(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Upload image to Supabase Storage ────────────────────────────────────────
async function uploadCardImage(blob, userId) {
  const fileName = `contacts/${userId}/${genId()}.jpg`;
  const { data, error } = await supabase.storage
    .from("powermate-media")
    .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });

  if (error) {
    // Surface the real reason instead of silently returning null — a missing
    // bucket, an RLS policy, or a bad path all look identical to the user
    // otherwise ("scan worked, but no photo" with zero explanation).
    console.error("[CardScanner] Photo upload failed:", error);
    throw new Error("Photo upload failed: " + (error.message || "unknown storage error"));
  }

  const { data: pub } = supabase.storage.from("powermate-media").getPublicUrl(data.path);
  return pub.publicUrl;
}

// ─── Call the Edge Function to extract data ──────────────────────────────────
async function extractCardData(imageBase64) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ imageBase64 }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || "Card scanning failed");
  }

  return result.data;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function CardScanner({ userId, onExtracted, onCancel }) {
  const [step, setStep]       = useState("choose"); // choose | processing | review | error
  const [error, setError]     = useState("");
  const [progress, setProgress] = useState("");
  const [cardImageUrl, setCardImageUrl] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  async function handleFileSelected(file) {
    if (!file) return;
    setStep("processing");
    setError("");

    try {
      // Step 1 — compress
      setProgress("Optimizing photo…");
      const { blob, dataUrl } = await compressImage(file);

      // Step 2 — upload to storage (in parallel with AI extraction)
      setProgress("Uploading…");
      const uploadPromise = uploadCardImage(blob, userId).catch(err => {
        // Don't let a photo failure kill the whole scan — the AI-extracted
        // name/company/etc is still valuable even with no photo attached.
        console.error("[CardScanner] Photo upload failed, continuing without photo:", err);
        return { failed: true, message: err.message };
      });

      // Step 3 — call AI
      setProgress("Reading the card…");
      const extracted = await extractCardData(dataUrl);

      // Step 4 — wait for upload to finish too
      setProgress("Almost done…");
      const uploadResult = await uploadPromise;
      const photoUrl = (uploadResult && uploadResult.failed) ? null : uploadResult;

      // Pass data back to parent
      onExtracted({
        ...extracted,
        card_photo_url: photoUrl,
        _photo_upload_error: (uploadResult && uploadResult.failed) ? uploadResult.message : null,
      });
    } catch (e) {
      console.error("Scan failed:", e);
      setError(e.message || "Something went wrong");
      setStep("error");
    }
  }

  function triggerCamera() {
    cameraInputRef.current?.click();
  }

  function triggerGallery() {
    galleryInputRef.current?.click();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between" style={{ background: "#F7F3F3" }}>
        <p className="text-base font-black text-slate-900">Scan Business Card</p>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:bg-white">
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <AnimatePresence mode="wait">

          {step === "choose" && (
            <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-3">
              <p className="text-sm text-slate-500 mb-3">
                Take a photo or upload an existing one. AI will extract the contact details automatically.
              </p>
              <button onClick={triggerCamera}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-red-300 transition-colors text-left min-h-[68px]">
                <div className="w-11 h-11 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Camera size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900">Take Photo</p>
                  <p className="text-xs text-slate-500">Use camera to snap the card</p>
                </div>
              </button>
              <button onClick={triggerGallery}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-red-300 transition-colors text-left min-h-[68px]">
                <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <ImageIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900">Upload Photo</p>
                  <p className="text-xs text-slate-500">Pick an existing photo from gallery</p>
                </div>
              </button>
            </motion.div>
          )}

          {step === "processing" && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-8 flex flex-col items-center text-center">
              <Loader2 size={42} className="text-red-600 animate-spin mb-4" />
              <p className="text-base font-bold text-slate-900">{progress || "Processing…"}</p>
              <p className="text-xs text-slate-500 mt-1">Takes a few seconds</p>
            </motion.div>
          )}

          {step === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800">Couldn't scan the card</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setStep("choose"); setError(""); }}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                  style={{ background: "#8B1A1A" }}>
                  Try Again
                </button>
                <button onClick={onCancel}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-slate-600 bg-slate-100 min-h-[48px]">
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
