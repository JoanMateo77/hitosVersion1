-- ============================================================================
-- 0004 — Compromiso medible (Fase 1 del spec 2026-06-10)
-- Cómo correrla: Supabase Dashboard → SQL Editor → pegar TODO → Run.
-- Idempotente. NO toca goals.current_milestone (se elimina en Fase 2).
-- ============================================================================

-- 1) HITOS propios de cada meta (dejan de ser texto de plantilla)
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  position    int  not null check (position >= 0),
  target_date date,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists milestones_goal_idx on public.milestones (goal_id, position);

-- 2) COMPROMISO: una fila por bloque/momento (un día puede tener varios)
--    weekday: lunes=0 … domingo=6
create table if not exists public.goal_schedule (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  target_kind  text not null default 'time' check (target_kind in ('time','count')),
  target_value int  not null check (target_value > 0),
  unit         text,
  start_time   time,
  created_at   timestamptz not null default now()
);
create index if not exists goal_schedule_goal_idx on public.goal_schedule (goal_id);
create index if not exists goal_schedule_user_idx on public.goal_schedule (user_id, weekday);

-- 3) SESIONES (la Fase 2 las usa; la tabla queda lista desde ya)
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  schedule_id  uuid references public.goal_schedule (id) on delete set null,
  session_date date not null,
  target_kind  text not null default 'time' check (target_kind in ('time','count')),
  target_value int  not null check (target_value > 0),
  unit         text,
  planned_time time,
  started_at   timestamptz,
  ended_at     timestamptz,
  actual_value int,
  status       text not null default 'pending'
               check (status in ('pending','running','done','partial','missed','unconfirmed')),
  created_at   timestamptz not null default now()
);
create index if not exists sessions_user_date_idx on public.sessions (user_id, session_date);
-- Idempotencia de generación diaria: un bloque genera UNA sesión por día.
create unique index if not exists sessions_schedule_day_uniq
  on public.sessions (schedule_id, session_date) where schedule_id is not null;

-- 4) PERFIL: defaults del onboarding nuevo + meta prioritaria
alter table public.profiles
  add column if not exists preferred_moment text
    check (preferred_moment in ('morning','midday','evening'));
alter table public.profiles
  add column if not exists default_session_minutes int
    check (default_session_minutes > 0);
alter table public.profiles
  add column if not exists priority_goal_id uuid references public.goals (id) on delete set null;

-- 5) RLS
alter table public.milestones    enable row level security;
alter table public.goal_schedule enable row level security;
alter table public.sessions      enable row level security;

drop policy if exists milestones_all_own on public.milestones;
create policy milestones_all_own on public.milestones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists goal_schedule_all_own on public.goal_schedule;
create policy goal_schedule_all_own on public.goal_schedule
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sessions_all_own on public.sessions;
create policy sessions_all_own on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
