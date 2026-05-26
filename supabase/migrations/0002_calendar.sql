-- ============================================================================
--  Hito — migración 0002: Calendario + progreso de hitos
--  Cómo correrla: Supabase Dashboard → SQL Editor → New query → pegá TODO esto
--  → Run. Es idempotente y aditiva: no toca datos existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) EVENTOS  (calendario propio del usuario)
--    Un evento puede o no estar ligado a una meta. Si la meta se borra, el
--    evento se conserva (goal_id -> null) en vez de desaparecer.
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
-- 2) PROGRESO DE HITOS  (el "camino"/Roadmap deja de ser decorativo)
--    Índice del hito actual de cada meta dentro de su plantilla.
-- ----------------------------------------------------------------------------
alter table public.goals
  add column if not exists current_milestone smallint not null default 0;
