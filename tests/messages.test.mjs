import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_TEMPLATES, internationalPhone, messageVars, niceDate, render, template, whatsappUrl } from "../src/lib/messages.js";
import { finishBody, smsReference, smsRequest } from "../supabase/functions/send-messages/sms.js";

const sql = fs.readFileSync(new URL("../supabase/migrations/20260928100000_customer_messages.sql", import.meta.url), "utf8");

test("the app's wording is the same as the database's (automatic SMS)", () => {
  for (const [kind, text] of Object.entries(DEFAULT_TEMPLATES)) {
    const inSql = sql.match(new RegExp(`when '${kind}' then '((?:[^']|'')*)'`))[1].replace(/''/g, "'");
    assert.equal(inSql, text, kind);
  }
});

test("South African numbers become international; junk is refused", () => {
  assert.equal(internationalPhone("082 123 4567"), "+27821234567");
  assert.equal(internationalPhone("+27 (82) 123-4567"), "+27821234567");
  assert.equal(internationalPhone("27821234567"), "+27821234567");
  assert.equal(internationalPhone("0027821234567"), "+27821234567");
  assert.equal(internationalPhone("+44 7700 900123"), "+447700900123");
  assert.equal(internationalPhone("12345"), null);
  assert.equal(internationalPhone(""), null);
  assert.equal(whatsappUrl("+27821234567", "Hi & bye"), "https://wa.me/27821234567?text=Hi%20%26%20bye");
});

test("messages fill in the customer, company, job, date and link", () => {
  const vars = messageVars({
    client: { contact: "Johan Smit", company: "Test Mine" },
    profile: { trading_name: "Acme Hydraulics" },
    job: { title: "Pump overhaul", scheduled_date: "2026-10-06", scheduled_time: "09:30:00", assigned_to: "Greg Botha" },
  });
  assert.equal(render(DEFAULT_TEMPLATES.booking, vars), 'Hi Johan, Acme Hydraulics has booked your job "Pump overhaul" for Tue 06 Oct at 09:30. Reply to this message if that doesn\'t suit you.');
  assert.equal(render(DEFAULT_TEMPLATES.on_my_way, vars), "Hi Johan, Greg from Acme Hydraulics is on the way to you now.");
  const inv = messageVars({ client: { company: "Beta" }, profile: { trading_name: "Acme" }, invoice: { invoice_number: "INV-7", total: 1150, balance_due: 575 }, link: "https://app/?portal=x" });
  assert.equal(render(DEFAULT_TEMPLATES.invoice, inv), "Hi Beta, here is invoice INV-7 from Acme for R 575.00. You can view and pay it here: https://app/?portal=x");
  assert.equal(niceDate("2026-10-06"), "Tue 06 Oct");
});

test("a company's own wording wins; blank falls back", () => {
  assert.equal(template("done", { message_templates: { done: "Klaar! {client}" } }), "Klaar! {client}");
  assert.equal(template("done", { message_templates: { done: "  " } }), DEFAULT_TEMPLATES.done);
  assert.equal(render("Hi {client}{unknown}!", { client: "Ann" }), "Hi Ann!");
});

test("SMS requests for BulkSMS and Twilio", () => {
  const b = smsRequest({ provider: "bulksms", username: "id", secret: "sec" }, { to: "+27821234567", body: "Hi" });
  assert.equal(b.url, "https://api.bulksms.com/v1/messages");
  assert.equal(b.init.headers.Authorization, "Basic " + Buffer.from("id:sec").toString("base64"));
  assert.deepEqual(JSON.parse(b.init.body), { to: "+27821234567", body: "Hi" });
  assert.equal(smsReference({ provider: "bulksms" }, [{ id: "123" }]), "123");
  const t = smsRequest({ provider: "twilio", username: "AC1", secret: "tok", sender: "+27100000000" }, { to: "+27821234567", body: "Hi there" });
  assert.equal(t.url, "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
  assert.equal(t.init.body, "To=%2B27821234567&From=%2B27100000000&Body=Hi+there");
  assert.equal(smsReference({ provider: "twilio" }, { sid: "SM9" }), "SM9");
});

test("the portal link in job-done texts needs the app's address, else it's left out", () => {
  const body = 'Hi Ann, Acme has finished the job "X". Thank you for your business. See your account and invoices: {app}/?portal=abc123';
  assert.equal(finishBody(body, "https://app.example.com/"), 'Hi Ann, Acme has finished the job "X". Thank you for your business. See your account and invoices: https://app.example.com/?portal=abc123');
  assert.equal(finishBody(body, ""), 'Hi Ann, Acme has finished the job "X". Thank you for your business.');
});

test("people can't mark messages sent, and SMS have a monthly limit", () => {
  assert.match(sql, /revoke update, delete on public\.customer_messages from authenticated/);
  assert.match(sql, /\(channel = 'sms' and status in \('queued', 'skipped'\)\)\)\s+and provider_ref is null and sent_at is null/);
  assert.match(sql, /if v_used >= v_limit then/);
  assert.match(sql, /'messages_claim\(integer\)', 'message_result\(uuid, boolean, text, text\)'\] loop\s+execute format\('revoke execute on function public\.%s from public, anon, authenticated'/);
  assert.match(fs.readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8"), /\[functions\.send-messages\](\n#[^\n]*)*\nverify_jwt = false/);
});
