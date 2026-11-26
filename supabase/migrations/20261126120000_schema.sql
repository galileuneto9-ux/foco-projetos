-- Foco nos Projetos — esquema inicial.
-- A ideia e os passos ficam em projects / project_steps (RLS do dono).
-- ai_runs guarda só auditoria de custo, sem copiar o texto da ideia.

create extension if not exists pgcrypto with schema public;

-- updated_at ----------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public;

-- teams ---------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  morning_hour time not null default '08:00',
  evening_hour time not null default '18:00',
  stall_days int not null default 5 check (stall_days between 1 and 30),
  weekly_checkin_weekday int not null default 5 check (weekly_checkin_weekday between 0 and 6),
  weekly_checkin_hour time not null default '16:00',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger teams_touch
before update on public.teams
for each row execute function public.touch_updated_at();

-- team_members --------------------------------------------------------------

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  notify_google_chat boolean not null default false,
  notify_whatsapp boolean not null default false,
  google_chat_space_id text,
  whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^55[0-9]{10,11}$'),
  whatsapp_opted_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id),
  constraint team_members_whatsapp_optin check (
    notify_whatsapp = false
    or (whatsapp_e164 is not null and whatsapp_opted_in_at is not null)
  )
);

create unique index team_members_one_team_per_user_idx
  on public.team_members (user_id);

create unique index team_members_one_owner_idx
  on public.team_members (team_id)
  where role = 'owner';

-- google oauth (metadados). O refresh token não fica nesta tabela.

create table public.google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  google_email text not null check (char_length(btrim(google_email)) between 3 and 200),
  refresh_token_secret_ref text not null,
  personal_space_id text not null,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id)
);

create trigger google_oauth_connections_touch
before update on public.google_oauth_connections
for each row execute function public.touch_updated_at();

-- ciphertext só no servidor. Sem policy para authenticated.

create table public.google_oauth_secrets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger google_oauth_secrets_touch
before update on public.google_oauth_secrets
for each row execute function public.touch_updated_at();

create table public.whatsapp_connection (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams (id) on delete cascade,
  provider text not null default 'evolution_baileys',
  evolution_instance text not null,
  connected_number_e164 text check (
    connected_number_e164 is null or connected_number_e164 ~ '^55[0-9]{10,11}$'
  ),
  status text not null default 'disconnected' check (
    status in ('disconnected', 'qr', 'open', 'close')
  ),
  recommended_secondary_sim boolean not null default true,
  last_qr_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id)
);

create trigger whatsapp_connection_touch
before update on public.whatsapp_connection
for each row execute function public.touch_updated_at();

-- projects ------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  brief text check (brief is null or char_length(brief) <= 2000),
  status text not null default 'fila' check (
    status in ('fila', 'ativo', 'pausado', 'concluido', 'desistido')
  ),
  visibility text not null default 'privado' check (visibility in ('privado', 'compartilhado')),
  board_flag text not null default 'no_prazo' check (board_flag in ('no_prazo', 'atrasado', 'travado')),
  next_milestone text check (next_milestone is null or char_length(next_milestone) <= 200),
  next_milestone_on date,
  last_progress_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id),
  constraint projects_owner_member_fkey
    foreign key (team_id, owner_id)
    references public.team_members (team_id, user_id)
    on delete cascade
);

create index projects_owner_status_idx on public.projects (owner_id, status);
create index projects_team_visibility_idx on public.projects (team_id, visibility);

create table public.project_steps (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  done_when text not null check (char_length(btrim(done_when)) between 1 and 400),
  minutes int not null check (minutes between 15 and 30),
  status text not null default 'pendente' check (status in ('pendente', 'atual', 'feito', 'pulado')),
  position int not null default 0 check (position >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id),
  constraint project_steps_project_fkey
    foreign key (team_id, project_id)
    references public.projects (team_id, id)
    on delete cascade
);

create index project_steps_project_idx on public.project_steps (project_id, position);

create unique index project_steps_one_current_idx
  on public.project_steps (project_id)
  where status = 'atual';

create trigger project_steps_touch
before update on public.project_steps
for each row execute function public.touch_updated_at();

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  project_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id),
  constraint project_notes_project_fkey
    foreign key (team_id, project_id)
    references public.projects (team_id, id)
    on delete cascade,
  constraint project_notes_author_fkey
    foreign key (team_id, author_id)
    references public.team_members (team_id, user_id)
    on delete cascade
);

create trigger project_notes_touch
before update on public.project_notes
for each row execute function public.touch_updated_at();

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  project_id uuid not null,
  step_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  completed_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_member_fkey
    foreign key (team_id, user_id)
    references public.team_members (team_id, user_id)
    on delete cascade,
  constraint deliveries_project_fkey
    foreign key (team_id, project_id)
    references public.projects (team_id, id)
    on delete cascade,
  constraint deliveries_step_fkey
    foreign key (team_id, step_id)
    references public.project_steps (team_id, id)
    on delete set null (step_id)
);

create index deliveries_user_completed_idx on public.deliveries (user_id, completed_at desc);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('diario_manha', 'diario_noite', 'alerta_parado', 'semanal')),
  for_date date not null,
  project_id uuid,
  project_key uuid generated always as (
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored,
  channel text not null check (channel in ('app', 'google_chat', 'whatsapp')),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  status text not null default 'enviado' check (status in ('enviado', 'respondido', 'expirado', 'falhou')),
  answer text check (answer is null or answer in ('fiz', 'nao_fiz', 'travado', 'texto')),
  answer_text text check (answer_text is null or char_length(answer_text) <= 1000),
  sent_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkins_member_fkey
    foreign key (team_id, user_id)
    references public.team_members (team_id, user_id)
    on delete cascade,
  constraint checkins_project_fkey
    foreign key (team_id, project_id)
    references public.projects (team_id, id)
    on delete cascade,
  constraint checkins_idempotent unique (user_id, kind, for_date, project_key)
);

create index checkins_user_date_idx on public.checkins (user_id, for_date, kind);

create trigger checkins_touch
before update on public.checkins
for each row execute function public.touch_updated_at();

create table public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  week_start date not null,
  body text not null check (char_length(body) between 1 and 8000),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, week_start)
);

create trigger weekly_summaries_touch
before update on public.weekly_summaries
for each row execute function public.touch_updated_at();

create table public.nudge_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  checkin_id uuid not null,
  channel text not null check (channel in ('app', 'google_chat', 'whatsapp')),
  provider_message_id text,
  ok boolean not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nudge_log_member_fkey
    foreign key (team_id, user_id)
    references public.team_members (team_id, user_id)
    on delete cascade,
  constraint nudge_log_checkin_fkey
    foreign key (checkin_id)
    references public.checkins (id)
    on delete cascade
);

create index nudge_log_checkin_idx on public.nudge_log (checkin_id, channel, ok);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  project_id uuid,
  provider text not null,
  input_tokens int,
  output_tokens int,
  input_chars int,
  output_steps int,
  status text not null check (status in ('ok', 'falhou', 'recusado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_runs_member_fkey
    foreign key (team_id, user_id)
    references public.team_members (team_id, user_id)
    on delete cascade,
  constraint ai_runs_project_fkey
    foreign key (team_id, project_id)
    references public.projects (team_id, id)
    on delete set null
);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 200),
  token_hash text not null unique,
  invited_by uuid not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id),
  constraint team_invites_inviter_fkey
    foreign key (team_id, invited_by)
    references public.team_members (team_id, user_id)
    on delete cascade
);

create index team_invites_team_idx on public.team_invites (team_id, email);

create trigger team_invites_touch
before update on public.team_invites
for each row execute function public.touch_updated_at();

-- recibo de webhook: só o servidor (service role). Sem texto da mensagem.

create table public.webhook_receipts (
  id text primary key,
  team_id uuid references public.teams (id) on delete cascade,
  received_at timestamptz not null default now()
);

-- funções de autorização ----------------------------------------------------

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members m
    where m.team_id = p_team
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members m
    where m.team_id = p_team
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.can_read_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.team_members m
      on m.team_id = p.team_id
     and m.user_id = auth.uid()
    where p.id = p_project
      and (p.owner_id = auth.uid() or p.visibility = 'compartilhado')
  );
$$;

revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.is_team_owner(uuid) from public;
revoke all on function public.can_read_project(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;
grant execute on function public.is_team_owner(uuid) to authenticated, service_role;
grant execute on function public.can_read_project(uuid) to authenticated, service_role;

-- teto de 3 ativos ----------------------------------------------------------

create or replace function public.projects_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count int;
begin
  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id then
      raise exception 'TEAM_IMMUTABLE' using errcode = '42501';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'OWNER_IMMUTABLE' using errcode = '42501';
    end if;
  end if;

  if new.status = 'ativo'
     and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from 'ativo')) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text, 0));
    select count(*) into active_count
    from public.projects
    where owner_id = new.owner_id
      and status = 'ativo'
      and id is distinct from new.id;
    if active_count >= 3 then
      raise exception 'TETO_ATIVOS: você já tem 3 projetos ativos. Pause, conclua ou devolva um à fila antes de ativar outro.'
        using errcode = 'P0001';
    end if;
    if new.activated_at is null then
      new.activated_at := pg_catalog.now();
    end if;
  end if;

  if new.status = 'concluido'
     and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from 'concluido'))
     and new.completed_at is null then
    new.completed_at := pg_catalog.now();
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.projects_before_write() from public;

create trigger projects_before_write
before insert or update on public.projects
for each row execute function public.projects_before_write();

create or replace function public.team_members_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'OWNER_PERMANENTE' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role is distinct from 'owner' then
      raise exception 'OWNER_PERMANENTE' using errcode = '42501';
    end if;
    if new.team_id is distinct from old.team_id or new.user_id is distinct from old.user_id then
      raise exception 'MEMBRO_IMMUTABLE' using errcode = '42501';
    end if;
    if not public.is_team_owner(old.team_id) then
      if new.role is distinct from old.role
         or new.google_chat_space_id is distinct from old.google_chat_space_id then
        raise exception 'CAMPO_PROTEGIDO' using errcode = '42501';
      end if;
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.team_members_before_write() from public;

create trigger team_members_before_write
before insert or update or delete on public.team_members
for each row execute function public.team_members_before_write();

create or replace function public.checkins_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.team_id is distinct from old.team_id
       or new.kind is distinct from old.kind
       or new.for_date is distinct from old.for_date
       or new.project_id is distinct from old.project_id
       or new.prompt is distinct from old.prompt then
      raise exception 'CHECKIN_IMMUTABLE' using errcode = '42501';
    end if;
  end if;

  if new.project_id is not null then
    if not exists (
      select 1
      from public.projects p
      where p.id = new.project_id
        and p.team_id = new.team_id
        and p.owner_id = new.user_id
    ) then
      raise exception 'PROJETO_ALHEIO' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function public.checkins_before_write() from public;

create trigger checkins_before_write
before insert or update on public.checkins
for each row execute function public.checkins_before_write();

-- RPCs ----------------------------------------------------------------------

create or replace function public.create_team(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_name text := btrim(p_name);
  v_display text := btrim(p_display_name);
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80
     or char_length(v_display) < 2 or char_length(v_display) > 80 then
    raise exception 'NOME_INVALIDO' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_members where user_id = v_uid) then
    raise exception 'JA_TEM_TIME' using errcode = 'P0001';
  end if;

  insert into public.teams (name, created_by)
  values (v_name, v_uid)
  returning id into v_team;

  insert into public.team_members (team_id, user_id, role, display_name)
  values (v_team, v_uid, 'owner', v_display);

  return v_team;
end;
$$;

create or replace function public.activate_project(p_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_project from public.projects where id = p_project;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if v_project.owner_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_project.status = 'ativo' then
    return;
  end if;
  if v_project.status not in ('fila', 'pausado') then
    raise exception 'STATUS_INVALIDO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_project.owner_id::text, 0));
  select count(*) into v_count
  from public.projects
  where owner_id = v_project.owner_id
    and status = 'ativo';
  if v_count >= 3 then
    raise exception 'TETO_ATIVOS: você já tem 3 projetos ativos. Pause, conclua ou devolva um à fila antes de ativar outro.'
      using errcode = 'P0001';
  end if;

  update public.projects
  set status = 'ativo'
  where id = p_project;
end;
$$;

create or replace function public.set_current_step(p_step uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.project_steps%rowtype;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_step from public.project_steps where id = p_step;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  select owner_id into v_owner from public.projects where id = v_step.project_id;
  if v_owner is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_step.status not in ('pendente', 'atual') then
    raise exception 'PASSO_INVALIDO' using errcode = '22023';
  end if;

  update public.project_steps
  set status = 'pendente'
  where project_id = v_step.project_id
    and status = 'atual'
    and id <> p_step;

  update public.project_steps
  set status = 'atual'
  where id = p_step;
end;
$$;

create or replace function public.complete_step(p_step uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.project_steps%rowtype;
  v_project public.projects%rowtype;
  v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_step from public.project_steps where id = p_step;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  select * into v_project from public.projects where id = v_step.project_id;
  if v_project.owner_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_step.status not in ('pendente', 'atual') then
    raise exception 'PASSO_INVALIDO' using errcode = '22023';
  end if;

  update public.project_steps
  set status = 'feito',
      completed_at = pg_catalog.now()
  where id = p_step;

  insert into public.deliveries (team_id, user_id, project_id, step_id, title, completed_at)
  values (v_step.team_id, auth.uid(), v_step.project_id, v_step.id, v_step.title, pg_catalog.now());

  update public.projects
  set last_progress_at = pg_catalog.now()
  where id = v_step.project_id;

  if not exists (
    select 1 from public.project_steps
    where project_id = v_step.project_id and status = 'atual'
  ) then
    select id into v_next
    from public.project_steps
    where project_id = v_step.project_id
      and status = 'pendente'
    order by position, created_at
    limit 1;
    if v_next is not null then
      update public.project_steps
      set status = 'atual'
      where id = v_next;
    end if;
  end if;
end;
$$;

create or replace function public.skip_step(p_step uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.project_steps%rowtype;
  v_owner uuid;
  v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_step from public.project_steps where id = p_step;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  select owner_id into v_owner from public.projects where id = v_step.project_id;
  if v_owner is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_step.status not in ('pendente', 'atual') then
    raise exception 'PASSO_INVALIDO' using errcode = '22023';
  end if;

  update public.project_steps
  set status = 'pulado'
  where id = p_step;

  if not exists (
    select 1 from public.project_steps
    where project_id = v_step.project_id and status = 'atual'
  ) then
    select id into v_next
    from public.project_steps
    where project_id = v_step.project_id
      and status = 'pendente'
    order by position, created_at
    limit 1;
    if v_next is not null then
      update public.project_steps
      set status = 'atual'
      where id = v_next;
    end if;
  end if;
end;
$$;

revoke all on function public.create_team(text, text) from public;
revoke all on function public.activate_project(uuid) from public;
revoke all on function public.set_current_step(uuid) from public;
revoke all on function public.complete_step(uuid) from public;
revoke all on function public.skip_step(uuid) from public;

grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.activate_project(uuid) to authenticated;
grant execute on function public.set_current_step(uuid) to authenticated;
grant execute on function public.complete_step(uuid) to authenticated;
grant execute on function public.skip_step(uuid) to authenticated;
