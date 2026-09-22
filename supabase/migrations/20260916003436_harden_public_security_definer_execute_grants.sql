-- Exported from production supabase_migrations.schema_migrations (20260916003436).
revoke execute on function public.enforce_signup_domain() from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.recalculate_invoice_payment_totals(uuid) from anon;
revoke execute on function public.restore_sync_dependencies() from anon;
revoke execute on function public.stage_missing_sync_dependencies() from anon;
revoke execute on function public.sync_invoice_after_payment() from anon;
