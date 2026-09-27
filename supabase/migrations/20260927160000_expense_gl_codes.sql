-- Each company's own ledger (GL) account code per expense category, so
-- expense exports for Sage / Xero / QuickBooks land on the right accounts in
-- its chart. Empty means the app's defaults (src/lib/expenseAccounting.js).
alter table public.team_profiles add column if not exists expense_gl_codes jsonb not null default '{}'::jsonb;
alter table public.team_profiles drop constraint if exists team_profiles_expense_gl_codes_check;
alter table public.team_profiles add constraint team_profiles_expense_gl_codes_check
  check (jsonb_typeof(expense_gl_codes) = 'object' and length(expense_gl_codes::text) <= 4000);
