-- ── Customer portal ───────────────────────────────────────────────────────────
-- Each client can have one private link (/?portal=TOKEN) that opens without
-- signing in. It shows what the company has for that client: quotes (to open
-- and accept), invoices with PDFs and what's owed, a statement, jobs, machines
-- and service plans. Anyone in the company who can see the client can make or
-- replace the link; replacing it stops the old one working.
create table if not exists public.client_portal_links (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{48}$'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  last_opened_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists client_portal_links_active_uidx on public.client_portal_links (client_id) where revoked_at is null;
alter table public.client_portal_links enable row level security;
drop policy if exists client_portal_links_select on public.client_portal_links;
create policy client_portal_links_select on public.client_portal_links for select to authenticated
  using (private.can_see_team(team_id));
revoke all on public.client_portal_links from anon, authenticated;
grant select on public.client_portal_links to authenticated;

create or replace function private.portal_link(p_client_id uuid, p_new boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.clients;
  v_token text;
begin
  select * into c from public.clients where id = p_client_id;
  if not found or c.team_id is null or not private.can_see_team(c.team_id) then raise exception 'Client not found'; end if;
  if private.team_access(c.team_id) <> 'full' then raise exception 'Your account is read-only'; end if;
  if not p_new then
    select token into v_token from public.client_portal_links where client_id = c.id and revoked_at is null;
    if v_token is not null then return v_token; end if;
  end if;
  update public.client_portal_links set revoked_at = now() where client_id = c.id and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.client_portal_links (team_id, client_id, token) values (c.team_id, c.id, v_token);
  return v_token;
end $$;
create or replace function private.revoke_portal_link(p_client_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.client_portal_links l set revoked_at = now()
   where l.client_id = p_client_id and l.revoked_at is null and private.can_see_team(l.team_id);
end $$;
revoke execute on function private.portal_link(uuid, boolean) from public, anon;
revoke execute on function private.revoke_portal_link(uuid) from public, anon;
grant execute on function private.portal_link(uuid, boolean) to authenticated;
grant execute on function private.revoke_portal_link(uuid) to authenticated;
create or replace function public.client_portal_link(p_client_id uuid, p_new boolean default false) returns text
language sql security invoker set search_path = '' as $$ select private.portal_link(p_client_id, p_new); $$;
create or replace function public.revoke_client_portal_link(p_client_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.revoke_portal_link(p_client_id); $$;
revoke execute on function public.client_portal_link(uuid, boolean) from public, anon;
revoke execute on function public.revoke_client_portal_link(uuid) from public, anon;
grant execute on function public.client_portal_link(uuid, boolean) to authenticated;
grant execute on function public.revoke_client_portal_link(uuid) to authenticated;

-- What the customer sees. Only records that are the customer's business:
-- no drafts, no internal notes about the client, no cost prices.
create or replace function public.get_client_portal(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.client_portal_links;
  c public.clients;
  v_p public.team_profiles;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.client_portal_links where token = p_token and revoked_at is null;
  if not found then return null; end if;
  if private.team_access(l.team_id) = 'suspended' then return null; end if;
  select * into c from public.clients where id = l.client_id and team_id = l.team_id;
  if not found then return null; end if;
  select * into v_p from public.team_profiles where team_id = l.team_id;
  update public.client_portal_links set last_opened_at = now() where id = l.id;
  return jsonb_build_object(
    'client', jsonb_build_object('name', c.company, 'contact', c.contact, 'email', c.email, 'phone', c.phone,
                                 'vat_no', c.vat_number, 'address', coalesce(c.billing_address, c.location)),
    'company', jsonb_build_object(
      'trading_name', v_p.trading_name, 'legal_name', v_p.legal_name, 'registration_no', v_p.registration_no,
      'vat_no', v_p.vat_no, 'vat_registered', coalesce(v_p.vat_registered, true), 'address', v_p.address,
      'phone', v_p.phone, 'email', v_p.email, 'website', v_p.website, 'logo_data', v_p.logo_data,
      'brand_color', v_p.brand_color, 'bank_name', v_p.bank_name, 'bank_account_name', v_p.bank_account_name,
      'bank_account_no', v_p.bank_account_no, 'bank_branch_code', v_p.bank_branch_code,
      'bank_account_type', v_p.bank_account_type, 'bank_swift', v_p.bank_swift,
      'payment_terms_days', v_p.payment_terms_days, 'invoice_terms', v_p.invoice_terms, 'quote_terms', v_p.quote_terms),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'number', coalesce(q.quote_number, upper(left(replace(q.id::text, '-', ''), 8))),
               'title', coalesce(q.details ->> 'title', q.description), 'value', q.value, 'status', q.status,
               'date', coalesce(q.sent_date, q.created_at::date), 'expiry_date', q.expiry_date,
               'accepted_at', q.accepted_at, 'can_accept', q.accepted_at is null and q.declined_at is null
                 and q.status not in ('Accepted', 'Rejected', 'Lost', 'Won')
                 and (q.expiry_date is null or q.expiry_date >= current_date))
             order by coalesce(q.sent_date, q.created_at::date) desc)
        from public.quotes q
       where q.client_id = c.id and q.team_id = l.team_id and coalesce(q.status, '') not in ('Draft', 'draft')), '[]'),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status, 'issue_date', i.issue_date,
               'due_date', i.due_date, 'subtotal', i.subtotal, 'vat', i.vat, 'total', i.total,
               'amount_paid', i.amount_paid, 'balance_due', i.balance_due, 'line_items', i.line_items, 'notes', i.notes)
             order by i.issue_date desc nulls last)
        from public.invoices i
       where i.client_id = c.id and i.team_id = l.team_id and coalesce(i.status, '') not in ('draft', 'cancelled', 'void')
         and i.invoice_number !~ '^INV-\d{4}-\d{6,7}$'), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('invoice_number', i.invoice_number, 'amount', p.amount,
                                          'payment_date', p.payment_date, 'method', p.method, 'reference', p.reference)
             order by p.payment_date desc nulls last)
        from public.payments p join public.invoices i on i.id = p.invoice_id
       where i.client_id = c.id and i.team_id = l.team_id and coalesce(i.status, '') not in ('draft', 'cancelled', 'void')), '[]'),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object('job_number', j.job_number, 'title', j.title, 'status', j.status,
                                          'scheduled_date', j.scheduled_date, 'completed_at', j.completed_at,
                                          'location', j.location, 'work_done', case when j.status = 'completed' then j.work_done end)
             order by coalesce(j.scheduled_date, j.created_at::date) desc)
        from (select * from public.jobs where client_id = c.id and team_id = l.team_id and status <> 'cancelled'
               order by coalesce(scheduled_date, created_at::date) desc limit 50) j), '[]'),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'make', e.make, 'model', e.model, 'serial', e.serial,
                                          'location', e.location, 'service_due', e.service_due) order by e.name)
        from public.equipment e where e.client_id = c.id and e.team_id = l.team_id), '[]'),
    'service_plans', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'every_months', s.every_months, 'every_days', s.every_days,
                                          'next_due', s.next_due) order by s.next_due)
        from public.service_plans s where s.client_id = c.id and s.team_id = l.team_id and s.active), '[]'));
end $$;

-- A quote in the portal opens the normal accept page (/?quote=TOKEN).
create or replace function public.portal_quote_link(p_token text, p_quote_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  l public.client_portal_links;
  q public.quotes;
  v_token text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.client_portal_links where token = p_token and revoked_at is null;
  if not found or private.team_access(l.team_id) = 'suspended' then return null; end if;
  select * into q from public.quotes where id = p_quote_id and client_id = l.client_id and team_id = l.team_id
     and coalesce(status, '') not in ('Draft', 'draft') for update;
  if not found then return null; end if;
  v_token := coalesce(case when q.share_expires_at > now() then q.share_token end, encode(extensions.gen_random_bytes(24), 'hex'));
  update public.quotes
     set share_token = v_token,
         share_expires_at = greatest(coalesce(q.share_expires_at, now()), coalesce(q.expiry_date::timestamptz + interval '1 day', now() + interval '60 days'), now() + interval '7 days')
   where id = q.id;
  return v_token;
end $$;

revoke execute on function public.get_client_portal(text) from public;
revoke execute on function public.portal_quote_link(text, uuid) from public;
grant execute on function public.get_client_portal(text) to anon, authenticated;
grant execute on function public.portal_quote_link(text, uuid) to anon, authenticated;

create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs',
               'service_plans','repair_reports','breakdown_reports','followups','notes','activities','leads','equipment',
               'quotes','contacts','expenses','vehicle_checks','custom_faults','company_documents',
               'machine_jack_confirmations','team_notifications','clients']::text[];
$$;
