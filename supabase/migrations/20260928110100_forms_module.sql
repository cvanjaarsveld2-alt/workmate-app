-- Forms & checklists is a module a company can switch off (Company Details → Modules).
alter table public.team_profiles drop constraint if exists team_profiles_disabled_modules_valid;
alter table public.team_profiles add constraint team_profiles_disabled_modules_valid check (
  disabled_modules <@ array['sales', 'quotes_invoicing', 'field_notes', 'vehicle_checks', 'reports', 'equipment',
                            'jack_selector', 'meetings', 'expenses', 'forms']::text[]);
