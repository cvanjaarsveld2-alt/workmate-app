-- Exported from production supabase_migrations.schema_migrations (20260918092125).
-- ─── PowerMate Assistant: email-detected quotes ────────────────────────────
-- Quotes that were sent as plain Outlook emails (never entered into PowerMate)
-- get picked up by a daily Gmail-reading scheduled task and land here for
-- Christo to review before they become real rows in `quotes`. Nothing in this
-- table auto-creates a quote or a follow-up on its own — that only happens
-- when he taps "Add to Quotes" on the Assistant screen, so a bad extraction
-- never silently pollutes the real pipeline.

alter table public.quotes add column if not exists source text not null default 'manual';

create table if not exists public.email_quotes (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null,
  gmail_message_id       text not null,
  direction              text not null default 'sent',
  to_address             text,
  from_address           text,
  subject                text,
  snippet                text,
  sent_at                timestamptz,

  extracted_client_name  text,
  extracted_amount       numeric,
  extracted_currency     text default 'ZAR',
  extracted_quote_ref    text,
  extraction_confidence  text default 'medium',

  matched_client_id      uuid references public.clients(id) on delete set null,
  status                 text not null default 'new',
  promoted_quote_id      uuid references public.quotes(id) on delete set null,

  sync_status            text default 'synced',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint email_quotes_status_check check (status in ('new','confirmed','dismissed')),
  constraint email_quotes_confidence_check check (extraction_confidence in ('high','medium','low'))
);

create unique index if not exists email_quotes_user_message_uidx
  on public.email_quotes (user_id, gmail_message_id);

create index if not exists email_quotes_user_status_idx
  on public.email_quotes (user_id, status, sent_at desc);

alter table public.email_quotes enable row level security;

drop policy if exists "email_quotes_select_own" on public.email_quotes;
create policy "email_quotes_select_own" on public.email_quotes
  for select using (user_id = auth.uid());

drop policy if exists "email_quotes_update_own" on public.email_quotes;
create policy "email_quotes_update_own" on public.email_quotes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "email_quotes_delete_own" on public.email_quotes;
create policy "email_quotes_delete_own" on public.email_quotes
  for delete using (user_id = auth.uid());

create or replace function public.email_quotes_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_quotes_set_updated_at on public.email_quotes;
create trigger email_quotes_set_updated_at
  before update on public.email_quotes
  for each row execute function public.email_quotes_set_updated_at();
