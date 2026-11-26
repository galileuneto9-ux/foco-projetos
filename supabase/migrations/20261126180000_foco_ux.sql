-- Passos curtos, data de cobrança, links de um toque e eventos da agenda.

update public.project_steps set minutes = 25 where minutes > 25;

alter table public.project_steps drop constraint project_steps_minutes_check;
alter table public.project_steps
  add constraint project_steps_minutes_check check (minutes between 5 and 25);

alter table public.projects add column charge_on date;

create table public.action_links (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null,
  project_id uuid,
  step_id uuid,
  action text not null check (action in ('concluir', 'fiz', 'nao_fiz', 'travado')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_links_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade,
  constraint action_links_project_fkey
    foreign key (team_id, project_id) references public.projects (team_id, id) on delete cascade
);

create trigger action_links_touch
before update on public.action_links
for each row execute function public.touch_updated_at();

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('manha', 'noite')),
  for_date date not null,
  provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade,
  constraint calendar_events_once unique (user_id, kind, for_date)
);

create table public.project_charges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  next_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_charges_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade,
  constraint project_charges_project_fkey
    foreign key (team_id, project_id) references public.projects (team_id, id) on delete cascade
);

alter table public.action_links enable row level security;
alter table public.calendar_events enable row level security;
alter table public.project_charges enable row level security;

grant select on public.action_links to authenticated;
grant select on public.calendar_events to authenticated;
grant select, insert on public.project_charges to authenticated;
grant all on public.action_links to service_role;
grant all on public.calendar_events to service_role;
grant all on public.project_charges to service_role;
revoke all on public.action_links from anon, public;
revoke all on public.calendar_events from anon, public;
revoke all on public.project_charges from anon, public;

create policy action_links_select on public.action_links
for select to authenticated
using (user_id = (select auth.uid()));

create policy calendar_events_select on public.calendar_events
for select to authenticated
using (user_id = (select auth.uid()));

create policy project_charges_select on public.project_charges
for select to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_charges.project_id
      and p.team_id = project_charges.team_id
      and (
        p.owner_id = (select auth.uid())
        or (
          p.visibility = 'compartilhado'
          and public.is_team_member(p.team_id)
        )
      )
  )
);

create policy project_charges_insert on public.project_charges
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id = project_charges.project_id
      and p.team_id = project_charges.team_id
      and p.visibility = 'compartilhado'
      and public.is_team_member(p.team_id)
  )
);
