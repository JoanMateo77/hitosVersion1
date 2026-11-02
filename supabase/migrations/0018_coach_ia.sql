-- ============================================================================
-- 0018 — Coach con IA: el plan que propuso la IA, las respuestas de la persona
--        y la conversación con el coach de cada meta.
-- ============================================================================

-- 1) Plan de la IA (GoalPlan, schemaVersion 1) y respuestas a sus preguntas.
--    Sirven para mostrar el detalle de cada etapa (objetivo, señal de éxito,
--    primeras acciones) y para que el coach recuerde el contexto después.
alter table public.goals
  add column if not exists ai_plan jsonb;
alter table public.goals
  add column if not exists ai_answers jsonb;

-- 2) Conversación con el coach de una meta. `proposal` guarda los cambios que
--    el coach propuso en ese turno y si la persona los aplicó.
create table if not exists public.goal_coach_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  goal_id     uuid not null references public.goals (id) on delete cascade,
  role        text not null check (role in ('user','coach')),
  body        text not null check (char_length(body) between 1 and 2000),
  proposal    jsonb,
  created_at  timestamptz not null default now()
);
alter table public.goal_coach_messages enable row level security;

-- Solo la dueña o el dueño de la meta lee y escribe su conversación; al
-- insertar se exige además que la meta sea suya (no basta con el user_id).
drop policy if exists goal_coach_messages_select_own on public.goal_coach_messages;
create policy goal_coach_messages_select_own on public.goal_coach_messages
  for select using (auth.uid() = user_id);

drop policy if exists goal_coach_messages_insert_own on public.goal_coach_messages;
create policy goal_coach_messages_insert_own on public.goal_coach_messages
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );

drop policy if exists goal_coach_messages_update_own on public.goal_coach_messages;
create policy goal_coach_messages_update_own on public.goal_coach_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists goal_coach_messages_delete_own on public.goal_coach_messages;
create policy goal_coach_messages_delete_own on public.goal_coach_messages
  for delete using (auth.uid() = user_id);

create index if not exists goal_coach_messages_goal_idx
  on public.goal_coach_messages (goal_id, created_at);
