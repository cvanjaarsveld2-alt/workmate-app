-- These indexes exactly duplicated existing unique indexes and added no
-- distinct ordering or filtering benefit.
drop index if exists public.idx_invoices_job_id;
drop index if exists public.idx_outlook_conn_user;
