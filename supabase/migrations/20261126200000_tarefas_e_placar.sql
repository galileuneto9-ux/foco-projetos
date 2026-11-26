-- Tarefas, subtarefas, pontos e cópia idempotente de project_steps.
-- project_steps permanece, sem escrita pelo cliente.

alter table public.projects add column if not exists priority text;
update public.projects set priority = 'medio' where priority is null;
alter table public.projects alter column priority set default 'medio';
alter table public.projects alter column priority set not null;
alter table public.projects add column if not exists due_date date;

do $$ begin
  alter table public.projects
    add constraint projects_priority_check check (priority in ('importante', 'medio', 'baixo'));
exception when duplicate_object then null;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid,
  parent_task_id uuid,
  owner_id uuid not null,
  assignee_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  done_when text check (done_when is null or char_length(done_when) <= 400),
  minutes int check (minutes is null or minutes between 5 and 25),
  status text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'feita', 'pulada')),
  priority text check (priority is null or priority in ('importante', 'medio', 'baixo')),
  visibility text check (visibility is null or visibility in ('privado', 'compartilhado')),
  due_date date,
  position int not null default 0 check (position >= 0),
  completed_at timestamptz,
  legacy_step_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_shape_check check (
    (project_id is not null and visibility is null and priority is null)
    or (project_id is null and visibility in ('privado', 'compartilhado') and priority in ('importante', 'medio', 'baixo'))
  )
);

alter table public.tasks add column if not exists legacy_step_id uuid;
create unique index if not exists tasks_legacy_step_idx on public.tasks (legacy_step_id) where legacy_step_id is not null;
create unique index if not exists tasks_team_id_idx on public.tasks (team_id, id);

do $$ begin
  alter table public.tasks
    add constraint tasks_project_fkey
    foreign key (team_id, project_id) references public.projects (team_id, id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
    add constraint tasks_parent_fkey
    foreign key (parent_task_id) references public.tasks (id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
    add constraint tasks_owner_fkey
    foreign key (team_id, owner_id) references public.team_members (team_id, user_id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
    add constraint tasks_assignee_fkey
    foreign key (team_id, assignee_id) references public.team_members (team_id, user_id) on delete cascade;
exception when duplicate_object then null;
end $$;

create unique index if not exists tasks_one_current_idx
  on public.tasks (project_id)
  where status = 'em_andamento' and project_id is not null;

create unique index if not exists tasks_sibling_position_idx
  on public.tasks (
    team_id,
    (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(parent_task_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    position
  );

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
before update on public.tasks
for each row execute function public.touch_updated_at();

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null,
  source_kind text not null check (source_kind in ('task', 'project')),
  source_id uuid not null,
  points int not null check (points > 0),
  priority text not null check (priority in ('importante', 'medio', 'baixo')),
  visibility text not null check (visibility in ('privado', 'compartilhado')),
  awarded_at timestamptz not null default now(),
  week_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, source_id)
);

do $$ begin
  alter table public.point_events
    add constraint point_events_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade;
exception when duplicate_object then null;
end $$;

alter table public.deliveries add column if not exists task_id uuid;
alter table public.deliveries alter column project_id drop not null;

do $$ begin
  alter table public.deliveries
    add constraint deliveries_task_fkey
    foreign key (task_id) references public.tasks (id) on delete set null;
exception when duplicate_object then null;
end $$;

select set_config('foco.migrating_steps', '1', true);

insert into public.tasks (
  team_id, project_id, parent_task_id, owner_id, assignee_id, title, done_when, minutes,
  status, priority, visibility, position, completed_at, legacy_step_id
)
select
  s.team_id,
  s.project_id,
  null,
  p.owner_id,
  p.owner_id,
  s.title,
  s.done_when,
  s.minutes,
  case s.status
    when 'pendente' then 'aberta'
    when 'atual' then 'em_andamento'
    when 'feito' then 'feita'
    else 'pulada'
  end,
  null,
  null,
  s.position,
  s.completed_at,
  s.id
from public.project_steps s
join public.projects p on p.id = s.project_id and p.team_id = s.team_id
where not exists (
  select 1 from public.tasks t where t.legacy_step_id = s.id
);

update public.deliveries d
set task_id = t.id
from public.tasks t
where d.step_id = t.legacy_step_id
  and d.task_id is null;

select set_config('foco.migrating_steps', '', true);

create or replace function public.week_start_sao_paulo(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (
    (p_at at time zone 'America/Sao_Paulo')::date
    - (extract(isodow from (p_at at time zone 'America/Sao_Paulo'))::int - 1)
  );
$$;

create or replace function public.can_read_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task
      and (
        (t.project_id is not null and public.can_read_project(t.project_id))
        or (
          t.project_id is null
          and exists (
            select 1
            from public.team_members m
            where m.team_id = t.team_id
              and m.user_id = auth.uid()
              and (t.owner_id = auth.uid() or t.visibility = 'compartilhado')
          )
        )
      )
  );
$$;

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.tasks%rowtype;
  proj_visibility text;
  proj_owner uuid;
begin
  if new.parent_task_id is not null then
    select * into parent from public.tasks where id = new.parent_task_id;
    if not found or parent.parent_task_id is not null then
      raise exception 'NIVEL_3' using errcode = 'P0001';
    end if;
    if parent.team_id is distinct from new.team_id or parent.project_id is distinct from new.project_id then
      raise exception 'HIERARQUIA_INVALIDA' using errcode = '42501';
    end if;
  end if;

  if new.project_id is not null then
    new.visibility := null;
    new.priority := null;
    select visibility, owner_id into proj_visibility, proj_owner
    from public.projects where id = new.project_id;
    if proj_visibility = 'privado' and new.assignee_id is distinct from proj_owner then
      raise exception 'ATRIBUICAO_PRIVADA' using errcode = '42501';
    end if;
  else
    if new.visibility is null then
      new.visibility := 'privado';
    end if;
    if new.priority is null then
      new.priority := 'medio';
    end if;
    if new.visibility = 'privado' and new.assignee_id is distinct from new.owner_id then
      raise exception 'ATRIBUICAO_PRIVADA' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and auth.uid() = old.assignee_id
     and auth.uid() is distinct from old.owner_id
     and not exists (
       select 1 from public.projects p
       where p.id = old.project_id and p.owner_id = auth.uid()
     ) then
    if new.title is distinct from old.title
       or new.done_when is distinct from old.done_when
       or new.project_id is distinct from old.project_id
       or new.parent_task_id is distinct from old.parent_task_id
       or new.owner_id is distinct from old.owner_id
       or new.assignee_id is distinct from old.assignee_id
       or new.priority is distinct from old.priority
       or new.visibility is distinct from old.visibility
       or new.due_date is distinct from old.due_date
       or new.position is distinct from old.position
       or new.minutes is distinct from old.minutes
       or new.team_id is distinct from old.team_id then
      raise exception 'SO_STATUS' using errcode = '42501';
    end if;
  end if;

  if new.status = 'feita' and (tg_op = 'INSERT' or old.status is distinct from 'feita') and new.completed_at is null then
    new.completed_at := pg_catalog.now();
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write
before insert or update on public.tasks
for each row execute function public.tasks_before_write();

create or replace function public.award_points(
  p_team uuid,
  p_user uuid,
  p_kind text,
  p_source uuid,
  p_priority text,
  p_visibility text,
  p_task_in_project boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points int;
begin
  if p_priority not in ('importante', 'medio', 'baixo') then
    return;
  end if;
  v_points := case p_priority
    when 'importante' then case when p_task_in_project then 3 else 30 end
    when 'baixo' then case when p_task_in_project then 1 else 10 end
    else case when p_task_in_project then 2 else 20 end
  end;
  insert into public.point_events (team_id, user_id, source_kind, source_id, points, priority, visibility, week_start)
  values (
    p_team,
    p_user,
    p_kind,
    p_source,
    v_points,
    p_priority,
    p_visibility,
    public.week_start_sao_paulo(pg_catalog.now())
  )
  on conflict (source_kind, source_id) do nothing;
end;
$$;

create or replace function public.tasks_award_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_priority text;
  v_visibility text;
  v_actor uuid;
begin
  if coalesce(current_setting('foco.migrating_steps', true), '') = '1' then
    return new;
  end if;
  if new.status = 'feita' and (tg_op = 'INSERT' or old.status is distinct from 'feita') then
    v_actor := nullif(current_setting('foco.actor', true), '')::uuid;
    if v_actor is null then
      v_actor := coalesce(auth.uid(), new.assignee_id);
    end if;
    if new.project_id is null then
      perform public.award_points(new.team_id, v_actor, 'task', new.id, new.priority, new.visibility, false);
    else
      select priority, visibility into v_priority, v_visibility
      from public.projects where id = new.project_id;
      perform public.award_points(new.team_id, v_actor, 'task', new.id, v_priority, v_visibility, true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_award_after on public.tasks;
create trigger tasks_award_after
after insert or update of status on public.tasks
for each row execute function public.tasks_award_after();

create or replace function public.projects_award_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'concluido' and (tg_op = 'INSERT' or old.status is distinct from 'concluido') then
    perform public.award_points(new.team_id, new.owner_id, 'project', new.id, new.priority, new.visibility, false);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_award_after on public.projects;
create trigger projects_award_after
after insert or update of status on public.projects
for each row execute function public.projects_award_after();

create or replace function public.complete_task(p_task uuid, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_owner uuid;
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_next uuid;
begin
  if auth.uid() is not null and v_actor is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  v_owner := v_task.owner_id;
  if v_task.project_id is not null then
    select owner_id into v_owner from public.projects where id = v_task.project_id;
  end if;
  if v_actor is distinct from v_task.owner_id
     and v_actor is distinct from v_task.assignee_id
     and v_actor is distinct from v_owner then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_task.status in ('feita', 'pulada') then
    return;
  end if;
  perform set_config('foco.actor', v_actor::text, true);
  update public.tasks set status = 'feita' where id = p_task;
  perform set_config('foco.actor', '', true);

  insert into public.deliveries (team_id, user_id, project_id, step_id, task_id, title)
  values (v_task.team_id, v_actor, v_task.project_id, null, v_task.id, v_task.title);

  if v_task.project_id is not null then
    update public.projects set last_progress_at = pg_catalog.now() where id = v_task.project_id;
    select t.id into v_next
    from public.tasks t
    left join public.tasks parent on parent.id = t.parent_task_id
    where t.project_id = v_task.project_id
      and t.id <> p_task
      and t.status in ('aberta', 'em_andamento')
    order by coalesce(parent.position, t.position), case when t.parent_task_id is null then -1 else t.position end
    limit 1;
    if v_next is not null then
      update public.tasks set status = 'aberta' where project_id = v_task.project_id and status = 'em_andamento' and id <> v_next;
      update public.tasks set status = 'em_andamento' where id = v_next;
    end if;
  end if;
end;
$$;

create or replace function public.set_current_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_task from public.tasks where id = p_task;
  if not found or v_task.project_id is null then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  select owner_id into v_owner from public.projects where id = v_task.project_id;
  if v_owner is distinct from auth.uid() and v_task.owner_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.tasks
  set status = 'aberta'
  where project_id = v_task.project_id and status = 'em_andamento' and id <> p_task;
  update public.tasks set status = 'em_andamento' where id = p_task;
end;
$$;

create or replace function public.skip_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_owner uuid;
  v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  v_owner := v_task.owner_id;
  if v_task.project_id is not null then
    select owner_id into v_owner from public.projects where id = v_task.project_id;
  end if;
  if auth.uid() is distinct from v_task.owner_id
     and auth.uid() is distinct from v_task.assignee_id
     and auth.uid() is distinct from v_owner then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_task.status in ('feita', 'pulada') then
    return;
  end if;
  update public.tasks set status = 'pulada' where id = p_task;
  if v_task.project_id is not null then
    select t.id into v_next
    from public.tasks t
    left join public.tasks parent on parent.id = t.parent_task_id
    where t.project_id = v_task.project_id
      and t.id <> p_task
      and t.status in ('aberta', 'em_andamento')
    order by coalesce(parent.position, t.position), case when t.parent_task_id is null then -1 else t.position end
    limit 1;
    if v_next is not null then
      update public.tasks set status = 'aberta' where project_id = v_task.project_id and status = 'em_andamento' and id <> v_next;
      update public.tasks set status = 'em_andamento' where id = v_next;
    end if;
  end if;
end;
$$;

create or replace function public.indent_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_prev uuid;
  v_pos int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if v_task.owner_id is distinct from auth.uid() and not exists (
    select 1 from public.projects p where p.id = v_task.project_id and p.owner_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_task.parent_task_id is not null or exists (select 1 from public.tasks c where c.parent_task_id = v_task.id) then
    raise exception 'NIVEL_3' using errcode = 'P0001';
  end if;
  select id into v_prev
  from public.tasks
  where team_id = v_task.team_id
    and project_id is not distinct from v_task.project_id
    and parent_task_id is null
    and position < v_task.position
  order by position desc
  limit 1;
  if v_prev is null then
    raise exception 'SEM_IRMAO' using errcode = 'P0001';
  end if;
  select coalesce(max(position) + 1, 0) into v_pos from public.tasks where parent_task_id = v_prev;
  update public.tasks set parent_task_id = v_prev, position = v_pos where id = p_task;
end;
$$;

create or replace function public.outdent_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_parent_pos int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_task from public.tasks where id = p_task;
  if not found or v_task.parent_task_id is null then
    raise exception 'JA_RAIZ' using errcode = 'P0001';
  end if;
  if v_task.owner_id is distinct from auth.uid() and not exists (
    select 1 from public.projects p where p.id = v_task.project_id and p.owner_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select position into v_parent_pos from public.tasks where id = v_task.parent_task_id;
  update public.tasks
  set position = position + 100000
  where team_id = v_task.team_id
    and project_id is not distinct from v_task.project_id
    and parent_task_id is null
    and position > v_parent_pos;
  update public.tasks set parent_task_id = null, position = v_parent_pos + 1 where id = p_task;
  update public.tasks
  set position = position - 99999
  where team_id = v_task.team_id
    and project_id is not distinct from v_task.project_id
    and parent_task_id is null
    and position >= 100000;
end;
$$;

create or replace function public.move_task(p_task uuid, p_direction int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_other uuid;
  v_other_pos int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_direction = 0 then
    return;
  end if;
  select * into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if v_task.owner_id is distinct from auth.uid() and not exists (
    select 1 from public.projects p where p.id = v_task.project_id and p.owner_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select id, position into v_other, v_other_pos
  from public.tasks
  where team_id = v_task.team_id
    and project_id is not distinct from v_task.project_id
    and parent_task_id is not distinct from v_task.parent_task_id
    and ((p_direction < 0 and position < v_task.position) or (p_direction > 0 and position > v_task.position))
  order by case when p_direction < 0 then position end desc,
           case when p_direction > 0 then position end asc
  limit 1;
  if v_other is null then
    return;
  end if;
  update public.tasks set position = 1000000 where id = v_task.id;
  update public.tasks set position = v_task.position where id = v_other;
  update public.tasks set position = v_other_pos where id = v_task.id;
end;
$$;

create or replace function public.insert_task_after(p_after uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_id uuid;
  v_title text := left(btrim(coalesce(p_title, '')), 160);
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_title = '' then
    v_title := 'Nova tarefa';
  end if;
  select * into v_task from public.tasks where id = p_after;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if v_task.owner_id is distinct from auth.uid() and not exists (
    select 1 from public.projects p where p.id = v_task.project_id and p.owner_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.tasks
  set position = position + 100000
  where team_id = v_task.team_id
    and project_id is not distinct from v_task.project_id
    and parent_task_id is not distinct from v_task.parent_task_id
    and position > v_task.position;
  insert into public.tasks (
    team_id, project_id, parent_task_id, owner_id, assignee_id, title, status, position, priority, visibility
  )
  values (
    v_task.team_id,
    v_task.project_id,
    v_task.parent_task_id,
    auth.uid(),
    auth.uid(),
    v_title,
    'aberta',
    v_task.position + 1,
    case when v_task.project_id is null then coalesce(v_task.priority, 'medio') else null end,
    case when v_task.project_id is null then coalesce(v_task.visibility, 'privado') else null end
  )
  returning id into v_id;
  update public.tasks
  set position = position - 99999
  where team_id = v_task.team_id
    and project_id is not distinct from v_task.project_id
    and parent_task_id is not distinct from v_task.parent_task_id
    and position >= 100000;
  return v_id;
end;
$$;

create or replace function public.projects_private_assignees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'privado' and exists (
    select 1 from public.tasks t
    where t.project_id = new.id and t.assignee_id is distinct from t.owner_id
  ) then
    raise exception 'ATRIBUICAO_PRIVADA' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_private_assignees on public.projects;
create trigger projects_private_assignees
before update of visibility on public.projects
for each row execute function public.projects_private_assignees();

revoke all on function public.can_read_task(uuid) from public;
revoke all on function public.award_points(uuid, uuid, text, uuid, text, text, boolean) from public;
revoke all on function public.complete_task(uuid, uuid) from public;
revoke all on function public.set_current_task(uuid) from public;
grant execute on function public.can_read_task(uuid) to authenticated, service_role;
grant execute on function public.award_points(uuid, uuid, text, uuid, text, text, boolean) to service_role;
grant execute on function public.complete_task(uuid, uuid) to authenticated, service_role;
grant execute on function public.set_current_task(uuid) to authenticated;
revoke all on function public.skip_task(uuid) from public;
revoke all on function public.indent_task(uuid) from public;
revoke all on function public.outdent_task(uuid) from public;
revoke all on function public.move_task(uuid, int) from public;
revoke all on function public.insert_task_after(uuid, text) from public;
grant execute on function public.skip_task(uuid) to authenticated;
grant execute on function public.indent_task(uuid) to authenticated;
grant execute on function public.outdent_task(uuid) to authenticated;
grant execute on function public.move_task(uuid, int) to authenticated;
grant execute on function public.insert_task_after(uuid, text) to authenticated;

alter table public.tasks enable row level security;
alter table public.point_events enable row level security;

grant select, insert, update, delete on public.tasks to authenticated, service_role;
grant select on public.point_events to authenticated;
grant all on public.point_events to service_role;
revoke insert, update, delete on public.point_events from authenticated;
revoke all on public.tasks from anon, public;
revoke all on public.point_events from anon, public;
revoke insert, update, delete on public.project_steps from authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
for select to authenticated
using (
  (
    project_id is not null
    and exists (
      select 1
      from public.projects p
      join public.team_members m on m.team_id = p.team_id and m.user_id = (select auth.uid())
      where p.id = tasks.project_id
        and p.team_id = tasks.team_id
        and (p.owner_id = (select auth.uid()) or p.visibility = 'compartilhado')
    )
  )
  or (
    project_id is null
    and exists (
      select 1
      from public.team_members m
      where m.team_id = tasks.team_id
        and m.user_id = (select auth.uid())
        and (owner_id = (select auth.uid()) or visibility = 'compartilhado')
    )
  )
);

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
for insert to authenticated
with check (
  public.is_team_member(team_id)
  and owner_id = (select auth.uid())
  and (
    project_id is null
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.team_id = tasks.team_id and p.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
for update to authenticated
using (
  owner_id = (select auth.uid())
  or assignee_id = (select auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  or assignee_id = (select auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = (select auth.uid())
  )
);

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
for delete to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = (select auth.uid())
  )
);

drop policy if exists point_events_select on public.point_events;
create policy point_events_select on public.point_events
for select to authenticated
using (
  user_id = (select auth.uid())
  or (visibility = 'compartilhado' and public.is_team_member(team_id))
);

drop policy if exists deliveries_select on public.deliveries;
create policy deliveries_select on public.deliveries
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    public.is_team_member(team_id)
    and (
      exists (
        select 1 from public.projects p
        where p.id = deliveries.project_id
          and p.team_id = deliveries.team_id
          and p.visibility = 'compartilhado'
      )
      or exists (
        select 1 from public.tasks t
        where t.id = deliveries.task_id
          and t.team_id = deliveries.team_id
          and t.project_id is null
          and t.visibility = 'compartilhado'
      )
    )
  )
);
