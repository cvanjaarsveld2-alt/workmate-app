// ─── Edge Function: transcribe-audio ─────────────────────────────────────────
// Voice notes and meeting recordings → text (OpenAI Whisper).
// Signed-in PowerMate users only: verify_jwt alone also accepts the public anon
// key, which would let anyone spend the OpenAI budget, so the caller's session
// is checked against Supabase Auth here too. Inputs are size-capped.
// ─────────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper's own limit

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// The anon key is a valid JWT but not a user, so /auth/v1/user rejects it.
async function requireUser(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !key) return null;
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id || null;
}

// Whisper picks the decoder from the file name; iPhones record audio/mp4, not webm.
function fileNameFor(type: string) {
  if (/mp4|m4a|aac/.test(type)) return "audio.m4a";
  if (/mpeg|mp3/.test(type)) return "audio.mp3";
  if (/wav/.test(type)) return "audio.wav";
  if (/ogg/.test(type)) return "audio.ogg";
  return "audio.webm";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await requireUser(req))) return json({ error: "Unauthorized" }, 401);

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    if (!(audioFile instanceof File) || audioFile.size === 0) return json({ error: "No audio file provided" }, 400);
    if (audioFile.size > MAX_AUDIO_BYTES) return json({ error: "Recording is too long (max 25 MB)" }, 413);
    const language = String(formData.get("language") || "").trim();
    const prompt = String(formData.get("prompt") || "Power Works mining industrial field service South Africa").slice(0, 600);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "Transcription is not configured" }, 500);

    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, fileNameFor(audioFile.type || ""));
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "text");
    if (/^[a-z]{2}$/.test(language)) whisperForm.append("language", language);
    if (prompt) whisperForm.append("prompt", prompt);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    });
    if (!res.ok) {
      console.error("[transcribe-audio] Whisper error", res.status, (await res.text()).slice(0, 300));
      return json({ error: "Transcription failed" }, 502);
    }
    return json({ text: (await res.text()).trim() });
  } catch (e) {
    console.error("[transcribe-audio]", e);
    return json({ error: "Transcription failed" }, 500);
  }
});
