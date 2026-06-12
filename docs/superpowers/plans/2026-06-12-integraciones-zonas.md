# Integraciones entre zonas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar las zonas que hoy viven en silos (auditoría de junio, sección integración): hábito↔meta, resumen semanal en Hoy, eventos de la meta en su detalle, revisión que lee hábitos, y Aprender ordenado por tu foco.

**Architecture:** Una migración nueva (0010: `habits.goal_id` nullable, ON DELETE SET NULL — borrar la meta no borra el hábito). El resto es ensamble de piezas existentes: `weekConsistency`, `habitStreak`, `listEventsInRange` y el FK evento→meta ya existen. Todo degrada con gracia si la migración no corrió (cargas con `catch → []`; el goal_id solo viaja cuando se elige).

**Tech Stack:** React 18 + TS + Vite, Supabase JS, vitest.

**Verificación:** `npm run typecheck && npm test` por tarea; commit por tarea.

---

### Task 1: Capa de datos hábito↔meta (migración 0010 + tipos + servicios)

**Files:** Create `supabase/migrations/0010_habito_meta.sql`. Modify `src/lib/types.ts` (Habit), `src/services/habits.ts`.

- [ ] **Step 1:** migración:

```sql
-- Vincula opcionalmente un hábito a una meta: el hábito le suma contexto
-- (visible en el detalle de la meta y en la revisión semanal). Borrar la
-- meta NO borra el hábito: queda como hábito suelto (set null).
alter table public.habits
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create index if not exists habits_goal_id_idx on public.habits(goal_id);
```

- [ ] **Step 2:** `types.ts` — en `Habit`, tras `weekdays`:

```ts
  /** Meta a la que suma este hábito (opcional). */
  goalId: string | null
```

- [ ] **Step 3:** `services/habits.ts` — `HabitRow` agrega `goal_id?: string | null`; `mapHabit` agrega `goalId: row.goal_id ?? null`; `createHabit` acepta `goalId?: string | null` y lo incluye en el insert **solo si viene con valor** (si la migración 0010 no corrió, crear sin meta sigue funcionando); `updateHabit` acepta `goalId` en el patch (`row.goal_id = patch.goalId`).
- [ ] **Step 4:** typecheck + tests → commit `feat(habitos): un hábito puede vincularse a una meta — migración 0010 + capa de datos`

---

### Task 2: Hábitos UI — elegir meta al crear y desde el menú

**Files:** Modify `src/screens/Habits.tsx`.

- [ ] **Step 1:** cargar metas activas (`listGoals(userId).catch(() => [])` en el Promise.all del effect); `goalById` memo; estado del form `const [goalId, setGoalId] = useState<string | null>(null)` (reset en `openWith` y tras crear).
- [ ] **Step 2:** en el formulario, tras el selector de días, selector opcional:

```tsx
{activeGoals.length > 0 && (
  <div className="field">
    <span className="field__label" id="habit-goal-label">¿Suma a una meta? (opcional)</span>
    <div className="row wrap" role="group" aria-labelledby="habit-goal-label">
      <button type="button" className={`chip${goalId === null ? ' chip--selected' : ''}`}
        aria-pressed={goalId === null} onClick={() => setGoalId(null)}>
        Ninguna
      </button>
      {activeGoals.map((g) => (
        <button key={g.id} type="button" className={`chip${goalId === g.id ? ' chip--selected' : ''}`}
          aria-pressed={goalId === g.id} onClick={() => setGoalId(g.id)}>
          <NicheIcon area={g.area} size={14} /> {g.title}
        </button>
      ))}
    </div>
  </div>
)}
```

`handleCreate` pasa `goalId` a `createHabit`.

- [ ] **Step 3:** en la tarjeta del hábito, junto al label de días, tag de la meta si está vinculado: `{habit.goalId && goalById.get(habit.goalId) && (<span className="tag"><IconArrowReturn size={11}/> {goalById.get(habit.goalId)!.title}</span>)}`. En el menú ⋯, mismo grupo de chips llamando `changeHabitGoal(habit, id)` → optimista + `updateHabit(habit.id, { goalId })` con revert.
- [ ] **Step 4:** typecheck + tests → commit `feat(habitos): vincular un hábito a una meta desde el form y el menú`

---

### Task 3: GoalDetail — hábitos que suman y eventos de la semana

**Files:** Modify `src/screens/GoalDetail.tsx`.

- [ ] **Step 1:** cargar en el Promise.all (con catch → [] para degradar): `listHabits(userId)`, `listHabitChecksInRange(userId, addDays(todayISO(), -119), todayISO())`, `listEventsInRange(userId, weekStart, addDays(weekStart, 6))`. Derivar `linkedHabits` (goalId === id, no archivados), `habitStreaks` (con `habitStreak`), `goalEvents` (e.goalId === id, ordenados por fecha/hora).
- [ ] **Step 2:** en la columna lateral, tras el card de InfoRows:

```tsx
{linkedHabits.length > 0 && (
  <div className="card stack stack--sm">
    <span className="kicker">Hábitos que suman</span>
    {linkedHabits.map((h) => (
      <button key={h.id} className="row row--between" style={{ alignItems: 'center', width: '100%', textAlign: 'left' }}
        onClick={() => navigate('/habitos')}>
        <span className="small nowrap-ellipsis">{h.title}</span>
        {(habitStreaks.get(h.id) ?? 0) >= 2 && (
          <span className="streak-chip"><IconFlame size={12} /> {habitStreaks.get(h.id)}</span>
        )}
      </button>
    ))}
  </div>
)}

{goalEvents.length > 0 && (
  <div className="card stack stack--sm">
    <span className="kicker">En tu agenda esta semana</span>
    {goalEvents.map((e) => (
      <button key={e.id} className="ev" onClick={() => navigate(`/calendario?d=${e.date}`)}>
        <span className="ev__time">{e.allDay || !e.startTime ? 'Día' : formatTime12(e.startTime)}</span>
        <span className="ev__title">{formatWeekday(e.date).split(' ')[0]} · {e.title}</span>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3:** typecheck + tests → commit `feat(meta): el detalle muestra sus hábitos vinculados y sus eventos de la semana`

---

### Task 4: Revisión — los hábitos vinculados cuentan

**Files:** Modify `src/screens/Review.tsx`.

- [ ] **Step 1:** cargar también `listHabits(userId).catch(() => [])` y `listHabitChecksInRange(userId, startOfWeek(today), today).catch(() => [])`. Derivar para la meta activa: `linkedHabits` + `habitChecksCount` (checks de esta semana de esos hábitos).
- [ ] **Step 2:** extender la línea de contexto: si hay hábitos vinculados, añadir `· hábitos: {habitChecksCount} {habitChecksCount === 1 ? 'marca' : 'marcas'} esta semana`.
- [ ] **Step 3:** typecheck + tests → commit `feat(revision): los hábitos vinculados a la meta aparecen en el contexto`

---

### Task 5: Hoy — resumen semanal numérico

**Files:** Modify `src/screens/Today.tsx`.

- [ ] **Step 1:** import `weekConsistency` (domain/sessions). Memo:

```ts
  // Resumen numérico de la semana (la tira muestra estados; esto muestra cuenta).
  const week = useMemo(
    () => weekConsistency(blocks, [...history, ...sessions], startOfWeek(today)),
    [blocks, history, sessions, today],
  )
```

- [ ] **Step 2:** bajo la weekstrip (después del bloque `{stripDay && …}`), dentro del mismo `<div>`:

```tsx
            {week.committed > 0 && (
              <p className="faint tiny" style={{ marginTop: 'var(--s2)' }}>
                {week.done >= week.committed
                  ? `Compromiso semanal cumplido: ${week.done} ${week.done === 1 ? 'sesión' : 'sesiones'}.`
                  : `${week.done} de ${week.committed} sesiones de tu compromiso esta semana.`}
              </p>
            )}
```

- [ ] **Step 3:** typecheck + tests → commit `feat(hoy): resumen numérico de la semana bajo la tira — cuántas sesiones llevas de tu compromiso`

---

### Task 6: Aprender — ordenado por tu foco

**Files:** Modify `src/screens/Learn.tsx`.

- [ ] **Step 1:** imports: `useEffect` (react), `useSession` (@/app/session), `getGoal` (@/services/goals), `NicheId` (types). Estado:

```ts
  const { profile } = useSession()
  // Foco del usuario: el área de su meta prioritaria ⭐, o el nicho del perfil.
  const [focusArea, setFocusArea] = useState<NicheId | null>(profile.primaryNiche)
  useEffect(() => {
    if (!profile.priorityGoalId) return
    let active = true
    getGoal(profile.priorityGoalId)
      .then((g) => {
        if (active && g) setFocusArea(g.area)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [profile.priorityGoalId])
```

- [ ] **Step 2:** en la vista raíz, ordenar (sort estable) y etiquetar:

```ts
  const collections = focusArea
    ? [...LEARN_COLLECTIONS].sort(
        (a, b) => (a.area === focusArea ? 0 : 1) - (b.area === focusArea ? 0 : 1),
      )
    : LEARN_COLLECTIONS
```

Reemplazar `LEARN_COLLECTIONS.map` por `collections.map` y en el row del título de cada card: `{focusArea === c.area && <span className="tag">Para tu foco</span>}`.

- [ ] **Step 3:** typecheck + tests → commit `feat(aprender): las colecciones de tu foco van primero — meta prioritaria o nicho del perfil`

---

### Task 7: Memoria y docs

- [ ] Actualizar memoria `hito-pending-user-actions` (correr migración 0010) y `hito-audit-2026-06` (integraciones 1, 2, 5, 6 y 8 del ranking aplicadas). Commit final de docs si aplica.

## Self-review

- La migración es aditiva e idempotente; el código no rompe si no corrió (catch → [], goal_id solo viaja al elegirse).
- `weekConsistency`, `habitStreak`, FK evento→meta: piezas ya existentes y testeadas — solo ensamble.
- Tipos: `Habit.goalId: string | null` consumido en Habits/GoalDetail/Review; `weekConsistency(blocks, sessions, weekStart)` coincide con domain/sessions.ts:80.
