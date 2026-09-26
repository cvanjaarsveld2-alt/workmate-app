-- Companies not registered for VAT may not charge it. When off, the app
-- stops adding VAT to new quotes and invoices and documents show no VAT.
alter table public.team_profiles add column if not exists vat_registered boolean not null default true;
