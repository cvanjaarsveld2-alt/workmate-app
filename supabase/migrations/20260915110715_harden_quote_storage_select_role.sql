-- Exported from production supabase_migrations.schema_migrations (20260915110715).
DROP POLICY IF EXISTS "Users read their own quote PDFs" ON storage.objects;
CREATE POLICY "Users read their own quote PDFs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'powermate-quotes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
