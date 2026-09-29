import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decide, fallbackKind, inboxRow, mainAttachment, matchRecords, parseTriage, prefilter, triagePrompt } from "../supabase/functions/mail-agent/agent.js";
import * as ms from "../supabase/functions/mail-agent/microsoft.js";
import * as gm from "../supabase/functions/mail-agent/google.js";
import { normalizeParsed } from "../supabase/functions/mail-agent/imap-parse.js";

const read = p => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const dir = {
  clients: [{ id: "c1", company: "Anglo Sishen", email: "buyer@anglo.co.za" }],
  contacts: [{ id: "k1", name: "Jan Buyer", email: "jan@kumba.co.za", client_id: "c1" }],
  suppliers: [{ id: "s1", name: "Bearing Man", email: "sales@bearingman.co.za" }],
  purchaseOrders: [{ id: "p1", po_number: "PO-00042", supplier_id: "s1" }],
  ownEmails: ["christo@pwrstart.com"],
};
const msg = over => ({ id: "<m@x>", from: { email: "someone@example.com", name: "" }, subject: "", text: "", headers: [], attachments: [], ...over });

test("the mail agent uses the same receipt reader as email-in", () => {
  assert.equal(read("../supabase/functions/mail-agent/inbound.js"), read("../supabase/functions/inbound-email/inbound.js"));
});

test("prefilter: personal, marketing and automatic mail never reaches the AI", () => {
  assert.equal(prefilter(msg({ subject: "Braai on Saturday?", text: "Bring chops" }), dir).relevant, false);
  assert.equal(prefilter(msg({ subject: "50% off everything", headers: [{ name: "List-Unsubscribe", value: "<mailto:x>" }] }), dir).relevant, false);
  assert.equal(prefilter(msg({ subject: "Automatic reply: Invoice" }), dir).relevant, false);
  assert.equal(prefilter(msg({ from: { email: "calendar@google.com" }, subject: "Invitation: Site visit" }), dir).relevant, false);
  assert.equal(prefilter(msg({ from: { email: "christo@pwrstart.com" }, subject: "lunch?" }), dir).relevant, false);
  // Business mail gets through, with what it matched.
  const p = prefilter(msg({ from: { email: "sales@bearingman.co.za" }, subject: "Order confirmation for PO-00042" }), dir);
  assert.equal(p.relevant, true);
  assert.equal(p.matches.supplier.id, "s1");
  assert.equal(p.matches.po.id, "p1");
  assert.equal(prefilter(msg({ from: { email: "anyone@anglo.co.za" }, subject: "Gate access" }), dir).matches.client.id, "c1");
  assert.equal(prefilter(msg({ from: { email: "jan@kumba.co.za" }, subject: "hello" }), dir).matches.client.id, "c1");
  assert.equal(prefilter(msg({ subject: "Tax invoice 2231 from Engen" }), dir).relevant, true);
  // A shop's receipt with an unsubscribe link still counts.
  assert.equal(prefilter(msg({ subject: "Your Takealot receipt", headers: [{ name: "List-Unsubscribe", value: "x" }] }), dir).relevant, true);
  // Gmail addresses only match the exact person, not everyone at gmail.
  assert.equal(matchRecords(msg({ from: { email: "stranger@gmail.com" } }), { clients: [{ id: "c9", email: "joe@gmail.com" }] }).client, null);
  // PO numbers match whole words only.
  assert.equal(matchRecords(msg({ subject: "PO-000421" }), dir).po, null);
});

test("the AI's answer is checked, never trusted as-is", () => {
  const t = parseTriage('```json\n{"kind":"expense","confidence":1.4,"summary":"Bearing Man invoice","expense":{"vendor":"Bearing Man","amount":"R 2 300,00","vat_amount":"300","expense_date":"2026-09-27","category":"Parts & Materials"}}\n```');
  assert.equal(t.kind, "expense");
  assert.equal(t.confidence, 1);
  assert.equal(t.expense.amount, 2300);
  assert.equal(t.expense.vat_amount, 300);
  assert.equal(parseTriage({ kind: "delete_everything" }).kind, "ignore");
  assert.equal(parseTriage("nonsense").kind, "ignore");
  // A kind the company switched off is ignored.
  assert.equal(parseTriage({ kind: "quote_request" }, ["expense"]).kind, "ignore");
  const s = parseTriage({ kind: "supplier_doc", confidence: 0.9, supplier_doc: { doc_type: "order_confirmation", expected_date: "2026-02-30", total: "R1,000.50" } });
  assert.equal(s.supplier_doc.expected_date, "");
  assert.equal(s.supplier_doc.total, 1000.5);
  assert.match(triagePrompt({ companyName: "Power Works", matches: { supplier: { name: "Bearing Man" } } }), /The sender is a supplier: Bearing Man\./);
});

test("decide: review by default; files by itself only when allowed and sure", () => {
  const exp = { kind: "expense", confidence: 0.95, summary: "x", expense: { amount: 2300, vat_amount: 300, currency: "ZAR", vendor: "Bearing Man" } };
  const m = { supplier: { id: "s1", name: "Bearing Man" } };
  assert.deepEqual(decide(exp, m), { keep: true, kind: "expense", auto: null });
  assert.equal(decide(exp, m, { autoFile: true }).auto.action, "expense");
  assert.equal(decide(exp, {}, { autoFile: true }).auto, null); // unknown supplier: a person checks
  assert.equal(decide({ ...exp, confidence: 0.8 }, m, { autoFile: true }).auto, null);
  assert.equal(decide({ ...exp, expense: { ...exp.expense, currency: "USD" } }, m, { autoFile: true }).auto, null);
  assert.equal(decide({ kind: "customer_email", confidence: 0.9, summary: "Gate code" }, { client: { id: "c1" } }, { autoFile: true }).auto.action, "customer_note");
  assert.equal(decide({ kind: "customer_email", confidence: 0.9 }, {}, { autoFile: true }).auto, null);
  assert.equal(decide({ kind: "quote_request", confidence: 0.96, quote_request: { what: "2x 30T jacks" } }, {}, { autoFile: true }).auto.fields.title, "Quote: 2x 30T jacks");
  assert.equal(decide({ kind: "quote_request", confidence: 0.9 }, {}, { autoFile: true }).auto, null);
  assert.equal(decide({ kind: "supplier_doc", confidence: 0.9, supplier_doc: {} }, { po: { id: "p1" } }, { autoFile: true }).auto.fields.purchase_order_id, "p1");
  assert.equal(decide({ kind: "ignore" }, m).keep, false);
  assert.equal(decide({ kind: "quote_request", confidence: 1 }, {}, { kinds: ["expense"] }).keep, false);
  assert.equal(fallbackKind({ po: {} }), "supplier_doc");
  assert.equal(fallbackKind({ client: {} }), "customer_email");
  assert.equal(fallbackKind({ client: {} }, ["expense"]), null);
});

test("inbox row: private to the mailbox owner, file kept for bills", () => {
  const m = msg({ id: "<abc@x>", from: { email: "Sales@BearingMan.co.za", name: "Bearing Man" }, subject: "Invoice 88", date: "2026-09-27T08:00:00Z",
    attachments: [{ Name: "INV88.pdf", ContentType: "application/pdf", Content: Buffer.alloc(100, 1).toString("base64") }] });
  const file = mainAttachment(m);
  assert.equal(file.ext, "pdf");
  const row = inboxRow({ msg: m, triage: { kind: "expense", confidence: 0.9, summary: "Invoice", expense: { amount: 100 } },
    matches: { supplier: { id: "s1" } }, connection: { id: "conn", team_id: "t", user_id: "u" }, file });
  assert.equal(row.source, "mailbox");
  assert.equal(row.owner_user_id, "u");
  assert.equal(row.from_email, "sales@bearingman.co.za");
  assert.equal(row.status, "ready");
  assert.equal(row.file_name, "INV88.pdf");
  assert.equal(row.supplier_id, "s1");
  assert.equal(inboxRow({ msg: m, triage: { kind: "expense", expense: {} }, matches: {}, connection: {} }).status, "failed");
});

const fakeFetch = routes => async (url, init = {}) => {
  const u = String(url);
  const hit = routes.find(([re]) => re.test(u));
  if (!hit) throw new Error(`unexpected ${u}`);
  const [status, body] = typeof hit[1] === "function" ? hit[1](u, init) : [200, hit[1]];
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
};

test("Microsoft: sign-in asks only to read mail; delta paging; refused access is an auth error", async () => {
  const u = new URL(ms.authorizeUrl({ clientId: "cid", redirectUri: "https://db/functions/v1/mail-agent", state: "s" }));
  assert.equal(u.searchParams.get("scope"), "offline_access User.Read Mail.Read");
  const fetchFn = fakeFetch([
    [/mailFolders\?\$filter/, { value: [{ id: "F1" }] }],
    [/mailFolders\/F1\/messages\/delta/, { value: [
      { id: "1", internetMessageId: "<a@x>", subject: "Invoice", from: { emailAddress: { address: "Sales@X.co.za", name: "X" } }, receivedDateTime: "2026-09-27T08:00:00Z", body: { contentType: "text", content: "Total R100" }, hasAttachments: true },
      { id: "2", "@removed": { reason: "deleted" } },
    ], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next" }],
    [/\/next$/, { value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta?token=9" }],
  ]);
  const r = await ms.listNew("tok", { folder: "Invoices", since: "2026-09-20T00:00:00Z", fetchFn });
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].from.email, "sales@x.co.za");
  assert.equal(r.messages[0].text, "Total R100");
  assert.equal(r.cursor, "https://graph.microsoft.com/v1.0/delta?token=9");
  await assert.rejects(ms.listNew("tok", { cursor: "https://graph.microsoft.com/v1.0/delta?x", fetchFn: fakeFetch([[/delta/, () => [401, {}]]]) }), ms.AuthError);
  await assert.rejects(ms.refresh("r", { clientId: "c", clientSecret: "s", fetchFn: fakeFetch([[/token/, () => [400, { error: "invalid_grant" }]]]) }), ms.AuthError);
});

test("Gmail: first check reads the last week, then only what's new", async () => {
  const u = new URL(gm.authorizeUrl({ clientId: "cid", redirectUri: "r", state: "s" }));
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly email");
  assert.equal(u.searchParams.get("access_type"), "offline");
  const b64 = s => Buffer.from(s).toString("base64url");
  const message = { id: "g1", internalDate: String(Date.parse("2026-09-27T08:00:00Z")), payload: {
    headers: [{ name: "From", value: '"Engen" <accounts@engen.co.za>' }, { name: "Subject", value: "Tax invoice" }, { name: "Message-ID", value: "<g@x>" }],
    parts: [{ mimeType: "text/plain", body: { data: b64("Total R 1 150.00") } }, { filename: "inv.pdf", mimeType: "application/pdf", body: { attachmentId: "A1", size: 10 } }],
  } };
  const first = await gm.listNew("tok", { fetchFn: fakeFetch([
    [/\/profile$/, { emailAddress: "me@gmail.com", historyId: "500" }],
    [/\/messages\?labelIds=INBOX&q=newer_than%3A7d/, { messages: [{ id: "g1" }] }],
    [/\/messages\/g1\?format=full/, message],
  ]) });
  assert.equal(first.cursor, "500");
  assert.equal(first.messages[0].from.email, "accounts@engen.co.za");
  assert.equal(first.messages[0].text, "Total R 1 150.00");
  assert.equal(first.messages[0].attachments[0].attachmentId, "A1");
  const next = await gm.listNew("tok", { cursor: "500", fetchFn: fakeFetch([
    [/\/history\?startHistoryId=500/, { history: [{ messagesAdded: [{ message: { id: "g1" } }] }], historyId: "510" }],
    [/\/messages\/g1\?format=full/, message],
  ]) });
  assert.equal(next.cursor, "510");
  assert.equal(next.messages.length, 1);
  // History too old: starts again from recent mail.
  const reset = await gm.listNew("tok", { cursor: "1", fetchFn: fakeFetch([
    [/\/history/, () => [404, {}]],
    [/\/profile$/, { historyId: "900" }],
    [/\/messages\?labelIds/, { messages: [] }],
  ]) });
  assert.equal(reset.cursor, "900");
  assert.equal(gm.b64url("YQ"), "YQ==");
});

test("IMAP messages are parsed into the same shape", () => {
  const m = normalizeParsed({
    messageId: "<i@x>", from: { address: "Accounts@Engen.co.za", name: "Engen" }, to: [{ address: "me@icloud.com" }], subject: "Invoice",
    date: "2026-09-27T08:00:00Z", text: "Total R100", headers: [{ key: "list-unsubscribe", value: "x" }],
    attachments: [{ filename: "inv.pdf", mimeType: "application/pdf", content: new Uint8Array([1, 2, 3]).buffer }],
  }, 7);
  assert.equal(m.id, "<i@x>");
  assert.equal(m.from.email, "accounts@engen.co.za");
  assert.equal(m.attachments[0].Content, "AQID");
  assert.equal(m.headers[0].name, "list-unsubscribe");
});

test("the server side: private credentials, owner-only items, auto-filing as the owner", () => {
  const sql = read("../supabase/migrations/20260929180000_mail_agent.sql");
  assert.match(sql, /vault\.create_secret\(p_secret/);
  assert.match(sql, /revoke all on private\.mail_connections from public, anon, authenticated;/);
  assert.match(sql, /p_source = 'forward' or p_owner = auth\.uid\(\) or private\.is_team_manager\(p_team\)/);
  assert.match(sql, /return private\.inbox_file\(p_id, p_action, coalesce\(p_fields, '\{\}'::jsonb\), it\.owner_user_id, true\);/);
  assert.match(sql, /create trigger team_members_drop_mailboxes after delete on public\.team_members/);
  assert.match(sql, /where exists \(select 1 from private\.mail_connections where status = 'active'\)/);
  // Anyone who can see an inbox item (or the expense made from it) can open
  // its file, wherever it's stored; nobody else.
  const files = read("../supabase/migrations/20260929190000_inbox_file_access.sql");
  assert.match(files, /create policy receipts_read_inbox on storage\.objects for select to authenticated/);
  assert.match(files, /exists \(select 1 from public\.inbox_items i where i\.file_path = objects\.name\)/);
  assert.match(files, /exists \(select 1 from public\.expenses e where e\.receipt_url = objects\.name\)/);
  const fn = read("../supabase/functions/mail-agent/index.ts");
  assert.match(fn, /cron_secret_matches/);
  assert.match(fn, /mail_state_provider", \{ p_state: body\.state \|\| "", p_user: who\.user\.id \}/);
  assert.match(fn, /const pre = prefilter\(msg, dir\);\s+if \(!pre\.relevant\) continue;/);
});
