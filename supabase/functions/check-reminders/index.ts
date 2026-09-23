// ─── Edge Function: check-reminders (retired) ────────────────────────────────
// Replaced by send-reminders. The old version read tables that no longer exist
// (plan_items, follow_ups), ran with the service role for any signed-in caller
// and sent unencrypted push payloads. Nothing schedules or calls it; this stub
// keeps the slug answering harmlessly until it is deleted in the Supabase
// dashboard (Edge Functions → check-reminders → Delete).
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Retired — reminders are sent by send-reminders" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  }),
);
