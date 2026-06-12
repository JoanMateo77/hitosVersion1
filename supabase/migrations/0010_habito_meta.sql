-- Vincula opcionalmente un hábito a una meta: el hábito le suma contexto
-- (visible en el detalle de la meta y en la revisión semanal). Borrar la
-- meta NO borra el hábito: queda como hábito suelto (set null).
alter table public.habits
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create index if not exists habits_goal_id_idx on public.habits(goal_id);
