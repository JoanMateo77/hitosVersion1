-- ============================================================================
-- 0017 — Metas flexibles, notas y resumen diario: sesiones "saltadas",
--        hora del resumen diario por push y tabla de notas.
-- ============================================================================

-- 1) Sesiones saltadas: una sesión que decides no hacer sin que cuente como
--    fallo. Se vuelve a crear el check de estado con 'skipped' añadido
--    (declarado en línea en 0004, por eso su nombre por defecto).
alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions
  add constraint sessions_status_check
  check (status in ('pending','running','done','partial','missed','unconfirmed','skipped'));

-- 2) Resumen diario por push: hora elegida (NULL = desactivado) y el último
--    día en que se envió, para no repetirlo.
alter table public.profiles
  add column if not exists daily_digest_time time;
alter table public.profiles
  add column if not exists daily_digest_sent_on date;

-- 3) Notas: captura rápida (texto o checklist) que vive en la bandeja hasta
--    asignarla a una meta, un área o Ideas.
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  body        text not null default '',
  items       jsonb,                 -- checklist: [{ "text": "...", "done": false }]; null = nota de texto
  place       text not null default 'inbox' check (place in ('inbox','goal','area','ideas')),
  goal_id     uuid references public.goals (id) on delete set null,
  area        text,
  pinned      boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.notes enable row level security;
drop policy if exists notes_all_own on public.notes;
create policy notes_all_own on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists notes_user_archived_idx
  on public.notes (user_id, archived_at);

-- Sin trigger de updated_at: el repo no tiene una función reutilizable, así
-- que el servicio de notas lo actualiza en cada escritura.
