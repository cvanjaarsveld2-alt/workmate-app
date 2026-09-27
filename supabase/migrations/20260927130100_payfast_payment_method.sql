-- PayFast payments record the payment method the payments table allows
-- (card or instant EFT, from PayFast's payment_method); the reference names PayFast.
drop function if exists public.payfast_record_payment(uuid, numeric, text, numeric);
create or replace function public.payfast_record_payment(p_invoice_id uuid, p_amount numeric, p_pf_payment_id text, p_fee numeric,
                                                         p_method text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  v_key text := 'payfast:' || p_pf_payment_id;
  v_id uuid;
begin
  if p_pf_payment_id is null or p_pf_payment_id !~ '^[0-9A-Za-z_-]{1,40}$' then raise exception 'Bad payment id'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Bad amount'; end if;
  select * into i from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if exists (select 1 from public.payments where idempotency_key = v_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.payments (id, user_id, team_id, invoice_id, amount, payment_date, method, reference, notes, idempotency_key, sync_status)
  values (gen_random_uuid(), i.user_id, i.team_id, i.id, round(p_amount, 2), current_date,
          -- PayFast's payment_method: cc = card, ef/eft/ie = instant EFT.
          case lower(coalesce(p_method, '')) when 'cc' then 'card' when 'ef' then 'instant_eft' when 'eft' then 'instant_eft'
               when 'ie' then 'instant_eft' else 'other' end,
          'PayFast ' || p_pf_payment_id,
          case when p_fee is not null and p_fee <> 0 then format('Paid online. PayFast fee R %s', to_char(abs(p_fee), 'FM999999990.00')) else 'Paid online' end,
          v_key, 'synced')
  returning id into v_id;
  if i.team_id is not null then
    insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
    values (i.team_id, i.user_id, i.user_id, 'invoice', i.id, coalesce(i.invoice_number, 'Invoice'),
            format('Paid online: R %s', to_char(p_amount, 'FM999999990.00')));
  end if;
  return jsonb_build_object('ok', true, 'payment_id', v_id);
end $$;
revoke execute on function public.payfast_record_payment(uuid, numeric, text, numeric, text) from public, anon, authenticated;
grant execute on function public.payfast_record_payment(uuid, numeric, text, numeric, text) to service_role;
