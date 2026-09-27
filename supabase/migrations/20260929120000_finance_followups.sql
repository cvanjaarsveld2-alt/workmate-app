-- ── Follow-ups to the financial controls ──────────────────────────────────────
-- * The customer portal lists only payments that stand (not reversed ones).
-- * Xero gets whether an invoice's prices include VAT.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.get_client_portal(text)'::regprocedure);
  if position('p.voided_at is null' in d) = 0 then
    d := replace(d, 'from public.payments p join public.invoices i on i.id = p.invoice_id
       where i.client_id = c.id',
                    'from public.payments p join public.invoices i on i.id = p.invoice_id
       where p.voided_at is null and i.client_id = c.id');
    if position('p.voided_at is null' in d) = 0 then raise exception 'portal patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.xero_invoices_to_sync(uuid, integer)'::regprocedure);
  if position('i.vat_inclusive' in d) = 0 then
    d := replace(d, 'i.line_items, i.notes,', 'i.line_items, i.notes, i.vat_inclusive,');
    if position('i.vat_inclusive' in d) = 0 then raise exception 'xero patch did not apply'; end if;
    execute d;
  end if;
end $$;
