-- Exported from production supabase_migrations.schema_migrations (20260918123233).
-- ─── Fix: storage INSERT policies were bypassable by ANY authenticated user ─
-- Caught by adversarial testing (Phase 1 Completion, Phase A), not assumed.
--
-- ROOT CAUSE: media_insert_own / docs_insert_own used
--   bucket_id = 'X' AND (folder-path-check OR owner_id = auth.uid())
-- The "OR owner_id = auth.uid()" branch was meant as legacy-path fallback,
-- but for an INSERT, owner_id is the row's OWN new value -- for a real
-- Storage-API-mediated upload it is always server-set to the uploader's own
-- auth.uid(), for EVERY uploader, regardless of which folder they choose to
-- write into. That makes the owner_id branch trivially true on every insert
-- and makes the folder-path branch irrelevant: any authenticated user can
-- INSERT an object at ANY path in these buckets (e.g. under another user's
-- or team's folder), not just their own. Confirmed exploitable via a direct
-- adversarial insert simulating exactly what the real Storage API sets
-- (owner/owner_id = the attacker's own auth.uid(), path = a victim's
-- folder) -- it succeeded before this fix.
--
-- Also found while investigating: docs_insert_own's folder check compares
-- (storage.foldername(name))[1] to auth.uid(), but the real, current,
-- correct upload path built by CompanyDocuments.jsx is
-- `company-docs/<uid>/<file>` -- so foldername(name)[1] is literally the
-- string "company-docs", never a uid, and [2] is the uid. The folder check
-- was checking the wrong array index and could never match, making the
-- (now-removed) owner_id branch the ONLY thing that ever let real uploads
-- through. Fixed to check the correct index so the folder check is
-- meaningful again.
--
-- media_insert_own's folder check was already correct: current code
-- (helpers.js uploadPhotoToSupabase, CardScanner.jsx uploadCardImage) always
-- puts the uploader's own uid as the FIRST path segment, so
-- (storage.foldername(name))[1] = auth.uid() is reachable and correct for
-- every real current upload -- the owner_id branch was pure dead weight
-- that only widened the attack surface, not something legitimate uploads
-- ever needed. Confirmed via grep of every "powermate-media" upload call
-- site in src/ before removing it.
--
-- FIX: for INSERT only, drop the owner_id fallback entirely and require the
-- folder-path check to pass on its own. SELECT/UPDATE/DELETE keep the
-- owner_id fallback (it is safe there -- owner_id reflects who actually
-- uploaded the object originally and cannot be forged for an existing row
-- by anyone but the true uploader), but the folder-index bug in company-docs
-- is fixed there too for consistency and defense-in-depth.

drop policy if exists "media_insert_own" on storage.objects;
create policy "media_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'powermate-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "docs_insert_own" on storage.objects;
create policy "docs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-docs'
    and (storage.foldername(name))[1] = 'company-docs'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "docs_select_own" on storage.objects;
create policy "docs_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-docs'
    and (
      ((storage.foldername(name))[1] = 'company-docs' and (storage.foldername(name))[2] = auth.uid()::text)
      or owner_id = auth.uid()::text
    )
  );

drop policy if exists "docs_delete_own" on storage.objects;
create policy "docs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-docs'
    and (
      ((storage.foldername(name))[1] = 'company-docs' and (storage.foldername(name))[2] = auth.uid()::text)
      or owner_id = auth.uid()::text
    )
  );
