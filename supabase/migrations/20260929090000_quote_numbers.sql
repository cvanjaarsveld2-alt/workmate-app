-- ── Sequential quote numbers ──────────────────────────────────────────────────
-- Like invoice numbers: when a quote reaches the server it is given the
-- company's next number (prefix + 5 digits, e.g. Q-00042). The counter row is
-- locked while a number is taken, so four people quoting at the same moment
-- still get four different numbers. A quote made offline gets its number when
-- it syncs. A later save of the same quote keeps its number.

alter table public.team_profiles
  add column if not exists quote_prefix text not null default 'Q-' check (quote_prefix ~ '^[A-Za-z0-9/_-]{0,12}$'),
  add column if not exists next_quote_number int not null default 1 check (next_quote_number between 1 and 99999999);

create or replace function private.assign_quote_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_next int;
  v_number text;
begin
  if tg_op = 'UPDATE' then
    new.quote_number := coalesce(old.quote_number, new.quote_number);
    return new;
  end if;
  -- An upsert of a quote that already exists fires this before turning into
  -- an update: don't spend a number on it.
  if new.team_id is null or exists (select 1 from public.quotes where id = new.id) then
    return new;
  end if;
  insert into public.team_profiles (team_id) values (new.team_id) on conflict (team_id) do nothing;
  loop
    update public.team_profiles
       set next_quote_number = next_quote_number + 1
     where team_id = new.team_id
    returning quote_prefix, next_quote_number - 1 into v_prefix, v_next;
    v_number := v_prefix || lpad(v_next::text, 5, '0');
    -- The owner may have set the counter back; skip numbers already used.
    exit when not exists (
      select 1 from public.quotes where team_id = new.team_id and quote_number = v_number);
  end loop;
  new.quote_number := v_number;
  return new;
end $$;
revoke execute on function private.assign_quote_number() from public, anon, authenticated;

drop trigger if exists quotes_assign_number on public.quotes;
create trigger quotes_assign_number before insert or update of quote_number on public.quotes
  for each row execute function private.assign_quote_number();

-- Existing quotes get numbers in the order they were made, per company.
do $$
declare r record;
begin
  for r in
    select q.id, q.team_id, row_number() over (partition by q.team_id order by q.created_at, q.id) as n
      from public.quotes q
     where q.team_id is not null and q.quote_number is null
  loop
    insert into public.team_profiles (team_id) values (r.team_id) on conflict (team_id) do nothing;
    update public.quotes
       set quote_number = (select quote_prefix from public.team_profiles where team_id = r.team_id) || lpad(r.n::text, 5, '0')
     where id = r.id;
  end loop;
  update public.team_profiles p
     set next_quote_number = greatest(p.next_quote_number,
           (select count(*) + 1 from public.quotes q where q.team_id = p.team_id and q.quote_number is not null));
end $$;

-- A number is never used twice within a company.
create unique index if not exists quotes_quote_number_team_uidx
  on public.quotes (team_id, quote_number) where team_id is not null and quote_number is not null;
