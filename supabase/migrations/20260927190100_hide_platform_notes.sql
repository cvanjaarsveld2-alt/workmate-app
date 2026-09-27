-- ── Your notes about a company stay yours ─────────────────────────────────────
-- team_plans is readable by the company's own people (their plan, trial, paid
-- until). The platform owner's private notes and the PayFast subscription
-- token are not for them: only these columns can be read directly. The
-- console reads everything through admin-only functions; nobody writes the
-- table directly (changes go through admin_update_plan and billing).
revoke select, insert, update on public.team_plans from anon, authenticated;
grant select (team_id, plan, status, trial_ends_at, paid_until, seats, updated_at,
              deletion_requested_at, deletion_requested_by, billing_status)
  on public.team_plans to authenticated;
