-- Exported from production supabase_migrations.schema_migrations (20260915163501).
create unique index if not exists idx_jobs_quote_id_unique on public.jobs(quote_id) where quote_id is not null;
create index if not exists idx_jobs_team_schedule on public.jobs(team_id, scheduled_date, scheduled_time);
create index if not exists idx_jobs_assigned_schedule on public.jobs(assigned_to_user_id, scheduled_date, scheduled_time);
create index if not exists idx_invoices_team_status_due on public.invoices(team_id, status, due_date);
create index if not exists idx_payments_invoice_date on public.payments(invoice_id, payment_date);

create or replace function public.recalculate_invoice_payment_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_total numeric;
  v_paid numeric;
begin
  select total into v_total from public.invoices where id = p_invoice_id;
  if v_total is null then return; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id = p_invoice_id;
  update public.invoices
     set amount_paid = least(v_paid, v_total),
         balance_due = greatest(v_total - v_paid, 0),
         status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partially_paid' when status = 'paid' then 'sent' else status end,
         updated_at = now()
   where id = p_invoice_id;
end;
$$;

create or replace function public.sync_invoice_after_payment()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.recalculate_invoice_payment_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_invoice_after_payment on public.payments;
create trigger trg_sync_invoice_after_payment
after insert or update or delete on public.payments
for each row execute function public.sync_invoice_after_payment();

grant execute on function public.recalculate_invoice_payment_totals(uuid) to authenticated;
revoke execute on function public.recalculate_invoice_payment_totals(uuid) from anon;
revoke execute on function public.sync_invoice_after_payment() from anon, authenticated;
