// ─── Edge Function: send-reminders ───────────────────────────────────────────
// Called every 5 minutes by pg_cron (job "powermate-followup-reminders").
// Sends a push notification for each open follow-up whose reminder is due, to
// the assignee (or creator), so reminders arrive even when the app is closed.
//
// Auth: cron presents the x-cron-secret header; it is checked against the vault
// secret "powermate_cron_secret" through public.cron_secret_matches(), which only
// service_role may execute. No user JWT is involved (verify_jwt = false).
//
// Times: follow-ups store local South African wall-clock date/time. SAST is
// UTC+2 all year (no DST), so they are converted with a fixed offset.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webPush from "https://esm.sh/web-push@3.6.7";

const SAST_OFFSET = "+02:00";
const WINDOW_MINUTES = 10; // cron runs every 5 min; 10 min tolerates one late run

// Codes the app offers (src/lib/constants.js) plus legacy codes found in data.
function reminderFireAt(date: string, time: string | null, reminder: string): Date | null {
  const hhmm = /^\d{2}:\d{2}/.test(time || "") ? (time as string).slice(0, 5) : "09:00";
  const due = new Date(`${date}T${hhmm}:00${SAST_OFFSET}`);
  const minus = (mins: number) => new Date(due.getTime() - mins * 60_000);
  switch (reminder) {
    case "on_time": return due;
    case "15_before": case "15_min": return minus(15);
    case "30_before": case "30_min": return minus(30);
    case "1h_before": case "1_hour": return minus(60);
    case "2_hours": return minus(120);
    case "1d_before": case "1_day": {
      const d = new Date(`${date}T09:00:00${SAST_OFFSET}`);
      return new Date(d.getTime() - 86_400_000);
    }
    case "2_days": {
      const d = new Date(`${date}T09:00:00${SAST_OFFSET}`);
      return new Date(d.getTime() - 2 * 86_400_000);
    }
    case "morning": return new Date(`${date}T07:00:00${SAST_OFFSET}`);
    default: return null; // "none" or unknown
  }
}

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
  if (!vapidPublic || !vapidPrivate) return json({ error: "VAPID keys not configured" }, 500);
  webPush.setVapidDetails(Deno.env.get("VAPID_EMAIL") ?? "mailto:admin@pwrstart.com", vapidPublic, vapidPrivate);

  try {
    const now = new Date();
    // Dates in SAST: yesterday..+3 days covers every reminder type's lead time.
    const sastToday = new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(sastToday) - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.parse(sastToday) + 3 * 86_400_000).toISOString().slice(0, 10);

    const { data: followups, error } = await supabase
      .from("followups")
      .select("id, user_id, assigned_to_user_id, title, client, date, time, reminder, notified_at")
      .eq("completed", false)
      .gte("date", from)
      .lte("date", to)
      .not("reminder", "is", null)
      .neq("reminder", "none");
    if (error) throw error;

    let sent = 0, due = 0;
    const notifiedIds: string[] = [];
    for (const fu of followups || []) {
      const fireAt = reminderFireAt(fu.date, fu.time, fu.reminder);
      if (!fireAt) continue;
      const lateBy = (now.getTime() - fireAt.getTime()) / 60_000;
      if (lateBy < 0 || lateBy > WINDOW_MINUTES) continue;
      // Already sent for this fire time (e.g. a previous run inside the window).
      if (fu.notified_at && new Date(fu.notified_at).getTime() >= fireAt.getTime()) continue;
      due++;

      const target = fu.assigned_to_user_id || fu.user_id;
      const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", target);
      notifiedIds.push(fu.id);
      if (!subs?.length) continue;

      const payload = JSON.stringify({
        title: `⏰ Reminder: ${fu.title}`,
        body: `${fu.time ? `Due at ${fu.time.slice(0, 5)}` : "Due today"}${fu.client ? ` — ${fu.client}` : ""}`,
        url: "/?screen=Followups",
        tag: `followup-${fu.id}`,
      });
      const stale: string[] = [];
      for (const sub of subs) {
        try {
          await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) stale.push(sub.id);
          else console.error("[send-reminders] push failed", e?.statusCode, String(e?.body || e?.message || e).slice(0, 200));
        }
      }
      if (stale.length) await supabase.from("push_subscriptions").delete().in("id", stale);
    }

    if (notifiedIds.length) {
      await supabase.from("followups").update({ notified_at: now.toISOString() }).in("id", notifiedIds);
    }
    return json({ ok: true, checked: followups?.length || 0, due, sent });
  } catch (e) {
    console.error("[send-reminders]", e);
    return json({ error: "Reminder run failed" }, 500);
  }
});
