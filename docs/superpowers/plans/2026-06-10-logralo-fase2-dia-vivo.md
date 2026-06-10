# Lógralo Fase 2 — El día vivo: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o ejecución directa del controlador (acuerdo de velocidad 2026-06-10: tareas con código completo las implementa el controlador; revisión integral única al cierre). Steps use checkbox (`- [ ]`) syntax.

**Goal:** El día deja de ser una lista de tareas aleatorias: las sesiones comprometidas se generan solas, se EMPIEZAN (cronómetro por timestamps), transcurren y se cierran con honestidad ("¿cómo te fue?"). El detalle de meta muestra el compromiso y el progreso calculado, y `current_milestone` muere.

**Architecture:** Expand-contract continúa: 0005 agrega columnas de pausa (expand); el drop de `current_milestone` va en 0006 al FINAL, cuando ya nadie lo lee. El dominio puro nuevo vive en `src/domain/sessions.ts` (TDD). Pantallas reescritas (Today, GoalDetail) salen con copy tuteo de una. El patrón compacto de etapas (backlog #1) se diseña una vez y se usa en GoalDetail y en el wizard.

**Tech Stack:** React + TS estricto + Vite + Supabase + Vitest. Spec: `docs/superpowers/specs/2026-06-10-hito-base-solida-design.md` §4.2, 5.3, 5.4, 5.5. Backlog del smoke Fase 1 en el plan de Fase 1 (ítems 1 y 3 se resuelven acá).

**Convenciones:** weekday lunes=0 (`weekdayMon0`); snake_case↔camelCase solo en services; commits sin Co-Authored-By; copy profesional tuteo en todo lo que se toque.

---

### Task 1: Migración 0005 — pausa de sesiones (expand)

**Files:** Create `supabase/migrations/0005_sesiones_pausa.sql`

```sql
-- 0005 — Cronómetro con pausa (Fase 2). Idempotente. Solo agrega columnas.
alter table public.sessions
  add column if not exists paused_at timestamptz;
alter table public.sessions
  add column if not exists paused_total_seconds int not null default 0
    check (paused_total_seconds >= 0);
```

- [ ] Crear archivo, commit `feat(db): columnas de pausa para sesiones (fase 2)`.
- [ ] CHECKPOINT usuario: pegar en SQL Editor → Run (se le deja en el portapapeles).

### Task 2: Tipos + servicio de sesiones

**Files:** Modify `src/lib/types.ts`; Create `src/services/sessions.ts`; Modify `src/services/milestones.ts`

- [ ] `types.ts` al final:

```typescript
export type SessionStatus = 'pending' | 'running' | 'done' | 'partial' | 'missed' | 'unconfirmed'

/** Una sesión de trabajo real sobre una meta, generada desde el compromiso. */
export interface Session {
  id: string
  goalId: string
  userId: string
  /** Bloque que la generó; null = sesión espontánea. */
  scheduleId: string | null
  date: string
  targetKind: TargetKind
  targetValue: number
  unit: string | null
  plannedTime: string | null
  startedAt: string | null
  endedAt: string | null
  /** Minutos (time) o cantidad (count) realmente hechos. */
  actualValue: number | null
  status: SessionStatus
  /** Pausa del cronómetro: cuándo se pausó y cuánto lleva acumulado en pausas. */
  pausedAt: string | null
  pausedTotalSeconds: number
  createdAt: string
}
```

- [ ] `src/services/sessions.ts` (mapper estilo hermanos; columnas `session_date→date`, `planned_time` slice HH:MM como schedule.ts):
  - `listSessionsForDate(userId, dateISO)` y `listSessionsInRange(userId, fromISO, toISO)` (order date asc).
  - `generateSessionsForDate(userId, dateISO, blocks: ScheduleBlock[])`: filas desde bloques con `weekday === weekdayMon0(dateISO)`, copiando target/unit/planned_time; insertar con `.upsert(rows, { onConflict: 'schedule_id,session_date', ignoreDuplicates: true })` (idempotente: el índice único parcial hace de cerrojo). Devuelve las sesiones del día tras generar (select).
  - Mutaciones que devuelven la fila mapeada: `startSession(id)` (`started_at: now, status: 'running'`), `pauseSession(id, pausedAt)` y `resumeSession(id, pausedTotalSeconds)` (el dominio calcula el acumulado; el servicio solo persiste), `finishSession(id, { status: 'done'|'partial'|'missed', actualValue })` (+ `ended_at: now`, limpia `paused_at`), `markPending(id)` (deshacer un check rápido).
  - `closeStaleSessions(userId, beforeISO)`: `update status='unconfirmed', ended_at=now` where `status='running'` and `session_date < beforeISO`.
  - `createSpontaneousSession(userId, goalId, { targetKind, targetValue, unit })` con `session_date = today`, `schedule_id: null`.
- [ ] `milestones.ts` agrega: `setMilestoneDone(id, done: boolean)` (done_at now/null), `updateMilestoneFields(id, { title?, targetDate? })`, `addMilestone(userId, goalId, title, position)`, `deleteMilestone(id)`, `reorderMilestones(updates: {id, position}[])` (updates secuenciales).
- [ ] tsc + tests verdes; commit `feat(services): sesiones (generación idempotente, ciclo de vida) y edición de hitos`.

### Task 3: Dominio puro `src/domain/sessions.ts` (TDD)

**Files:** Create `src/domain/sessions.test.ts` PRIMERO, luego `src/domain/sessions.ts`.

Funciones (todas puras, fechas/nows por parámetro):

```typescript
/** Segundos efectivos de trabajo: (now|pausedAt) - startedAt - pausas acumuladas. */
elapsedSeconds(s: Session, now: Date): number
/** Para kind 'time': segundos restantes hasta el objetivo (>= 0). */
remainingSeconds(s: Session, now: Date): number
/** ¿El cronómetro ya cumplió el objetivo? (kind 'time' y elapsed >= target*60) */
isTimeReached(s: Session, now: Date): boolean
/** ¿Quedó abierta de un día anterior? (running y date < hoy) */
isStaleRunning(s: Session, todayISO: string): boolean
/** Sugerencia de contenido para la tarjeta: rotación determinística del pool
 *  de la plantilla por día+meta (sin currentMilestone). */
pickSuggestion(template: GoalTemplate, goalId: string, dateISO: string): string
/** Progreso estructural de la meta. */
milestoneProgress(milestones: Milestone[]): { done: number; total: number; ratio: number }
/** Consistencia semanal: sesiones cumplidas (done|partial) / comprometidas. */
weekConsistency(blocks: ScheduleBlock[], sessions: Session[], weekStartISO: string): { done: number; committed: number }
/** Racha sobre días comprometidos: los días sin compromiso no la rompen.
 *  doneDates = fechas con >=1 sesión done|partial. */
currentStreakCommitted(doneDates: Set<string>, committedWeekdays: Set<number>, todayISO: string): number
```

Tests mínimos: elapsed con pausa activa y acumulada; remaining clamp 0; stale ayer vs hoy; consistencia con bloques de 2 días y 1 done; racha que salta el finde no comprometido, que está "en juego" hoy sin sesión aún (como `currentStreak` legacy: hoy vacío no rompe), y que se corta en día comprometido sin done; pickSuggestion estable para mismo día/meta y distinto entre metas.

- [ ] Tests → fallo → implementación → verde → suite completa → commit `feat(domain): sesiones — cronómetro por timestamps, consistencia y racha comprometida (TDD)`.

### Task 4: SessionCard + Hoy reescrito

**Files:** Create `src/components/SessionCard.tsx`; Modify `src/screens/Today.tsx` (reescritura mayor); Modify `src/styles/components.css` (tinte por meta en tarjeta de sesión: fondo degradado sutil `var(--niche)` al 6-10%, borde izquierdo 3px).

Estructura nueva de Hoy (spec 5.3, copy tuteo):
1. Header: "Tu día" + fecha + chip racha 🔥 (de `currentStreakCommitted`).
2. **Mini tira semanal** (Task 6) debajo del header.
3. **UN aviso máximo** (prioridad: sesión vencida por confirmar > revisión semanal > meta olvidada). Muere el apilamiento: foco semanal, banner de modo enfocado y "proponé vos" se eliminan (las sesiones SON el plan).
4. "TUS SESIONES DE HOY · X de Y": `SessionCard` por sesión, orden por plannedTime (null al final). Props: `{ session, goal, suggestion, onStart, onQuickDone, onUndo }`. Contenido: emoji+título de meta, objetivo ("25 min" / "10 páginas"), hora, sugerencia (`pickSuggestion`), porqué como ancla (faint), botón circular grande ▶ (navega a `/sesion/:id`) + check rápido (finishSession done con actualValue=target). Done: tachado + "Hecha HH:MM", tap deshace (markPending). Estado vacío sin compromisos hoy: "Hoy no comprometiste sesiones. ¿Una espontánea?" → hoja simple para elegir meta activa y crear espontánea con defaults del schedule de esa meta.
5. "LO QUE SUMASTE TÚ": tareas `source==='user'` con TaskItem (igual que hoy); las tasks legacy de meta dejan de generarse Y de renderizarse (filtrar source).
6. "TU AGENDA": eventos; tap navega `/calendario?d=${e.date}`.

Init nuevo: cargar [goals, blocks(listScheduleForUser), tasks, events, sesiones de la semana (range lunes..domingo)] → `closeStaleSessions` → `generateSessionsForDate(today)` (guard genGuard se mantiene) → backfill fire-and-forget se conserva. Eliminar imports/usos: planningGoals, deriveGoalActions, pickAction, weeklyFocus, actionsPerWeek, focus override de localStorage. Conservar: findForgottenGoal (alimentado ahora con última fecha done de sesiones por meta), goalsDueForReview, useCheer/useToast, withErrorHandling con rollback en TODA mutación de sesión.

- [ ] Implementar, tsc + tests, commit `feat(hoy): el día vivo — sesiones comprometidas, un aviso, agenda y racha comprometida`.

### Task 5: Pantalla Sesión en curso + flujo "¿Cómo te fue?"

**Files:** Create `src/screens/SessionRun.tsx`; Create `src/components/SessionRing.tsx`; Modify `src/App.tsx` (ruta `/sesion/:sessionId`, lazy, dentro de AppShell sin bottomnav o pantalla full — usar `screen--full` como Wizard).

- `SessionRing`: SVG circle r=70, stroke-dasharray/offset por progreso, números tabulares centro (mm:ss para time; "7 / 10 páginas" para count). `prefers-reduced-motion`: sin animación de progreso.
- `SessionRun`: carga sesión + meta. Estados:
  - `pending` → botón grande "Comenzar" (startSession) — o auto-start si se llegó con `?start=1` desde la tarjeta.
  - `running` (time): tick de 1s con setInterval que SOLO recalcula desde timestamps (`elapsedSeconds`); ⏸ Pausar / ▶ Reanudar (pause/resumeSession con el acumulado calculado en dominio); porqué en el centro bajo el anillo; al llegar a 0 (`isTimeReached`): celebración (useCheer + haptic vía `navigator.vibrate?.(30)`) + botones "✓ La completé" (done, actualValue=target) / "Termino más tarde" (sigue corriendo).
  - `running` (count): stepper grande +/− sobre el anillo de progreso; "Terminé ✓" → done si actual>=target, partial si 0<actual<target (con confirmación corta), missed si 0.
  - "Terminé ✓" antes de tiempo (time): hoja con "✓ La completé" (done, actualValue=minutos transcurridos redondeados, mínimo 1) / "Hice una parte" (partial, idem) / "No pude seguir" (missed, actual 0).
  - **Vencida al volver** (running de HOY con isTimeReached, o entrar a una sesión `unconfirmed`): pantalla de cierre "Tu sesión de {meta} terminó — Comenzaste a las HH:MM · objetivo X" con: "✓ La completé" / "Hice una parte…" (slider/stepper de minutos o cantidad) / "Hoy no pude" (missed). Sin culpa, copy del mockup validado.
  - Al cerrar en cualquier estado final → navigate('/') con cheer.
- Today muestra como AVISO prioritario la primera sesión running vencida o unconfirmed de días previos: tarjeta "Quedó una sesión abierta {de ayer}" → navega a /sesion/:id para resolverla.
- [ ] Implementar, tsc + tests, commit `feat(sesion): cronómetro vivo con pausa, contador por cantidad y cierre honesto`.

### Task 6: Mini tira semanal en Hoy + corregir ayer

**Files:** Modify `src/screens/Today.tsx`; Modify `src/styles/components.css` (`.weekstrip`, `.weekstrip__day`, puntos de estado).

- Tira Lu..Do de la semana actual: número de día + hasta 3 puntos (sesiones de ese día: lleno verde done/partial, borde pendiente, ámbar parcial-mixto, gris missed). Hoy resaltado.
- Tap día pasado → hoja inferior (mismo patrón sheet del Calendar: backdrop + focus trap si está disponible, o card expandible simple) con las sesiones de ese día y acciones "✓ La hice" / "Parcial…" / dejar como estaba (finishSession sobre la fecha pasada; la racha se recalcula al cerrar la hoja). Tap día futuro → `/calendario?d=`.
- [ ] Commit `feat(hoy): tira semanal con corrección de días pasados`.

### Task 7: Patrón compacto de etapas (backlog #1) — wizard

**Files:** Rewrite `src/components/wizard/MilestonesStep.tsx`; Modify `src/styles/components.css` (`.mstone`, `.mstone--done`, `.mstone__title`, `.mstone__meta`, `.mstone__actions`).

Diseño calmo (lo que pidió el usuario): UNA línea por etapa — número/punto + título como TEXTO plano; tap en el título lo convierte en input inline (autoFocus, blur/Enter confirma); a la derecha solo "⋯" que abre una fila de acciones para ESA etapa (fecha · subir · bajar · quitar) y se cierra al actuar. Fecha elegida se muestra como tag chiquito junto al título ("📅 1 jul"). "+ Agregar etapa" al final agrega y abre su input directo. Nada de tarjetas grandes ni inputs de fecha siempre visibles.

- [ ] Reescribir componente (misma interfaz `{ milestones, onChange }` — el Wizard no cambia), CSS nuevo, tsc, commit `feat(wizard): etapas compactas — adiós al ruido (backlog smoke #1)`.

### Task 8: GoalDetail reescrito (backlog #3 + reglas de logro)

**Files:** Rewrite `src/screens/GoalDetail.tsx`; Create `src/components/MilestoneChecklist.tsx` (versión persistida del patrón compacto: check circular por fila + edición inline + ⋯ con fecha/orden/quitar, llama servicios de milestones); Modify `src/styles/components.css` si falta algo.

Estructura (spec 5.5, copy tuteo):
1. Header: tag nicho+estado, título, "Editar" (GoalEditor existente se conserva).
2. Porqué (focus-card, igual).
3. **Bloque de progreso calculado**: barra `milestoneProgress` ("Etapa X de N"), consistencia de la semana (`weekConsistency` con blocks+sesiones de la semana), sesiones totales done, tiempo invertido real (suma actual_value de sesiones time done/partial). Muere "Avance: N acciones completadas" (countDoneByGoal legacy puede quedar como dato secundario o irse — se va).
4. **TU COMPROMISO** (backlog #3, arriba y visible): chips por bloque "Lu 19:00 · 25 min" + total semanal (`formatCommitmentSummary`) + botón "Editar compromiso" → sección expandible con `CommitmentStep` (reutilizado tal cual: blocks editables + guardia con `listActiveGoalSchedule` excluyendo esta meta) y Guardar = `replaceSchedule(goalId, blocks)` nuevo en schedule.ts (delete por goal_id + createScheduleBlocks; las sesiones futuras se regeneran solas al abrir cada día; las de hoy ya generadas se conservan).
5. **EL CAMINO**: `MilestoneChecklist`. Reglas de logro (spec 4.3): marcar/desmarcar libre con `setMilestoneDone`; al marcar el ÚLTIMO pendiente → celebración + tarjeta "¿La damos por lograda?" con botón primario (setGoalStatus done) y "Todavía no". El botón "Marcar como lograda" deja de ser fijo: vive en menú "⋯ Más" (junto a Archivar) mientras haya pendientes, con confirmación que LISTA los pendientes y ofrece "Ya los cumplí" (marca todos) / "Cerrar igual".
6. Acciones: Pausar / Reactivar (al reactivar: generar sesiones de hoy si toca, ya sin pickAction), menú ⋯ (lograda con confirmación, archivar). "Esta semana agendadas" (eventos) se mantiene con su semántica separada de "invertido".
- [ ] Implementar, tsc + tests, commit `feat(meta): detalle con compromiso visible, progreso real y reglas de logro (backlog smoke #3)`.

### Task 9: Review re-cableado mínimo

**Files:** Modify `src/screens/Review.tsx` (el re-propósito completo es Fase 4).

- Cargar milestones por meta revisada; "Avancé de etapa" → `setMilestoneDone` del primer pendiente; "Logré la meta" solo aparece sin pendientes (o con confirmación de pendientes como en GoalDetail); fuera `setGoalMilestone`/`clampedStage` (stage = done count). Copy de los botones a tuteo.
- [ ] Commit `refactor(revision): etapas reales en lugar de current_milestone`.

### Task 10: Limpieza legacy + migración 0006 (contract)

**Files:** Modify `src/screens/Goals.tsx`, `src/screens/Progress.tsx`, `src/screens/GoalCreated.tsx`, `src/domain/dailyPlan.ts` (+test), `src/domain/goals.ts` (+test), `src/services/goals.ts`, `src/services/tasks.ts`, `src/lib/types.ts`; Create `supabase/migrations/0006_drop_current_milestone.sql`.

- Goals.tsx y Progress.tsx: etapa desde `milestoneProgressByGoal(userId)` nuevo en milestones.ts (`select goal_id, done_at` → Map {done,total}); quitar clampedStage/isPathComplete si quedan sin uso (y sus tests).
- GoalCreated: quitar el fallback a template.milestones/currentMilestone (toda meta nueva ya tiene hitos propios); quitar pickAction → la "primera acción" pasa a ser la PRIMERA SESIÓN: "Tu primera sesión: {día} {hora} · {target}" desde el schedule creado (si hay sesión hoy, CTA "Empezar ahora" → /sesion/:id).
- Wizard submit: deja de crear la tarea legacy (createGoalTasks/pickAction/isUniqueViolation fuera); si hoy es día comprometido, `generateSessionsForDate` para que el plan de hoy la muestre al instante.
- dailyPlan.ts: eliminar pickAction, deriveGoalActions, planningGoals, weeklyFocus, actionsPerWeek, isDueToday, currentStreak (reemplazada) y sus tests; conservar findForgottenGoal (re-basado en sesiones) y goalsDueForReview. FocusMode: quitar de types/profile mapper (la columna en BD queda muerta hasta una limpieza futura).
- types.ts: quitar `currentMilestone` de Goal; goals.ts: quitar setGoalMilestone y el campo del mapper; tasks.ts: quitar createGoalTasks/lastDoneByGoal/countDoneByGoalInRange si quedan sin consumidores (verificar con grep).
- 0006: `alter table public.goals drop column if exists current_milestone;` — checkpoint usuario.
- [ ] tsc + suite completa + build; commit `refactor!: muere current_milestone — progreso 100% calculado (migración 0006)`.

### Task 11: Verificación final de la Fase 2

- [ ] `npm test -- --run` + `npx tsc --noEmit` + `npm run build` verdes; revisión integral única (agente fuerte) sobre `git diff <inicio-fase2>..HEAD` con foco en: máquina de estados de sesión (carreras del tick vs mutaciones), idempotencia de generación (StrictMode + multi-pestaña), reglas de logro, y que no quede NINGÚN uso legacy (grep currentMilestone|setGoalMilestone|pickAction|deriveGoalActions|planningGoals|weeklyFocus|actionsPerWeek vacío).
- [ ] Smoke usuario: crear meta → verla en Hoy como sesión → empezarla → cerrarla por cronómetro; dejar una corriendo, cerrar pestaña, volver → "¿cómo te fue?"; marcar última etapa en detalle → oferta de lograda; editar compromiso desde detalle; tira semanal corrige ayer.
- [ ] Tras smoke OK: merge a master (deploy) — primer deploy coherente del rediseño.
