-- ── Per-person menu ──────────────────────────────────────────────────────────
-- Each teammate chooses which screens appear in their own menu. Stored on the
-- user so the choice follows them to any device. Users can read their own row
-- (users_read_own) but not update it directly (role lives there too), so the
-- change goes through a narrow function that only touches this column.
alter table public.users add column if not exists hidden_screens text[] not null default '{}';

create or replace function private.set_my_hidden_screens(p_screens text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  p_screens := coalesce(p_screens, '{}');
  if coalesce(array_length(p_screens, 1), 0) > 40 then raise exception 'Too many screens'; end if;
  if exists (select 1 from unnest(p_screens) s where s !~ '^[A-Za-z0-9]{1,40}$') then
    raise exception 'Invalid screen name';
  end if;
  update public.users
     set hidden_screens = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(p_screens) s)
   where id = auth.uid();
end $$;
revoke execute on function private.set_my_hidden_screens(text[]) from public, anon;
grant execute on function private.set_my_hidden_screens(text[]) to authenticated;

create or replace function public.set_my_hidden_screens(p_screens text[])
returns void language sql security invoker set search_path = ''
as $$ select private.set_my_hidden_screens(p_screens); $$;
revoke execute on function public.set_my_hidden_screens(text[]) from public, anon;
grant execute on function public.set_my_hidden_screens(text[]) to authenticated;
