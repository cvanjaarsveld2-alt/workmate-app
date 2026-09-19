-- Restrict the last remaining public-role policy to authenticated users.
drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update"
  on public.team_members
  for update
  to authenticated
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));
