-- Exported from production supabase_migrations.schema_migrations (20260919052113).

-- PowerMate security hardening: telemetry ownership and RPC surface.
drop policy if exists "Anyone insert events" on public.events;
create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke execute on function public.accept_shared_record(uuid,uuid) from public;
revoke execute on function public.create_team_for_user(text,uuid) from public;
revoke execute on function public.current_team_id() from public;
revoke execute on function public.get_team_member_emails(uuid) from public;
revoke execute on function public.is_team_admin(uuid) from public;
revoke execute on function public.join_team_by_code(text,uuid) from public;
revoke execute on function public.migrate_user_data_to_team(uuid,uuid) from public;
revoke execute on function public.notify_assignment(uuid,uuid,uuid,text,uuid,text,text) from public;
revoke execute on function public.reassign_record(text,uuid,uuid,text) from public;
revoke execute on function public.same_team(uuid) from public;
revoke execute on function public.recalculate_invoice_payment_totals(uuid) from public;

revoke execute on function public.events_set_owner_and_validate() from public, authenticated;
revoke execute on function public.enforce_signup_domain() from public, authenticated;
revoke execute on function public.handle_new_user() from public, authenticated;
revoke execute on function public.restore_sync_dependencies() from public, authenticated;
revoke execute on function public.stage_missing_sync_dependencies() from public, authenticated;
revoke execute on function public.sync_invoice_after_payment() from public, authenticated;

revoke execute on function public.recalculate_invoice_payment_totals(uuid) from authenticated;

grant execute on function public.accept_shared_record(uuid,uuid) to authenticated;
grant execute on function public.create_team_for_user(text,uuid) to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.get_team_member_emails(uuid) to authenticated;
grant execute on function public.join_team_by_code(text,uuid) to authenticated;
grant execute on function public.migrate_user_data_to_team(uuid,uuid) to authenticated;
grant execute on function public.notify_assignment(uuid,uuid,uuid,text,uuid,text,text) to authenticated;
grant execute on function public.reassign_record(text,uuid,uuid,text) to authenticated;
grant execute on function public.same_team(uuid) to authenticated;
