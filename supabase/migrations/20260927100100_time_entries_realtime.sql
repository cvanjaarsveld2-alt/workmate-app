-- Timesheet changes reach other devices live, like jobs.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'time_entries') then
    alter publication supabase_realtime add table public.time_entries;
  end if;
end $$;
