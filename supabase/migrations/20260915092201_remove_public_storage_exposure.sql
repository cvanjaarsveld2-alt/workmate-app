-- Exported from production supabase_migrations.schema_migrations (20260915092201).
-- Remove public access from the buckets that contain app/user files.
-- We intentionally leave powermate-quotes unchanged because it is already private.
UPDATE storage.buckets SET public = false WHERE id IN ('powermate-files','powermate-media','company-docs','receipts');

-- Remove broad/public policies that bypass per-user ownership.
DROP POLICY IF EXISTS "Allow public viewing" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads 1sty3qs_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow viewing 1sty3qs_0" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users delete own media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users upload media" ON storage.objects;
DROP POLICY IF EXISTS "Public read media" ON storage.objects;
DROP POLICY IF EXISTS "company_docs_authenticated_all" ON storage.objects;
DROP POLICY IF EXISTS "powermate_media_authenticated_all" ON storage.objects;
DROP POLICY IF EXISTS "receipts_authenticated_all" ON storage.objects;

-- Remove broad owner-delete policy that was not path-scoped; keep the path-scoped owner policy.
DROP POLICY IF EXISTS "Allow owner delete" ON storage.objects;

-- Remove legacy public bucket policies if present.
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

-- Keep access authenticated and path-owned for company docs/media/receipts.
-- Existing docs_* / media_* / receipts_* policies are intentionally retained.

-- Ensure powermate-files has no accidental public access. The app should use a more specific policy if it still needs this bucket.
DROP POLICY IF EXISTS "Allow public viewing" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads 1sty3qs_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow viewing 1sty3qs_0" ON storage.objects;
