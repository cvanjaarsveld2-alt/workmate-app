# iPhone and Android apps

The store apps are the same app as the website, packaged with Capacitor (the
`android/` and `ios/` folders). The app runs from the phone itself, so it
opens and works offline straight away. It talks to the same database as the
website.

## What you need once

| | Google Play (Android) | Apple App Store (iPhone) |
|---|---|---|
| Account | Google Play developer, US$25 once | Apple Developer Program, US$99 a year |
| Computer | Any (Windows, Mac or Linux) with Android Studio | A Mac with Xcode |
| Time for review | Usually 1–3 days | Usually 1–2 days; stricter |

## Before the first build

1. **App ID.** `capacitor.config.json` has `"appId": "com.powermate.fieldservice"`. Change it
   to your own before the first upload (e.g. `za.co.yourcompany.powermate`). It can never
   change after an app is published.
2. **Your website's address.** Links the app sends (customer portal, quote acceptance,
   invites, QR labels) must point at your website. Set it when building:
   ```
   VITE_PUBLIC_APP_URL=https://app.yourproduct.co.za
   VITE_SUPABASE_URL=https://hrqzqyfvbfzrfnuxovvr.supabase.co
   VITE_SUPABASE_ANON_KEY=<the publishable key, same as the website's>
   npm run build:native
   ```
   `build:native` refuses to build without these.
3. **Icons and splash screens** are already made from `public/icon.svg`. After changing
   the logo run `npm run native:assets`, then `npx cap sync`.

## Test on an Android phone (no account needed)

- Every change to the Android project builds a test app on GitHub (Actions →
  "Android app (test build)" → the run → Artifacts → `powermate-android-test`).
- To build one yourself, go to Actions → "Android app (test build)" → **Run workflow**.
- Copy the `.apk` to the phone and open it. You'll need to allow "install unknown apps".
- In the repository settings (Settings → Secrets and variables → Actions → Variables), set
  `PUBLIC_APP_URL` to your website so links in test builds work too.

## Publish on Google Play

1. On a computer with Android Studio, run `npm run build:native`, then `npx cap open android`.
2. Build → Generate Signed App Bundle → create an upload key.
   **Keep the key file and its password safe**: every future update needs them.
3. In Play Console, create the app and upload the `.aab`. You'll also need:
   - screenshots;
   - privacy policy: `https://<your website>/?legal=privacy`;
   - Data safety: account info, business contacts, photos and location (only if a company
     switches the technician map on). All of it is encrypted in transit, and deleted on
     request.
4. Start with **Internal testing** (your own team), then release to Production.

## Publish on the App Store

1. On a Mac: `npm run build:native`, then `npx cap open ios`. Xcode opens.
2. Signing & Capabilities → choose your Apple Developer team and the bundle ID (the
   same app ID).
3. Product → Archive → Distribute → App Store Connect.
4. In App Store Connect you'll need:
   - screenshots (6.7" and 6.5" iPhone);
   - the privacy policy URL;
   - the App Privacy answers (same as Google's Data safety).
5. Apple checks that an app is "more than a website" (guideline 4.2). In the review notes,
   mention what makes it an app: it works fully offline (underground and on remote sites),
   the camera (receipts, job photos, business cards), signatures, QR codes on machines,
   location while clocked in, and the PIN / Face ID lock.
6. Give Apple a demo login (a test company with sample data) in the review notes.

## Updating the apps

Most changes are to the website's code and reach the store apps with the next build:
`npm run build:native`, then upload a new version (bump the version number in Android
Studio / Xcode). Database and server changes reach everyone immediately, without an app
update.

## Things that behave differently in the store app

- **Paying by PayFast** opens PayFast; after paying, the customer lands on your website.
  Your own staff rarely pay from the app; customers pay from their portal link in a browser.
- **Email links** (confirm email, reset password) open the website.
- **Offline**: the whole app is on the phone. The website version uses its service worker
  for this instead.
