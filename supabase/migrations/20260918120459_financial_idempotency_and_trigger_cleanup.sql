-- Exported from production supabase_migrations.schema_migrations (20260918120459).
create unique index if not exists jobs_quote_id_uidx
  on public.jobs (quote_id)
  where quote_id is not null;

create unique index if not exists invoices_job_id_uidx
  on public.invoices (job_id)
  where job_id is not null;

create unique index if not exists jobs_job_number_scope_uidx
  on public.jobs (coalesce(team_id, user_id), job_number)
  where job_number is not null;

create unique index if not exists invoices_invoice_number_scope_uidx
  on public.invoices (coalesce(team_id, user_id), invoice_number)
  where invoice_number is not null;

drop trigger if exists trg_recalculate_invoice_payment_totals on public.payments;
drop function if exists public.recalculate_invoice_payment_totals();
