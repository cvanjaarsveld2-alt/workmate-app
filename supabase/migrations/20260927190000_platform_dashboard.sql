-- ── Platform dashboard: more per company ──────────────────────────────────────
-- The console's company list also shows each company's subscription (PayFast
-- or not), its user limit, what it has paid, and how busy it is (jobs).
create or replace function private.admin_list_companies() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(c) order by c.created_at desc) from (
      select t.id, t.name, t.created_at,
             (select u.email from auth.users u where u.id = t.owner_user_id) as owner_email,
             (select count(*) from public.team_members m where m.team_id = t.id) as members,
             (select max(e."timestamp") from public.events e join public.team_members m on m.user_id = e.user_id where m.team_id = t.id) as last_active,
             (select count(*) from public.clients x where x.team_id = t.id) as clients,
             (select count(*) from public.quotes x where x.team_id = t.id) as quotes,
             (select count(*) from public.invoices x where x.team_id = t.id) as invoices,
             (select count(*) from public.jobs x where x.team_id = t.id) as jobs,
             (select coalesce(sum(p.amount), 0) from public.billing_payments p where p.team_id = t.id) as paid_total,
             (select max(p.paid_at) from public.billing_payments p where p.team_id = t.id) as last_payment_at,
             tp.plan, tp.status, tp.trial_ends_at, tp.paid_until, tp.seats, tp.notes, tp.deletion_requested_at,
             tp.billing_status,
             private.seat_limit(t.id) as seat_limit,
             private.team_access(t.id) as access
        from public.teams t left join public.team_plans tp on tp.team_id = t.id) c), '[]'::jsonb);
end $$;
