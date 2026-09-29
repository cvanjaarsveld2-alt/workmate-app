// ─── Edge Function: inbound-email ────────────────────────────────────────────
// Takes in receipts and supplier bills emailed to a company's forwarding
// address (shown in the app under Expenses → Inbox) and puts them in its
// Inbox for someone to check and approve. Nothing becomes an expense here.
//
// The inbound-mail service (Postmark: Servers → Inbound → Webhook URL) posts
// each email as JSON to:
//   <SUPABASE_URL>/functions/v1/inbound-email?key=<INBOUND_EMAIL_SECRET>
// (or with the secret as the password of basic auth). Addresses look like
// <token>@<your inbound domain>, or <hash>+<token>@inbound.postmarkapp.com.
//
// Secrets: INBOUND_EMAIL_SECRET (required), OPENAI_API_KEY (to read the files;
// without it items arrive for typing in by hand). verify_jwt = false: the
// secret is checked here. Always answers 200 once the secret is right, so the
// mail service doesn't retry mail we chose to ignore; retries of the same
// email are recognised by its Message-ID.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bodyText, extractionPrompt, findTokens, isAutoReply, looksLikeReceipt, matchSupplier,
  parseExtraction, sender, usableAttachments,
} from "./inbound.js";
import { aiParts } from "./documents.js";
import { heicAsJpeg } from "./heic.js";

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Most items one company can receive in a day (stops a mail loop or spam
// from running up AI costs).
const DAILY_LIMIT = 200;

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function givenSecret(req: Request) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("key") ?? "";
  if (fromQuery) return fromQuery;
  const auth = req.headers.get("authorization") ?? "";
  if (/^basic /i.test(auth)) {
    try {
      const decoded = atob(auth.slice(6).trim());
      return decoded.slice(decoded.indexOf(":") + 1);
    } catch {
      return "";
    }
  }
  return req.headers.get("x-inbound-secret") ?? "";
}

type Part = { name: string; size: number; content?: string; ext?: string; contentType?: string; text?: string };

async function readWithAI(part: Part): Promise<{ extracted?: Record<string, unknown>; error?: string }> {
  const key = env("OPENAI_API_KEY");
  if (!key) return { error: "Automatic reading isn't set up yet. Enter the details from the file." };
  const content: unknown[] = [{ type: "text", text: extractionPrompt() }];
  if (part.text) content.push({ type: "text", text: `The email:\n\n${part.text}` });
  else {
    // PDFs and photos as they are; Word, Excel and CSV as their text; iPhone
    // photos converted to JPEG first.
    const file = (part.ext === "heic" && (await heicAsJpeg(part))) || part;
    const read = await aiParts(file);
    if (read.error) return { error: read.error };
    content.push(...read.parts);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      console.error("inbound-email: AI said", res.status, (await res.text()).slice(0, 300));
      return { error: "The file couldn't be read automatically. Enter the details from the file." };
    }
    const body = await res.json();
    return { extracted: parseExtraction(body?.choices?.[0]?.message?.content ?? "{}") };
  } catch (e) {
    console.error("inbound-email: AI failed", String(e));
    return { error: "The file couldn't be read automatically. Enter the details from the file." };
  } finally {
    clearTimeout(timer);
  }
}

function decode(b64: string) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function messageKey(p: Record<string, unknown>) {
  const id = String(p.MessageID ?? "").trim();
  if (id) return id.slice(0, 300);
  const raw = `${p.From}|${p.Subject}|${p.Date}|${String(p.TextBody ?? "").slice(0, 500)}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return "h:" + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

async function takeIn(db: SupabaseClient, p: Record<string, unknown>) {
  const tokens = findTokens(p);
  if (!tokens.length) return { ignored: "not addressed to a company inbox" };
  let team: { team_id: string; owner_user_id: string; access: string } | undefined;
  for (const token of tokens) {
    const { data: rows } = await db.rpc("inbox_team_for_token", { p_token: token });
    team = rows?.[0];
    if (team) break;
  }
  if (!team) return { ignored: "unknown address" };
  if (team.access === "suspended") return { ignored: "company suspended" };
  if (isAutoReply(p)) return { ignored: "automatic reply" };

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("inbox_items").select("id", { count: "exact", head: true })
    .eq("team_id", team.team_id).gte("received_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    console.warn("inbound-email: daily limit reached for", team.team_id);
    return { ignored: "daily limit reached" };
  }

  const from = sender(p);
  const subject = String(p.Subject ?? "").slice(0, 300);
  const text = bodyText(p);
  const { files, skipped } = usableAttachments(p);
  const parts: Part[] = files.length
    ? files
    : [{ name: "", size: 0, text: looksLikeReceipt(text) ? text : undefined }];
  const note = skipped.length ? `Not taken in: ${skipped.map(s => `${s.name} (${s.why})`).join(", ")}.` : "";
  const msgId = await messageKey(p);

  const { data: suppliers } = await db.from("suppliers").select("id, name, email, active").eq("team_id", team.team_id).limit(1000);

  let added = 0;
  for (let n = 0; n < parts.length; n++) {
    const part = parts[n];
    const { data: inserted } = await db.from("inbox_items").upsert({
      team_id: team.team_id,
      message_id: msgId,
      part: n,
      from_email: from.email || null,
      from_name: from.name || null,
      subject,
      body_excerpt: text.slice(0, 4000) || null,
      file_name: part.name || null,
      content_type: part.contentType ?? (part.text ? "text/plain" : null),
      file_size: part.size || null,
      status: "new",
    }, { onConflict: "team_id,message_id,part", ignoreDuplicates: true }).select("id");
    const itemId = inserted?.[0]?.id;
    if (!itemId) continue; // the same email again (the mail service retried)
    added++;

    let filePath: string | null = null;
    let result: { extracted?: Record<string, unknown>; error?: string };
    if (part.content) {
      filePath = `receipts/${team.owner_user_id}/inbox/${crypto.randomUUID()}.${part.ext}`;
      const { error: upErr } = await db.storage.from("receipts")
        .upload(filePath, decode(part.content), { contentType: part.contentType, upsert: false });
      if (upErr) {
        console.error("inbound-email: storage", upErr.message);
        filePath = null;
        result = { error: "The file couldn't be saved. Ask the sender to send it again." };
      } else {
        result = await readWithAI(part);
      }
    } else if (part.text) {
      result = await readWithAI(part);
    } else {
      result = { error: "No file was attached, and no amount was found in the email." };
    }

    const extracted = result.extracted ?? {};
    const supplier = matchSupplier(suppliers ?? [], { fromEmail: from.email, vendor: String(extracted.vendor ?? "") });
    await db.from("inbox_items").update({
      file_path: filePath,
      status: result.extracted && extracted.amount ? "ready" : "failed",
      extracted,
      supplier_id: supplier?.id ?? null,
      error: [result.extracted && !extracted.amount ? "No amount was found. Enter it from the file." : result.error, note]
        .filter(Boolean).join(" ") || null,
    }).eq("id", itemId);
  }
  return { ok: true, added };
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = env("INBOUND_EMAIL_SECRET");
  if (!secret) return json({ error: "Email-in isn't set up (INBOUND_EMAIL_SECRET)" }, 503);
  if (!sameSecret(givenSecret(req), secret)) return json({ error: "Unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ignored: "not JSON" });
  }
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  try {
    return json(await takeIn(db, payload));
  } catch (e) {
    // A real failure: let the mail service try again later.
    console.error("inbound-email:", String(e));
    return json({ error: "Couldn't take the email in" }, 500);
  }
});
