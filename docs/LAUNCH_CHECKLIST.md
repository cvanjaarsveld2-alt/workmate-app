# Selling the app to other companies — launch checklist

Everything in the app for running several companies is built. This page covers
what only you (the product owner) can do, and how to run the platform day to day.

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
| 9 | **Email from your domain** (invites, confirmations, password resets) | Supabase → Authentication → SMTP (e.g. Resend, Postmark, Amazon SES); edit the email templates to your product name | 30 min |
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
  the console (plan, status *active*, *paid until*).
- **Card / debit-order billing later** (PayFast, Paystack or Peach Payments):
  1. Open a merchant account.
  2. Add their keys as Supabase secrets.
  3. Ask for a `billing-webhook` edge function that verifies the gateway's
     signature and updates `team_plans` (plan, status, paid_until). The console
     and the enforcement already use those fields.
- **Deletion requests**: a company's master account can ask for its data to be
  deleted (Company Details → Your company's data). The console marks it.
  1. After the notice period in your terms, tap **Delete this company's data**
     and type the company name.
  2. Then remove the company's files: Supabase → Storage → `powermate-media` and
     `receipts`, the folders named after each of its people's user IDs.
- **Support**: messages from *Help & support* arrive in the Support tab. Reply
  there; the person sees your answer in the app.

## 3. Checks after any database change

- **Two-company isolation test**: in the Supabase SQL editor run
  `select private.tenant_isolation_test();`. The message must start with
  `ISOLATION PASS (0 failed)`. It creates a test company, checks reads, writes,
  sharing, storage and the team functions from both sides, and always rolls back.
- **Simulation**: run `npm run test:sim` (the CI does this on every pull request).

## 4. App stores (optional — the app already installs from the browser)

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
