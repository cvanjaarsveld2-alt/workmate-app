-- Exported from production supabase_migrations.schema_migrations (20260922174915).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_gl_code_length'
  ) then
    alter table public.expenses
      add constraint expenses_gl_code_length check (gl_code is null or char_length(gl_code) <= 40);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_gr_code_length'
  ) then
    alter table public.expenses
      add constraint expenses_gr_code_length check (gr_code is null or char_length(gr_code) <= 40);
  end if;
end $$;
