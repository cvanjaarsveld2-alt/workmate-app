-- ── Two-company isolation test, kept in the database ──────────────────────
-- private.tenant_isolation_test() creates a second company (owner + member)
-- and checks from both sides that nothing crosses between companies: reads on
-- every table, writes, sharing, storage and the team functions. It always
-- ends by raising an exception, so nothing it creates is kept. Only the
-- database owner can run it:
--     select private.tenant_isolation_test();
-- The error message starts with "ISOLATION PASS" or "ISOLATION FAIL".
-- Re-run it after any change to policies or team functions.
create or replace function private.tenant_isolation_test() returns void
language plpgsql set search_path = '' as $iso$

declare
  a_owner uuid := '431dcb72-ea3f-43ed-9f73-74384e862300';
  a_team uuid := '4c36881d-695c-467b-902c-45203a86a078';
  b_owner uuid := gen_random_uuid();
  b_member uuid := gen_random_uuid();
  b_team uuid;
  b_client uuid := gen_random_uuid();
  a_client uuid;
  a_code text;
  out text := '';
  failed int := 0;
  n int;
  ok boolean;
  t text;
  tables text[] := array[
    'activities','breakdown_reports','calendar_events','clients','company_documents','contacts','conversations',
    'custom_faults','documents','email_quotes','equipment','events','expenses','follow_ups','followups',
    'import_activity','invoices','jobs','leads','machine_jack_confirmations','notes','notification_log',
    'outlook_connections','payments','plan_items','push_subscriptions','quote_emails','quotes',
    'reminder_deliveries','repair_reports','sales_reports','service_reports','targets','vehicle_checks'];
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (b_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'iso-owner-' || b_owner || '@pwrstart.com', '', now(), now(), '{}', '{}'),
         (b_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'iso-member-' || b_member || '@pwrstart.com', '', now(), now(), '{}', '{}');
  insert into public.users (id, email, role) values (b_owner, 'iso-owner-' || b_owner || '@pwrstart.com', 'employee'), (b_member, 'iso-member-' || b_member || '@pwrstart.com', 'employee')
  on conflict (id) do nothing;
  select id into a_client from public.clients where team_id = a_team limit 1;
  select invite_code into a_code from public.teams where id = a_team;

  -- ── As company B's owner ──
  perform set_config('request.jwt.claims', json_build_object('sub', b_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b_team := (public.create_team_for_user('Isolation Test Co', b_owner)->>'id')::uuid;
  insert into public.clients (id, user_id, team_id, company) values (b_client, b_owner, b_team, 'B only client');
  insert into public.plan_items (user_id) values (b_owner);

  foreach t in array tables loop
    begin
      execute format('select count(*) from public.%I where user_id is distinct from $1 and user_id is distinct from $2', t)
        into n using b_owner, b_member;
    exception when insufficient_privilege then n := 0; -- no access at all
    end;
    if n > 0 then failed := failed + 1; out := out || format(E'\nFAIL B reads %s of A''s rows in %s', n, t); end if;
  end loop;
  select count(*) into n from public.teams where id <> b_team;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B sees other teams'; end if;
  select count(*) into n from public.team_members where team_id <> b_team;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B sees other team members'; end if;
  select count(*) into n from public.team_profiles where team_id <> b_team;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B sees other company profiles'; end if;
  select count(*) into n from public.users where id <> b_owner;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B sees other users'; end if;
  select count(*) into n from public.team_notifications where from_user_id <> b_owner and to_user_id <> b_owner;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B sees other notifications'; end if;
  out := out || format(E'\nok   B sees none of A''s rows across %s tables', array_length(tables, 1) + 5);

  -- Writes against A.
  update public.clients set notes = 'hacked' where team_id = a_team; get diagnostics n = row_count;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B updated A clients'; else out := out || E'\nok   B cannot update A''s clients'; end if;
  delete from public.clients where team_id = a_team; get diagnostics n = row_count;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B deleted A clients'; else out := out || E'\nok   B cannot delete A''s clients'; end if;
  update public.team_profiles set trading_name = 'hacked' where team_id = a_team; get diagnostics n = row_count;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B edited A profile'; else out := out || E'\nok   B cannot edit A''s company details'; end if;
  update public.teams set name = 'hacked' where id = a_team; get diagnostics n = row_count;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B renamed A'; else out := out || E'\nok   B cannot rename A'; end if;
  begin
    insert into public.clients (user_id, team_id, company) values (b_owner, a_team, 'planted');
    failed := failed + 1; out := out || E'\nFAIL B planted a client in A';
  exception when others then out := out || E'\nok   B cannot add records to A';
  end;
  begin
    insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title)
    values (a_team, b_owner, a_owner, 'client', b_client, 'spam');
    failed := failed + 1; out := out || E'\nFAIL B notified A''s owner';
  exception when others then out := out || E'\nok   B cannot send notifications into A';
  end;

  -- Sharing loophole: B "shares" A's client with itself.
  if a_client is not null then
    insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title)
    values (b_team, b_owner, b_owner, 'client', a_client, 'self-share');
    select count(*) into n from public.clients where id = a_client;
    if n > 0 then failed := failed + 1; out := out || E'\nFAIL self-share exposes A''s client'; else out := out || E'\nok   sharing another company''s record with yourself exposes nothing'; end if;
  end if;

  -- Storage and functions.
  if private.can_see_member_files(a_owner::text) then failed := failed + 1; out := out || E'\nFAIL B can open A''s photos'; else out := out || E'\nok   B cannot open A''s photos or receipts'; end if;
  select count(*) into n from public.get_team_member_emails(a_team);
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL B lists A''s members'; else out := out || E'\nok   B cannot list A''s members'; end if;
  ok := false;
  begin perform public.reassign_record('clients', a_client, b_owner, 'x'); exception when others then ok := true; end;
  if not ok then failed := failed + 1; out := out || E'\nFAIL B reassigned A''s client'; else out := out || E'\nok   B cannot reassign A''s records'; end if;
  ok := false;
  begin perform public.remove_team_member(a_owner, b_owner, false); exception when others then ok := true; end;
  if not ok then failed := failed + 1; out := out || E'\nFAIL B removed A''s member'; else out := out || E'\nok   B cannot remove A''s members'; end if;
  ok := false;
  begin perform public.set_member_access(a_owner, 'member', false); exception when others then ok := true; end;
  if not ok then failed := failed + 1; out := out || E'\nFAIL B changed A''s roles'; else out := out || E'\nok   B cannot change A''s roles'; end if;
  ok := false;
  begin perform public.regenerate_invite_code(a_team); exception when others then ok := true; end;
  if not ok then failed := failed + 1; out := out || E'\nFAIL B reset A''s invite code'; else out := out || E'\nok   B cannot reset A''s invite code'; end if;
  ok := false;
  begin perform public.join_team_by_code('WRONGCODE123', b_owner); exception when others then ok := true; end;
  if not ok then failed := failed + 1; out := out || E'\nFAIL wrong invite code accepted'; else out := out || E'\nok   a wrong invite code is refused'; end if;
  if length(a_code) < 12 then failed := failed + 1; out := out || E'\nFAIL A invite code shorter than 12'; else out := out || E'\nok   invite codes are 12+ characters'; end if;
  if public.get_my_effective_role() <> 'admin' then failed := failed + 1; out := out || E'\nFAIL B owner is not admin of own company'; end if;

  -- ── As company A's master account (has the old global admin role) ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients where team_id = b_team;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL A reads B clients'; else out := out || E'\nok   A cannot read B''s clients'; end if;
  select count(*) into n from public.plan_items where user_id = b_owner;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL A (global admin) reads B plan items'; else out := out || E'\nok   A''s old global admin role no longer reaches B'; end if;
  select count(*) into n from public.team_profiles where team_id = b_team;
  if n > 0 then failed := failed + 1; out := out || E'\nFAIL A reads B profile'; else out := out || E'\nok   A cannot read B''s company details'; end if;
  if private.can_see_member_files(b_owner::text) then failed := failed + 1; out := out || E'\nFAIL A can open B''s photos'; else out := out || E'\nok   A cannot open B''s photos'; end if;
  select count(*) into n from public.plan_items where user_id = a_owner or user_id in (select user_id from public.team_members where team_id = a_team);
  out := out || format(E'\nok   A still reads its own company''s rows (plan items: %s)', n);
  reset role;

  raise exception 'ISOLATION % (% failed)%', case when failed = 0 then 'PASS' else 'FAIL' end, failed, out;
end $iso$;
revoke execute on function private.tenant_isolation_test() from public, anon, authenticated;
