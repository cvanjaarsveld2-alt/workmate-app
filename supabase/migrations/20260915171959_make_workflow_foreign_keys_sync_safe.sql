-- Exported from production supabase_migrations.schema_migrations (20260915171959).
alter table public.followups add column if not exists sync_pending_quote_id uuid, add column if not exists sync_pending_client_id uuid, add column if not exists sync_pending_note_id uuid, add column if not exists sync_pending_team_id uuid;
alter table public.jobs add column if not exists sync_pending_quote_id uuid, add column if not exists sync_pending_client_id uuid;
alter table public.invoices add column if not exists sync_pending_quote_id uuid, add column if not exists sync_pending_job_id uuid, add column if not exists sync_pending_client_id uuid;
alter table public.payments add column if not exists sync_pending_invoice_id uuid;

create or replace function public.stage_missing_sync_dependencies() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='followups' then
    if new.quote_id is not null and not exists(select 1 from public.quotes where id=new.quote_id) then new.sync_pending_quote_id:=new.quote_id; new.quote_id:=null; end if;
    if new.client_id is not null and not exists(select 1 from public.clients where id=new.client_id) then new.sync_pending_client_id:=new.client_id; new.client_id:=null; end if;
    if new.linked_note_id is not null and not exists(select 1 from public.notes where id=new.linked_note_id) then new.sync_pending_note_id:=new.linked_note_id; new.linked_note_id:=null; end if;
    if new.team_id is not null and not exists(select 1 from public.teams where id=new.team_id) then new.sync_pending_team_id:=new.team_id; new.team_id:=null; end if;
  elsif tg_table_name='jobs' then
    if new.quote_id is not null and not exists(select 1 from public.quotes where id=new.quote_id) then new.sync_pending_quote_id:=new.quote_id; new.quote_id:=null; end if;
    if new.client_id is not null and not exists(select 1 from public.clients where id=new.client_id) then new.sync_pending_client_id:=new.client_id; new.client_id:=null; end if;
  elsif tg_table_name='invoices' then
    if new.quote_id is not null and not exists(select 1 from public.quotes where id=new.quote_id) then new.sync_pending_quote_id:=new.quote_id; new.quote_id:=null; end if;
    if new.job_id is not null and not exists(select 1 from public.jobs where id=new.job_id) then new.sync_pending_job_id:=new.job_id; new.job_id:=null; end if;
    if new.client_id is not null and not exists(select 1 from public.clients where id=new.client_id) then new.sync_pending_client_id:=new.client_id; new.client_id:=null; end if;
  elsif tg_table_name='payments' then
    if new.invoice_id is not null and not exists(select 1 from public.invoices where id=new.invoice_id) then new.sync_pending_invoice_id:=new.invoice_id; new.invoice_id:=null; end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_stage_missing_sync_dependencies on public.followups;
drop trigger if exists trg_stage_missing_sync_dependencies on public.jobs;
drop trigger if exists trg_stage_missing_sync_dependencies on public.invoices;
drop trigger if exists trg_stage_missing_sync_dependencies on public.payments;
create trigger trg_stage_missing_sync_dependencies before insert or update on public.followups for each row execute function public.stage_missing_sync_dependencies();
create trigger trg_stage_missing_sync_dependencies before insert or update on public.jobs for each row execute function public.stage_missing_sync_dependencies();
create trigger trg_stage_missing_sync_dependencies before insert or update on public.invoices for each row execute function public.stage_missing_sync_dependencies();
create trigger trg_stage_missing_sync_dependencies before insert or update on public.payments for each row execute function public.stage_missing_sync_dependencies();

create or replace function public.restore_sync_dependencies() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='quotes' then
    update public.followups set quote_id=sync_pending_quote_id,sync_pending_quote_id=null where sync_pending_quote_id=new.id;
    update public.jobs set quote_id=sync_pending_quote_id,sync_pending_quote_id=null where sync_pending_quote_id=new.id;
    update public.invoices set quote_id=sync_pending_quote_id,sync_pending_quote_id=null where sync_pending_quote_id=new.id;
  elsif tg_table_name='clients' then
    update public.followups set client_id=sync_pending_client_id,sync_pending_client_id=null where sync_pending_client_id=new.id;
    update public.jobs set client_id=sync_pending_client_id,sync_pending_client_id=null where sync_pending_client_id=new.id;
    update public.invoices set client_id=sync_pending_client_id,sync_pending_client_id=null where sync_pending_client_id=new.id;
  elsif tg_table_name='notes' then
    update public.followups set linked_note_id=sync_pending_note_id,sync_pending_note_id=null where sync_pending_note_id=new.id;
  elsif tg_table_name='teams' then
    update public.followups set team_id=sync_pending_team_id,sync_pending_team_id=null where sync_pending_team_id=new.id;
  elsif tg_table_name='jobs' then
    update public.invoices set job_id=sync_pending_job_id,sync_pending_job_id=null where sync_pending_job_id=new.id;
  elsif tg_table_name='invoices' then
    update public.payments set invoice_id=sync_pending_invoice_id,sync_pending_invoice_id=null where sync_pending_invoice_id=new.id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_restore_sync_dependencies_quotes on public.quotes;
drop trigger if exists trg_restore_sync_dependencies_clients on public.clients;
drop trigger if exists trg_restore_sync_dependencies_notes on public.notes;
drop trigger if exists trg_restore_sync_dependencies_teams on public.teams;
drop trigger if exists trg_restore_sync_dependencies_jobs on public.jobs;
drop trigger if exists trg_restore_sync_dependencies_invoices on public.invoices;
create trigger trg_restore_sync_dependencies_quotes after insert on public.quotes for each row execute function public.restore_sync_dependencies();
create trigger trg_restore_sync_dependencies_clients after insert on public.clients for each row execute function public.restore_sync_dependencies();
create trigger trg_restore_sync_dependencies_notes after insert on public.notes for each row execute function public.restore_sync_dependencies();
create trigger trg_restore_sync_dependencies_teams after insert on public.teams for each row execute function public.restore_sync_dependencies();
create trigger trg_restore_sync_dependencies_jobs after insert on public.jobs for each row execute function public.restore_sync_dependencies();
create trigger trg_restore_sync_dependencies_invoices after insert on public.invoices for each row execute function public.restore_sync_dependencies();

comment on column public.followups.sync_pending_quote_id is 'Offline sync staging for quote FK when parent arrives later';
comment on column public.jobs.sync_pending_quote_id is 'Offline sync staging for quote FK when parent arrives later';
comment on column public.invoices.sync_pending_job_id is 'Offline sync staging for job FK when parent arrives later';
comment on column public.payments.sync_pending_invoice_id is 'Offline sync staging for invoice FK when parent arrives later';
