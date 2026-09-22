-- Exported from production supabase_migrations.schema_migrations (20260918092223).
create or replace function public.email_quotes_set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
