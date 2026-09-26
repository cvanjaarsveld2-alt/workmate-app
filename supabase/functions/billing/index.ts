// ─── Edge Function: billing ──────────────────────────────────────────────────
// Companies pay for their plan themselves: monthly PayFast subscriptions into
// the platform owner's PayFast account (Platform → Billing).
//
//   POST { action: "checkout", plan, return_url }  (signed in; master account
//        only) → the signed PayFast subscription form for the page to post.
//        The price comes from the platform's price list, never the page.
//   POST { action: "cancel" }  (master account) → cancels the subscription at
//        PayFast; the plan runs to the end of the paid month.
//   POST (PayFast notification, form-encoded) → checked (signature, merchant,
//        PayFast's own confirmation); a completed payment extends the plan by
//        a month (billing_record_payment), a cancellation is noted.
//
// payfast.js is a copy of supabase/functions/payfast/payfast.js (edge
// functions are deployed one folder at a time); tests keep them identical.
// verify_jwt = false: PayFast's notifications carry no sign-in, and the
// signed-in actions check the caller themselves.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { apiSignatureString, hosts, paramString, parseNotification, safeReturnUrl, subscriptionFields } from "./payfast.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";

async function md5(text: string) {
  const buf = await crypto.subtle.digest("MD5", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = env("SUPABASE_URL");
  const db = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: gw } = await db.rpc("billing_gateway");

  if ((req.headers.get("content-type") || "").includes("application/json")) {
    let body: Record<string, string> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }
    if (!gw) return json({ error: "not_available", message: "Paying in the app isn't switched on yet. Please contact us." }, 503);
    // Everything below is done as the signed-in person.
    const asUser = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });
    const { data: ctx } = await asUser.rpc("billing_context");
    if (!ctx?.team_id) return json({ error: "Only the company's master account can change the plan." }, 403);

    if (body.action === "checkout") {
      const { data: catalogue } = await asUser.rpc("plan_catalogue");
      const plan = catalogue?.[body.plan];
      if (!plan || !(Number(plan.price) > 0)) return json({ error: "Choose a plan" }, 400);
      if (ctx.billing_status === "active" && ctx.billing_token)
        return json({ error: "You already have a subscription. Cancel it first to change plan." }, 409);
      const back = safeReturnUrl(body.return_url);
      if (!back) return json({ error: "Bad return address" }, 400);
      const pairs = subscriptionFields(
        { ...gw, amount: plan.price, plan: body.plan, plan_name: plan.name, team_id: ctx.team_id, company: ctx.company, email: ctx.email },
        {
          returnUrl: back + (back.includes("?") ? "&" : "?") + "paid=1",
          cancelUrl: back,
          notifyUrl: `${supabaseUrl}/functions/v1/billing`,
        },
      );
      const signature = await md5(paramString(pairs, gw.passphrase));
      return json({ url: `https://${hosts(gw.sandbox)}/eng/process`, fields: [...pairs, ["signature", signature]] });
    }

    if (body.action === "cancel") {
      if (!ctx.billing_token) return json({ error: "There's no subscription to cancel." }, 400);
      const headers: Record<string, string> = {
        "merchant-id": gw.merchant_id,
        version: "v1",
        timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
      };
      headers.signature = await md5(apiSignatureString(headers, gw.passphrase));
      const res = await fetch(
        `https://api.payfast.co.za/subscriptions/${encodeURIComponent(ctx.billing_token)}/cancel${gw.sandbox ? "?testing=true" : ""}`,
        { method: "PUT", headers },
      ).catch(() => null);
      if (!res?.ok) return json({ error: "PayFast didn't accept the cancellation. Please try again or contact us." }, 502);
      await db.rpc("billing_mark_cancelled", { p_team_id: ctx.team_id });
      return json({ ok: true });
    }
    return json({ error: "Bad request" }, 400);
  }

  // ── PayFast notification ──
  if (!gw) return new Response("not configured", { status: 400 });
  const pairs = parseNotification(await req.text());
  const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? "";
  if (get("merchant_id") !== gw.merchant_id) return new Response("merchant", { status: 400 });
  if ((await md5(paramString(pairs, gw.passphrase))) !== get("signature")) return new Response("signature", { status: 400 });
  const check = await fetch(`https://${hosts(gw.sandbox)}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: paramString(pairs, ""),
  })
    .then(r => r.text())
    .catch(() => "");
  if (check.trim() !== "VALID") return new Response("not confirmed", { status: 400 });

  const teamId = get("custom_str1");
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return new Response("team", { status: 400 });
  const status = get("payment_status");
  if (status === "CANCELLED") {
    await db.rpc("billing_mark_cancelled", { p_team_id: teamId });
    return new Response("ok");
  }
  if (status !== "COMPLETE") return new Response("ok");
  const { error } = await db.rpc("billing_record_payment", {
    p_team_id: teamId,
    p_plan: get("custom_str2"),
    p_amount: Number(get("amount_gross")),
    p_pf_payment_id: get("pf_payment_id"),
    p_token: get("token"),
  });
  if (error) return new Response("error", { status: 500 }); // PayFast retries
  return new Response("ok");
});
