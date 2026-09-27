// ─── Edge Function: payfast ──────────────────────────────────────────────────
// Online payment of invoices through each company's own PayFast account.
//
// 1. Customer taps "Pay now" in their portal → the page POSTs
//    { action: "checkout", token, invoice_id, return_url } here. We check the
//    portal link owns the invoice (payfast_checkout_data), and return the
//    signed PayFast form for the page to submit.
// 2. PayFast POSTs its notification (ITN, form-encoded) here when the payment
//    completes. We check the signature with the company's passphrase, the
//    merchant, and ask PayFast to confirm the notification is genuine
//    (/eng/query/validate); then record the payment once
//    (payfast_record_payment), which marks the invoice paid.
//
// No user sign-in (verify_jwt = false): the portal token and PayFast's
// signature + server confirmation are the checks. Uses the service role.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkoutFields, hosts, paramString, parseNotification, safeReturnUrl } from "./payfast.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function md5(text: string) {
  const buf = await crypto.subtle.digest("MD5", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server not configured" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const notifyUrl = `${supabaseUrl}/functions/v1/payfast`;

  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    // ── 1. Checkout from the portal ──
    let body: Record<string, string> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }
    if (body.action !== "checkout") return json({ error: "Bad request" }, 400);
    const back = safeReturnUrl(body.return_url);
    if (!back) return json({ error: "Bad return address" }, 400);
    const { data, error } = await db.rpc("payfast_checkout_data", { p_token: body.token, p_invoice_id: body.invoice_id });
    if (error || !data) return json({ error: "This invoice can't be paid online. Please contact us." }, 404);
    if (data.paid) return json({ paid: true });
    const returnUrl = back + (back.includes("?") ? "&" : "?") + "paid=1";
    const pairs = checkoutFields(data, { returnUrl, cancelUrl: back, notifyUrl });
    const signature = await md5(paramString(pairs, data.passphrase));
    return json({ url: `https://${hosts(data.sandbox)}/eng/process`, fields: [...pairs, ["signature", signature]] });
  }

  // ── 2. PayFast notification ──
  const raw = await req.text();
  const pairs = parseNotification(raw);
  const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? "";
  const invoiceId = get("m_payment_id");
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) return new Response("bad", { status: 400 });

  const { data: g } = await db.rpc("payfast_gateway_for_invoice", { p_invoice_id: invoiceId });
  if (!g) return new Response("unknown", { status: 400 });
  if (get("merchant_id") !== g.merchant_id) return new Response("merchant", { status: 400 });
  const expected = await md5(paramString(pairs, g.passphrase));
  if (expected !== get("signature")) {
    await db.from("events").insert({ name: "payfast_bad_signature", data: { invoice_id: invoiceId }, timestamp: new Date().toISOString() });
    return new Response("signature", { status: 400 });
  }
  // Ask PayFast whether it really sent this.
  const check = await fetch(`https://${hosts(g.sandbox)}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: paramString(pairs, ""),
  })
    .then(r => r.text())
    .catch(() => "");
  if (check.trim() !== "VALID") return new Response("not confirmed", { status: 400 });

  if (get("payment_status") !== "COMPLETE") return new Response("ok");
  const amount = Number(get("amount_gross"));
  const { error } = await db.rpc("payfast_record_payment", {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_pf_payment_id: get("pf_payment_id"),
    p_fee: Number(get("amount_fee")) || null,
    p_method: get("payment_method") || null,
  });
  if (error) return new Response("error", { status: 500 }); // PayFast retries
  return new Response("ok");
});
