-- The app syncs email_quotes changes (review/dismiss/promote on the Assistant
-- screen) with an upsert, which Postgres checks against INSERT policies even when
-- the row exists. email_quotes had no INSERT policy, so every such change was
-- refused (42501). Owners may insert/upsert only their own rows.
drop policy if exists "email_quotes_insert_own" on public.email_quotes;
create policy "email_quotes_insert_own" on public.email_quotes
  for insert to authenticated
  with check (user_id = (select auth.uid()));
