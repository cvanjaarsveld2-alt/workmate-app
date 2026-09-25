-- ── Help / report a problem ──────────────────────────────────────────────────
-- Anyone signed in can send a message from Help; they see their own messages
-- and replies. Platform admins see and answer everything in the console.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  email text check (length(email) <= 200),
  subject text not null check (length(subject) between 1 and 200),
  message text not null check (length(message) between 1 and 5000),
  screen text check (length(screen) <= 60),
  device text check (length(device) <= 300),
  app_version text check (length(app_version) <= 20),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  admin_reply text check (length(admin_reply) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and admin_reply is null
              and (team_id is null or (select private.same_team(team_id))));
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
grant select, insert on public.support_tickets to authenticated;

create or replace function private.admin_answer_ticket(p_id uuid, p_status text, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_status not in ('open', 'answered', 'closed') then raise exception 'Invalid status'; end if;
  update public.support_tickets
     set status = p_status, admin_reply = coalesce(nullif(trim(p_reply), ''), admin_reply), updated_at = now()
   where id = p_id;
end $$;
revoke execute on function private.admin_answer_ticket(uuid, text, text) from public, anon;
grant execute on function private.admin_answer_ticket(uuid, text, text) to authenticated;
create or replace function public.admin_answer_ticket(p_id uuid, p_status text, p_reply text) returns void
language sql security invoker set search_path = '' as $$ select private.admin_answer_ticket(p_id, p_status, p_reply); $$;
revoke execute on function public.admin_answer_ticket(uuid, text, text) from public, anon;
grant execute on function public.admin_answer_ticket(uuid, text, text) to authenticated;
