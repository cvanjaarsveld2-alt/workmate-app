-- Detailed quotes: an optional write-up stored with the quote.
--   { title, intro, cover, exclusions,
--     sections: [{ id, title, body, photos: [{ id, storage_path, caption }] }] }
-- Photos live in the powermate-media bucket (uploader's folder); only their
-- paths are stored here. Capped so a runaway client can't bloat the row.
alter table public.quotes add column if not exists details jsonb;
alter table public.quotes drop constraint if exists quotes_details_size;
alter table public.quotes add constraint quotes_details_size
  check (details is null or (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 200000));
