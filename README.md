# PowerMate PWA

PowerMate is an installable field-service and sales assistant for Powerworks. It supports client and contact management, leads, follow-ups, quotes, equipment, expenses, vehicle checks, breakdown and repair reporting, team assignment, jobs, invoices, payments, offline storage, cloud synchronisation, realtime updates, reminders, push subscriptions and PWA installation.

## Run locally
```bash
npm install
npm run dev
```

## Production build
```bash
npm ci
npm run build
```

The production build is Vite-based and outputs to `dist`.

## Checks
```bash
npm run lint       # ESLint: undefined names/components, hook rules
npm test           # node:test unit and source checks
npm run test:sim   # builds the app and drives every screen + save/sync/offline
                   # flows in Chromium against an in-memory Supabase emulator,
                   # then audits contrast/wrapped numbers/overflow in light and
                   # dark mode and opens every screen offline via the service worker
npm run check      # lint + tests + field/security checks + production build
```
The simulation uses synthetic data only and never contacts Supabase; writes are
validated against the production schema in `tests/sim/schema.json` (refresh it
when columns change).

## Deploy to Vercel
1. Import the repository into Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Deploy.

## Install on phone
### iPhone / iPad
Open the deployed HTTPS app in Safari → **Share** → **Add to Home Screen** → open PowerMate from the new Home Screen icon. Push notifications require the installed Home Screen web app and a direct permission action.

### Android
Open the deployed HTTPS app in Chrome → menu → **Install app** / **Add to Home Screen**.

## Offline behaviour
PowerMate keeps a user-scoped IndexedDB copy of operational data and a durable sync queue. Changes can be captured offline and reconciled when connectivity returns. Jobs, invoices and payments now have dedicated offline stores and participate in the same reconciliation path. Realtime updates are used where supported, with periodic reconciliation as a safety net.

## Push notifications
The web app registers device push subscriptions in Supabase. The `send-notifications` Edge Function delivers Web Push notifications using VAPID credentials and removes stale subscriptions when Apple/browser endpoints return 404 or 410.

## Security
Supabase Row Level Security is enabled for application data. User/team-scoped records and private storage are protected by authenticated policies. Storage paths are normalised to the authenticated user's scope before upload or signed-URL access.
