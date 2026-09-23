// ─── Edge Function: historical-rate ──────────────────────────────────────────
// The real exchange rate to ZAR for a past date, for currencies the free ECB
// source doesn't cover (exchangerate-api.com, paid key in EXCHANGERATE_API_KEY).
// Signed-in users only: the anon key also passes verify_jwt, and each call
// spends paid quota.
// ─────────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const { from, date } = await req.json().catch(() => ({}));
    const currency = String(from || "").trim().toUpperCase();
    if (!currency || currency === "ZAR") return json({ rate: 1, rateDate: date, source: "n/a" });
    if (!/^[A-Z]{3}$/.test(currency)) return json({ error: "from must be a 3-letter currency code" }, 400);
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);

    const API_KEY = Deno.env.get("EXCHANGERATE_API_KEY");
    if (!API_KEY) return json({ error: "EXCHANGERATE_API_KEY not configured" }, 500);

    const [year, month, day] = date.split("-").map(n => parseInt(n, 10)); // the API wants no leading zeros
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/history/${currency}/${year}/${month}/${day}`);
    const body = await res.json().catch(() => ({}));
    if (body.result !== "success") return json({ error: body["error-type"] || "Lookup failed" }, 502);

    const rate = body.conversion_rates?.ZAR;
    if (typeof rate !== "number" || rate <= 0) return json({ error: "No ZAR rate in response for that date/currency" }, 404);
    return json({ rate, rateDate: date, source: "exchangerate-api.com (historical)" });
  } catch (e) {
    console.error("[historical-rate]", e);
    return json({ error: "Rate lookup failed" }, 500);
  }
});
