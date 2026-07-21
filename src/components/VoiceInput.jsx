// ─── VoiceInput ───────────────────────────────────────────────────────────────
// Tap mic → speak in English or Afrikaans → text appears in the target field.
// Uses Web Speech API for real-time transcription (works offline for English).
// Falls back to OpenAI Whisper via Edge Function for Afrikaans accuracy.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, X, Check } from "lucide-react";
import { BRAND } from "../lib/constants";

const SUPABASE_URL = "https://hrqzqyfvbfzrfnuxovvr.supabase.co";

export function VoiceInput({ onResult, placeholder = "Tap mic and speak...", lang = "af-ZA", className = "" }) {
  const [mode, setMode]         = useState("idle"); // idle | listening | processing | done
  const [transcript, setTranscript] = useState("");
  const [error, setError]       = useState("");
  const [language, setLanguage] = useState(lang); // af-ZA or en-ZA
  const recognitionRef          = useRef(null);
  const mediaRecorderRef        = useRef(null);
  const chunksRef               = useRef([]);

  // Clean up on unmount
  useEffect(() => () => {
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
  }, []);

  async function startListening() {
    setError("");
    setTranscript("");
    setMode("listening");

    // Try Web Speech API first (works offline, good for English)
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = language;
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e) => {
        const text = Array.from(e.results).map(r => r[0].transcript).join(" ");
        setTranscript(text);
      };
      recognition.onerror = (e) => {
        if (e.error === "not-allowed") {
          setError("Microphone permission denied. Please allow access.");
          setMode("idle");
        }
        // For other errors, fall through to Whisper
      };
      recognition.onend = () => {
        if (mode === "listening") setMode("idle");
      };
      recognition.start();
      return;
    }

    // Fallback: record audio blob → Whisper
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100);
    } catch (e) {
      setError("Microphone not available.");
      setMode("idle");
    }
  }

  async function stopListening() {
    recognitionRef.current?.stop();

    // If we were using MediaRecorder, send to Whisper
    if (mediaRecorderRef.current?.state === "recording") {
      setMode("processing");
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());

      await new Promise(r => setTimeout(r, 300)); // wait for final chunk
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      await transcribeWithWhisper(blob);
      return;
    }
    setMode("done");
  }

  async function transcribeWithWhisper(blob) {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("language", language === "af-ZA" ? "af" : "en");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.text) {
        setTranscript(data.text.trim());
        setMode("done");
      } else {
        setError("Could not transcribe. Please try again.");
        setMode("idle");
      }
    } catch (e) {
      setError("Transcription failed. Please type manually.");
      setMode("idle");
    }
  }

  function confirm() {
    if (transcript.trim()) onResult(transcript.trim());
    setTranscript("");
    setMode("idle");
  }

  function cancel() {
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
    setTranscript("");
    setMode("idle");
    setError("");
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Language toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLanguage("en-ZA")}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${language === "en-ZA" ? "text-white" : "bg-slate-100 text-slate-500"}`}
          style={language === "en-ZA" ? { background: BRAND.primary } : {}}>
          English
        </button>
        <button
          onClick={() => setLanguage("af-ZA")}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${language === "af-ZA" ? "text-white" : "bg-slate-100 text-slate-500"}`}
          style={language === "af-ZA" ? { background: BRAND.primary } : {}}>
          Afrikaans
        </button>
      </div>

      {/* Transcript display */}
      {(transcript || mode === "listening") && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 min-h-[60px]">
          <p className="text-sm text-slate-700 leading-relaxed">
            {transcript || <span className="text-slate-300 italic">Listening...</span>}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {mode === "idle" && (
          <button onClick={startListening}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
            style={{ background: BRAND.primary }}>
            <Mic size={16} /> Hold to speak
          </button>
        )}
        {mode === "listening" && (
          <>
            <motion.button
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              onClick={stopListening}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
              style={{ background: "#DC2626" }}>
              <MicOff size={16} /> Stop recording
            </motion.button>
            <button onClick={cancel} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 min-h-[44px]">
              <X size={16} />
            </button>
          </>
        )}
        {mode === "processing" && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-sm font-bold text-slate-500 min-h-[44px]">
            <Loader2 size={16} className="animate-spin" /> Transcribing...
          </div>
        )}
        {mode === "done" && transcript && (
          <>
            <button onClick={confirm}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
              style={{ background: "#16A34A" }}>
              <Check size={16} /> Use this
            </button>
            <button onClick={() => { setTranscript(""); setMode("listening"); startListening(); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 min-h-[44px]">
              <Mic size={16} /> Redo
            </button>
            <button onClick={cancel} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 min-h-[44px]">
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
