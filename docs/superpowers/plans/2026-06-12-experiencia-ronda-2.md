# Experiencia ronda 2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuatro mejoras de experiencia que cierran lo que quedó del análisis: Progreso muestra los hábitos (último silo), el progreso de Aprender se vuelve durable (BD multi-dispositivo), el hábito de hoy se marca desde su meta, y los errores de Agenda/Hábitos pasan por `friendlyError` + enlace de ajuste en "Meta creada".

**Architecture:** Una migración nueva (0011 `lesson_reads`, estilo de 0009: RLS `all_own`, PK compuesta) con sync suave: localStorage sigue siendo el cache y la BD la verdad compartida; todo degrada con gracia si la migración no corrió. El resto reusa piezas existentes (`habitWeek`, `habitStreak`, `setHabitCheck`, `friendlyError`).

**Verificación:** `npm run typecheck && npm test` por tarea; commit por tarea.

---

### Task R1: Progreso muestra tus hábitos

**Files:** Modify `src/screens/Progress.tsx`.

- [ ] Cargar en el useAsyncData (con catch → vacío): `listHabits(userId)` y `listHabitChecksInRange(userId, addDays(today, -(HISTORY_DAYS-1)), today)`. Derivar `activeHabits`, sets de fechas por hábito, `habitWeek` (semana en curso) y `habitStreak` por hábito.
- [ ] Sección "Tus hábitos" dentro de `.progress-grid`, después de "Tus metas": una fila por hábito con título (+ tag de meta vinculada si existe), mini-cadena de 7 puntos (clases `weekstrip__dot--*`, mapeo due→future como en Habits.tsx) y chip de racha si ≥2. Click → `/habitos`.
- [ ] typecheck + tests → commit `feat(progreso): tus hábitos también cuentan aquí — semana y racha por hábito`

### Task R2: Aprender durable (migración 0011 + servicio + sync)

**Files:** Create `supabase/migrations/0011_lecturas.sql`, `src/services/learn.ts`. Modify `src/screens/Learn.tsx`.

- [ ] Migración (estilo 0009): tabla `lesson_reads(user_id, lesson_id, read_at, pk(user_id, lesson_id))` + RLS `lesson_reads_all_own`.
- [ ] Servicio: `listLessonReads(userId) → Set<string>`, `setLessonRead(userId, lessonId, read)` (upsert/delete idempotente), `pushLessonReads(userId, ids)` (upsert masivo ignoreDuplicates).
- [ ] Learn.tsx: en un useEffect al montar, `listLessonReads` → unión con lo local, `saveRead(unión)`, y `pushLessonReads` de lo local que falte en el servidor (migración suave). `toggleRead` además hace `void setLessonRead(...).catch(() => {})` — offline/migración pendiente no rompen nada: localStorage sigue siendo el cache.
- [ ] typecheck + tests → commit `feat(aprender): tu progreso de lectura ahora vive en tu cuenta — migración 0011 + sync suave`

### Task R3: Marcar el hábito de hoy desde su meta

**Files:** Modify `src/screens/GoalDetail.tsx`.

- [ ] En el card "Hábitos que suman": si el hábito aplica hoy (weekdays vacío o incluye `weekdayMon0(hoy)`), mostrar el botón `check` que marca/desmarca el cumplimiento de HOY (optimista sobre `habitChecks`, `setHabitCheck` con revert + toast en error). El título sigue navegando a `/habitos`. La racha se recalcula sola (deriva de `habitChecks`).
- [ ] typecheck + tests → commit `feat(meta): el hábito de hoy se marca sin salir del detalle de su meta`

### Task R4: Errores amables en Agenda/Hábitos + ajuste post-creación

**Files:** Modify `src/screens/Calendar.tsx:128`, `src/screens/Habits.tsx` (loadError + actionError + formError), `src/screens/GoalCreated.tsx`.

- [ ] Calendar y Habits: reemplazar `err instanceof Error ? err.message : '…'` por `friendlyError(err, '…')` (import de `@/lib/errors`).
- [ ] GoalCreated: bajo el botón primario, enlace secundario `Ver o ajustar esta meta` → `/metas/:id` (por si hay un typo recién creado, sin competir con la CTA).
- [ ] typecheck + tests → commit `fix(ux): errores amables en agenda y hábitos — y ajustar la meta recién creada sin rodeos`

### Task R5: Memoria

- [ ] Anotar migración 0011 pendiente en `hito-pending-user-actions`; actualizar `hito-audit-2026-06`.

## Self-review
- 0011 es aditiva e idempotente; Learn funciona igual sin ella (catch → local).
- `habitWeek`/`habitStreak`/`setHabitCheck` ya testeadas; solo ensamble.
- Sin placeholders: el código de servicio está definido arriba; el resto son patrones ya usados en el repo (weekstrip dots, check optimista de Today).
