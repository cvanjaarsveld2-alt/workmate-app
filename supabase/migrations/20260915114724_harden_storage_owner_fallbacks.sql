-- Exported from production supabase_migrations.schema_migrations (20260915114724).
drop policy if exists "media_insert_own" on storage.objects;
drop policy if exists "media_select_own" on storage.objects;
drop policy if exists "media_update_own" on storage.objects;
drop policy if exists "media_delete_own" on storage.objects;

create policy "media_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'powermate-media'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

create policy "media_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'powermate-media'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

create policy "media_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'powermate-media'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
)
with check (
  bucket_id = 'powermate-media'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

create policy "media_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'powermate-media'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

-- Company documents historically used company-docs/<user-id>/... while the
-- hardened layout is <user-id>/company-docs/.... Keep the legacy layout safe
-- by authorizing it through Storage ownership, while new rows remain path-scoped.
drop policy if exists "docs_insert_own" on storage.objects;
drop policy if exists "docs_select_own" on storage.objects;
drop policy if exists "docs_delete_own" on storage.objects;

create policy "docs_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'company-docs'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

create policy "docs_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'company-docs'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

create policy "docs_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'company-docs'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or owner_id = (auth.uid())::text
  )
);

-- Team-shared company documents may be listed in the app by teammates. The
-- storage object must correspond to a company_documents row in a team the
-- caller belongs to.
drop policy if exists "docs_select_team" on storage.objects;
create policy "docs_select_team" on storage.objects
for select to authenticated
using (
  bucket_id = 'company-docs'
  and exists (
    select 1
    from public.company_documents d
    join public.team_members tm on tm.team_id = d.team_id
    where d.file_url = name
      and d.team_id is not null
      and tm.user_id = auth.uid()
  )
);
