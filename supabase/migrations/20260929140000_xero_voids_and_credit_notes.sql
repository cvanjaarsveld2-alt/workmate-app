-- ── Xero: voids and credit notes follow the invoice ──────────────────────────
-- An invoice already sent to Xero that's voided in the app is voided in Xero;
-- a credit note on such an invoice is created in Xero and allocated to it, so
-- the two ledgers agree. Sent by the xero edge function after the invoices.

alter table public.invoices add column if not exists xero_voided_at timestamptz;
alter table public.credit_notes
  add column if not exists xero_credit_note_id text,
  add column if not exists xero_synced_at timestamptz;

-- What to send: voids, and credit notes whose invoice is in Xero.
create or replace function public.xero_changes_to_sync(p_team_id uuid, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'voids', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'xero_invoice_id', i.xero_invoice_id, 'invoice_number', i.invoice_number))
        from (select * from public.invoices
               where team_id = p_team_id and status = 'cancelled' and xero_invoice_id is not null and xero_voided_at is null
               order by voided_at limit p_limit) i), '[]'::jsonb),
    'credit_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'credit_number', n.credit_number, 'issue_date', n.issue_date, 'reason', n.reason,
               'line_items', n.line_items, 'vat_inclusive', n.vat_inclusive, 'total', n.total,
               'xero_invoice_id', i.xero_invoice_id, 'invoice_number', i.invoice_number,
               'client', coalesce(c.company, 'Customer'), 'email', c.email, 'vat_number', c.vat_number,
               'vat_registered', (select coalesce(tp.vat_registered, true) from public.team_profiles tp where tp.team_id = n.team_id))
             order by n.created_at)
        from (select * from public.credit_notes
               where team_id = p_team_id and xero_credit_note_id is null order by created_at limit p_limit) n
        join public.invoices i on i.id = n.invoice_id and i.xero_invoice_id is not null
        left join public.clients c on c.id = i.client_id), '[]'::jsonb));
$$;

create or replace function public.xero_mark_changes(p_team_id uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  for r in select value from jsonb_array_elements(p_results) loop
    if r ->> 'kind' = 'void' and (r ->> 'ok')::boolean then
      update public.invoices set xero_voided_at = now() where id = (r ->> 'id')::uuid and team_id = p_team_id;
    elsif r ->> 'kind' = 'credit_note' and r ->> 'xero_id' is not null then
      update public.credit_notes set xero_credit_note_id = r ->> 'xero_id', xero_synced_at = now()
       where id = (r ->> 'id')::uuid and team_id = p_team_id;
    end if;
  end loop;
  -- Errors join the invoice ones on the Xero card in Company Details.
  update private.xero_connections
     set last_sync_result = coalesce(last_sync_result, '{}'::jsonb) || jsonb_build_object(
           'errors', coalesce(last_sync_result -> 'errors', '[]'::jsonb)
                     || coalesce((select jsonb_agg(e -> 'error') from (select e from jsonb_array_elements(p_results) e
                                   where e ->> 'error' is not null limit 5) z), '[]'::jsonb))
   where team_id = p_team_id
     and exists (select 1 from jsonb_array_elements(p_results) e where e ->> 'error' is not null);
end $$;

revoke execute on function public.xero_changes_to_sync(uuid, int) from public, anon, authenticated;
revoke execute on function public.xero_mark_changes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.xero_changes_to_sync(uuid, int) to service_role;
grant execute on function public.xero_mark_changes(uuid, jsonb) to service_role;
