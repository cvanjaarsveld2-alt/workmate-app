-- Exported from production supabase_migrations.schema_migrations (20260916054532).
drop trigger if exists trg_restore_sync_dependencies_quotes on public.quotes;
create trigger trg_restore_sync_dependencies_quotes after insert or update on public.quotes for each row execute function public.restore_sync_dependencies();

drop trigger if exists trg_restore_sync_dependencies_clients on public.clients;
create trigger trg_restore_sync_dependencies_clients after insert or update on public.clients for each row execute function public.restore_sync_dependencies();

drop trigger if exists trg_restore_sync_dependencies_notes on public.notes;
create trigger trg_restore_sync_dependencies_notes after insert or update on public.notes for each row execute function public.restore_sync_dependencies();

drop trigger if exists trg_restore_sync_dependencies_teams on public.teams;
create trigger trg_restore_sync_dependencies_teams after insert or update on public.teams for each row execute function public.restore_sync_dependencies();

drop trigger if exists trg_restore_sync_dependencies_jobs on public.jobs;
create trigger trg_restore_sync_dependencies_jobs after insert or update on public.jobs for each row execute function public.restore_sync_dependencies();

drop trigger if exists trg_restore_sync_dependencies_invoices on public.invoices;
create trigger trg_restore_sync_dependencies_invoices after insert or update on public.invoices for each row execute function public.restore_sync_dependencies();
