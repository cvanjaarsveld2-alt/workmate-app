-- Exported from production supabase_migrations.schema_migrations (20260918121855).
create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  return auth.uid() is not null and p_team_id is not null and exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'admin'
  );
end;
$$;

drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members
  for update
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete" on public.team_members
  for delete
  using (user_id = auth.uid() or public.is_team_admin(team_id));
