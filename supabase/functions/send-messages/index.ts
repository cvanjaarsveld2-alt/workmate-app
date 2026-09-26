// ─── Edge Function: send-messages ────────────────────────────────────────────
// Sends queued customer SMS (public.customer_messages) through the platform's
// SMS provider (Platform → Messages: BulkSMS or Twilio). Called every 2
// minutes by pg_cron (job "powermate-send-messages") while anything is queued.
// Messages are queued by the app ("Send SMS") and by the automatic booking /
// job-done texts; each company has a monthly limit (checked when queued).
//
// Optional secret APP_URL (e.g. https://app.yourproduct.co.za) adds the
// customer's portal link to "job done" texts.
//
// Auth: like customer-reminders, cron presents x-cron-secret (verify_jwt = false).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { finishBody, smsReference, smsRequest } from "./sms.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server not configured" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const presented = req.headers.get("x-cron-secret") || "";
  if (!presented) return json({ error: "Unauthorized" }, 401);
  const { data: ok } = await db.rpc("cron_secret_matches", { p_secret: presented });
  if (ok !== true) return json({ error: "Unauthorized" }, 401);

  const { data: gw } = await db.rpc("sms_gateway");
  if (!gw) return json({ skipped: "SMS isn't switched on (Platform → Messages)." });
  const appUrl = Deno.env.get("APP_URL") ?? "";

  const { data: batch, error } = await db.rpc("messages_claim", { p_limit: 50 });
  if (error) return json({ error: error.message }, 500);
  let sent = 0,
    failed = 0;
  for (const m of batch || []) {
    const { url, init } = smsRequest(gw, { to: m.to_phone, body: finishBody(m.body, appUrl) });
    const res = await fetch(url, init).catch(e => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
    const text = await res.text().catch(() => "");
    let reply: unknown = null;
    try {
      reply = JSON.parse(text);
    } catch {
      // Not JSON: keep the text for the error.
    }
    if (res.ok) {
      await db.rpc("message_result", { p_id: m.id, p_ok: true, p_ref: smsReference(gw, reply), p_error: null });
      sent++;
    } else {
      const why = (reply as { detail?: string; message?: string })?.detail || (reply as { message?: string })?.message || text || `HTTP ${res.status}`;
      await db.rpc("message_result", { p_id: m.id, p_ok: false, p_ref: null, p_error: String(why).slice(0, 300) });
      failed++;
    }
  }
  return json({ sent, failed });
});
