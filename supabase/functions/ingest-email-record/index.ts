// ─── ingest-email-record ────────────────────────────────────────────────────
// Thin, trusted write endpoint for the PowerMate Assistant email pipeline.
//
// Who calls this: a daily Claude scheduled task that reads Christo's
// dedicated "quotes inbox" Gmail account (via the Gmail MCP connector),
// picks out emails that look like a quote was sent, extracts the client
// name / amount / currency / quote reference, and POSTs the results here.
// This function never talks to Gmail itself — it just authenticates the
// caller and writes rows.
//
// Auth model: server-to-server, so there's no user JWT (verify_jwt = false).
// The caller presents a long random shared secret as a Bearer token, compared
// in constant time. The only thing this endpoint can do is create rows in
// email_quotes for an existing PowerMate user, and nothing becomes a real quote
// or follow-up until Christo reviews it on the Assistant screen.
//
// Required secrets (Project Settings → Edge Functions → Secrets):
//   INGEST_SHARED_SECRET   — long random string; also given to the scheduled task.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — present by default.
//
// Request:
//   POST /functions/v1/ingest-email-record
//   Authorization: Bearer <INGEST_SHARED_SECRET>
//   { "user_id": "<auth.users id>", "records": [ { "gmail_message_id": "...", ... } ] }
//
// Response: { inserted, skipped, errors: [{ gmail_message_id, message }] }
// "skipped" = already ingested (unique on user_id + gmail_message_id), so
// re-scanning the same inbox every day is safe.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time comparison, so response timing can't be used to guess the secret.
function secretMatches(presented: string, expected: string) {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);

function sanitizeRecord(raw: Record<string, unknown>, userId: string) {
  const gmailMessageId = typeof raw.gmail_message_id === "string" ? raw.gmail_message_id.trim().slice(0, 200) : "";
  if (!gmailMessageId) return { error: "gmail_message_id is required" };

  const amount =
    raw.extracted_amount === null || raw.extracted_amount === undefined || raw.extracted_amount === ""
      ? null
      : Number(raw.extracted_amount);
  if (amount !== null && !Number.isFinite(amount)) return { error: "extracted_amount must be a number" };

  const confidence =
    typeof raw.extraction_confidence === "string" && CONFIDENCE_VALUES.has(raw.extraction_confidence)
      ? raw.extraction_confidence
      : "medium";

  let sentAt: string | null = null;
  if (typeof raw.sent_at === "string" && raw.sent_at) {
    const d = new Date(raw.sent_at);
    if (!Number.isNaN(d.getTime())) sentAt = d.toISOString();
  }

  return {
    row: {
      user_id: userId,
      gmail_message_id: gmailMessageId,
      direction: typeof raw.direction === "string" && raw.direction ? raw.direction.slice(0, 20) : "sent",
      to_address: typeof raw.to_address === "string" ? raw.to_address.slice(0, 320) : null,
      from_address: typeof raw.from_address === "string" ? raw.from_address.slice(0, 320) : null,
      subject: typeof raw.subject === "string" ? raw.subject.slice(0, 500) : null,
      snippet: typeof raw.snippet === "string" ? raw.snippet.slice(0, 2000) : null,
      sent_at: sentAt,
      extracted_client_name: typeof raw.extracted_client_name === "string" ? raw.extracted_client_name.slice(0, 200) : null,
      extracted_amount: amount,
      extracted_currency: typeof raw.extracted_currency === "string" && raw.extracted_currency ? raw.extracted_currency.slice(0, 10) : "ZAR",
      extracted_quote_ref: typeof raw.extracted_quote_ref === "string" ? raw.extracted_quote_ref.slice(0, 100) : null,
      extraction_confidence: confidence,
      status: "new",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sharedSecret = Deno.env.get("INGEST_SHARED_SECRET");
  if (!sharedSecret) {
    console.error("[ingest-email-record] INGEST_SHARED_SECRET is not configured");
    return json({ error: "Server not configured" }, 500);
  }

  const presented = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented || !secretMatches(presented, sharedSecret)) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!UUID_RE.test(userId)) return json({ error: "user_id must be a user id" }, 400);

  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length === 0) return json({ error: "records must be a non-empty array" }, 400);
  if (records.length > 200) return json({ error: "records exceeds max batch size of 200" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[ingest-email-record] Supabase service credentials missing from Edge Function env");
    return json({ error: "Server not configured" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Only write under a real PowerMate user.
  const { data: userRow, error: userError } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
  if (userError) {
    console.error("[ingest-email-record] user lookup failed", userError);
    return json({ error: "Could not verify user" }, 500);
  }
  if (!userRow) return json({ error: "Unknown user_id" }, 404);

  let inserted = 0;
  let skipped = 0;
  const errors: { gmail_message_id?: string; message: string }[] = [];

  for (const raw of records) {
    if (typeof raw !== "object" || raw === null) {
      errors.push({ message: "record is not an object" });
      continue;
    }
    const result = sanitizeRecord(raw as Record<string, unknown>, userId);
    if ("error" in result) {
      errors.push({ gmail_message_id: (raw as Record<string, unknown>)?.gmail_message_id as string | undefined, message: result.error });
      continue;
    }
    const { error } = await supabase.from("email_quotes").insert(result.row);
    if (!error) {
      inserted += 1;
      continue;
    }
    // 23505 = unique_violation — this email was already ingested on a previous run.
    if (error.code === "23505") {
      skipped += 1;
      continue;
    }
    console.error("[ingest-email-record] insert failed", result.row.gmail_message_id, error);
    errors.push({ gmail_message_id: result.row.gmail_message_id, message: "Insert failed" });
  }

  return json({ inserted, skipped, errors });
});
