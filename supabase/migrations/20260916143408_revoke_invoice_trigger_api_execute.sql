-- Exported from production supabase_migrations.schema_migrations (20260916143408).
REVOKE EXECUTE ON FUNCTION public.recalculate_invoice_payment_totals(uuid) FROM authenticated, anon;
