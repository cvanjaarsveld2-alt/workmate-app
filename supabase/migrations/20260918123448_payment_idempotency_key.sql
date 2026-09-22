-- Exported from production supabase_migrations.schema_migrations (20260918123448).
-- ─── Phase D: real payment idempotency ─────────────────────────────────────
-- Before: no way to distinguish "this exact payment intent was already
-- recorded" from "this is a new payment" at the DB level. The frontend only
-- disabled its own Record-Payment button while a save was in flight, which
-- protects against a double-tap on ONE device but not: two tabs, two
-- devices, a sync retry after a network timeout that actually succeeded
-- server-side, or a browser restart mid-sync. All of those can legitimately
-- resubmit the identical payment intent.
--
-- Fix: a client-generated idempotency_key, created ONCE at the moment the
-- user commits to the payment (in InvoicesScreen.jsx's pay(), before the
-- offline/online branch), stored as part of the payment record itself (so
-- IndexedDB persistence + every sync-queue retry naturally resend the same
-- key), enforced unique at the DB level. A second insert with the same key
-- (any cause: retry, dual-device, restart) hits this constraint instead of
-- creating a duplicate payment row, and the sync engine (sync.js, Phase F)
-- now treats that specific violation as "already recorded" success rather
-- than a failure.
alter table public.payments add column if not exists idempotency_key text;
create unique index if not exists payments_idempotency_key_uidx
  on public.payments (idempotency_key) where idempotency_key is not null;
