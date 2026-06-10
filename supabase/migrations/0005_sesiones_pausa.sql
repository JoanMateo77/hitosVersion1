-- ============================================================================
-- 0005 — Cronómetro con pausa + índice de generación (Fase 2). Idempotente.
-- Cómo correrla: Supabase Dashboard → SQL Editor → pegar TODO → Run.
-- ============================================================================

-- 1) Pausa del cronómetro por timestamps (sobrevive a cerrar la app)
alter table public.sessions
  add column if not exists paused_at timestamptz;
alter table public.sessions
  add column if not exists paused_total_seconds int not null default 0
    check (paused_total_seconds >= 0);

-- 2) El índice único PARCIAL de 0004 no puede usarse con ON CONFLICT desde la
--    API (la inferencia exige el predicado). Lo reemplaza un único COMPLETO
--    equivalente: los NULL de schedule_id no chocan entre sí (sesiones
--    espontáneas ilimitadas) y los bloques siguen generando UNA sesión por día.
drop index if exists public.sessions_schedule_day_uniq;
create unique index if not exists sessions_schedule_day_uniq
  on public.sessions (schedule_id, session_date);
