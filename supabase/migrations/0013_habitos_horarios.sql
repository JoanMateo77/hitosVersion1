-- ============================================================================
-- 0013 — Hábitos con horario: momentos del día y repeticiones.
-- ============================================================================

-- 1) habits.times: lista de horas "HH:MM" ordenadas. CADA hora es una
--    repetición del hábito en el día ("beber agua" 5 veces = 5 horas).
--    NULL o vacío = comportamiento clásico: una vez al día, sin hora fija.
alter table public.habits
  add column if not exists times text[];

-- 2) habit_checks.slot: a qué repetición corresponde la marca. El slot i
--    corresponde a times[i]; los hábitos sin times usan siempre slot 0, así
--    que las marcas existentes (default 0) quedan compatibles sin backfill.
alter table public.habit_checks
  add column if not exists slot smallint not null default 0;

-- 3) La unicidad pasa de (habit_id, date) a (habit_id, date, slot): un hábito
--    puede tener varias marcas el mismo día, una por repetición.
--    (habit_checks_habit_id_date_key es el nombre que Postgres le dio al
--    unique inline de 0009; el drop del nuevo hace la migración re-ejecutable.)
alter table public.habit_checks
  drop constraint if exists habit_checks_habit_id_date_key;
alter table public.habit_checks
  drop constraint if exists habit_checks_habit_date_slot_key;
alter table public.habit_checks
  add constraint habit_checks_habit_date_slot_key unique (habit_id, date, slot);
