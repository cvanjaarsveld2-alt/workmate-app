-- Remove only indexes proven redundant by prefix coverage and zero usage
-- since pg_stat_database.stats_reset (2026-04-26), while preserving all
-- unique/constraint indexes and indexes with observed scans.
drop index if exists public.idx_contacts_user_id;
drop index if exists public.followups_team_id;
drop index if exists public.idx_payments_invoice;
drop index if exists public.idx_repair_team;
drop index if exists public.idx_custom_faults_team;
