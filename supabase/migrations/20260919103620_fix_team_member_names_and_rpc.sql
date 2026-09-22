-- Exported from production supabase_migrations.schema_migrations (20260919103620).
drop function if exists public.get_team_member_emails(uuid);
drop function if exists private.get_team_member_emails(uuid);

create or replace function private.get_team_member_emails(p_team_id uuid)
returns table(user_id uuid, role text, joined_at timestamptz, email text, full_name text)
language sql
security definer
set search_path=''
as $$
  select
    tm.user_id,
    tm.role::text,
    tm.joined_at,
    u.email,
    coalesce(p.full_name, '') as full_name
  from public.team_members tm
  left join auth.users u on u.id=tm.user_id
  left join public.users p on p.id=tm.user_id
  where tm.team_id=p_team_id
    and exists (
      select 1 from public.team_members me
      where me.team_id=p_team_id and me.user_id=auth.uid()
    )
  order by tm.joined_at asc;
$$;

create or replace function public.get_team_member_emails(p_team_id uuid)
returns table(user_id uuid, role text, joined_at timestamptz, email text, full_name text)
language sql
security invoker
set search_path=''
as $$
  select * from private.get_team_member_emails(p_team_id);
$$;

revoke all on function public.get_team_member_emails(uuid) from public, anon;
grant execute on function public.get_team_member_emails(uuid) to authenticated;

update public.users set full_name='Renita van Jaarsveld'
where id='431dcb72-ea3f-43ed-9f73-74384e862300' and coalesce(full_name,'')='';

update public.users set full_name='Christo'
where id='dc4e613a-ef56-472a-b700-66365f67f258' and coalesce(full_name,'')='';

update public.users set full_name='Greg'
where id='f16f3dd1-c87c-4066-8a38-750d7bc31d65' and coalesce(full_name,'')='';

update public.users set full_name='Juan'
where id='af8fb768-091b-4a47-8510-528450cee0bc' and coalesce(full_name,'')='';
