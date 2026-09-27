-- Per-company modules: the master account switches whole features off for
-- everyone in the company (e.g. Jack Selector is specific to mining and
-- hydraulics). New companies start without Jack Selector; existing ones keep
-- everything they have today.
alter table public.team_profiles add column if not exists disabled_modules text[] not null default '{jack_selector}';
update public.team_profiles set disabled_modules = '{}' where team_id in (select id from public.teams where created_at < now());
alter table public.team_profiles drop constraint if exists team_profiles_disabled_modules_valid;
alter table public.team_profiles add constraint team_profiles_disabled_modules_valid
  check (disabled_modules <@ array['sales','quotes_invoicing','field_notes','vehicle_checks','reports','equipment','jack_selector','meetings','expenses']::text[]);
