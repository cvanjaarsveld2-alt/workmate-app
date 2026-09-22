-- Exported from production supabase_migrations.schema_migrations (20260919092804).
create schema if not exists extensions;
drop extension pg_net;
create extension pg_net with schema extensions;
