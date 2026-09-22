-- Exported from production supabase_migrations.schema_migrations (20260918122756).
-- ─── Fix #2 for docs_select_team: the first fix (20260918133000) compared
-- d.file_url = storage.objects.name, assuming file_url held the bare object
-- key. Live data shows company_documents.file_url actually stores the FULL
-- public URL (e.g. https://<project>.supabase.co/storage/v1/object/public/
-- company-docs/company-docs/<uid>/<file>.pdf), while storage.objects.name is
-- just the bare key (company-docs/<uid>/<file>.pdf). Those are never equal
-- either way -- the previous fix was still broken, just broken differently.
-- Caught by adversarial re-verification (Phase 1 Completion, Phase B/A),
-- not assumed correct. Correlate by suffix match instead: the full URL must
-- end with "/" + the bare object key, which is exactly how Supabase Storage
-- constructs public URLs from bucket_id + name.
drop policy if exists "docs_select_team" on storage.objects;
create policy "docs_select_team" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-docs'
    and exists (
      select 1 from public.company_documents d
      join public.team_members tm on tm.team_id = d.team_id
      where d.team_id is not null
        and tm.user_id = auth.uid()
        and right(d.file_url, length(storage.objects.name) + 1) = ('/' || storage.objects.name)
    )
  );
