-- ============================================================================
--  Hito — migración 0003: revisión guiada (Sección 6)
--  Cómo correrla: Supabase Dashboard → SQL Editor → New query → pegá esto → Run.
--  Aditiva e idempotente.
-- ============================================================================

-- Cuándo se revisó por última vez cada meta (alimenta la "revisión semanal
-- guiada"; se combina con reviewEveryDays de la plantilla para saber qué toca).
alter table public.goals
  add column if not exists last_reviewed_at timestamptz;
