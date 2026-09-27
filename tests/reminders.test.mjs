import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { daysOverdue, isOverdue, reminderMessage } from "../src/lib/reminders.js";

const inv = { invoice_number: "INV-00042", due_date: "2026-09-20", total: 1150, balance_due: 650, status: "sent" };

test("overdue invoices", () => {
  assert.equal(daysOverdue(inv, "2026-09-27"), 7);
  assert.equal(daysOverdue(inv, "2026-09-20"), 0);
  assert.equal(isOverdue(inv, "2026-09-27"), true);
  assert.equal(isOverdue({ ...inv, balance_due: 0 }, "2026-09-27"), false);
  assert.equal(isOverdue({ ...inv, status: "paid" }, "2026-09-27"), false);
  assert.equal(isOverdue({ ...inv, due_date: null }, "2026-09-27"), false);
});

test("the reminder is polite, exact and links to the customer's account", () => {
  const text = reminderMessage({ contact: "Jan", company: "Acme Hydraulics", invoice: inv, url: "https://app.example.com/?portal=abc", today: "2026-09-27" });
  assert.match(text, /^Hi Jan,\n\nA friendly reminder that invoice INV-00042 for R 650.00 was due on 2026-09-20 \(7 days ago\)\./);
  assert.match(text, /how to pay here: https:\/\/app\.example\.com\/\?portal=abc/);
  assert.match(text, /Kind regards,\nAcme Hydraulics$/);
  assert.doesNotMatch(reminderMessage({ invoice: inv, today: "2026-09-27" }), /here:/);
});

test("reminders go out once, daily, and customer emails only when switched on", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927140000_automatic_reminders.sql", import.meta.url), "utf8");
  assert.match(sql, /unique \(kind, record_id, stage\)/);
  assert.match(sql, /cron\.schedule\('powermate-daily-reminders'/);
  const emails = fs.readFileSync(new URL("../supabase/migrations/20260927140100_customer_reminder_emails.sql", import.meta.url), "utf8");
  assert.match(emails, /tp\.email_customer_reminders/);
  assert.match(emails, /grant execute on function public\.customer_reminder_batch\(\) to service_role/);
  const fn = fs.readFileSync(new URL("../supabase/functions/customer-reminders/index.ts", import.meta.url), "utf8");
  assert.match(fn, /cron_secret_matches/);
});
