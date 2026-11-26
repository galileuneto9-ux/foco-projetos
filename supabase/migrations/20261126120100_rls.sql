-- RLS: anon sem acesso. Cada pessoa vê o próprio privado e o compartilhado do seu time.

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.google_oauth_connections enable row level security;
alter table public.google_oauth_secrets enable row level security;
alter table public.whatsapp_connection enable row level security;
alter table public.projects enable row level security;
alter table public.project_steps enable row level security;
alter table public.project_notes enable row level security;
alter table public.deliveries enable row level security;
alter table public.checkins enable row level security;
alter table public.weekly_summaries enable row level security;
alter table public.nudge_log enable row level security;
alter table public.ai_runs enable row level security;
alter table public.team_invites enable row level security;
alter table public.webhook_receipts enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on all tables in schema public from anon, public;
revoke all on schema public from anon;

revoke all on public.google_oauth_secrets from authenticated, anon, public;
revoke all on public.webhook_receipts from authenticated, anon, public;

-- teams

create policy teams_select on public.teams
for select to authenticated
using (public.is_team_member(id));

create policy teams_update on public.teams
for update to authenticated
using (public.is_team_owner(id))
with check (public.is_team_owner(id));

-- team_members

create policy team_members_select on public.team_members
for select to authenticated
using (public.is_team_member(team_id));

create policy team_members_insert on public.team_members
for insert to authenticated
with check (public.is_team_owner(team_id) and role = 'member');

create policy team_members_update_self on public.team_members
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy team_members_update_owner on public.team_members
for update to authenticated
using (public.is_team_owner(team_id))
with check (public.is_team_owner(team_id));

create policy team_members_delete on public.team_members
for delete to authenticated
using (
  public.is_team_owner(team_id)
  and role <> 'owner'
);

-- google / whatsapp: só o owner lê metadados

create policy google_oauth_owner on public.google_oauth_connections
for all to authenticated
using (public.is_team_owner(team_id))
with check (public.is_team_owner(team_id) and user_id = (select auth.uid()));

create policy whatsapp_owner_select on public.whatsapp_connection
for select to authenticated
using (public.is_team_owner(team_id));

create policy whatsapp_owner_write on public.whatsapp_connection
for all to authenticated
using (public.is_team_owner(team_id))
with check (public.is_team_owner(team_id));

-- projects: dono escreve; colegas só leem compartilhado

-- A policy usa as colunas da própria linha. can_read_project() relê a tabela e
-- falha no INSERT ... RETURNING, porque a linha nova ainda não está visível.
create policy projects_select on public.projects
for select to authenticated
using (
  exists (
    select 1
    from public.team_members m
    where m.team_id = projects.team_id
      and m.user_id = (select auth.uid())
      and (
        projects.owner_id = (select auth.uid())
        or projects.visibility = 'compartilhado'
      )
  )
);

create policy projects_insert on public.projects
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and public.is_team_member(team_id)
);

create policy projects_update on public.projects
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy projects_delete on public.projects
for delete to authenticated
using (owner_id = (select auth.uid()));

-- passos e notas: só o dono do projeto, mesmo se o cartão for compartilhado

create policy project_steps_owner on public.project_steps
for all to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_steps.project_id
      and p.team_id = project_steps.team_id
      and p.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_steps.project_id
      and p.team_id = project_steps.team_id
      and p.owner_id = (select auth.uid())
  )
);

create policy project_notes_owner on public.project_notes
for all to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_notes.project_id
      and p.team_id = project_notes.team_id
      and p.owner_id = (select auth.uid())
  )
)
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = project_notes.project_id
      and p.team_id = project_notes.team_id
      and p.owner_id = (select auth.uid())
  )
);

-- entregas: as suas; o owner do time só vê as de projeto compartilhado

create policy deliveries_select on public.deliveries
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    public.is_team_owner(team_id)
    and exists (
      select 1 from public.projects p
      where p.id = deliveries.project_id
        and p.team_id = deliveries.team_id
        and p.visibility = 'compartilhado'
    )
  )
);

create policy deliveries_insert on public.deliveries
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = deliveries.project_id
      and p.team_id = deliveries.team_id
      and p.owner_id = (select auth.uid())
  )
);

-- check-ins: o seu. O owner do time lê só o semanal.

create policy checkins_select on public.checkins
for select to authenticated
using (
  user_id = (select auth.uid())
  or (kind = 'semanal' and public.is_team_owner(team_id))
);

create policy checkins_insert on public.checkins
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_team_member(team_id)
);

create policy checkins_update on public.checkins
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- resumo semanal: só o owner

create policy weekly_summaries_select on public.weekly_summaries
for select to authenticated
using (public.is_team_owner(team_id));

-- auditoria sem segredo: a própria pessoa e o owner do time

create policy nudge_log_select on public.nudge_log
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_team_owner(team_id)
);

create policy ai_runs_select on public.ai_runs
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_team_owner(team_id)
);

create policy ai_runs_insert on public.ai_runs
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_team_member(team_id)
);

-- convites: só o owner

create policy team_invites_owner on public.team_invites
for all to authenticated
using (public.is_team_owner(team_id))
with check (
  public.is_team_owner(team_id)
  and invited_by = (select auth.uid())
);
