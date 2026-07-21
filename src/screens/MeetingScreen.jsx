// ─── MeetingScreen ────────────────────────────────────────────────────────────
// Record a meeting, auto-transcribe with Whisper, auto-format into
// structured meeting minutes with action items using GPT-4o.
// Saves as a Field Note linked to the client.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Loader2, FileText, Check, X, Clock,
  Users, MapPin, ChevronRight, Trash2, Play, Square,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { Card, Btn, Field, Toast, Empty, PageHeader, ClientSelector } from "../components/ui";
import { todayISO, genId, smartDate } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { offlineSave } from "../offline/offlineDb";

const SUPABASE_URL = "https://hrqzqyfvbfzrfnuxovvr.supabase.co";

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MeetingScreen({ data, setData, userId, userEmail, teamId, onNavigate }) {
  const [phase, setPhase]             = useState("setup");   // setup | recording | processing | review | saved
  const [meetingTitle, setMeetingTitle] = useState("");
  const [clientId, setClientId]       = useState(null);
  const [attendees, setAttendees]     = useState("");
  const [location, setLocation]       = useState("");
  const [language, setLanguage]       = useState("en");      // en | af | mixed
  const [duration, setDuration]       = useState(0);
  const [minutes, setMinutes]         = useState(null);      // structured output
  const [error, setError]             = useState("");
  const [toast, setToast]             = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const timerRef         = useRef(null);
  const startTimeRef     = useRef(null);

  const clients = (data.clients || []).filter(c => c.user_id === userId || c.assigned_to_user_id === userId);
  const selectedClient = clients.find(c => c.id === clientId);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }, []);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus" : "audio/webm",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      startTimeRef.current = Date.now();
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      setPhase("recording");
    } catch (e) {
      setError("Microphone permission required. Please allow access and try again.");
    }
  }

  async function stopRecording() {
    clearInterval(timerRef.current);
    if (!mediaRecorderRef.current) return;
    setPhase("processing");
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    await new Promise(r => setTimeout(r, 500));

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    await processRecording(blob);
  }

  async function processRecording(blob) {
    try {
      // Step 1: Transcribe with Whisper
      const formData = new FormData();
      formData.append("audio", blob, "meeting.webm");
      formData.append("language", language === "mixed" ? "" : language);
      formData.append("prompt", "This is a business meeting in the mining and industrial sector. " +
        "Participants may speak English and Afrikaans. Companies discussed include Power Works.");

      const transcribeRes = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
        method: "POST", body: formData,
      });
      const { text: transcript, error: transcriptError } = await transcribeRes.json();

      if (transcriptError || !transcript) throw new Error("Transcription failed");

      // Step 2: Format into meeting minutes with GPT-4o
      const context = [
        meetingTitle && `Meeting: ${meetingTitle}`,
        selectedClient && `Client: ${selectedClient.company}${selectedClient.branch ? ` — ${selectedClient.branch}` : ""}`,
        attendees && `Attendees: ${attendees}`,
        location && `Location: ${location}`,
        `Date: ${new Date().toLocaleDateString("en-ZA")}`,
        `Duration: ${formatDuration(duration)}`,
      ].filter(Boolean).join("\n");

      const formatRes = await fetch(`${SUPABASE_URL}/functions/v1/format-meeting-minutes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, context }),
      });
      const formatted = await formatRes.json();
      if (formatted.error) throw new Error(formatted.error);

      setMinutes({ ...formatted, transcript, rawDuration: duration });
      setPhase("review");
    } catch (e) {
      setError(e.message || "Processing failed. Please try again.");
      setPhase("setup");
    }
  }

  function saveAsNote(saveTarget) {
    // saveTarget: "Notes" or "Followups"
    const client = selectedClient;
    const noteText = [
      `# ${minutes.title || meetingTitle || "Meeting Notes"}`,
      `📅 ${new Date().toLocaleDateString("en-ZA")} · ⏱ ${formatDuration(minutes.rawDuration)}`,
      attendees && `👥 ${attendees}`,
      location && `📍 ${location}`,
      "",
      "## Summary",
      minutes.summary,
      "",
      minutes.keyPoints?.length ? "## Key Discussion Points\n" + minutes.keyPoints.map(p => `• ${p}`).join("\n") : "",
      "",
      minutes.decisions?.length ? "## Decisions Made\n" + minutes.decisions.map(d => `✅ ${d}`).join("\n") : "",
      "",
      minutes.actionItems?.length ? "## Action Items\n" + minutes.actionItems.map(a => `☐ ${a.action}${a.owner ? ` — ${a.owner}` : ""}${a.deadline ? ` (by ${a.deadline})` : ""}`).join("\n") : "",
      "",
      minutes.nextMeeting ? `## Next Meeting\n${minutes.nextMeeting}` : "",
    ].filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();

    const note = withTeamId({
      id: genId(),
      user_id: userId,
      client: client?.company || "",
      client_id: clientId || null,
      note: noteText,
      urgency: "Normal",
      resolved: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
      source: "meeting_recording",
    }, teamId);

    setData(d => ({
      ...d,
      notes: [note, ...(d.notes || [])],
      syncQueue: [{ id: genId(), table: "notes", action: "insert", data: note, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    offlineSave("notes", note).catch(() => {});

    // Also create follow-up action items
    if (minutes.actionItems?.length && saveTarget === "both") {
      minutes.actionItems.forEach(item => {
        if (!item.deadline && !item.action) return;
        const fu = withTeamId({
          id: genId(), user_id: userId,
          title: item.action,
          client: client?.company || "",
          client_id: clientId || null,
          date: item.deadline || todayISO(),
          notes: `Action from meeting: ${minutes.title || meetingTitle}`,
          completed: false,
          sync_status: "pending",
          created_at: new Date().toISOString(),
        }, teamId);
        setData(d => ({
          ...d,
          followups: [fu, ...(d.followups || [])],
          syncQueue: [{ id: genId(), table: "followups", action: "insert", data: fu, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
        }));
        offlineSave("followups", fu).catch(() => {});
      });
    }

    setToast(`Meeting minutes saved${minutes.actionItems?.length ? ` + ${minutes.actionItems.length} follow-ups created` : ""}`);
    setPhase("saved");
    setTimeout(() => onNavigate?.("Notes"), 1500);
  }

  // ── PHASE: setup ──────────────────────────────────────────────────────────
  if (phase === "setup") return (
    <div className="space-y-4">
      <PageHeader title="Record Meeting" />

      <Card className="p-4 space-y-4">
        <Field label="Meeting title (optional)" value={meetingTitle}
          onChange={setMeetingTitle} placeholder="e.g. Site visit Anglo Sishen" />

        <ClientSelector label="Client (optional)" value={clientId}
          onChange={v => setClientId(v || null)} clients={clients} placeholder="Link to a client…" />

        <Field label="Attendees" value={attendees}
          onChange={setAttendees} placeholder="e.g. Tshidi, Greg, Christo" />

        <Field label="Location" value={location}
          onChange={setLocation} placeholder="e.g. Anglo Sishen workshop" />

        {/* Language selection */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">Meeting language</p>
          <div className="flex gap-2">
            {[["en", "English"], ["af", "Afrikaans"], ["mixed", "Mixed"]].map(([val, label]) => (
              <button key={val} onClick={() => setLanguage(val)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${language === val ? "text-white" : "bg-slate-100 text-slate-500"}`}
                style={language === val ? { background: BRAND.primary } : {}}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {language === "mixed" ? "Whisper will auto-detect English/Afrikaans switching" : `Optimised for ${language === "en" ? "English" : "Afrikaans"}`}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      <button onClick={startRecording}
        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl text-white text-base font-black min-h-[64px]"
        style={{ background: BRAND.primary }}>
        <Mic size={22} /> Start Recording
      </button>

      <p className="text-xs text-center text-slate-400">
        Recording processes after you stop — requires internet connection.
      </p>
    </div>
  );

  // ── PHASE: recording ─────────────────────────────────────────────────────
  if (phase === "recording") return (
    <div className="space-y-4">
      <PageHeader title="Recording…" />
      <Card className="p-6">
        <div className="flex flex-col items-center gap-6 py-4">
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [1, 0.8, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: "#FEE2E2" }}>
            <Mic size={40} style={{ color: "#DC2626" }} />
          </motion.div>

          <div className="text-center">
            <p className="text-4xl font-black text-slate-900 tabular-nums">{formatDuration(duration)}</p>
            <p className="text-sm text-slate-400 mt-1">Recording in progress</p>
            {selectedClient && <p className="text-xs font-bold mt-2" style={{ color: BRAND.primary }}>{selectedClient.company}</p>}
          </div>

          <div className="w-full space-y-2.5">
            <button onClick={stopRecording}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-white font-black text-base"
              style={{ background: "#DC2626" }}>
              <Square size={18} /> Stop & Process
            </button>
            <p className="text-xs text-center text-slate-400">Recording will be transcribed and formatted automatically</p>
          </div>
        </div>
      </Card>
    </div>
  );

  // ── PHASE: processing ────────────────────────────────────────────────────
  if (phase === "processing") return (
    <div className="space-y-4">
      <PageHeader title="Processing…" />
      <Card className="p-8">
        <div className="flex flex-col items-center gap-4 py-4">
          <Loader2 size={40} className="animate-spin" style={{ color: BRAND.primary }} />
          <div className="text-center">
            <p className="text-base font-black text-slate-900">Transcribing your meeting</p>
            <p className="text-sm text-slate-400 mt-1">This takes about {Math.max(10, Math.floor(duration / 6))} seconds…</p>
          </div>
          <div className="w-full space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-400" /><span>Audio captured ({formatDuration(duration)})</span></div>
            <div className="flex items-center gap-2"><Loader2 size={8} className="animate-spin" /><span>Transcribing with Whisper AI…</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-200" /><span>Formatting meeting minutes…</span></div>
          </div>
        </div>
      </Card>
    </div>
  );

  // ── PHASE: review ────────────────────────────────────────────────────────
  if (phase === "review" && minutes) return (
    <div className="space-y-4">
      <PageHeader title="Meeting Minutes" />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-black text-slate-900">{minutes.title || meetingTitle || "Meeting Notes"}</p>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">⏱ {formatDuration(minutes.rawDuration)}</span>
        </div>

        {selectedClient && (
          <div className="flex items-center gap-2 text-xs font-bold" style={{ color: BRAND.primary }}>
            <Users size={12} /> {selectedClient.company}
          </div>
        )}

        {minutes.summary && (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Summary</p>
            <p className="text-sm text-slate-700 leading-relaxed">{minutes.summary}</p>
          </div>
        )}

        {minutes.keyPoints?.length > 0 && (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Key Points</p>
            <div className="space-y-1">
              {minutes.keyPoints.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-slate-300 mt-0.5">•</span><span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {minutes.decisions?.length > 0 && (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Decisions</p>
            <div className="space-y-1">
              {minutes.decisions.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
                  <span className="text-slate-700">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {minutes.actionItems?.length > 0 && (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">
              Action Items ({minutes.actionItems.length})
            </p>
            <div className="space-y-2">
              {minutes.actionItems.map((a, i) => (
                <div key={i} className="rounded-xl bg-amber-50 border border-amber-100 p-2.5">
                  <p className="text-sm font-bold text-amber-900">{a.action}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {a.owner && <p className="text-xs text-amber-600">👤 {a.owner}</p>}
                    {a.deadline && <p className="text-xs text-amber-600">📅 {a.deadline}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {minutes.nextMeeting && (
          <div className="rounded-xl bg-blue-50 p-3">
            <p className="text-xs font-black text-blue-600 uppercase tracking-wider mb-1">Next Meeting</p>
            <p className="text-sm text-blue-700">{minutes.nextMeeting}</p>
          </div>
        )}
      </Card>

      {/* Save options */}
      <div className="space-y-2.5">
        <button onClick={() => saveAsNote("both")}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-black text-sm min-h-[56px]"
          style={{ background: BRAND.primary }}>
          <FileText size={18} /> Save minutes + create follow-up actions
        </button>
        <button onClick={() => saveAsNote("notes")}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm min-h-[48px] bg-slate-100 text-slate-700">
          <FileText size={16} /> Save minutes only
        </button>
        <button onClick={() => setPhase("setup")}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm text-slate-400 min-h-[44px]">
          <X size={14} /> Discard
        </button>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );

  // ── PHASE: saved ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
        <Check size={32} className="text-green-500" />
      </div>
      <p className="text-base font-black text-slate-900">Minutes saved</p>
      <p className="text-sm text-slate-400">Redirecting to Field Notes…</p>
    </div>
  );
}
