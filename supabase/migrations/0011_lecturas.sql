-- ============================================================================
-- 0011 — Lecturas de Aprender: el progreso deja de vivir solo en un dispositivo.
-- ============================================================================

create table if not exists public.lesson_reads (
  user_id    uuid not null references auth.users (id) on delete cascade,
  lesson_id  text not null,
  read_at    timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.lesson_reads enable row level security;
drop policy if exists lesson_reads_all_own on public.lesson_reads;
create policy lesson_reads_all_own on public.lesson_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
