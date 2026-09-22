-- Exported from production supabase_migrations.schema_migrations (20260915155234).
create or replace function public.recalculate_invoice_payment_totals() returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_invoice_id uuid;
  v_total numeric;
  v_paid numeric;
  v_balance numeric;
  v_status text;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select total into v_total from public.invoices where id = v_invoice_id;
  if v_total is null then return coalesce(new, old); end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_invoice_id;
  v_balance := greatest(0, v_total - v_paid);
  v_status := case when v_balance = 0 then 'paid' when v_paid > 0 then 'part_paid' else 'draft' end;
  update public.invoices set amount_paid = v_paid, balance_due = v_balance, status = case when status = 'cancelled' then status else v_status end, updated_at = now() where id = v_invoice_id;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_recalculate_invoice_payment_totals on public.payments;
create trigger trg_recalculate_invoice_payment_totals after insert or update or delete on public.payments for each row execute function public.recalculate_invoice_payment_totals();
