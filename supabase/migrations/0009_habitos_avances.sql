-- ============================================================================
-- 0009 — Hábitos diarios + diario de avances en sesiones.
-- ============================================================================

-- 1) Hábitos: rutinas de un toque, separadas de las metas (sin etapas ni cronómetro)
create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  area        text not null default 'otra',
  -- Días de la semana en los que aplica (lunes=0 … domingo=6). Vacío = todos.
  weekdays    smallint[] not null default '{}',
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.habits enable row level security;
drop policy if exists habits_all_own on public.habits;
create policy habits_all_own on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Marcas diarias: una fila por hábito y día cumplido
create table if not exists public.habit_checks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  habit_id   uuid not null references public.habits (id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);
alter table public.habit_checks enable row level security;
drop policy if exists habit_checks_all_own on public.habit_checks;
create policy habit_checks_all_own on public.habit_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists habit_checks_user_date_idx
  on public.habit_checks (user_id, date);

-- 3) Diario de avances: qué lograste en cada sesión (opcional, texto corto)
alter table public.sessions
  add column if not exists accomplishment text;
