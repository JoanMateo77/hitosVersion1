-- ============================================================================
-- 0015 — Reorganizar un día: horas de hábitos distintas SOLO para una fecha.
-- ============================================================================

-- Un día la rutina cambia (viaje, plan distinto) y las repeticiones del hábito
-- se mueven de hora sin tocar su horario de siempre. Una fila por hábito y
-- fecha; times reemplaza las horas del hábito ese día (mismo número de
-- repeticiones: solo se reorganizan).
create table if not exists public.habit_day_overrides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  habit_id   uuid not null references public.habits (id) on delete cascade,
  date       date not null,
  times      text[] not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);
alter table public.habit_day_overrides enable row level security;
drop policy if exists habit_day_overrides_all_own on public.habit_day_overrides;
create policy habit_day_overrides_all_own on public.habit_day_overrides
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists habit_day_overrides_user_date_idx
  on public.habit_day_overrides (user_id, date);
