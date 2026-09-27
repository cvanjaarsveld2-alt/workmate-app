// ─── Edge Function: customer-reminders ───────────────────────────────────────
// Called once a day by pg_cron (job "powermate-customer-reminders", 08:40
// SAST). Emails customers a polite reminder about overdue invoices, with their
// portal link, for companies that switched this on (Company Details →
// Reminders). One email per invoice at 1, 7, 14 and 30 days overdue.
//
// Needs these secrets (Supabase → Edge Functions → Secrets); without them it
// sends nothing:
//   RESEND_API_KEY        an API key from resend.com
//   REMINDER_FROM_EMAIL   a sender on a domain verified in Resend,
//                         e.g. accounts@yourproduct.co.za
//   APP_URL               the app's address, e.g. https://app.yourproduct.co.za
// Replies go to each company's finance (or main) email address.
//
// Auth: like problem-digest, cron presents x-cron-secret (verify_jwt = false).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Due = {
  invoice_id: string;
  team_id: string;
  stage: number;
  to: string;
  contact: string | null;
  client: string | null;
  invoice_number: string;
  balance: number;
  due_date: string;
  days: number;
  company: string | null;
  reply_to: string | null;
  portal_token: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rand = (n: number) =>
  "R " + Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Same wording as "Remind customer" in the app (src/lib/reminders.js).
function message(d: Due, url: string) {
  return [
    `Hi ${d.contact || "there"},`,
    "",
    `A friendly reminder that invoice ${d.invoice_number} for ${rand(d.balance)} was due on ${d.due_date} (${d.days} day${d.days === 1 ? "" : "s"} ago).`,
    `You can see the invoice, your statement and how to pay here: ${url}`,
    "If you've already paid, please ignore this and thank you.",
    "",
    "Kind regards,",
    d.company || "",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server not configured" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const presented = req.headers.get("x-cron-secret") || "";
  if (!presented) return json({ error: "Unauthorized" }, 401);
  const { data: ok } = await db.rpc("cron_secret_matches", { p_secret: presented });
  if (ok !== true) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("REMINDER_FROM_EMAIL") ?? "";
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  if (!apiKey || !from || !appUrl) return json({ skipped: "Email sending isn't set up (RESEND_API_KEY, REMINDER_FROM_EMAIL, APP_URL)." });

  const { data: due, error } = await db.rpc("customer_reminder_batch");
  if (error) return json({ error: error.message }, 500);
  let sent = 0,
    failed = 0;
  for (const d of (due || []) as Due[]) {
    const url = `${appUrl}/?portal=${d.portal_token}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${(d.company || "Accounts").replace(/[<>"]/g, "")} <${from}>`,
        to: [d.to],
        reply_to: d.reply_to || undefined,
        subject: `Reminder: invoice ${d.invoice_number} is overdue`,
        text: message(d, url),
      }),
    }).catch(() => null);
    if (res?.ok) {
      await db.rpc("customer_reminder_sent", { p_invoice_id: d.invoice_id, p_team_id: d.team_id, p_stage: d.stage });
      sent++;
    } else failed++;
  }
  return json({ sent, failed });
});
