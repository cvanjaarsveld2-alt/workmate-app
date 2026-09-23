-- Notifications > "Clear all" deletes the user's notifications, but the table had
-- no DELETE policy, so RLS silently removed nothing and they reappeared on reload.
-- Recipients may delete only notifications addressed to them.
drop policy if exists "notifications_delete_own" on public.team_notifications;
create policy "notifications_delete_own" on public.team_notifications
  for delete to authenticated
  using (to_user_id = (select auth.uid()));
