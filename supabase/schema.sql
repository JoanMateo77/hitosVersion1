-- ============================================================================
--  Hito — esquema de base de datos
--  Cómo correrlo: Supabase Dashboard → SQL Editor → New query → pegá TODO esto
--  → Run. Es idempotente: lo podés correr de nuevo sin romper nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PERFILES  (1:1 con auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  focus_mode   text not null default 'single'
               check (focus_mode in ('single', 'multi')),
  primary_niche text
               check (primary_niche in (
                 'salud','finanzas','carrera','aprendizaje',
                 'relaciones','creatividad','bienestar','otra')),
  onboarded_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) METAS
-- ----------------------------------------------------------------------------
create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  why              text,
  target_date      date,
  area             text not null default 'otra'
                   check (area in (
                     'salud','finanzas','carrera','aprendizaje',
                     'relaciones','creatividad','bienestar','otra')),
  success_criteria text,
  template_key     text not null default 'personalizada',
  status           text not null default 'active'
                   check (status in ('active','paused','done','archived')),
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index if not exists goals_user_status_idx on public.goals (user_id, status);

-- ----------------------------------------------------------------------------
-- 3) TAREAS  (ítems del plan del día)
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  goal_id    uuid references public.goals (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 300),
  plan_date  date not null,
  source     text not null default 'user'
             check (source in ('user','goal','suggested')),
  status     text not null default 'pending'
             check (status in ('pending','done','postponed')),
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists tasks_user_date_idx on public.tasks (user_id, plan_date);
-- Regla de producto "una acción por meta por día": evita duplicados al generar.
create unique index if not exists tasks_goal_day_uniq
  on public.tasks (goal_id, plan_date) where goal_id is not null;

-- ----------------------------------------------------------------------------
-- 4) ROW LEVEL SECURITY  (cada usuario solo ve y toca lo suyo)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.goals    enable row level security;
alter table public.tasks    enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists goals_all_own on public.goals;
create policy goals_all_own on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tasks_all_own on public.tasks;
create policy tasks_all_own on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5) Crear el perfil automáticamente cuando se registra un usuario
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6) AGENDA / CALENDARIO  (Sección 4 — eventos del usuario)
--    goal_id opcional: si la meta se borra, el evento se conserva sin vínculo.
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  goal_id     uuid references public.goals (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 200),
  notes       text,
  event_date  date not null,
  start_time  time,                       -- null cuando es de día completo
  end_time    time,
  all_day     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists events_user_date_idx on public.events (user_id, event_date);

alter table public.events enable row level security;
drop policy if exists events_all_own on public.events;
create policy events_all_own on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7) PROGRESO DE HITOS + REVISIÓN
--    current_milestone: el "camino"/Roadmap deja de ser decorativo.
--    last_reviewed_at: alimenta la revisión guiada (Sección 6).
-- ----------------------------------------------------------------------------
alter table public.goals
  add column if not exists current_milestone smallint not null default 0;
alter table public.goals
  add column if not exists last_reviewed_at timestamptz;
