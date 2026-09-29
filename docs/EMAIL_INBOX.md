# Receipts and bills by email

Each company gets its own private address, for example
`4a0e4956c351@in.yourproduct.co.za`. Staff forward receipts to it, suppliers can
send invoices to it, and anyone can set an email rule ("forward everything from
accounts@supplier.co.za"). Each receipt or bill waits in **Expenses → Emailed
receipts & bills** until someone checks it and taps **Approve**. Approving makes
an expense with the emailed file attached. Nothing reaches the books without a
person approving it, the same as in Dext, Hubdoc or Xero's "email bills in".

Only mail sent to that address is ever seen. The app never reads anyone's
mailbox.

## How it works

1. An inbound-mail service (Postmark) receives the email and posts it to the
   `inbound-email` Edge Function.
2. The function works out the company from the address, then stores each
   attachment (up to 5 per email, 10 MB each) with the company's receipts.
   PDFs, photos (including iPhone HEIC), Word (.docx), Excel (.xlsx) and CSV
   files are read. Older .doc and .xls files are kept for a person to open.
   When there's no attachment, it stores the email text instead, for online
   orders.
3. AI reads each file: supplier, VAT number, total, VAT, date, due date and
   category. Each value is checked before it's saved. The sender is matched to
   the company's suppliers by email address, email domain or name.
4. In the app, the person reviewing corrects anything that was misread. A
   warning shows when the same amount from a similar supplier is already saved.
   Then they approve it, or tap *Not an expense*.

Safeguards:
- Each address has a 12-character random part, so it can't be guessed. The
  database's `reset_inbox_address(team_id)` function gives a company a new one
  (master account or admin only).
- Automatic replies and bounces are ignored.
- A company can receive at most 200 items a day.
- If the mail service sends the same email twice, it's only stored once.
- Inbox items can only be read by the company's own people, and the
  two-company isolation test checks this.

## Setting it up (about 20 minutes)

1. **Postmark**: create an account at postmarkapp.com, create a server, then
   open its **Inbound** stream.
   - **Simplest**: use the inbound address Postmark shows, for example
     `abc123@inbound.postmarkapp.com`. Company addresses then look like
     `abc123+4a0e4956c351@inbound.postmarkapp.com`.
   - **Nicer**: use your own domain. Add an MX record for
     `in.yourproduct.co.za` pointing to `inbound.postmarkapp.com` (priority 10),
     and set that domain as the server's inbound domain. Company addresses then
     look like `4a0e4956c351@in.yourproduct.co.za`.
2. **Make a secret**: a long random string, for example from a password
   manager (40+ characters).
3. **Postmark webhook**: under Inbound → Settings, set the webhook URL to
   `https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/inbound-email?key=YOUR_SECRET`
   Leave **Include raw email content** off; it isn't needed.
4. **Supabase**: Edge Functions → Secrets → add `INBOUND_EMAIL_SECRET` = your
   secret. `OPENAI_API_KEY` is already set for the receipt scanner. Without it,
   items still arrive, to be typed in by hand.
5. **Vercel**: Project → Settings → Environment Variables → add
   `VITE_INBOX_ADDRESS`. Use `abc123+{token}@inbound.postmarkapp.com` for the
   simplest option, or `{token}@in.yourproduct.co.za` for your own domain.
   Then redeploy. The app puts each company's code where `{token}` is.
6. **Test**: open Expenses, copy the address, and email a PDF invoice to it.
   It should appear within a minute, marked *Ready to check*.

Until steps 4 and 5 are done, the Inbox stays hidden in the app and the
function refuses all mail.

## Costs

Postmark's inbound mail is included in its paid plans (from about $15 a month
for 10,000 emails). Reading each file costs a fraction of a cent on
`gpt-4o-mini`.

## Later: connecting a mailbox

A company could also connect an Outlook or Gmail folder (for example
"Invoices"), with only that folder read. That needs a Microsoft or Google app
review. The unused `outlook_connections` and `quote_emails` tables come from
an earlier attempt at this and can be removed or reused then.
