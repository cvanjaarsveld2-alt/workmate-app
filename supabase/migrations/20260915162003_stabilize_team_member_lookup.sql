-- Exported from production supabase_migrations.schema_migrations (20260915162003).
drop function if exists public.get_team_member_emails(uuid);

create or replace function public.get_team_member_emails(p_team_id uuid)
returns table(user_id uuid, role text, joined_at timestamptz, email text)
language sql
security definer
set search_path = public, auth
as $$
  select tm.user_id,
         tm.role::text,
         tm.joined_at,
         u.email
  from public.team_members tm
  left join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and exists (
      select 1
      from public.team_members me
      where me.team_id = p_team_id
        and me.user_id = auth.uid()
    )
  order by tm.joined_at asc;
$$;

revoke all on function public.get_team_member_emails(uuid) from public, anon;
grant execute on function public.get_team_member_emails(uuid) to authenticated;
