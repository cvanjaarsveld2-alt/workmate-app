-- Exported from production supabase_migrations.schema_migrations (20260919102538).

create or replace function public.get_my_effective_role()
returns text
language sql
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    ) then 'admin'
    when exists (
      select 1 from public.team_members
      where user_id = auth.uid() and role = 'admin'
    ) then 'admin'
    else 'member'
  end;
$$;

revoke all on function public.get_my_effective_role() from public, anon;
grant execute on function public.get_my_effective_role() to authenticated;
