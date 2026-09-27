// ─── Edge Function: xero ─────────────────────────────────────────────────────
// Connects a company to its Xero organisation and sends its invoices there.
//
//   POST { action: "authorize_url", state }   → Xero sign-in address. The
//        state comes from xero_start() (master account only, one-time).
//   GET  ?code&state                           → Xero sends the owner back
//        here; we swap the code for tokens, save the connection and return
//        them to Company Details.
//   POST { action: "sync", team_id }          → "Sync now" (the caller's own
//        sign-in is checked: master account or admin of that company).
//   POST { action: "sync_all" } + x-cron-secret → nightly, every company.
//
// Needs secrets XERO_CLIENT_ID, XERO_CLIENT_SECRET and APP_URL (and
// optionally XERO_SCOPES). The Xero app's redirect URI must be
// <SUPABASE_URL>/functions/v1/xero. verify_jwt = false: the state, the
// caller's sign-in or the cron secret are checked here.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeUrl, DEFAULT_SCOPES, isDuplicateNumber, readResult, toXeroInvoice } from "./xero.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const env = (k: string) => Deno.env.get(k) ?? "";
const API = "https://api.xero.com/api.xro/2.0";

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env("XERO_CLIENT_ID")}:${env("XERO_CLIENT_SECRET")}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Xero sign-in failed (${res.status})`);
  return res.json();
}

async function accessToken(db: SupabaseClient, teamId: string) {
  const { data: c } = await db.rpc("xero_connection", { p_team_id: teamId });
  if (!c) throw new Error("Xero isn't connected");
  if (new Date(c.expires_at).getTime() > Date.now()) return c;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  await db.rpc("xero_update_tokens", { p_team_id: teamId, p_access: t.access_token, p_refresh: t.refresh_token, p_expires_in: t.expires_in });
  return { ...c, access_token: t.access_token };
}

async function syncTeam(db: SupabaseClient, teamId: string) {
  const c = await accessToken(db, teamId);
  const headers = { Authorization: `Bearer ${c.access_token}`, "xero-tenant-id": c.tenant_id, Accept: "application/json", "Content-Type": "application/json" };
  let sent = 0,
    failed = 0;
  for (let round = 0; round < 10; round++) {
    const { data: invoices } = await db.rpc("xero_invoices_to_sync", { p_team_id: teamId, p_limit: 50 });
    if (!invoices?.length) break;
    const res = await fetch(`${API}/Invoices?summarizeErrors=false`, {
      method: "POST",
      headers,
      body: JSON.stringify({ Invoices: invoices.map((i: Record<string, unknown>) => toXeroInvoice(i, { accountCode: c.sales_account_code })) }),
    });
    const body = await res.json().catch(() => ({}));
    const results = [];
    for (let n = 0; n < invoices.length; n++) {
      let r: { xero_id?: string; error?: string } = res.ok || res.status === 400 ? readResult(body?.Invoices?.[n]) : { error: `Xero said ${res.status}` };
      // Already in Xero (e.g. typed in there by hand): link to it.
      if (r.error && isDuplicateNumber(r.error)) {
        const found = await fetch(`${API}/Invoices?InvoiceNumbers=${encodeURIComponent(invoices[n].invoice_number)}`, { headers })
          .then(x => x.json())
          .catch(() => null);
        if (found?.Invoices?.[0]?.InvoiceID) r = { xero_id: found.Invoices[0].InvoiceID };
      }
      results.push({ id: invoices[n].id, ...r });
      if (r.xero_id) sent++;
      else failed++;
    }
    await db.rpc("xero_mark_synced", { p_team_id: teamId, p_results: results });
    if (!res.ok && res.status !== 400) break;
    if (results.every(r => !r.xero_id)) break; // nothing moving: stop, show the errors
  }
  return { sent, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server not configured" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const configured = !!(env("XERO_CLIENT_ID") && env("XERO_CLIENT_SECRET") && env("APP_URL"));
  const redirectUri = `${supabaseUrl}/functions/v1/xero`;
  const appUrl = env("APP_URL").replace(/\/$/, "");

  // ── Back from Xero sign-in ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const back = (msg: string) => Response.redirect(`${appUrl}/?screen=CompanyProfile&xero=${encodeURIComponent(msg)}`, 302);
    if (!configured) return new Response("Xero isn't set up", { status: 503 });
    const { data: s } = await db.rpc("xero_take_state", { p_state: url.searchParams.get("state") || "" });
    if (!s) return back("expired");
    if (!url.searchParams.get("code")) return back("cancelled");
    try {
      const t = await tokenRequest({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: redirectUri });
      const tenants = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${t.access_token}` } }).then(r => r.json());
      const org = (tenants || []).find((x: { tenantType: string }) => x.tenantType === "ORGANISATION") || tenants?.[0];
      if (!org) return back("no-organisation");
      await db.rpc("xero_save_connection", {
        p_team_id: s.team_id,
        p_user_id: s.user_id,
        p_tenant_id: org.tenantId,
        p_tenant_name: org.tenantName,
        p_access: t.access_token,
        p_refresh: t.refresh_token,
        p_expires_in: t.expires_in,
      });
      return back("connected");
    } catch {
      return back("failed");
    }
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!configured) return json({ error: "not_configured", message: "Xero isn't available yet. Ask the app provider to set it up." }, 503);

  if (body.action === "authorize_url") {
    const { data: ok } = await db.rpc("xero_state_valid", { p_state: body.state || "" });
    if (!ok) return json({ error: "Start again from Company Details." }, 400);
    return json({ url: authorizeUrl({ clientId: env("XERO_CLIENT_ID"), redirectUri, state: body.state, scopes: env("XERO_SCOPES") || DEFAULT_SCOPES }) });
  }

  if (body.action === "sync") {
    // Checked as the person pressing the button.
    const asUser = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });
    const { data: allowed } = await asUser.rpc("xero_can_sync", { p_team_id: body.team_id });
    if (allowed !== true) return json({ error: "Only the master account or an admin can do this" }, 403);
    try {
      return json(await syncTeam(db, body.team_id));
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  if (body.action === "sync_all") {
    const { data: ok } = await db.rpc("cron_secret_matches", { p_secret: req.headers.get("x-cron-secret") || "" });
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    const { data: teams } = await db.rpc("xero_connected_teams");
    const out: Record<string, unknown> = {};
    for (const t of (teams || []) as string[]) {
      try {
        out[t] = await syncTeam(db, t);
      } catch (e) {
        out[t] = { error: (e as Error).message };
      }
    }
    return json(out);
  }
  return json({ error: "Bad request" }, 400);
});
