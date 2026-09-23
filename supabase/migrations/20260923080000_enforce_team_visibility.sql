-- Enforce team visibility in the database, not only in the app's screens.
--
-- Before: every record policy allowed ANY team member to read, edit and delete
-- every teammate's record (team_id in my teams). The app only hid them, so a
-- member could read the whole team's clients, quotes, expenses... straight from
-- the API. Now a teammate's record is visible/editable only to:
--   the owner (user_id) or assignee, the master account (teams.owner_user_id),
--   team admins (the master decides who is admin), and members the master has
--   granted whole-team view (team_members.can_view_team).
-- That is exactly what the app already shows, so nobody loses anything they
-- can see today. Records shared with someone (team_notifications) stay readable
-- by that recipient. Team reference data (company documents, custom faults,
-- jack confirmations) stays team-wide.

create or replace function private.can_see_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_team_id is not null and exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
      and (t.owner_user_id = auth.uid() or tm.role = 'admin' or coalesce(tm.can_view_team, false)));
$$;
revoke all on function private.can_see_team(uuid) from public, anon;
grant execute on function private.can_see_team(uuid) to authenticated;

create or replace function private.shared_with_me(p_type text, p_record_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.team_notifications n
    where n.to_user_id = auth.uid() and n.record_type = p_type
      and n.record_id::text = p_record_id and not coalesce(n.declined, false));
$$;
revoke all on function private.shared_with_me(text, text) from public, anon;
grant execute on function private.shared_with_me(text, text) to authenticated;
create index if not exists team_notifications_to_record_idx on public.team_notifications (to_user_id, record_id);

-- activities
alter policy activities_sel on public.activities using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy activities_upd on public.activities using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy activities_del on public.activities using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- breakdown_reports
alter policy breakdown_reports_sel on public.breakdown_reports using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy breakdown_reports_upd on public.breakdown_reports using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy breakdown_reports_del on public.breakdown_reports using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- clients
alter policy clients_sel on public.clients using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)) or private.shared_with_me('client', id::text));
alter policy clients_upd on public.clients using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy clients_del on public.clients using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- contacts
alter policy contacts_sel on public.contacts using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)) or private.shared_with_me('contact', id::text));
alter policy contacts_upd on public.contacts using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy contacts_del on public.contacts using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- equipment
alter policy equipment_sel on public.equipment using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy equipment_upd on public.equipment using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy equipment_del on public.equipment using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- followups
alter policy followups_sel on public.followups using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)) or private.shared_with_me('followup', id::text));
alter policy followups_upd on public.followups using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy followups_del on public.followups using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- leads
alter policy leads_sel on public.leads using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)) or private.shared_with_me('lead', id::text));
alter policy leads_upd on public.leads using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy leads_del on public.leads using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- notes
alter policy notes_sel on public.notes using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy notes_upd on public.notes using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy notes_del on public.notes using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- quotes
alter policy quotes_sel on public.quotes using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)) or private.shared_with_me('quote', id::text));
alter policy quotes_upd on public.quotes using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy quotes_del on public.quotes using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- repair_reports
alter policy repair_reports_sel on public.repair_reports using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy repair_reports_upd on public.repair_reports using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy repair_reports_del on public.repair_reports using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- expenses
alter policy expenses_sel on public.expenses using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy expenses_upd on public.expenses using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy expenses_del on public.expenses using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- vehicle_checks
alter policy vehicle_checks_sel on public.vehicle_checks using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy vehicle_checks_upd on public.vehicle_checks using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy vehicle_checks_del on public.vehicle_checks using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));

-- invoices
alter policy invoices_select on public.invoices using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy invoices_update on public.invoices using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy invoices_delete on public.invoices using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
-- Was: any team member could insert rows owned by someone else.
alter policy invoices_insert on public.invoices
  with check (user_id = (select auth.uid()) and (team_id is null or private.same_team(team_id)));

-- jobs
alter policy jobs_select on public.jobs using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy jobs_update on public.jobs using (user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or assigned_to_user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy jobs_delete on public.jobs using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
-- Was: any team member could insert rows owned by someone else.
alter policy jobs_insert on public.jobs
  with check (user_id = (select auth.uid()) and (team_id is null or private.same_team(team_id)));

-- payments
alter policy payments_select on public.payments using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
alter policy payments_update on public.payments using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)))
  with check ((user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id))) and (team_id is null or private.same_team(team_id)));
alter policy payments_delete on public.payments using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
-- Was: any team member could insert rows owned by someone else.
alter policy payments_insert on public.payments
  with check (user_id = (select auth.uid()) and (team_id is null or private.same_team(team_id)));

-- Logged-out requests never need table access (RLS already returned nothing,
-- but TRUNCATE is not covered by RLS). Signed-in users never need TRUNCATE,
-- TRIGGER or REFERENCES. Same for tables created later.
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
