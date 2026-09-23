import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Loader2, X, Check } from "lucide-react";
import { BRAND } from "../lib/constants";
import { supabase } from "../supabase";
const SUPABASE_URL = "https://hrqzqyfvbfzrfnuxovvr.supabase.co";
export function VoiceInput({
  onResult,
  placeholder = "Tap mic and speak...",
  lang = "af-ZA",
  className = "",
}) {
  const [mode, setMode] = useState("idle"),
    [transcript, setTranscript] = useState(""),
    [error, setError] = useState(""),
    [language, setLanguage] = useState(lang);
  const recognitionRef = useRef(null),
    mediaRecorderRef = useRef(null),
    chunksRef = useRef([]),
    modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
    },
    [],
  );
  async function startListening() {
    setError("");
    setTranscript("");
    setMode("listening");
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition,
        r = new SR();
      recognitionRef.current = r;
      r.lang = language;
      r.interimResults = true;
      r.continuous = true;
      r.onresult = e =>
        setTranscript(
          Array.from(e.results)
            .map(x => x[0].transcript)
            .join(" "),
        );
      r.onerror = e => {
        if (e.error === "not-allowed") {
          setError("Microphone permission denied. Please allow access.");
          setMode("idle");
        } else if (["service-not-allowed", "audio-capture", "network"].includes(e.error))
          setError("Live speech is unavailable. Tap stop and try server transcription.");
      };
      r.onend = () => {
        if (modeRef.current === "listening") setMode("done");
      };
      try {
        r.start();
      } catch {
        setError("Could not start the microphone. Please try again.");
        setMode("idle");
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }),
        // iPhones record audio/mp4, not webm: pick what this device supports.
        mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported?.(t)),
        r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = r;
      chunksRef.current = [];
      r.ondataavailable = e => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      r.start(250);
    } catch (e) {
      setError(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access."
          : "Microphone not available.",
      );
      setMode("idle");
    }
  }
  async function stopListening() {
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === "recording") {
      setMode("processing");
      const r = mediaRecorderRef.current;
      r.stop();
      r.stream?.getTracks().forEach(t => t.stop());
      await new Promise(resolve => {
        r.onstop = resolve;
        setTimeout(resolve, 500);
      });
      await transcribe(new Blob(chunksRef.current, { type: r.mimeType || "audio/webm" }));
      return;
    }
    setMode(transcript.trim() ? "done" : "idle");
  }
  async function transcribe(blob) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
      const f = new FormData();
      f.append("audio", blob, /mp4/.test(blob.type) ? "recording.m4a" : "recording.webm");
      f.append("language", language === "af-ZA" ? "af" : "en");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: f,
        }),
        d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || `Transcription failed (${res.status})`);
      if (!d.text) throw new Error("No transcript returned");
      setTranscript(d.text.trim());
      setMode("done");
    } catch (e) {
      setError(e?.message || "Transcription failed. Please type manually.");
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
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
    setTranscript("");
    setMode("idle");
    setError("");
  }
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLanguage("en-ZA")}
          className={`px-3 py-1 rounded-full text-xs font-bold ${language === "en-ZA" ? "text-white" : "bg-slate-100 text-slate-500"}`}
          style={language === "en-ZA" ? { background: BRAND.primary } : {}}
        >
          English
        </button>
        <button
          onClick={() => setLanguage("af-ZA")}
          className={`px-3 py-1 rounded-full text-xs font-bold ${language === "af-ZA" ? "text-white" : "bg-slate-100 text-slate-500"}`}
          style={language === "af-ZA" ? { background: BRAND.primary } : {}}
        >
          Afrikaans
        </button>
      </div>
      {(transcript || mode === "listening") && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 min-h-[60px]">
          <p className="text-sm text-slate-700 leading-relaxed">
            {transcript || <span className="text-slate-400 italic">Listening...</span>}
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        {mode === "idle" && (
          <button
            onClick={startListening}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
            style={{ background: BRAND.primary }}
          >
            <Mic size={16} />
            {placeholder === "Tap mic and speak..." ? "Tap to speak" : placeholder}
          </button>
        )}
        {mode === "listening" && (
          <>
            <motion.button
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              onClick={stopListening}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
              style={{ background: "#DC2626" }}
            >
              <MicOff size={16} />
              Stop recording
            </motion.button>
            <button
              onClick={cancel}
              className="p-2.5 rounded-xl bg-slate-100 text-slate-500 min-h-[44px]"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </>
        )}
        {mode === "processing" && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-sm font-bold text-slate-500 min-h-[44px]">
            <Loader2 size={16} className="animate-spin" />
            Transcribing...
          </div>
        )}
        {mode === "done" && transcript && (
          <>
            <button
              onClick={confirm}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
              style={{ background: "#16A34A" }}
            >
              <Check size={16} />
              Use this
            </button>
            <button
              onClick={() => {
                setTranscript("");
                startListening();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 min-h-[44px]"
            >
              <Mic size={16} />
              Redo
            </button>
            <button
              onClick={cancel}
              className="p-2.5 rounded-xl bg-slate-100 text-slate-500 min-h-[44px]"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
