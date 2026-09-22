-- Exported from production supabase_migrations.schema_migrations (20260916145129).
drop policy if exists notifications_insert on public.team_notifications;
create policy notifications_insert on public.team_notifications
  for insert to authenticated
  with check (
    from_user_id = (select auth.uid())
    and team_id is not null
    and exists (
      select 1 from public.team_members tm
      where tm.team_id = team_notifications.team_id
        and tm.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.team_members tm
      where tm.team_id = team_notifications.team_id
        and tm.user_id = team_notifications.to_user_id
    )
  );

drop policy if exists notifications_update on public.team_notifications;
create policy notifications_update on public.team_notifications
  for update to authenticated
  using (to_user_id = (select auth.uid()))
  with check (to_user_id = (select auth.uid()));
