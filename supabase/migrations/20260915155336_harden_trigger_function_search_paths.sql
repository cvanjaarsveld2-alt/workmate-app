-- Exported from production supabase_migrations.schema_migrations (20260915155336).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'employee')
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;
create or replace function public.enforce_signup_domain() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) not like '%@pwrstart.com' then
    raise exception 'Sign up is restricted to @pwrstart.com email addresses.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create or replace function public.pm_set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.enforce_signup_domain() from anon, authenticated;
