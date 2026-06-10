-- ============================================================================
-- 0006 — Contract (Fase 2): muere el contador manual de progreso.
-- Correr SOLO después de deployar el código de la Fase 2 (ya ningún código lo
-- lee: el progreso se calcula de milestones + sessions).
-- ============================================================================
alter table public.goals drop column if exists current_milestone;
