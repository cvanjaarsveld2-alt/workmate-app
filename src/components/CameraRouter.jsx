// ─── CameraRouter ─────────────────────────────────────────────────────────────
// Universal camera-first scanner.
// Opens the camera immediately. After the user captures a photo, it sends a
// compressed frame to the AI which decides if it's a receipt/slip OR a business
// card. Then it routes to ReceiptScanner or CardScanner automatically.
//
// Usage:
//   <CameraRouter
//     userId={userId}
//     onReceipt={extractedData => { /* handle expense receipt */ }}
//     onCard={extractedData => { /* handle business card */ }}
//     onCancel={() => { /* close */ }}
//   />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Sparkles, RefreshCw, Receipt, CreditCard, RotateCcw } from "lucide-react";
import { supabase } from "../supabase";
import { ReceiptScanner } from "./ReceiptScanner";
import { CardScanner } from "./CardScanner";

// ─── AI classification: receipt vs business card ─────────────────────────────
// Sends the captured image to Claude via the Anthropic API (via Supabase Edge).
// Returns "receipt" | "card" | "unknown".
async function classifyImage(base64DataUrl) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Extract base64 from data URL (strip "data:image/jpeg;base64,")
    const base64 = base64DataUrl.split(",")[1];
    const mediaType = base64DataUrl.split(";")[0].replace("data:", "");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 50,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Look at this image and classify it. Reply with EXACTLY ONE word only:
- "receipt" if this is a till slip, invoice, payment slip, fuel receipt, or any financial document
- "card" if this is a business card, name card, or contact card
- "unknown" if you cannot tell

Reply with only the single word.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) return "unknown";
    const result = await response.json();
    const text = (result.content?.[0]?.text || "").trim().toLowerCase();
    if (text.includes("receipt")) return "receipt";
    if (text.includes("card")) return "card";
    return "unknown";
  } catch (e) {
    console.warn("CameraRouter classify failed:", e);
    return "unknown";
  }
}

// ─── Compress + capture helper ───────────────────────────────────────────────
function captureFrameFromVideo(videoEl, quality = 0.75) {
  const canvas = document.createElement("canvas");
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CameraRouter({ userId, onReceipt, onCard, onCancel }) {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const [cameraReady, setCameraReady]   = useState(false);
  const [cameraError, setCameraError]   = useState(null);
  const [phase, setPhase]              = useState("camera"); // "camera" | "classifying" | "receipt" | "card" | "unknown"
  const [capturedImage, setCapturedImage] = useState(null);
  const [facingMode, setFacingMode]    = useState("environment"); // rear cam default

  // ── Start camera ──────────────────────────────────────────────────────────
  async function startCamera(facing = facingMode) {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraReady(true);
      setCameraError(null);
    } catch (e) {
      console.error("Camera error:", e);
      setCameraError("Could not open camera — check permissions in Settings and try again.");
    }
  }

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  function flipCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  }

  // ── Capture + classify ────────────────────────────────────────────────────
  async function capture() {
    if (!videoRef.current || !cameraReady) return;
    const dataUrl = captureFrameFromVideo(videoRef.current);
    setCapturedImage(dataUrl);
    setPhase("classifying");

    // Stop camera while classifying (saves battery, shows preview)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    const type = await classifyImage(dataUrl);
    if (type === "receipt") {
      setPhase("receipt");
    } else if (type === "card") {
      setPhase("card");
    } else {
      setPhase("unknown");
    }
  }

  function retake() {
    setCapturedImage(null);
    setPhase("camera");
    startCamera();
  }

  // ── Phase: routed to scanner ───────────────────────────────────────────────
  if (phase === "receipt") {
    return (
      <ReceiptScanner
        userId={userId}
        slipType="till"
        prefillImage={capturedImage}
        onExtracted={onReceipt}
        onCancel={onCancel}
      />
    );
  }
  if (phase === "card") {
    return (
      <CardScanner
        userId={userId}
        prefillImage={capturedImage}
        onScanned={onCard}
        onCancel={onCancel}
      />
    );
  }

  // ── Phase: camera or classifying or unknown ────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#0a0a0a" }}
    >
      {/* Camera viewport */}
      <div className="relative flex-1 overflow-hidden">
        {!capturedImage ? (
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <img
            src={capturedImage}
            alt="Captured"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Dark overlay during classification */}
        <AnimatePresence>
          {phase === "classifying" && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ background: "rgba(0,0,0,0.65)" }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white mb-4"
              />
              <p className="text-white text-base font-bold">Identifying document…</p>
              <p className="text-white/60 text-sm mt-1">AI is deciding what this is</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unknown / can't tell */}
        <AnimatePresence>
          {phase === "unknown" && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8"
              style={{ background: "rgba(0,0,0,0.75)" }}>
              <p className="text-white text-lg font-black mb-2 text-center">Not sure what that is</p>
              <p className="text-white/70 text-sm text-center mb-6">The AI couldn't identify this as a receipt or business card. What would you like to scan?</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setPhase("receipt")}
                  className="flex-1 flex flex-col items-center gap-2 bg-white/15 backdrop-blur rounded-2xl py-4 border border-white/20 active:bg-white/25">
                  <Receipt size={24} className="text-white" />
                  <span className="text-white text-sm font-bold">Receipt / Slip</span>
                </button>
                <button onClick={() => setPhase("card")}
                  className="flex-1 flex flex-col items-center gap-2 bg-white/15 backdrop-blur rounded-2xl py-4 border border-white/20 active:bg-white/25">
                  <CreditCard size={24} className="text-white" />
                  <span className="text-white text-sm font-bold">Business Card</span>
                </button>
              </div>
              <button onClick={retake}
                className="mt-4 flex items-center gap-2 text-white/60 text-sm font-medium py-2 px-4">
                <RotateCcw size={14} /> Retake photo
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8"
            style={{ background: "rgba(0,0,0,0.85)" }}>
            <Camera size={40} className="text-white/40 mb-3" />
            <p className="text-white font-bold text-center mb-2">Camera not available</p>
            <p className="text-white/60 text-sm text-center mb-6">{cameraError}</p>
            <div className="flex gap-3">
              <button onClick={retake}
                className="flex items-center gap-2 bg-white text-slate-900 font-bold text-sm rounded-xl px-5 py-3">
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          </div>
        )}

        {/* Viewfinder overlay — subtle guide corners */}
        {phase === "camera" && cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-48 relative">
              {[["top-0 left-0 border-t-4 border-l-4 rounded-tl-xl", ""],
                ["top-0 right-0 border-t-4 border-r-4 rounded-tr-xl", ""],
                ["bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl", ""],
                ["bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl", ""]
              ].map(([cls], i) => (
                <div key={i} className={`absolute w-8 h-8 border-white/70 ${cls}`} />
              ))}
            </div>
            <p className="absolute bottom-1/4 text-white/80 text-xs font-medium">
              Aim at a receipt or business card
            </p>
          </div>
        )}

        {/* Top bar — close + flip */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe pt-4">
          <button onClick={onCancel}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.5)" }}>
            <X size={20} className="text-white" />
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.45)" }}>
            <Sparkles size={12} className="text-purple-300" />
            <span className="text-white text-xs font-bold">AI will identify document type</span>
          </div>
          {phase === "camera" && (
            <button onClick={flipCamera}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.5)" }}>
              <RefreshCw size={18} className="text-white" />
            </button>
          )}
          {phase !== "camera" && <div className="w-10 h-10" />}
        </div>
      </div>

      {/* Bottom bar — shutter or manual choice */}
      {phase === "camera" && (
        <div className="flex flex-col items-center gap-4 pb-safe pb-8 pt-6"
          style={{ background: "rgba(0,0,0,0.9)" }}>
          {/* Shutter button */}
          <button
            onClick={capture}
            disabled={!cameraReady}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>

          {/* Manual override options */}
          <div className="flex gap-6">
            <button onClick={() => setPhase("receipt")}
              className="flex items-center gap-1.5 text-white/60 text-xs font-medium active:text-white">
              <Receipt size={14} /> Force receipt
            </button>
            <button onClick={() => setPhase("card")}
              className="flex items-center gap-1.5 text-white/60 text-xs font-medium active:text-white">
              <CreditCard size={14} /> Force card
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
