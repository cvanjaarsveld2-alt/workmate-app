# Selling the app to other companies — launch checklist

Everything in the app for running several companies is built. This page covers
what only you (the product owner) can do, and how to run the platform day to day.
How accounts, roles and memberships work is explained in
[ACCOUNTS_AND_MEMBERSHIPS.md](ACCOUNTS_AND_MEMBERSHIPS.md).

## 1. Before the first outside company (must do)

| # | What | Where | Time |
|---|------|-------|------|
| 1 | **Upgrade Supabase to Pro** (daily backups, no pausing, support) | Supabase → Organization → Billing | 5 min |
| 2 | **Leaked-password protection** on | Supabase → Authentication → Providers → Email → *Prevent use of leaked passwords* | 1 min |
| 3 | **Confirm email** on (new sign-ups must confirm their address) | Supabase → Authentication → Providers → Email → *Confirm email* | 1 min |
| 4 | **Two-step login** on for your own account | App → Settings → Two-step login | 3 min |
| 5 | **Product name** decided (currently "PowerMate") | Vercel → Project → Settings → Environment Variables: `VITE_PRODUCT_NAME`; also `public/manifest.webmanifest` and `<title>` in `index.html` | 10 min |
| 6 | **Legal review** of the drafts: Terms, Privacy Policy, Data Processing Agreement. Fill in every [bracket] | `src/legal/*.md` (shown at `/?legal=terms`, `privacy`, `dpa`) | attorney |
| 7 | **Information Officer** registered with the Information Regulator (POPIA) | inforeg.org.za | 30 min |
| 8 | **Own domain**, e.g. `app.yourproduct.co.za` | Vercel → Domains; then Supabase → Authentication → URL Configuration: Site URL + Redirect URLs | 20 min |
| 9 | **Email from your domain** (confirmations, password resets). Supabase's built-in email is for testing only: it may not reach outside users. Step by step: [EMAIL_SETUP.md](EMAIL_SETUP.md); ready-made templates in `docs/email-templates/` | Resend (or Postmark / SES), then Supabase → Authentication → Emails (SMTP, templates) and URL Configuration | 30 min |
| 10 | **Uptime monitor**: app URL and `https://hrqzqyfvbfzrfnuxovvr.supabase.co/auth/v1/health`, every 5 minutes, alerts to your phone | UptimeRobot / Better Stack (free tiers) | 10 min |

Then, when you're ready to take sign-ups from anyone: **App → Settings → Platform
→ Sign-up → Open**. Until then it's *Restricted*: allowed email domains, a
company's own invite link, or a **sign-up code** you create in the same screen and
give to a prospect.

## 2. Running the platform (Settings → Platform)

- **Companies**: every company with its owner, people, clients, quotes, invoices,
  last activity, plan and trial end. Tap one to:
  - change plan and status, set *paid until*, keep private notes;
  - **+14 days trial**;
  - **Suspend / Reactivate**. Suspended companies can't open their data; their
    data is kept.
- **What each state means** (enforced by the database, not just the app):
  - *Trial* (14 days from sign-up): full use.
  - *Trial ended* or *past due*: **read-only**. They can view and export, not add
    or change.
  - *Suspended* or *cancelled*: no access.
  - *Starter / Pro / Enterprise / Free*: full use while *active*.
- **Taking payment today**: invoice the company yourself, then mark it paid in
  the console (plan, status *active*, *paid until*). Every morning the app tells
  a company's master account when its trial is about to end or its payment is
  due, and makes it read-only 7 days after *paid until* (job `powermate-plan-checks`).
- **Card / debit-order billing** is built: companies subscribe in
  **Plan & billing** through your PayFast account.
  1. Open your own PayFast merchant account, with recurring billing switched on.
  2. Set a passphrase in PayFast.
  3. Enter the merchant ID, key and passphrase in Platform → **Billing**.
  4. Test in sandbox, then switch it on for real.
  5. Set prices and features in Platform → **Plans**.

  The `billing` edge function (deployed) checks every PayFast notification and
  extends *paid until* a month per payment. See `ACCOUNTS_AND_MEMBERSHIPS.md`.
- **Deletion requests**: a company's master account can ask for its data to be
  deleted (Company Details → Your company's data). The console marks it.
  1. After the notice period in your terms, tap **Delete this company's data**
     and type the company name.
  2. Then remove the company's files: Supabase → Storage → `powermate-media` and
     `receipts`, the folders named after each of its people's user IDs.
- **Support**: messages from *Help & support* arrive in the Support tab. Reply
  there; the person sees your answer in the app.

## 3. Features that need a setting from you

| Feature | What to do | Where |
|---|---|---|
| **Customers pay invoices online** (PayFast) | Nothing for you. Each company connects its own PayFast account: Company Details → Online payments (merchant ID, key, passphrase; start in test mode). PayFast notifies `…/functions/v1/payfast`, which checks the payment with PayFast and marks the invoice paid. | In the app, per company |
| **Overdue-invoice emails to customers** | Create a Resend account, verify your sending domain, then add three secrets: `RESEND_API_KEY`, `REMINDER_FROM_EMAIL` (e.g. `accounts@yourproduct.co.za`) and `APP_URL` (e.g. `https://app.yourproduct.co.za`). Until then the daily run skips emails; everything else works. Companies switch it on under Company Details → Reminders. | Supabase → Edge Functions → Secrets |
| **Xero** (invoices sent to each company's Xero automatically) | Create an app at developer.xero.com (Web app). Redirect URI: `https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/xero`. Add secrets `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` and `APP_URL`. If Xero gives your app the newer granular scopes, set `XERO_SCOPES` to the scopes it lists for invoices and contacts (plus `offline_access`). Companies then tap Company Details → Xero → Connect. Nightly sync at 02:30 (job `powermate-xero-sync`). | developer.xero.com, then Supabase → Edge Functions → Secrets |
| **Team reminders** (overdue invoices, unanswered quotes, services due, low stock) | Nothing: daily at 07:20 (job `powermate-daily-reminders`). Companies can switch them off under Company Details → Reminders. | Automatic |
| **Service plans** | Nothing: jobs are made daily at 06:10 (job `powermate-service-plans`). | Automatic |

Daily jobs can be checked in Supabase → Integrations → Cron (`powermate-*`).

## 4. Checks after any database change

- **Two-company isolation test**: in the Supabase SQL editor run
  `select private.tenant_isolation_test();`. The message must start with
  `ISOLATION PASS (0 failed)`. It creates a test company, checks reads, writes,
  sharing, storage and the team functions from both sides, and always rolls back.
- **Simulation**: run `npm run test:sim` (the CI does this on every pull request).

## 5. App stores (optional — the app already installs from the browser)

The app is a Progressive Web App: people tap **Share → Add to Home Screen**
(iPhone) or **Install app** (Android/Chrome). Store listings add discoverability.

### Google Play (easiest, about a day)

1. Create a Google Play developer account (once-off US$25).
2. On pwabuilder.com, enter your app URL and choose **Android**. It generates a
   Trusted Web Activity package and an `assetlinks.json` file.
3. Put `assetlinks.json` in `public/.well-known/` and deploy. It must be served
   at `https://<your domain>/.well-known/assetlinks.json`.
4. Upload the package in Play Console with:
   - screenshots;
   - the privacy policy URL `https://<your domain>/?legal=privacy`;
   - the data-safety form (account info, business contacts, photos; encrypted
     in transit; deletion on request).

### Apple App Store (more work)

1. Join the Apple Developer Program (US$99/year).
2. Wrap the app with pwabuilder.com (iOS) or Capacitor.
3. Apple rejects apps that are "just a website" (guideline 4.2). Stress what
   works like an app: offline use, camera, push notifications and PIN / Face ID
   lock.
4. You need screenshots for 6.7" and 5.5" iPhones, the privacy policy URL, and
   the App Privacy questionnaire.

The icons are in `public/icons/` (192 and 512 px, plus a maskable version for
Android and an Apple touch icon). The manifest is `public/manifest.webmanifest`.
