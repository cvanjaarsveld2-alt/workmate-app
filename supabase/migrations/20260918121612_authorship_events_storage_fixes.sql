-- Exported from production supabase_migrations.schema_migrations (20260918121612).
do $$
declare
  t text;
  tables text[] := array['activities','breakdown_reports','clients','company_documents',
    'contacts','custom_faults','equipment','expenses','followups','leads','notes',
    'quotes','repair_reports','vehicle_checks'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid() and (team_id is null or team_id in (select team_id from public.team_members where user_id = auth.uid())))',
      t || '_ins', t
    );
  end loop;
end $$;

alter table public.events add column if not exists user_id uuid references auth.users(id) on delete set null;

create or replace function public.events_set_owner_and_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  if new.name is null or length(trim(new.name)) = 0 or length(new.name) > 200 then
    raise exception 'Invalid event name';
  end if;
  if new.data is not null and length(new.data::text) > 20000 then
    raise exception 'Event payload too large';
  end if;
  return new;
end;
$$;

drop trigger if exists events_set_owner_and_validate_trg on public.events;
create trigger events_set_owner_and_validate_trg
  before insert on public.events
  for each row execute function public.events_set_owner_and_validate();

drop policy if exists "docs_select_team" on storage.objects;
create policy "docs_select_team" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-docs'
    and exists (
      select 1 from public.company_documents d
      join public.team_members tm on tm.team_id = d.team_id
      where d.file_url = storage.objects.name
        and d.team_id is not null
        and tm.user_id = auth.uid()
    )
  );
