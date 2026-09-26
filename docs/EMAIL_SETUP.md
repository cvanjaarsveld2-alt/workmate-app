# Email setup (sign-up confirmation and password resets)

## How email checking works in the app

- **Sign up:** the app asks Supabase to create the account. If **Confirm email** is on,
  Supabase emails a link. The person can't sign in until they tap it; the app says "Check your
  email to confirm your account" and refuses sign-in with "This account has not been confirmed
  yet".
- **Forgot password / invited staff:** the app asks Supabase to email a "set your password"
  link. The message on screen is the same whether or not the email exists, so it can't be used
  to find out who has an account.
- **Company invite links** (`/?join=CODE`) are shared by the company itself (WhatsApp, email).
  No email is sent by the app for these.

The app itself doesn't send these emails. **Supabase does**, using whatever email settings the
project has. That's the part to set up properly.

## Supabase's built-in email is for testing only

Out of the box, Supabase sends auth emails from its own shared server, and:

- it only sends to email addresses of people in your Supabase organisation, so outside users
  may **never get the email**;
- it sends only a few emails an hour;
- the sender is Supabase's address, not yours, so emails can land in spam.

In short, it's fine for testing, not for customers.

## Set it up properly (about 30 minutes, once)

1. **An email sending service.** Resend is simplest; Postmark or Amazon SES also work.
   - Create an account.
   - Add your domain (e.g. `yourproduct.co.za`) and add the DNS records it shows you at your
     domain registrar. These are SPF and DKIM, which prove the emails really come from you.
   - Wait until it says "verified".
2. **Connect it to Supabase:** Supabase → Authentication → Emails → **SMTP Settings** →
   Enable custom SMTP.
   - Host, port, username and password come from Resend (SMTP section).
   - Sender email: e.g. `no-reply@yourproduct.co.za`.
   - Sender name: your product name.
3. **Turn on confirmation:** Supabase → Authentication → Sign In / Providers → Email →
   **Confirm email** on. Also turn on **Prevent use of leaked passwords**.
4. **Tell Supabase the app's address:** Supabase → Authentication → **URL Configuration**.
   - **Site URL:** the app's real address (now `https://workmate-app-pez6.vercel.app`, later
     your own domain).
   - **Redirect URLs:** add the same address, plus `https://*.vercel.app` if you want links to
     work on preview builds.

   If this is wrong, links in emails open the wrong site or fail.
5. **Branded emails:** Supabase → Authentication → Emails → Templates. Paste in the templates
   from `docs/email-templates/`: confirm sign-up, reset password, change email, magic link.
   The subject line for each is at the top of its file.
6. **Test it:** sign up with a private Gmail address. The confirmation should arrive within a
   minute, from your address, not in spam. Then try "Forgot password".

The same Resend account can send the overdue-invoice emails to customers (see
`LAUNCH_CHECKLIST.md`, section 3): add `RESEND_API_KEY`, `REMINDER_FROM_EMAIL` and `APP_URL`.
