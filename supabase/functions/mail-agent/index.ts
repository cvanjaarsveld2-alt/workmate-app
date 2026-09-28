// ─── Edge Function: mail-agent ───────────────────────────────────────────────
// Reads connected mailboxes and brings what matters into the app's Inbox
// (see agent.js for how it decides, and docs/MAIL_AGENT.md).
//
//   POST { action: "authorize_url", state }        → Microsoft/Google sign-in
//        address (state from mail_connect_start, checked here).
//   GET  ?code&state                               → back from sign-in: save the
//        mailbox and return to the app.
//   POST { action: "connect_imap", team_id, email, password, host?, port?,
//          folder? } + the person's sign-in         → test and save an IMAP mailbox.
//   POST { action: "run_one", connection_id } + sign-in → "Check now".
//   POST { action: "run" } + x-cron-secret         → every 5 minutes.
//
// Secrets: OPENAI_API_KEY, APP_URL; MS_CLIENT_ID + MS_CLIENT_SECRET for
// Microsoft; GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for Google. The redirect
// URI for both is <SUPABASE_URL>/functions/v1/mail-agent. verify_jwt = false:
// the state, the person's sign-in or the cron secret are checked here.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decide, fallbackKind, FIRST_RUN_DAYS, inboxRow, mainAttachment, MAX_MESSAGES_PER_RUN, messageText, parseTriage, prefilter, triagePrompt,
} from "./agent.js";
import * as ms from "./microsoft.js";
import * as gm from "./google.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
// Stop starting new mailboxes after this long, so one run fits in the limit.
const TIME_BUDGET_MS = 110_000;

type Conn = {
  id: string; team_id: string; user_id: string; provider: "microsoft" | "google" | "imap"; email: string; folder: string;
  imap_host: string | null; imap_port: number | null; cursor: string | null; access_token: string | null;
  access_expires_at: string | null; created_at: string; secret: string; owner_user_id: string; auto_file: boolean; kinds: string[];
};
type Msg = Record<string, any>;

const providerOpts = (p: string) =>
  p === "microsoft"
    ? { clientId: env("MS_CLIENT_ID"), clientSecret: env("MS_CLIENT_SECRET") }
    : { clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") };
const providerReady = (p: string) => {
  const o = providerOpts(p);
  return !!(o.clientId && o.clientSecret);
};

async function accessToken(db: SupabaseClient, c: Conn) {
  if (c.access_token && c.access_expires_at && new Date(c.access_expires_at).getTime() > Date.now()) return c.access_token;
  const lib = c.provider === "microsoft" ? ms : gm;
  const t = await lib.refresh(c.secret, providerOpts(c.provider));
  await db.rpc("mail_update_tokens", { p_id: c.id, p_access: t.access_token, p_expires_in: t.expires_in, p_refresh: t.refresh_token || null });
  return t.access_token as string;
}

async function readWithAI(prompt: string, msg: Msg, file: Msg | null) {
  const key = env("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY isn't set");
  const content: unknown[] = [
    { type: "text", text: prompt },
    { type: "text", text: `From: ${msg.from?.name || ""} <${msg.from?.email || ""}>\nSubject: ${msg.subject || ""}\n\n${messageText(msg).slice(0, 12000)}` },
  ];
  if (file?.content && file.ext === "pdf")
    content.push({ type: "file", file: { filename: file.name || "document.pdf", file_data: `data:application/pdf;base64,${file.content}` } });
  else if (file?.content && file.ext !== "heic")
    content.push({ type: "image_url", image_url: { url: `data:${file.contentType};base64,${file.content}`, detail: "high" } });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content }], response_format: { type: "json_object" }, max_tokens: 700, temperature: 0 }),
    });
    if (!res.ok) throw new Error(`AI said ${res.status}`);
    const body = await res.json();
    return body?.choices?.[0]?.message?.content ?? "{}";
  } finally {
    clearTimeout(timer);
  }
}

function decode(b64: string) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// The company's records the agent matches mail against.
async function directory(db: SupabaseClient, c: Conn) {
  const [clients, contacts, suppliers, pos, profile, members] = await Promise.all([
    db.from("clients").select("id, company, email").eq("team_id", c.team_id).not("email", "is", null).limit(5000),
    db.from("contacts").select("id, name, email, client_id").eq("team_id", c.team_id).not("email", "is", null).limit(5000),
    db.from("suppliers").select("id, name, email, active").eq("team_id", c.team_id).limit(2000),
    db.from("purchase_orders").select("id, po_number, supplier_id").eq("team_id", c.team_id).not("status", "in", "(cancelled,received)").limit(2000),
    db.from("team_profiles").select("trading_name, legal_name, email").eq("team_id", c.team_id).maybeSingle(),
    db.rpc("mail_team_emails", { p_team: c.team_id }),
  ]);
  return {
    clients: clients.data || [], contacts: contacts.data || [], suppliers: suppliers.data || [], purchaseOrders: pos.data || [],
    companyName: profile.data?.trading_name || profile.data?.legal_name || "",
    ownEmails: [c.email, profile.data?.email, ...((members.data as string[]) || [])].filter(Boolean),
  };
}

async function fetchNew(db: SupabaseClient, c: Conn) {
  const since = new Date(Math.max(Date.now() - FIRST_RUN_DAYS * 86400000, new Date(c.created_at).getTime() - FIRST_RUN_DAYS * 86400000)).toISOString();
  if (c.provider === "imap") {
    const { listNew } = await import("./imap.js");
    const [host, port] = [c.imap_host, c.imap_port];
    return { ...(await listNew({ host, port, email: c.email, password: c.secret, folder: c.folder }, { cursor: c.cursor, sinceDays: FIRST_RUN_DAYS, max: MAX_MESSAGES_PER_RUN })), token: null };
  }
  const token = await accessToken(db, c);
  const r = c.provider === "microsoft"
    ? await ms.listNew(token, { folder: c.folder, cursor: c.cursor, since, max: MAX_MESSAGES_PER_RUN })
    : await gm.listNew(token, { folder: c.folder, cursor: c.cursor, sinceDays: FIRST_RUN_DAYS, max: MAX_MESSAGES_PER_RUN });
  return { ...r, token };
}

// One mailbox: read new mail, keep what matters. Returns counts.
async function runConnection(db: SupabaseClient, c: Conn) {
  const counts = { read: 0, relevant: 0, kept: 0, filed: 0 };
  let cursor: string | null = null;
  try {
    const got = await fetchNew(db, c);
    cursor = got.cursor ?? null;
    counts.read = got.messages.length;
    const dir = await directory(db, c);
    for (const msg of got.messages as Msg[]) {
      const pre = prefilter(msg, dir);
      if (!pre.relevant) continue;
      counts.relevant++;
      // Already brought in (e.g. an earlier run stopped half-way)?
      const { count } = await db.from("inbox_items").select("id", { count: "exact", head: true })
        .eq("team_id", c.team_id).eq("message_id", String(msg.id).slice(0, 300));
      if (count) continue;
      if (c.provider !== "imap" && (msg.hasAttachments || msg.attachments?.some((a: Msg) => a.attachmentId))) {
        msg.attachments = await (c.provider === "microsoft" ? ms : gm).attachments(got.token!, msg);
      }
      const file = mainAttachment(msg);
      let triage;
      let aiFailed = false;
      try {
        triage = parseTriage(await readWithAI(triagePrompt({ companyName: dir.companyName, matches: pre.matches, kinds: c.kinds }), msg, file), c.kinds);
      } catch (e) {
        // The mailbox has moved on, so don't lose it: keep it for a person,
        // sorted by who sent it.
        console.error("mail-agent: AI", String(e));
        aiFailed = true;
        triage = { kind: fallbackKind(pre.matches, c.kinds), confidence: 0, summary: "" };
      }
      const d = aiFailed ? { keep: !!triage.kind, kind: triage.kind, auto: null } : decide(triage, pre.matches, { autoFile: c.auto_file, kinds: c.kinds });
      if (!d.keep) continue;
      const row = inboxRow({ msg, triage, matches: pre.matches, connection: c, file: d.kind === "expense" || d.kind === "supplier_doc" ? file : null });
      if (aiFailed) Object.assign(row, { status: "failed", error: "This couldn't be read automatically. Check it and file it by hand." });
      if (row.file_name && file?.content) {
        const path = `receipts/${c.owner_user_id}/inbox/${crypto.randomUUID()}.${file.ext}`;
        const { error } = await db.storage.from("receipts").upload(path, decode(file.content), { contentType: file.contentType, upsert: false });
        if (!error) (row as Msg).file_path = path;
      }
      const { data: ins, error } = await db.from("inbox_items").upsert(row, { onConflict: "team_id,message_id,part", ignoreDuplicates: true }).select("id");
      if (error) { console.error("mail-agent: save", error.message); continue; }
      const id = ins?.[0]?.id;
      if (!id) continue;
      counts.kept++;
      if (d.auto) {
        const { error: fe } = await db.rpc("mail_autofile", { p_id: id, p_action: d.auto.action, p_fields: d.auto.fields });
        if (fe) await db.from("inbox_items").update({ error: `Couldn't file this by itself: ${fe.message}` }).eq("id", id);
        else counts.filed++;
      }
    }
    await db.rpc("mail_mark_run", { p_id: c.id, p_cursor: cursor, p_found: counts.kept, p_error: null });
  } catch (e) {
    const auth = e instanceof ms.AuthError || e instanceof gm.AuthError || (e as Error)?.name === "AuthError" || /refused the password/.test(String((e as Error)?.message));
    const message = `${auth ? "AUTH: " : ""}${(e as Error)?.message || e}`;
    console.error("mail-agent:", c.provider, message);
    await db.rpc("mail_mark_run", { p_id: c.id, p_cursor: cursor, p_found: counts.kept, p_error: message });
    return { ...counts, error: message };
  }
  return counts;
}

async function runDue(db: SupabaseClient, only?: string) {
  const started = Date.now();
  const { data } = await db.rpc("mail_connections_due", { p_limit: 20, p_only: only || null });
  const out: Record<string, unknown> = {};
  for (const c of (data || []) as Conn[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    if (c.provider !== "imap" && !providerReady(c.provider)) { out[c.id] = { skipped: `${c.provider} isn't set up` }; continue; }
    out[c.id] = await runConnection(db, c);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = env("SUPABASE_URL");
  const db = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const redirectUri = `${supabaseUrl}/functions/v1/mail-agent`;
  const appUrl = env("APP_URL").replace(/\/$/, "");

  // ── Back from Microsoft/Google sign-in ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const back = (msg: string) => Response.redirect(`${appUrl}/?screen=Expenses&mailbox=${encodeURIComponent(msg)}`, 302);
    const { data: s } = await db.rpc("mail_take_state", { p_state: url.searchParams.get("state") || "" });
    if (!s) return back("expired");
    if (!url.searchParams.get("code")) return back("cancelled");
    try {
      const lib = s.provider === "microsoft" ? ms : gm;
      const t = await lib.exchangeCode(url.searchParams.get("code")!, redirectUri, providerOpts(s.provider));
      if (!t.refresh_token) return back("no-offline-access");
      const email = s.provider === "microsoft" ? await ms.profileEmail(t.access_token) : (await gm.profile(t.access_token)).email;
      const { error } = await db.rpc("mail_save_connection", {
        p_team: s.team_id, p_user: s.user_id, p_provider: s.provider, p_email: email, p_secret: t.refresh_token,
        p_access: t.access_token, p_expires_in: t.expires_in, p_imap_host: null, p_imap_port: null, p_folder: "INBOX",
      });
      if (error) throw new Error(error.message);
      return back("connected");
    } catch (e) {
      console.error("mail-agent: connect", String(e));
      return back("failed");
    }
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  if (body.action === "run") {
    const { data: ok } = await db.rpc("cron_secret_matches", { p_secret: req.headers.get("x-cron-secret") || "" });
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    return json(await runDue(db));
  }

  // Everything else is done as the signed-in person.
  const asUser = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    auth: { persistSession: false },
  });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json({ error: "Sign in again" }, 401);

  if (body.action === "authorize_url") {
    const { data: provider } = await db.rpc("mail_state_provider", { p_state: body.state || "", p_user: who.user.id });
    if (!provider) return json({ error: "Start again from the Expenses screen." }, 400);
    if (!providerReady(provider)) return json({ error: "not_configured", message: `${provider === "microsoft" ? "Microsoft" : "Google"} sign-in isn't set up yet. Ask the app provider.` }, 503);
    const lib = provider === "microsoft" ? ms : gm;
    return json({ url: lib.authorizeUrl({ clientId: providerOpts(provider).clientId, redirectUri, state: body.state }) });
  }

  if (body.action === "connect_imap") {
    const { data: member } = await asUser.rpc("mail_can_connect", { p_team: body.team_id });
    if (member !== true) return json({ error: "You can't add a mailbox to this company." }, 403);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password) return json({ error: "Enter the email address and its app password." }, 400);
    const { serverFor, testLogin } = await import("./imap.js");
    const [host, port] = serverFor(email, body.host, body.port);
    try {
      await testLogin({ host, port, email, password, folder: body.folder || "INBOX" });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    const { data: id, error } = await db.rpc("mail_save_connection", {
      p_team: body.team_id, p_user: who.user.id, p_provider: "imap", p_email: email, p_secret: password,
      p_access: null, p_expires_in: 0, p_imap_host: host, p_imap_port: port, p_folder: body.folder || "INBOX",
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, id });
  }

  if (body.action === "run_one") {
    const { data: ok } = await asUser.rpc("mail_can_run", { p_id: body.connection_id });
    if (ok !== true) return json({ error: "Mailbox not found" }, 404);
    const r = await runDue(db, body.connection_id);
    return json(r[body.connection_id] || { skipped: true });
  }

  return json({ error: "Bad request" }, 400);
});
