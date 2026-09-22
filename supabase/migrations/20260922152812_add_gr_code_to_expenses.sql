-- Exported from production supabase_migrations.schema_migrations (20260922152812).
-- Adds the GR (SAGE reference) code alongside the existing gl_code column on
-- expenses, so the finance team's SAGE codes are captured per expense and
-- persist for future reference. Nullable/additive — no impact on existing rows.
alter table public.expenses
  add column if not exists gr_code text;

comment on column public.expenses.gl_code is 'SAGE general ledger / nominal account code for this expense, editable per-expense on the Expenses screen (defaults from category).';
comment on column public.expenses.gr_code is 'Secondary free-text SAGE reference code for this expense, set by the finance team on the Expenses screen.';
