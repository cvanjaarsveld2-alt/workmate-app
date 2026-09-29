import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bodyText, findToken, findTokens, isAutoReply, looksLikeReceipt, matchSupplier, parseExtraction, sender, usableAttachments,
} from "../supabase/functions/inbound-email/inbound.js";
import { inboxAddress, isPdfPath, itemState, possibleDuplicate, reviewForm, reviewProblem } from "../src/lib/inbox.js";
import { CATEGORIES } from "../src/lib/expenseAccounting.js";
import { CATEGORIES as FN_CATEGORIES } from "../supabase/functions/inbound-email/inbound.js";

const sql = fs.readFileSync("supabase/migrations/20260929160000_email_inbox.sql", "utf8");
const fn = fs.readFileSync("supabase/functions/inbound-email/index.ts", "utf8");
const b64 = n => Buffer.alloc(n, 1).toString("base64");

test("finds the company's token in the address, the +part or Postmark's MailboxHash", () => {
  assert.equal(findToken({ ToFull: [{ Email: "ab12cd34ef56@in.example.co.za" }] }), "ab12cd34ef56");
  assert.equal(findToken({ To: '"Receipts" <abc123+AB12CD34EF56@inbound.postmarkapp.com>' }), "ab12cd34ef56");
  assert.equal(findToken({ MailboxHash: "ab12cd34ef56", To: "x@y.com" }), "ab12cd34ef56");
  // Forwarded with the company address in Cc.
  assert.equal(findToken({ To: "me@acme.co.za", CcFull: [{ Email: "ab12cd34ef56@in.example.co.za" }] }), "ab12cd34ef56");
  assert.equal(findToken({ To: "accounts@acme.co.za" }), null);
  assert.equal(findToken({ MailboxHash: "SampleHash", To: "abc+SampleHash@inbound.postmarkapp.com" }), null);
  // A person whose address happens to look like a token doesn't hide the real one.
  assert.deepEqual(findTokens({ To: "christo12345@acme.co.za", Cc: "ab12cd34ef56@in.example.co.za" }), ["christo12345", "ab12cd34ef56"]);
});

test("keeps PDFs, photos and Office files; drops logos, oversized and unknown files", () => {
  const { files, skipped } = usableAttachments({
    Attachments: [
      { Name: "Invoice 123.pdf", ContentType: "application/pdf", Content: b64(2000) },
      { Name: "logo.png", ContentType: "image/png", Content: b64(4000), ContentID: "logo@x" },
      { Name: "slip.JPG", ContentType: "application/octet-stream", Content: b64(50000) },
      { Name: "terms.docx", ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Content: b64(10) },
      { Name: "archive.zip", ContentType: "application/zip", Content: b64(10) },
      { Name: "huge.pdf", ContentType: "application/pdf", Content: "x", ContentLength: 11 * 1024 * 1024 },
    ],
  });
  assert.deepEqual(files.map(f => [f.name, f.ext, f.contentType]), [
    ["Invoice 123.pdf", "pdf", "application/pdf"],
    ["slip.JPG", "jpg", "image/jpeg"],
    ["terms.docx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ]);
  assert.deepEqual(skipped.map(s => s.name), ["archive.zip", "huge.pdf"]);
  const many = usableAttachments({ Attachments: Array.from({ length: 7 }, (_, i) => ({ Name: `${i}.pdf`, ContentType: "application/pdf", Content: b64(10) })) });
  assert.equal(many.files.length, 5);
  assert.equal(many.skipped.length, 2);
});

test("reads the sender, the body, and ignores automatic replies", () => {
  assert.deepEqual(sender({ From: '"Engen Accounts" <Accounts@Engen.co.za>' }), { email: "accounts@engen.co.za", name: "Engen Accounts" });
  assert.deepEqual(sender({ FromFull: { Email: "a@b.co.za", Name: "B" } }), { email: "a@b.co.za", name: "B" });
  assert.equal(bodyText({ HtmlBody: "<style>p{}</style><p>Total&nbsp;R 1&nbsp;150.00</p><p>Thanks</p>" }), "Total R 1 150.00\nThanks");
  assert.ok(looksLikeReceipt("Order total: R1 150.00"));
  assert.ok(!looksLikeReceipt("See you at the site on Monday"));
  assert.ok(isAutoReply({ Headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }] }));
  assert.ok(isAutoReply({ Subject: "Automatic reply: Invoice" }));
  assert.ok(isAutoReply({ From: "MAILER-DAEMON@mail.example.com" }));
  assert.ok(!isAutoReply({ Subject: "Tax invoice INV-001", Headers: [{ Name: "Auto-Submitted", Value: "no" }] }));
});

test("never trusts the AI's reading as-is", () => {
  const x = parseExtraction('```json\n{"document_type":"invoice","vendor":"Engen Garsfontein","vat_number":"4 123-456 789","amount":"R 1 150,00","vat_amount":"150","currency":"zar","expense_date":"2026-09-27","due_date":"2026-02-31","category":"Fuel","payment_method":"EFT"}\n```');
  assert.equal(x.amount, 1150);
  assert.equal(x.vat_amount, 150);
  assert.equal(x.currency, "ZAR");
  assert.equal(x.vat_number, "4123456789");
  assert.equal(x.expense_date, "2026-09-27");
  assert.equal(x.due_date, ""); // not a real date
  assert.equal(x.payment_method, "Account");
  assert.equal(x.category, "Fuel");
  const bad = parseExtraction({ amount: -5, vat_amount: 900, category: "Snacks", document_type: "spam", currency: "rands" });
  assert.equal(bad.amount, null);
  assert.equal(bad.vat_amount, null);
  assert.equal(bad.category, "Other");
  assert.equal(bad.document_type, "other");
  assert.equal(bad.currency, "ZAR");
  assert.equal(parseExtraction({ amount: "100", vat_amount: "150" }).vat_amount, null); // VAT more than the total
  assert.deepEqual(parseExtraction("not json").amount, null);
  // Same categories as the Expenses screen.
  assert.deepEqual(FN_CATEGORIES, CATEGORIES);
});

test("matches the supplier by email, company domain or name", () => {
  const suppliers = [
    { id: "s1", name: "Engen Garsfontein (Pty) Ltd", email: "accounts@engen.co.za" },
    { id: "s2", name: "Bearing Man", email: "sales@bearingman.co.za" },
    { id: "s3", name: "Joe's Welding", email: "joe@gmail.com" },
    { id: "s4", name: "Old supplier", email: "x@old.co.za", active: false },
  ];
  assert.equal(matchSupplier(suppliers, { fromEmail: "accounts@engen.co.za" })?.id, "s1");
  assert.equal(matchSupplier(suppliers, { fromEmail: "noreply@bearingman.co.za" })?.id, "s2");
  // A Gmail address only matches the exact person.
  assert.equal(matchSupplier(suppliers, { fromEmail: "someone@gmail.com" }), null);
  assert.equal(matchSupplier(suppliers, { vendor: "ENGEN GARSFONTEIN" })?.id, "s1");
  assert.equal(matchSupplier(suppliers, { fromEmail: "x@old.co.za" }), null);
});

test("the app: address, review form, checks and duplicates", () => {
  assert.equal(inboxAddress("ab12cd34ef56", "{token}@in.example.co.za"), "ab12cd34ef56@in.example.co.za");
  assert.equal(inboxAddress("ab12cd34ef56", "abc+{token}@inbound.postmarkapp.com"), "abc+ab12cd34ef56@inbound.postmarkapp.com");
  assert.equal(inboxAddress("ab12cd34ef56", ""), "");
  assert.equal(inboxAddress("", "{token}@x.co.za"), "");
  assert.ok(isPdfPath("receipts/u/inbox/a.pdf"));
  assert.ok(!isPdfPath("receipts/u/receipts/a.jpg"));

  const now = Date.parse("2026-09-28T10:00:00Z");
  assert.equal(itemState({ status: "new", received_at: "2026-09-28T09:59:00Z" }, now), "new");
  assert.equal(itemState({ status: "new", received_at: "2026-09-28T09:00:00Z" }, now), "failed");
  assert.equal(itemState({ status: "ready" }, now), "ready");

  const f = reviewForm({
    received_at: "2026-09-27T08:00:00Z",
    from_name: "Engen",
    extracted: { document_type: "invoice", amount: 1150, vat_amount: 150, document_number: "INV-9", due_date: "2026-10-27" },
  });
  assert.equal(f.amount, "1150");
  assert.equal(f.expense_date, "2026-09-27");
  assert.equal(f.payment_method, "Account");
  assert.equal(f.notes, "No. INV-9 · Due 2026-10-27");
  assert.equal(reviewProblem(f), "");
  assert.equal(reviewProblem({ ...f, amount: "" }), "Enter the amount.");
  assert.equal(reviewProblem({ ...f, vat_amount: "2000" }), "The VAT can't be more than the amount.");

  const expenses = [{ id: "e1", vendor: "ENGEN Garsfontein", amount: 1150, expense_date: "2026-09-28" }];
  assert.equal(possibleDuplicate({ vendor: "Engen", amount: "1150.00", expense_date: "2026-09-27" }, expenses)?.id, "e1");
  assert.equal(possibleDuplicate({ vendor: "Engen", amount: "1150.00", expense_date: "2026-09-20" }, expenses), null);
  assert.equal(possibleDuplicate({ vendor: "Builders", amount: "1150.00", expense_date: "2026-09-27" }, expenses), null);
});

test("the server keeps the inbox private and checks every approval", () => {
  assert.match(sql, /revoke insert, update, delete on public\.inbox_items from anon, authenticated;/);
  assert.match(sql, /create policy inbox_items_select on public\.inbox_items for select to authenticated\s+using \(private\.same_team\(team_id\)/);
  assert.match(sql, /revoke execute on function public\.inbox_team_for_token\(text\) from public, anon, authenticated;/);
  assert.match(sql, /Enter the amount before approving/);
  assert.match(sql, /That job isn''t in your company/);
  assert.match(sql, /select array\['inbox_items',/);
  assert.match(sql, /from public\.inbox_items where team_id <> b_team/);
  // The function checks its secret, doesn't retry ignored mail, and never makes expenses itself.
  assert.match(fn, /if \(!sameSecret\(givenSecret\(req\), secret\)\) return json\(\{ error: "Unauthorized" \}, 401\);/);
  assert.match(fn, /ignoreDuplicates: true/);
  assert.doesNotMatch(fn, /from\("expenses"\)/);
});
