-- Exported from production supabase_migrations.schema_migrations (20260920153518).
-- ─── Machine Jack Confirmations ─────────────────────────────────────────────
-- Lets anyone on the team confirm, from inside the app (on site, with a tape
-- measure), which Power Works jack(s) actually fit a specific machine, and/or
-- the real measured jacking-point closed height. Previously this data only
-- lived in src/lib/machineData.js, so every update meant a code change and a
-- redeploy. The Jack Selector screen now merges this table on top of that
-- static catalogue at read time: a confirmed row here always wins over the
-- automatic estimate, and it takes effect immediately for everyone on the
-- team — no code touched.
create table if not exists public.machine_jack_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  brand text not null,
  model text not null,
  closed_height integer,
  jack_overrides text[],
  jack_stand text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists machine_jack_confirmations_brand_model_idx
  on public.machine_jack_confirmations (brand, model);

create index if not exists machine_jack_confirmations_team_id_idx
  on public.machine_jack_confirmations (team_id);

alter table public.machine_jack_confirmations enable row level security;

-- Visible to whoever confirmed it, or anyone on the same team — this is
-- shared reference data, not a personal record.
create policy "machine_jack_confirmations_select" on public.machine_jack_confirmations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      team_id is not null
      and team_id in (
        select team_members.team_id from public.team_members
        where team_members.user_id = (select auth.uid())
      )
    )
  );

create policy "machine_jack_confirmations_ins" on public.machine_jack_confirmations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      team_id is null
      or team_id in (
        select team_members.team_id from public.team_members
        where team_members.user_id = (select auth.uid())
      )
    )
  );

-- Any teammate can correct a confirmed value, not just whoever entered it.
create policy "machine_jack_confirmations_upd" on public.machine_jack_confirmations
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (
      team_id is not null
      and team_id in (
        select team_members.team_id from public.team_members
        where team_members.user_id = (select auth.uid())
      )
    )
  )
  with check (
    team_id is null
    or team_id in (
      select team_members.team_id from public.team_members
      where team_members.user_id = (select auth.uid())
    )
  );

create policy "machine_jack_confirmations_del" on public.machine_jack_confirmations
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (
      team_id is not null
      and team_id in (
        select team_members.team_id from public.team_members
        where team_members.user_id = (select auth.uid())
      )
    )
  );
