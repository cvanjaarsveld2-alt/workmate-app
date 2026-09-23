// ─── Edge Function: send-notifications ───────────────────────────────────────
// Push to one person's devices right now: team shares, share responses and the
// "Send test" button in More → Notifications. The caller must be signed in
// (verify_jwt = true) and may only notify themselves or someone they share a
// team with. Subscriptions are looked up here with the service role, because
// the caller cannot (and must not) read another person's push_subscriptions.
//
// Body: { to_user_id, title?, body?, url?, tag? }
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: { user }, error: authError } = await client.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Invalid token" }, 401);

    const { title, body, url, tag, to_user_id } = await req.json();
    if (!to_user_id) return json({ error: "to_user_id is required" }, 400);
    if (to_user_id !== user.id) {
      const [{ data: mine, error: mineError }, { data: theirs, error: theirsError }] = await Promise.all([
        client.from("team_members").select("team_id").eq("user_id", user.id),
        client.from("team_members").select("team_id").eq("user_id", to_user_id),
      ]);
      if (mineError || theirsError) return json({ error: "Unable to verify team membership" }, 500);
      const mineIds = new Set((mine || []).map((r: { team_id: string }) => r.team_id));
      if (!(theirs || []).some((r: { team_id: string }) => mineIds.has(r.team_id)))
        return json({ error: "Not allowed to notify this user" }, 403);
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    if (!vapidPublic || !vapidPrivate) return json({ error: "Web Push VAPID keys are not configured" }, 500);
    // Apple rejects the VAPID token unless the subject is a mailto: or https: URL.
    let subject = (Deno.env.get("VAPID_EMAIL") ?? "").trim();
    if (!/^(mailto:|https:)/.test(subject)) subject = subject.includes("@") ? `mailto:${subject}` : "mailto:admin@pwrstart.com";
    webPush.setVapidDetails(subject, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({
      title: title || "PowerMate",
      body: body || "You have a new notification",
      url: url || "/",
      ...(tag ? { tag: String(tag).slice(0, 64) } : {}),
      timestamp: Date.now(),
    });

    const { data: subs, error: subError } = await client
      .from("push_subscriptions").select("id, endpoint, p256dh, auth, user_agent").eq("user_id", to_user_id);
    if (subError) throw subError;
    if (!subs?.length) return json({ ok: true, sent: 0, failed: 0, reason: "no subscriptions" });

    let sent = 0;
    const staleIds: string[] = [];
    const failures: Array<{ id: string; statusCode?: number; message: string; user_agent?: string }> = [];
    await Promise.all(subs.map(async sub => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, urgency: "high" },
        );
        sent++;
      } catch (e: any) {
        const statusCode = Number(e?.statusCode) || undefined;
        const message = String(e?.body || e?.message || e || "Unknown push error").slice(0, 500);
        // 404/410: gone. VapidPkHashMismatch: made under an older VAPID key, can never succeed.
        if (statusCode === 404 || statusCode === 410 || /VapidPkHashMismatch/i.test(message)) staleIds.push(sub.id);
        else failures.push({ id: sub.id, statusCode, message, user_agent: sub.user_agent });
      }
    }));
    if (staleIds.length) await client.from("push_subscriptions").delete().in("id", staleIds);
    return json({ ok: sent > 0 || failures.length === 0, sent, failed: failures.length, stale: staleIds.length, failures: failures.slice(0, 5) });
  } catch (e: any) {
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
