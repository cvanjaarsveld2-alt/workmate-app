-- ── Platform (you, the product owner) vs companies ───────────────────────────
-- platform_admins: people who run the product itself (not a company's master
-- account). They manage sign-up settings and, later, companies and plans.
create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
insert into private.platform_admins (user_id)
select id from auth.users where id = '431dcb72-ea3f-43ed-9f73-74384e862300'
on conflict do nothing;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from private.platform_admins where user_id = auth.uid());
$$;
revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;
create or replace function public.is_platform_admin() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_platform_admin(); $$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ── Sign-up policy ───────────────────────────────────────────────────────────
-- signup_mode 'restricted' (default, as before): an allowed email domain, a
-- company invite code, or a sign-up code you give a prospective client.
-- 'open': anyone may sign up (switch when you launch).
create table if not exists private.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into private.platform_settings (key, value) values
  ('signup_mode', '"restricted"'),
  ('allowed_domains', '["pwrstart.com"]'),
  ('signup_codes', '[]')
on conflict (key) do nothing;

create or replace function public.enforce_signup_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_mode text;
  v_email text := lower(coalesce(new.email, ''));
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
begin
  select value #>> '{}' into v_mode from private.platform_settings where key = 'signup_mode';
  if coalesce(v_mode, 'restricted') = 'open' then return new; end if;
  if exists (
      select 1 from private.platform_settings s, jsonb_array_elements_text(s.value) d
       where s.key = 'allowed_domains' and v_email like '%@' || lower(d)) then
    return new;
  end if;
  if v_code <> '' and (
      exists (select 1 from public.teams where upper(invite_code) = v_code)
      or exists (select 1 from private.platform_settings s, jsonb_array_elements_text(s.value) c
                  where s.key = 'signup_codes' and upper(c) = v_code)) then
    return new;
  end if;
  raise exception 'Sign-up needs an invite code. Ask your company for one, or contact us for a sign-up code.'
    using errcode = 'check_violation';
end $$;

create or replace function private.get_platform_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return (select jsonb_object_agg(key, value) from private.platform_settings);
end $$;
create or replace function private.set_platform_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_key = 'signup_mode' and p_value #>> '{}' not in ('open', 'restricted') then raise exception 'Invalid sign-up mode'; end if;
  if p_key in ('allowed_domains', 'signup_codes') and jsonb_typeof(p_value) <> 'array' then raise exception 'Expected a list'; end if;
  if p_key not in ('signup_mode', 'allowed_domains', 'signup_codes') then raise exception 'Unknown setting'; end if;
  insert into private.platform_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke execute on function private.get_platform_settings() from public, anon;
revoke execute on function private.set_platform_setting(text, jsonb) from public, anon;
grant execute on function private.get_platform_settings() to authenticated;
grant execute on function private.set_platform_setting(text, jsonb) to authenticated;
create or replace function public.get_platform_settings() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.get_platform_settings(); $$;
create or replace function public.set_platform_setting(p_key text, p_value jsonb) returns void
language sql security invoker set search_path = '' as $$ select private.set_platform_setting(p_key, p_value); $$;
revoke execute on function public.get_platform_settings() from public, anon;
revoke execute on function public.set_platform_setting(text, jsonb) from public, anon;
grant execute on function public.get_platform_settings() to authenticated;
grant execute on function public.set_platform_setting(text, jsonb) to authenticated;

-- ── Terms acceptance (POPIA: record who agreed to what, and when) ────────────
alter table public.users add column if not exists terms_version text;
alter table public.users add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = 'public' as $$
begin
  insert into public.users (id, email, full_name, role, terms_version, terms_accepted_at)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'employee',
    nullif(new.raw_user_meta_data->>'terms_version', ''),
    case when coalesce(new.raw_user_meta_data->>'terms_version', '') <> '' then now() end)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end $$;

create or replace function private.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  if p_version is null or p_version !~ '^[0-9A-Za-z.-]{1,20}$' then raise exception 'Invalid terms version'; end if;
  update public.users set terms_version = p_version, terms_accepted_at = now() where id = auth.uid();
end $$;
revoke execute on function private.accept_terms(text) from public, anon;
grant execute on function private.accept_terms(text) to authenticated;
create or replace function public.accept_terms(p_version text) returns void
language sql security invoker set search_path = '' as $$ select private.accept_terms(p_version); $$;
revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
