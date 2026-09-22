-- Exported from production supabase_migrations.schema_migrations (20260919052331).
drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members for update to authenticated using (is_team_admin(team_id)) with check (is_team_admin(team_id));
