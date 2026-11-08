-- ============================================================================
-- 0022 — Área (color) de eventos y tareas sueltos
--        (spec docs/superpowers/specs/2026-11-08-color-area-y-tour-ia-design.md).
-- La IA de "Organizar el día" elige el área de lo que crea, y el editor de
-- eventos la deja cambiar. null = sin área (datos de antes): la app elige un
-- color estable por el título.
-- Idempotente: se puede correr más de una vez en el SQL editor de Supabase.
-- La RLS de events y tasks (cada quien sus filas) ya cubre las columnas nuevas:
-- esta migración no abre ningún acceso.
-- ============================================================================

alter table public.events add column if not exists area text;
alter table public.events drop constraint if exists events_area_check;
alter table public.events
  add constraint events_area_check
  check (area is null or area in (
    'salud','finanzas','carrera','aprendizaje','relaciones','creatividad','bienestar','otra'
  ));

alter table public.tasks add column if not exists area text;
alter table public.tasks drop constraint if exists tasks_area_check;
alter table public.tasks
  add constraint tasks_area_check
  check (area is null or area in (
    'salud','finanzas','carrera','aprendizaje','relaciones','creatividad','bienestar','otra'
  ));
