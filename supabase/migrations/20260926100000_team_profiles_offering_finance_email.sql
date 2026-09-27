-- White-label: things that used to be hard-coded for Power Works.
--   offering       — one line for sales messages ("our jacks, tyre handlers and …")
--   finance_email  — where expense claims are sent
alter table public.team_profiles add column if not exists offering text check (length(offering) <= 200);
alter table public.team_profiles add column if not exists finance_email text check (length(finance_email) <= 120);
