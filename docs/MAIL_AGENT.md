# Mail agent

The mail agent reads the mailboxes people connect and brings what matters to
the company into the Inbox (Expenses → *Inbox: receipts, bills & email*):

| It finds | It becomes (after a person approves, or by itself if allowed) |
|---|---|
| Receipts and supplier bills | An expense, with the PDF or photo attached |
| Customers asking for a quote | A new lead (stage *New*) |
| Other mail from known customers | A note on the customer's timeline |
| Supplier quotes, order confirmations, delivery notes | A note on the purchase order (and its reference and delivery date) |

## How it works

Every 5 minutes (cron job `powermate-mail-agent`, only while a mailbox is
connected) the `mail-agent` Edge Function checks each connected mailbox for new
mail in the chosen folder. When a mailbox is first connected, it also reads the
week before.

1. **Pre-filter, without AI.** Automatic replies, calendar invites, newsletters
   and marketing, and personal mail with no business words are skipped. They
   are never stored or sent anywhere. The agent looks at mail from the
   company's customers, contacts and suppliers, mail that mentions an open
   purchase order number, and mail with words like invoice, receipt, quote or
   order.
2. **One AI call** (`gpt-4o-mini`) sorts each remaining email and reads its
   details, including the PDF or photo attached. The answer is checked before
   use: the kind must be one the company allows, amounts must be numbers, VAT
   can't exceed the total, and dates must be real.
3. **Decide:**
   - By default, everything waits in the Inbox. A person can correct it, choose
     *What is this?* (expense, lead, customer note or purchase order) and file
     it, or tap *Not needed*.
   - With **File sure items by itself** switched on (master account only), the
     agent files an item itself only when it is sure:

     | Item | Filed by itself when |
     |---|---|
     | Expense | From a known supplier, has a total, in rand, and the AI is 90%+ sure |
     | Customer note | From a known customer, 85%+ sure |
     | Lead | 95%+ sure it's a quote request |
     | Purchase order note | The purchase order number is in the email, 85%+ sure |

     Everything it files is listed under *Filed by the agent this week*.
   - If the AI can't be reached, the email is still kept for a person to check
     and file by hand. It's never silently lost.

## Privacy and security

- The agent only **reads** mail. It can't send, delete or move anything:
  - Microsoft asks only for Mail.Read.
  - Google asks only for gmail.readonly.
  - IMAP mailboxes are opened read-only.
- Sign-in tokens and app passwords are kept encrypted in Supabase Vault. The
  app never shows them, and they're deleted when the mailbox is disconnected
  or its owner leaves the company.
- Items from someone's own mailbox are visible only to that person and the
  company's master account and admins. Items forwarded to the company address
  are visible to everyone in the company.
- A mailbox whose sign-in stops working (a changed password, or access
  removed) is stopped and marked, instead of being retried every 5 minutes.
- Say in your privacy policy that people may connect a mailbox, what is read,
  and what is kept.

## Connecting a mailbox (people in the app)

Expenses → Inbox → *Connect a mailbox*:

- **Microsoft (Outlook, Microsoft 365):** *Sign in with Microsoft*.
- **Gmail:** *Sign in with Google*.
- **iCloud or another mailbox:** enter the address and an **app-specific
  password**. For iCloud, create one at appleid.apple.com → Sign-In and
  Security → App-Specific Passwords. The server is filled in for iCloud,
  Gmail, Outlook.com and Yahoo; for other providers, type it under *Server
  settings*.

*Folder* chooses what is read, for example a folder called `Invoices` that an
email rule fills. *Check now* runs straight away.

## Setting it up (platform owner)

The function is deployed. IMAP mailboxes such as iCloud work as soon as
`OPENAI_API_KEY` is set (it already is, for the receipt scanner). For the
sign-in buttons:

### Microsoft (about 15 minutes)

1. In portal.azure.com, go to **App registrations → New registration**.
2. Name it after your product. For account types, choose *Accounts in any
   organizational directory and personal Microsoft accounts*.
3. Set the redirect URI (Web) to
   `https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/mail-agent`.
4. Under **Certificates & secrets**, create a new client secret and copy its
   value.
5. Under **API permissions**, add Microsoft Graph delegated permissions
   `Mail.Read`, `User.Read` and `offline_access`.
6. In Supabase → Edge Functions → Secrets, add `MS_CLIENT_ID` (the
   Application ID) and `MS_CLIENT_SECRET`.
7. Before other companies' staff connect, verify your publisher domain (Azure
   → Branding & properties). Microsoft shows a warning for unverified apps.

### Google (about 20 minutes, plus Google's review before public use)

1. In console.cloud.google.com, create a project and enable the **Gmail API**.
2. Set up the **OAuth consent screen**:
   - user type *External*;
   - scope `gmail.readonly`;
   - add yourself as a test user.
3. Under **Credentials**, create an OAuth client ID of type *Web application*.
   Set its redirect URI to
   `https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/mail-agent`.
4. In Supabase secrets, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. While the app is in *Testing*, only up to 100 listed test users can
   connect. For everyone, Google must verify the app. `gmail.readonly` is a
   *restricted* scope, which needs a yearly security assessment (CASA), paid
   to an assessor. Until then, Gmail users can connect as an IMAP mailbox with
   a Google app password instead.

`APP_URL` (already set) is where people return to after signing in.

## Costs

- Mailboxes: free.
- AI: about R0.01–R0.05 per business email read. Personal and marketing mail
  costs nothing, because it never reaches the AI.
- Each mailbox check reads at most 25 new emails. The rest wait for the next
  check.
