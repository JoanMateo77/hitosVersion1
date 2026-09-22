-- ============================================================================
-- 0016 — Identidad del hábito: icono, color, unidad, veces al día, pausa
--        y "saltar hoy" (días que no cuentan).
-- ============================================================================

-- 1) Identidad visual: cada hábito se reconoce por su azulejo (emoji + color).
--    NULL = todavía sin elegir; la app cae al icono/color de su área.
alter table public.habits
  add column if not exists icon text;            -- emoji, p. ej. '💧'
alter table public.habits
  add column if not exists color text;           -- clave de paleta: cyan, green, blue…

-- 2) Unidad opcional de la repetición ("vasos", "páginas"): solo texto para
--    mostrar "1 de 5 vasos". NULL = sin unidad.
alter table public.habits
  add column if not exists unit text;

-- 3) times_per_day: repeticiones del día (el objetivo). A partir de aquí
--    `times` son SOLO las horas de recordatorio y puede tener otra cantidad:
--    la repetición i tiene hora únicamente si existe times[i].
alter table public.habits
  add column if not exists times_per_day smallint not null default 1;

-- 4) Pausa: mientras hoy <= paused_until el hábito no aplica (no sale en Hoy
--    ni en Agenda y no rompe la racha). Al pasar la fecha vuelve solo.
alter table public.habits
  add column if not exists paused_until date;

-- Backfill: los hábitos con horas ya eran "N veces al día" (una por hora).
-- Solo toca las filas que siguen en el default (1) y tienen más de una hora,
-- para que volver a correr la migración no pise valores ya elegidos.
update public.habits
   set times_per_day = greatest(1, coalesce(array_length(times, 1), 1))
 where times_per_day = 1
   and coalesce(array_length(times, 1), 1) > 1;

-- 5) "Saltar hoy": una fila por hábito y fecha saltada. Ese día no es
--    aplicable para el hábito (racha intacta, no aparece en "Por hacer").
--    Se deshace borrando la fila.
create table if not exists public.habit_skips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  habit_id   uuid not null references public.habits (id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);
alter table public.habit_skips enable row level security;
drop policy if exists habit_skips_all_own on public.habit_skips;
create policy habit_skips_all_own on public.habit_skips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists habit_skips_user_date_idx
  on public.habit_skips (user_id, date);
