-- ── Leaver handling ──────────────────────────────────────────────────────────
-- The master account removes a teammate in one step: their shared team work
-- moves to a chosen teammate, they leave the team, their sessions and push
-- devices are cleared and (by default) their login is blocked. Personal
-- history (expenses, vehicle checks, invoices, payments) keeps its author and
-- stays visible to the team.
create or replace function private.remove_team_member(p_user_id uuid, p_reassign_to uuid, p_block_login boolean default true)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid; v_owner uuid; v_label text; v_n int;
  v_owned int := 0; v_assigned int := 0; t text;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select tm.team_id, tm2.owner_user_id into v_team, v_owner
    from public.team_members tm join public.teams tm2 on tm2.id = tm.team_id
   where tm.user_id = p_user_id limit 1;
  if v_team is null then raise exception 'Member not found'; end if;
  if not private.is_team_owner(v_team) then raise exception 'Only the master account can remove a teammate'; end if;
  if p_user_id = v_owner then raise exception 'The master account cannot be removed'; end if;
  if p_reassign_to is null or p_reassign_to = p_user_id
     or not exists (select 1 from public.team_members where team_id = v_team and user_id = p_reassign_to) then
    raise exception 'Choose a teammate to take over their work';
  end if;
  select coalesce(nullif(full_name, ''), email) into v_label from public.users where id = p_reassign_to;

  -- Work records: ownership moves, so the leaver no longer sees them.
  foreach t in array array['clients','contacts','followups','quotes','notes','equipment','leads',
                           'activities','jobs','breakdown_reports','repair_reports'] loop
    execute format('update public.%I set user_id = $1 where team_id = $2 and user_id = $3', t)
      using p_reassign_to, v_team, p_user_id;
    get diagnostics v_n = row_count; v_owned := v_owned + v_n;
    execute format('update public.%I set assigned_to_user_id = $1 where team_id = $2 and assigned_to_user_id = $3', t)
      using p_reassign_to, v_team, p_user_id;
    get diagnostics v_n = row_count; v_assigned := v_assigned + v_n;
  end loop;
  -- Keep the visible "assigned to" label in step where the table has one.
  foreach t in array array['clients','contacts','followups','notes','equipment','leads',
                           'jobs','breakdown_reports','repair_reports'] loop
    execute format('update public.%I set assigned_to = $1 where team_id = $2 and assigned_to_user_id = $3 and assigned_to is distinct from $1', t)
      using v_label, v_team, p_reassign_to;
  end loop;

  delete from public.team_members where team_id = v_team and user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  if coalesce(p_block_login, true) then
    update auth.users set banned_until = 'infinity' where id = p_user_id;
  end if;

  -- Audit trail (events_set_owner_and_validate stamps the caller as user_id).
  insert into public.events (name, data, "timestamp")
  values ('member_removed', jsonb_build_object('removed_user_id', p_user_id, 'reassigned_to', p_reassign_to,
          'records_owned_moved', v_owned, 'assignments_moved', v_assigned, 'login_blocked', coalesce(p_block_login, true)), now());

  return json_build_object('records_moved', v_owned, 'assignments_moved', v_assigned,
                           'login_blocked', coalesce(p_block_login, true));
end $$;
revoke execute on function private.remove_team_member(uuid, uuid, boolean) from public, anon;
grant execute on function private.remove_team_member(uuid, uuid, boolean) to authenticated;

create or replace function public.remove_team_member(p_user_id uuid, p_reassign_to uuid, p_block_login boolean default true)
returns json language sql security invoker set search_path = ''
as $$ select private.remove_team_member(p_user_id, p_reassign_to, p_block_login); $$;
revoke execute on function public.remove_team_member(uuid, uuid, boolean) from public, anon;
grant execute on function public.remove_team_member(uuid, uuid, boolean) to authenticated;

-- ── Team access to photos ────────────────────────────────────────────────────
-- Photos live in each uploader's folder. People who can already see the whole
-- team's records (the master account, admins, members granted whole-team
-- view: private.can_see_team) may now read teammates' photos and receipts
-- too, so shared clients show their business cards and attachments. Other
-- members still only read their own files.
create or replace function private.can_see_member_files(p_owner text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and p_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (
       select 1 from public.team_members them
        where them.user_id = p_owner::uuid and private.can_see_team(them.team_id));
$$;
revoke execute on function private.can_see_member_files(text) from public, anon;
grant execute on function private.can_see_member_files(text) to authenticated;

drop policy if exists "media_select_team" on storage.objects;
create policy "media_select_team" on storage.objects for select to authenticated
  using (bucket_id = 'powermate-media' and private.can_see_member_files((storage.foldername(name))[1]));

drop policy if exists "receipts_read_team" on storage.objects;
create policy "receipts_read_team" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = 'receipts'
         and private.can_see_member_files((storage.foldername(name))[2]));

-- ── Business-card links → storage paths ──────────────────────────────────────
-- Cards were saved as public links into the (now private) bucket. Store the
-- durable object path instead; the app signs a fresh link when showing it.
update public.contacts
   set card_photo_url = substring(card_photo_url from '/storage/v1/object/(?:public|sign|authenticated)/powermate-media/([^?]+)')
 where card_photo_url ~ '/storage/v1/object/(public|sign|authenticated)/powermate-media/';

-- ── Daily problem digest ────────────────────────────────────────────────────
-- 17:00 South Africa time (15:00 UTC): problem-digest summarises the last 24h
-- of crash / sync-failure events per team and tells the master account, only
-- when there is something to look at. Same cron secret as send-reminders.
select cron.unschedule(jobid) from cron.job where jobname = 'powermate-problem-digest';
select cron.schedule(
  'powermate-problem-digest',
  '0 15 * * *',
  $cmd$
  select net.http_post(
    url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/problem-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
