// ─── Edge Function: scan-business-card ───────────────────────────────────────
// Business card photo → contact fields (OpenAI vision). Signed-in users only
// (the anon key also passes verify_jwt, so the session is checked here). Takes
// the image as base64 only — no URL fetching — and caps its size.
// ─────────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BASE64_CHARS = 10_000_000; // ~7.5 MB image; the app sends a compressed JPEG

const EXTRACTION_PROMPT = `You are a business card OCR specialist. Extract contact information from this business card image and return ONLY a JSON object with these exact keys (use empty string "" if a field is not present):

{
  "name": "person's full name",
  "company": "company or organization name",
  "title": "job title or role",
  "email": "email address",
  "phone": "phone number (keep original format including country code)",
  "website": "website URL if shown"
}

Rules:
- Return ONLY the JSON object, no markdown, no explanation, no preamble
- If multiple phone numbers exist, prefer mobile/cell over landline
- For names, return the human name only (no titles like Mr./Dr.)
- For email, lowercase only
- Keep phone numbers as they appear, including +country codes
- If you cannot read the card clearly, return all empty strings
- Trim all whitespace from extracted values`;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await requireUser(req))) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!raw) return json({ error: "imageBase64 is required" }, 400);
    if (raw.length > MAX_BASE64_CHARS) return json({ error: "Image is too large" }, 413);
    let dataUrl: string;
    if (raw.startsWith("data:")) {
      if (!/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,/i.test(raw)) return json({ error: "Unsupported image type" }, 400);
      dataUrl = raw;
    } else {
      if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) return json({ error: "Invalid image data" }, 400);
      dataUrl = `data:image/jpeg;base64,${raw}`;
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ error: "Card scanning is not configured" }, 500);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ] }],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
    if (!openaiResponse.ok) {
      console.error("[scan-business-card] OpenAI error", openaiResponse.status, (await openaiResponse.text()).slice(0, 300));
      return json({ error: "AI vision call failed" }, 502);
    }

    const data = await openaiResponse.json();
    const cleaned = String(data?.choices?.[0]?.message?.content || "").replace(/```json/gi, "").replace(/```/g, "").trim();
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      return json({ error: "Could not parse contact info from card. Try a clearer photo." }, 422);
    }
    const field = (k: string, max = 200) => String(extracted?.[k] ?? "").trim().slice(0, max);
    return json({
      success: true,
      data: {
        name: field("name"),
        company: field("company"),
        title: field("title"),
        email: field("email").toLowerCase(),
        phone: field("phone", 50),
        website: field("website"),
      },
    });
  } catch (e) {
    console.error("[scan-business-card]", e);
    return json({ error: "Internal error" }, 500);
  }
});
