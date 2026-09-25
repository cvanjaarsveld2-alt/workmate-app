// ─── Edge Function: problem-digest ───────────────────────────────────────────
// Called once a day by pg_cron (job "powermate-problem-digest", 17:00 SAST).
// Reads the last 24 hours of problem events the app reports (crashes, errors,
// sync failures, devices whose offline storage isn't protected) and, for each
// team with something to look at, tells the master account: an in-app
// notification plus a push to their devices. Quiet days send nothing.
//
// Auth: same as send-reminders. Cron presents x-cron-secret, checked against
// the vault secret "powermate_cron_secret" via public.cron_secret_matches()
// (service_role only). No user JWT is involved (verify_jwt = false).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webPush from "https://esm.sh/web-push@3.6.7";
import { PROBLEMS, summarise, type Ev } from "./summary.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server not configured" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const presented = req.headers.get("x-cron-secret") || "";
  if (!presented) return json({ error: "Unauthorized" }, 401);
  const { data: ok, error: secretError } = await supabase.rpc("cron_secret_matches", { p_secret: presented });
  if (secretError || ok !== true) return json({ error: "Unauthorized" }, 401);

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const canPush = !!(vapidPublic && vapidPrivate);
  if (canPush) webPush.setVapidDetails(Deno.env.get("VAPID_EMAIL") ?? "mailto:admin@pwrstart.com", vapidPublic, vapidPrivate);

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error } = await supabase
      .from("events")
      .select("name, user_id, data")
      .gte("timestamp", since)
      .in("name", Object.keys(PROBLEMS))
      .limit(5000);
    if (error) throw error;
    if (!events?.length) return json({ ok: true, teams_notified: 0, problems: 0 });

    const [{ data: teams }, { data: members }] = await Promise.all([
      supabase.from("teams").select("id, owner_user_id"),
      supabase.from("team_members").select("team_id, user_id"),
    ]);

    let notified = 0, pushed = 0;
    for (const team of teams || []) {
      if (!team.owner_user_id) continue;
      const teamUsers = new Set((members || []).filter(m => m.team_id === team.id).map(m => m.user_id));
      const mine = (events as Ev[]).filter(e => e.user_id && teamUsers.has(e.user_id));
      const { total, text } = summarise(mine);
      if (!total) continue;

      const { error: insertError } = await supabase.from("team_notifications").insert({
        team_id: team.id,
        from_user_id: team.owner_user_id,
        to_user_id: team.owner_user_id,
        record_type: "problem_digest",
        record_id: crypto.randomUUID(),
        record_title: "App health · last 24 hours",
        message: `${text}. Details: Supabase → Table editor → events.`,
        read: false,
      });
      if (insertError) console.error("[problem-digest] notification insert failed", insertError);
      notified++;

      if (!canPush) continue;
      const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", team.owner_user_id);
      const payload = JSON.stringify({
        title: `PowerMate: ${total} problem${total === 1 ? "" : "s"} in the last 24h`,
        body: text,
        url: "/?screen=Notifications",
        tag: "problem_digest",
      });
      const stale: string[] = [];
      for (const sub of subs || []) {
        try {
          await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600 });
          pushed++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) stale.push(sub.id);
          else console.error("[problem-digest] push failed", e?.statusCode, String(e?.body || e?.message || e).slice(0, 200));
        }
      }
      if (stale.length) await supabase.from("push_subscriptions").delete().in("id", stale);
    }
    return json({ ok: true, teams_notified: notified, pushed, problems: events.length });
  } catch (e) {
    console.error("[problem-digest]", e);
    return json({ error: "Digest run failed" }, 500);
  }
});
