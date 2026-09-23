// ─── Edge Function: send-reminders ───────────────────────────────────────────
// Called every 5 minutes by pg_cron (job "powermate-followup-reminders"). Sends
// Web Push for every reminder that falls due, so reminders reach a phone even
// when the app is closed. An iPhone never runs a closed web app's timers, so
// anything that must arrive in the background has to come from here:
//   • follow-ups (incl. calendar entries) at their chosen reminder time
//   • the 07:00 "today's follow-ups" summary
//   • equipment service: 3 days before and on the day (09:00)
//   • unresolved notes on their resolve-by date (09:00)
// All times are the person's local time (users.timezone, kept current by the app).
//
// Each reminder is claimed in public.reminder_deliveries before it is sent, so
// overlapping or retried runs never deliver it twice.
//
// Auth: cron presents the x-cron-secret header; it is checked against the vault
// secret "powermate_cron_secret" through public.cron_secret_matches(), which only
// service_role may execute. No user JWT is involved (verify_jwt = false).
//
// Body (all optional, all require the cron secret):
//   {}                          normal run
//   { "preview_hours": 48 }     list what would be sent in the next N hours; sends nothing
//   { "test_user_id": "<id>" }  send a test push to that person's devices; reports each result
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";
import {
  DEFAULT_TZ, MAX_LOOKBACK_MINUTES, dueNow, planReminders, shiftDate, validTz,
  type EquipmentRow, type FollowupRow, type NoteRow, type Reminder,
} from "./schedule.ts";

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type PushResult = { host: string; status: number | null; ok: boolean; stale: boolean; error?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function push(sub: Sub, payload: string, ttl: number): Promise<PushResult> {
  const host = (() => { try { return new URL(sub.endpoint).host; } catch { return "?"; } })();
  try {
    const res = await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: ttl, urgency: "high" },
    );
    return { host, status: res?.statusCode ?? 201, ok: true, stale: false };
  } catch (e: any) {
    const status = Number(e?.statusCode) || null;
    const error = String(e?.body || e?.message || e).slice(0, 200);
    return {
      host, status, ok: false,
      // 404/410: the device unsubscribed or the app was removed. VapidPkHashMismatch:
      // Apple's answer for a subscription made under an older VAPID key; it can never
      // succeed again. Either way, forget it.
      stale: status === 404 || status === 410 || /VapidPkHashMismatch/i.test(error),
      error,
    };
  }
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
  // Apple rejects the VAPID token unless the subject is a mailto: or https: URL.
  let subject = (Deno.env.get("VAPID_EMAIL") ?? "").trim();
  if (!/^(mailto:|https:)/.test(subject)) subject = subject.includes("@") ? `mailto:${subject}` : "mailto:admin@pwrstart.com";
  webPush.setVapidDetails(subject, vapidPublic, vapidPrivate);

  let input: { preview_hours?: number; test_user_id?: string } = {};
  try { input = await req.json(); } catch { /* empty body = normal run */ }

  const subsFor = async (userIds: string[]): Promise<Sub[]> => {
    if (!userIds.length) return [];
    const { data, error } = await supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
    if (error) throw error;
    return data || [];
  };
  const dropStale = async (results: Array<PushResult & { id: string }>) => {
    const stale = results.filter(r => r.stale).map(r => r.id);
    if (stale.length) await supabase.from("push_subscriptions").delete().in("id", stale);
  };

  try {
    // ── Test: one push to each of a person's devices, with Apple/Google's answer ──
    if (input.test_user_id) {
      const subs = await subsFor([input.test_user_id]);
      const payload = JSON.stringify({
        title: "PowerMate test ✓",
        body: "Background notifications work — this came from the server, so it arrives even with the app closed.",
        url: "/?screen=Notifications",
        tag: "pm_test",
      });
      const results = await Promise.all(subs.map(async s => ({ id: s.id, ...(await push(s, payload, 600)) })));
      await dropStale(results);
      return json({ ok: results.some(r => r.ok), devices: subs.length, results: results.map(({ id: _id, ...r }) => r) });
    }

    const now = new Date();
    const preview = Number(input.preview_hours) > 0 ? Math.min(Number(input.preview_hours), 24 * 14) : 0;
    const from = new Date(now.getTime() - MAX_LOOKBACK_MINUTES * 60_000);
    const to = preview ? new Date(now.getTime() + preview * 3600_000) : now;

    // Date ranges wide enough for every timezone and every lead time (2 days + 3 days).
    const today = now.toISOString().slice(0, 10);
    const lastDay = shiftDate(to.toISOString().slice(0, 10), 3);
    const [fu, eq, nt] = await Promise.all([
      supabase.from("followups")
        .select("id, user_id, assigned_to_user_id, title, client, date, time, reminder, completed")
        .eq("completed", false).gte("date", shiftDate(today, -2)).lte("date", lastDay),
      supabase.from("equipment")
        .select("id, user_id, assigned_to_user_id, name, make, model, service_due")
        .gte("service_due", shiftDate(today, -1)).lte("service_due", shiftDate(lastDay, 3)),
      supabase.from("notes")
        .select("id, user_id, assigned_to_user_id, client, note, urgency, resolve_by, resolved")
        .eq("resolved", false).gte("resolve_by", shiftDate(today, -1)).lte("resolve_by", lastDay),
    ]);
    for (const r of [fu, eq, nt]) if (r.error) throw r.error;
    const records = {
      followups: (fu.data || []) as FollowupRow[],
      equipment: (eq.data || []) as EquipmentRow[],
      notes: (nt.data || []) as NoteRow[],
    };

    const userIds = [...new Set([...records.followups, ...records.equipment, ...records.notes]
      .map(r => r.assigned_to_user_id || r.user_id).filter(Boolean) as string[])];
    const tzByUser = new Map<string, string>();
    if (userIds.length) {
      const { data: users } = await supabase.from("users").select("id, timezone").in("id", userIds);
      for (const u of users || []) tzByUser.set(u.id, validTz(u.timezone));
    }
    const tzOf = (id: string) => tzByUser.get(id) || DEFAULT_TZ;
    const planned = planReminders(records, tzOf, from, to);

    // ── Preview: what would go out, when, in local time; nothing is sent ──
    if (preview) {
      const upcoming = planned.filter(r => r.fireAt.getTime() > now.getTime());
      const subs = await subsFor([...new Set(upcoming.map(r => r.userId))]);
      return json({
        now: now.toISOString(),
        reminders: upcoming.map(r => ({
          kind: r.kind, user_id: r.userId, title: r.title,
          fire_at_utc: r.fireAt.toISOString(),
          fire_at_local: r.fireAt.toLocaleString("en-ZA", { timeZone: tzOf(r.userId) }) + ` (${tzOf(r.userId)})`,
          devices: subs.filter(s => s.user_id === r.userId).length,
        })),
      });
    }

    // ── Normal run ──
    const due = dueNow(planned, now);
    if (!due.length) return json({ ok: true, checked: planned.length, due: 0, sent: 0 });

    // Claim first: only reminders this run inserted are sent, so a slow or
    // repeated run can never deliver the same reminder twice.
    const { data: claimed, error: claimError } = await supabase
      .from("reminder_deliveries")
      .upsert(due.map(r => ({ key: r.key, user_id: r.userId, kind: r.kind })), { onConflict: "key", ignoreDuplicates: true })
      .select("key");
    if (claimError) throw claimError;
    const claimedKeys = new Set((claimed || []).map((c: { key: string }) => c.key));
    const toSend: Reminder[] = due.filter(r => claimedKeys.has(r.key));

    const subs = await subsFor([...new Set(toSend.map(r => r.userId))]);
    let sent = 0;
    const retry: string[] = [];
    const allResults: Array<PushResult & { id: string }> = [];
    for (const r of toSend) {
      const mine = subs.filter(s => s.user_id === r.userId);
      if (!mine.length) continue; // no devices: nothing to retry
      const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.tag });
      const results = await Promise.all(mine.map(async s => ({ id: s.id, ...(await push(s, payload, r.ttl)) })));
      allResults.push(...results);
      if (results.some(x => x.ok)) sent++;
      // Every device failed for a reason other than being gone: release the
      // claim so the next run (still inside the lookback window) tries again.
      else if (results.some(x => !x.stale)) retry.push(r.key);
      for (const x of results.filter(x => !x.ok && !x.stale))
        console.error("[send-reminders] push failed", r.kind, x.host, x.status, x.error);
    }
    await dropStale(allResults);
    if (retry.length) await supabase.from("reminder_deliveries").delete().in("key", retry);

    const sentFollowups = toSend.filter(r => r.kind === "followup" && !retry.includes(r.key)).map(r => r.key.split(":")[1]);
    if (sentFollowups.length) await supabase.from("followups").update({ notified_at: now.toISOString() }).in("id", sentFollowups);
    // Keep the delivery log small; a key only matters until its day has passed.
    await supabase.from("reminder_deliveries").delete().lt("sent_at", new Date(now.getTime() - 30 * 86400_000).toISOString());

    return json({ ok: true, checked: planned.length, due: due.length, claimed: toSend.length, sent, retry: retry.length });
  } catch (e) {
    console.error("[send-reminders]", e);
    return json({ error: "Reminder run failed" }, 500);
  }
});
