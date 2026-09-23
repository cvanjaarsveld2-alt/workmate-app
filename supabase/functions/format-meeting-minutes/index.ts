// ─── Edge Function: format-meeting-minutes ───────────────────────────────────
// Meeting transcript → structured minutes (OpenAI). Signed-in users only (the
// anon key also passes verify_jwt, so the session is checked here), and the
// transcript/context are capped so one request can't run up the bill.
// ─────────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_TRANSCRIPT_CHARS = 60_000; // roughly a two-hour meeting
const MAX_CONTEXT_CHARS = 2_000;

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

const SYSTEM_PROMPT = `You are an expert business meeting assistant for Power Works (Pty) Ltd, a South African mining and industrial field service company. You receive a raw speech transcript of a business meeting and format it into structured meeting minutes. The meeting may be in English, Afrikaans, or a mix of both.

Return ONLY a valid JSON object with this exact structure:
{
  "title": "Brief meeting title",
  "summary": "2-3 sentence executive summary",
  "keyPoints": ["point 1", "point 2"],
  "decisions": ["decision 1", "decision 2"],
  "actionItems": [{"action": "what to do", "owner": "person or empty", "deadline": "date or empty"}],
  "nextMeeting": "next meeting details or empty"
}

Keep everything in English. Extract only what was actually discussed. Action items must be specific.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await requireUser(req))) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const transcript = String(body?.transcript || "").trim();
    const context = String(body?.context || "").slice(0, MAX_CONTEXT_CHARS);
    if (!transcript) return json({ error: "No transcript" }, 400);
    if (transcript.length > MAX_TRANSCRIPT_CHARS) return json({ error: "Transcript is too long" }, 413);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "Meeting minutes are not configured" }, 500);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Meeting context:\n${context}\n\nTranscript:\n${transcript}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[format-meeting-minutes] OpenAI error", res.status, (await res.text()).slice(0, 300));
      return json({ error: "Formatting failed" }, 502);
    }
    const data = await res.json();
    return json(JSON.parse(data.choices[0].message.content));
  } catch (e) {
    console.error("[format-meeting-minutes]", e);
    return json({ error: "Formatting failed" }, 500);
  }
});
