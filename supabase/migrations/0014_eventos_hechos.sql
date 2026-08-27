-- ============================================================================
-- 0014 — Eventos que se pueden tachar: la agenda como checklist.
-- ============================================================================

-- done_at: cuándo se marcó el evento como hecho. NULL = pendiente. Permite
-- tachar las cosas del día desde la agenda y desde el cronómetro de sesión
-- (bloques de meta con su plan adentro). Sin backfill: lo viejo queda pendiente.
alter table public.events
  add column if not exists done_at timestamptz;
