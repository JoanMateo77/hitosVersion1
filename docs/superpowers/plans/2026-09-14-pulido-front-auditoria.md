# Pulido de front tras la auditoría de septiembre · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar las olas 1 a 3 de `AUDITORIA-2026-09.md` §5: un solo dueño por dato, un presupuesto de voz por pantalla, el set de íconos calibrado y un lenguaje de motion con tokens, feedback en cada gesto y un momento focal al lograr algo.

**Architecture:** Cambios solo de front. Lógica nueva mínima y pura en `src/domain/sessions.ts` (racha y estado de día compartidos, con tests). El resto son recortes en pantallas, tres componentes nuevos (`Sheet`, `Celebration`, `Disclosure` reescrito sin `<details>`), un helper de View Transitions y CSS con tokens de duración. Sin servicios, esquema ni dependencias nuevas; Blendy se mantiene.

**Tech Stack:** React 19 + TypeScript estricto (`noUnusedLocals`) + Vite 6 + React Router 7 (`BrowserRouter`), CSS propio con tokens (`src/styles/tokens.css`), Vitest (solo `src/**/*.test.ts`, entorno node).

**Spec:** `AUDITORIA-2026-09.md` (hallazgos F/V/I/M y plan §5) con los anexos en `docs/auditorias/2026-09/`. Para la gramática visual vigente sigue mandando `docs/superpowers/specs/2026-09-09-agenda-bloques-dieta-informacion-design.md` (§3 dieta, §5.7 Disclosure).

## Global Constraints

- Copy en español neutro profesional con tuteo; nunca voseo. Datos, no veredictos ("Sin cumplir", no "Hoy no pudiste").
- Cada dato una vez por pantalla; historia, metadatos y explicaciones plegados o una sola vez (spec §3).
- `npm run typecheck`, `npm run lint`, `npm test` (201 pruebas o más) y `npm run build` en verde al cerrar cada tarea; al quitar un uso, quitar el import, estado o prop huérfanos (sin `eslint-disable`).
- Motion: solo `transform`, `opacity`, `grid-template-rows`, `stroke-dashoffset`, color y `background`; nunca `height`, `max-height`, `top` ni `width` animados en código nuevo. Toda duración nueva usa `--dur-tap` / `--dur-state` / `--dur-layout` / `--dur-focal` y toda curva usa `--ease-out` / `--ease-ios` / `--ease-spring` (Tarea 4 los define; las tareas anteriores no añaden motion). Toda salida es más corta que su entrada. `prefers-reduced-motion` reduce el desplazamiento y conserva el feedback de color/estado.
- Íconos: solo `src/components/icons.tsx` (SVG propio, `viewBox` 24, `currentColor`); nada de emoji ni de bibliotecas de íconos.
- Estilos solo con tokens; los `style` inline nuevos se limitan a variables CSS (`--i`, `--tab`, `--dy`) y a `viewTransitionName`.
- No tocar Supabase, servicios (salvo `services/profile.ts` en la Tarea 1) ni formularios más allá de lo listado.
- Nunca incluir `Co-Authored-By` ni atribución a Claude en los commits ni en la PR.
- Rama: `feat/pulido-front`, creada desde `feat/dieta-fase3` (la PR se abre contra `feat/dieta-fase3`).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/domain/sessions.ts` (+ `.test.ts`) | `activeCommittedWeekdays`, `doneDatesOf`, `globalStreak`, `dayState` — una sola métrica de racha y de estado de día. |
| `src/screens/Today.tsx` | Racha y tira con el dominio; un solo slot de voz; sin eco del cheer; agenda plegada; cascada solo en carga fría; cheer con salida. |
| `src/screens/Progress.tsx` | Racha con el dominio; sin "Etapa X de Y"; "Tus hábitos" a una línea; tira con `dayState`. |
| `src/services/profile.ts` | `fetchCurrentStreak` con `globalStreak`. |
| `src/screens/Goals.tsx` | Sin "Etapa X de Y" en la tarjeta; sin porqué en el peek; transición compartida al abrir el detalle. |
| `src/screens/GoalDetail.tsx` | Hábitos vinculados sin panel; `Celebration` al lograr la meta; flash en la etapa cumplida; `viewTransitionName` en el título. |
| `src/screens/GoalCreated.tsx` | Compromiso una sola vez; `Roadmap intro`. |
| `src/screens/SessionRun.tsx` | Idea de contenido dentro del plan plegado; anillo `reached`. |
| `src/screens/Wizard.tsx`, `src/screens/GoalSuggestions.tsx` | Copy honesto sobre plantillas. |
| `src/screens/Review.tsx` | `Celebration` al lograr la meta. |
| `src/screens/Habits.tsx`, `src/screens/Learn.tsx`, `src/screens/Calendar.tsx` | Íconos corregidos; sheets con `Sheet`. |
| `src/components/SessionCard.tsx` | Sin "Tu plan"; "Sin cumplir"; ✓ en el check; háptico. |
| `src/components/TaskItem.tsx`, `HabitRow.tsx`, `MilestoneChecklist.tsx`, `src/screens/calendar/AgendaRow.tsx`, `EventCheck.tsx` | ✓ en todos los checks; papelera en borrar; háptico; flash de etapa. |
| `src/components/wizard/MilestonesStep.tsx`, `CommitmentStep.tsx` | Papelera en "Quitar". |
| `src/components/Hint.tsx`, `src/components/ErrorBoundary.tsx` | Hint sin bombilla. ErrorBoundary no cambia. |
| `src/components/icons.tsx` | Trazo calibrado; `IconToday` nuevo; `IconProgress`/`IconFlag`/`IconQuote` centrados; `filled` en los 5 de navegación; `IconHito` con asset de 96 px; sin `IconSparkles`. |
| `src/components/BottomNav.tsx`, `SideNav.tsx` | Píldora deslizante (`--tab`), íconos rellenos en el activo, navegación con View Transition. |
| `src/components/Disclosure.tsx` | Reescrito: botón + cuerpo con `grid-template-rows` animado, misma API. |
| `src/screens/calendar/AgendaBlock.tsx`, `WeekDay.tsx` | Cuerpo siempre en el árbol tras la primera apertura; plegado animado. |
| `src/components/Sheet.tsx` (nuevo) | Hoja inferior con salida animada, arrastre para cerrar, foco atrapado y scroll bloqueado. |
| `src/screens/calendar/AddSheet.tsx` | Usa `Sheet`. |
| `src/components/Celebration.tsx` (nuevo) | Overlay focal "¡Meta lograda!" de 560 ms + háptico. |
| `src/components/Roadmap.tsx` | Prop `intro`: el camino se traza al montar. |
| `src/components/SessionRing.tsx` | Prop `reached`. |
| `src/lib/viewTransition.ts` (nuevo) | `withViewTransition(fn)`. |
| `src/lib/haptics.ts` (nuevo) | `tapHaptic()`, `successHaptic()`. |
| `src/hooks/useCheer.ts`, `src/app/toast.tsx` | Estado `leaving` 160 ms antes de desmontar. |
| `src/domain/templates.ts`, `src/lib/types.ts`, `src/domain/niches.ts` | Sin `kickoffActions` ni `emoji`. |
| `src/styles/tokens.css`, `base.css`, `components.css`, `today.css`, `session-plan.css` | Tokens de duración; reduced-motion correcto; barrido de `ease`; plegado, sheet, píldora, celebración, flash, camino. |
| `src/assets/logo-96.png` (nuevo), `public/favicon.png`, `public/logo-previews.png` (borrar) | Marca ligera. |

---

### Task 1: Dominio — una sola racha y un solo estado de día (F1, F8)

**Files:**
- Modify: `src/domain/sessions.ts` (junto a `currentStreakCommitted`, línea ~113)
- Test: `src/domain/sessions.test.ts`
- Modify: `src/screens/Today.tsx:249-255` (racha), `:262-268` (racha rota), `:438-446` (`stripState`)
- Modify: `src/screens/Progress.tsx:94-96` (racha), `:106-115` (`dayState`)
- Modify: `src/services/profile.ts:176-189` (`fetchCurrentStreak`)

**Interfaces:**
- Produces:
  ```ts
  export type DayState = 'done' | 'partial' | 'missed' | 'future' | 'free'
  export function activeCommittedWeekdays(goals: Pick<Goal, 'id' | 'status'>[], blocks: Pick<ScheduleBlock, 'goalId' | 'weekday'>[]): Set<number>
  export function doneDatesOf(sessions: Pick<Session, 'date' | 'status'>[]): Set<string>
  export function globalStreak(goals: Pick<Goal, 'id' | 'status'>[], blocks: Pick<ScheduleBlock, 'goalId' | 'weekday'>[], sessions: Pick<Session, 'date' | 'status'>[], todayISO: string): number
  export function dayState(dateISO: string, todayISO: string, daySessions: Pick<Session, 'status'>[], committed: boolean): DayState
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/domain/sessions.test.ts` (importar las cuatro funciones nuevas junto a las existentes):

```ts
describe('globalStreak', () => {
  const goals = [
    { id: 'g1', status: 'active' as const },
    { id: 'g2', status: 'paused' as const },
  ]
  const blocks = [
    { goalId: 'g1', weekday: 0 }, // lunes
    { goalId: 'g2', weekday: 2 }, // miércoles, de una meta pausada
  ] as Pick<ScheduleBlock, 'goalId' | 'weekday'>[]

  it('ignora los bloques de metas no activas', () => {
    expect([...activeCommittedWeekdays(goals, blocks)]).toEqual([0])
  })

  it('solo cuenta sesiones done o partial', () => {
    const dates = doneDatesOf([
      { date: '2026-09-07', status: 'done' },
      { date: '2026-09-08', status: 'partial' },
      { date: '2026-09-09', status: 'missed' },
    ] as Session[])
    expect([...dates].sort()).toEqual(['2026-09-07', '2026-09-08'])
  })

  it('la racha no se rompe por un miércoles de una meta pausada', () => {
    // 2026-09-14 es lunes. Lunes 7 y lunes 14 cumplidos; miércoles 9 sin sesión.
    const sessions = [
      { date: '2026-09-07', status: 'done' },
      { date: '2026-09-14', status: 'done' },
    ] as Session[]
    expect(globalStreak(goals, blocks, sessions, '2026-09-14')).toBe(2)
  })
})

describe('dayState', () => {
  const today = '2026-09-14'
  it('futuro comprometido es future, futuro libre es free', () => {
    expect(dayState('2026-09-15', today, [], true)).toBe('future')
    expect(dayState('2026-09-15', today, [], false)).toBe('free')
  })
  it('pasado sin compromiso ni sesiones es free', () => {
    expect(dayState('2026-09-10', today, [], false)).toBe('free')
  })
  it('done gana a partial', () => {
    expect(dayState('2026-09-10', today, [{ status: 'partial' }, { status: 'done' }] as Session[], true)).toBe('done')
    expect(dayState('2026-09-10', today, [{ status: 'partial' }] as Session[], true)).toBe('partial')
  })
  it('hoy comprometido y sin cumplir sigue en juego', () => {
    expect(dayState(today, today, [{ status: 'pending' }] as Session[], true)).toBe('future')
  })
  it('pasado comprometido sin cumplir es missed', () => {
    expect(dayState('2026-09-10', today, [], true)).toBe('missed')
    expect(dayState('2026-09-10', today, [{ status: 'missed' }] as Session[], false)).toBe('missed')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/domain/sessions.test.ts`
Expected: FAIL (las funciones no existen).

- [ ] **Step 3: Implementar en `src/domain/sessions.ts`** (tras `currentStreakCommitted`; importar `Goal` si no está)

```ts
/** Días de la semana (lunes=0) con bloque de alguna meta ACTIVA. Es la única
 *  vara para la racha global: Hoy, Progreso y Perfil la comparten. */
export function activeCommittedWeekdays(
  goals: Pick<Goal, 'id' | 'status'>[],
  blocks: Pick<ScheduleBlock, 'goalId' | 'weekday'>[],
): Set<number> {
  const active = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id))
  return new Set(blocks.filter((b) => active.has(b.goalId)).map((b) => b.weekday))
}

/** Fechas con al menos una sesión hecha o parcial. */
export function doneDatesOf(sessions: Pick<Session, 'date' | 'status'>[]): Set<string> {
  const out = new Set<string>()
  for (const s of sessions) if (s.status === 'done' || s.status === 'partial') out.add(s.date)
  return out
}

/** Racha global actual con la misma métrica en toda la app. */
export function globalStreak(
  goals: Pick<Goal, 'id' | 'status'>[],
  blocks: Pick<ScheduleBlock, 'goalId' | 'weekday'>[],
  sessions: Pick<Session, 'date' | 'status'>[],
  todayISO: string,
): number {
  return currentStreakCommitted(doneDatesOf(sessions), activeCommittedWeekdays(goals, blocks), todayISO)
}

export type DayState = 'done' | 'partial' | 'missed' | 'future' | 'free'

/** Estado de un día para las tiras de 7 días (Hoy y Progreso comparten reglas). */
export function dayState(
  dateISO: string,
  todayISO: string,
  daySessions: Pick<Session, 'status'>[],
  committed: boolean,
): DayState {
  if (dateISO > todayISO) return committed ? 'future' : 'free'
  if (!committed && daySessions.length === 0) return 'free'
  if (daySessions.some((s) => s.status === 'done')) return 'done'
  if (daySessions.some((s) => s.status === 'partial')) return 'partial'
  if (dateISO === todayISO) return 'future'
  return 'missed'
}
```

- [ ] **Step 4: Tests en verde**

Run: `npx vitest run src/domain/sessions.test.ts` → PASS.

- [ ] **Step 5: Consumir desde las tres superficies**

- `Today.tsx:249-255`: `const streak = useMemo(() => globalStreak(goals, blocks, [...history, ...sessions], today), [goals, history, sessions, blocks, today])`. En `streakBroken` (`:262-268`) reemplazar `new Set(blocks.map((b) => b.weekday))` por `activeCommittedWeekdays(goals, blocks)` y construir `doneDates` con `doneDatesOf([...history, ...sessions])`. Sustituir el cuerpo de `stripState` (`:438-446`) por: `const committed = committedWeekdays.has(weekdayMon0(date)); const day = (date === today ? sessions : history).filter((x) => x.date === date); return dayState(date, today, day, committed)` con `const committedWeekdays = useMemo(() => activeCommittedWeekdays(goals, blocks), [goals, blocks])` definido junto a la racha. Borrar los `Set` locales que queden sin uso.
- `Progress.tsx:94-96`: `const streak = globalStreak(goals, blocks, sessions, today)`; conservar `activeBlocks` para `weekConsistency`; `committedWeekdays = activeCommittedWeekdays(goals, blocks)`. Sustituir la función local `dayState` (`:106-115`) por la de dominio: `dayState(date, today, sessions.filter((s) => s.date === date), committedWeekdays.has(weekdayMon0(date)))`.
- `profile.ts:176-189`: el cuerpo de `fetchCurrentStreak` pasa a `return globalStreak(goals, blocks, sessions, today)` (misma carga de datos).

- [ ] **Step 6: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add src/domain/sessions.ts src/domain/sessions.test.ts src/screens/Today.tsx src/screens/Progress.tsx src/services/profile.ts
git commit -m "feat(dominio): una sola racha y un solo estado de día para Hoy, Progreso y Perfil"
```

---

### Task 2: Recortes de información (F2, F3, F4, F5, F6, F7, F9)

**Files:**
- Modify: `src/screens/Goals.tsx:234` (porqué del peek), `:323-327` (etapa)
- Modify: `src/screens/Progress.tsx:296-300` (etapa), `:309-354` (Tus hábitos)
- Modify: `src/screens/Today.tsx:908-930` (agenda), `:881` (`goalWhy`)
- Modify: `src/screens/GoalDetail.tsx:638-647`
- Modify: `src/screens/GoalCreated.tsx:108-114`
- Modify: `src/components/TaskItem.tsx:10, 21, 93-95`

**Interfaces:** consume `Disclosure` (`src/components/Disclosure.tsx`, props `summary`, `defaultOpen`, `children`).

- [ ] **Step 1: Metas y Progreso sin "Etapa X de Y"**

En `Goals.tsx:323-327` borrar el `<span className="faint tiny">…</span>` completo (queda solo la barra). Si `pathComplete` deja de usarse, borrarlo. En `Progress.tsx:296-300` borrar el `<span className="faint tiny">` de etapa. En `Goals.tsx:234` borrar `{goal.why && <p className="small muted">Porque {goal.why}</p>}`.

- [ ] **Step 2: "Tus hábitos" de Progreso a una línea**

Reemplazar la sección `Progress.tsx:309-354` por:

```tsx
{activeHabits.length > 0 && (
  <section aria-label="Tus hábitos" className="card card--tight row row--between" style={{ alignItems: 'center' }}>
    <span className="small">
      {activeHabits.length} {activeHabits.length === 1 ? 'hábito activo' : 'hábitos activos'}
      {bestHabitStreak >= 2 ? ` · mejor racha ${bestHabitStreak} días` : ''}
    </span>
    <button className="btn--link" onClick={() => navigate('/habitos')}>
      Ver hábitos
    </button>
  </section>
)}
```
con `const bestHabitStreak = Math.max(0, ...activeHabits.map((h) => habitStreak(habitDates.get(h.id) ?? new Set<string>(), h.weekdays, today)))` junto a `habitDates`. Borrar `HABIT_DOT`, `habitWeek`, `WEEKDAY_LABELS`, `NicheGlyph`, `nicheAccent` y `IconFlame` solo si quedan sin uso (typecheck/lint lo dicen).

- [ ] **Step 3: Agenda de Hoy plegada**

En `Today.tsx:908-930` envolver el `<div className="stack stack--sm">` de eventos en `<Disclosure summary={`Tu agenda de hoy · ${todayEvents.length}`}>` y quitar el `section-head` con kicker + "Ver agenda" (el enlace "Ver agenda" pasa a ser el último elemento dentro del Disclosure: `<button className="btn--link" onClick={() => navigate('/calendario')}>Ver agenda</button>`). La `<section aria-label="Tu agenda de hoy">` se conserva.

- [ ] **Step 4: Hábitos en Detalle de meta sin panel, compromiso una vez, prop muerta**

- `GoalDetail.tsx:638-647`: borrar el `span` "{doneCount} de {target} hoy" y el `streak-chip`; borrar `habitStreaks` y sus imports si quedan sin uso.
- `GoalCreated.tsx:108-114`: borrar el `<div className="row wrap">` de chips; conservar `<p className="small">{formatCommitmentSummary(schedule)}</p>`. Borrar `WEEKDAY_LABELS`/`blockTimeLabel` si quedan sin uso.
- `TaskItem.tsx`: borrar la prop `goalWhy` (`:10`, `:21`) y el bloque `:93-95`; en `Today.tsx:881` borrar `goalWhy={null}`.

- [ ] **Step 5: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src/screens src/components/TaskItem.tsx
git commit -m "feat(dieta): cada dato con una sola pantalla dueña"
```

---

### Task 3: Presupuesto de voz (V2, V3, V4, V5, V6)

**Files:**
- Modify: `src/screens/Today.tsx:386` (cheer), `:558` (slot), `:635-720`, `:856`
- Modify: `src/components/SessionCard.tsx:19-20, 38-46, 57` y `src/screens/Today.tsx` (prop `plan`)
- Modify: `src/screens/SessionRun.tsx:263, 493-498, 676-684`
- Modify: `src/screens/Wizard.tsx:344, 383`, `src/screens/GoalSuggestions.tsx:67-68`
- Modify: `src/domain/templates.ts` (11 bloques `kickoffActions`), `src/lib/types.ts:113`, `src/components/icons.tsx:100-108` (`IconSparkles`)

- [ ] **Step 1: Un solo slot de voz en Hoy**

Reemplazar `Today.tsx:558` por:

```tsx
// UNA sola voz por vista. Prioridad: consecuencia de una acción del usuario
// (celebración, racha rota) > pregunta que la app necesita (sin confirmar,
// revisión, olvidada) > sugerencia (arrastre de ayer).
type Voice = 'cheer' | 'streak' | 'resolve' | 'review' | 'forgotten' | 'carryover' | null
const voice: Voice = cheerMessage
  ? 'cheer'
  : showStreakNotice && streakBroken
    ? 'streak'
    : toResolve
      ? 'resolve'
      : reviewDue.length > 0
        ? 'review'
        : forgotten
          ? 'forgotten'
          : yesterdayPending.length > 0
            ? 'carryover'
            : null
```
y condicionar cada bloque: `{voice === 'cheer' && cheerMessage && …}` (`:635`), `{voice === 'streak' && streakBroken && …}` (`:641`), `voice === 'resolve'`, `voice === 'review'`, `voice === 'forgotten'` (`:656-720`), y el card de arrastre (`:856`) con `voice === 'carryover'`. El `<Hint id="session-partial-2026-06">` (`:718`) se conserva: es de una sola vez.

- [ ] **Step 2: Sin eco**

- `Today.tsx:386`: borrar la rama `cheer('Cumpliste tu compromiso de hoy. Bien hecho.')` (el subtítulo de `:577` ya lo dice); conservar el cheer "Primera sesión del día. Así se empieza." con `if (willBeDone === 1 && todaySessions.length > 1)`.
- `SessionCard.tsx:57`: `'Hoy no pudiste — está bien'` → `'Sin cumplir'`.
- `SessionCard.tsx`: quitar la prop `plan` (`:19-20`), la línea `if (plan …) parts.push(…)` (`:44`) y la firma de `sessionHint`; en `Today.tsx` quitar `plan={planByGoal.get(goal.id)}` y `planByGoal` si queda sin uso.

- [ ] **Step 3: La idea de contenido dentro del plan plegado**

En `SessionRun.tsx:493-498` borrar el bloque del `tag` con `IconLightbulb`. Dentro del `Disclosure` del plan (`:676-684`), como primer hijo:

```tsx
{session.status === 'pending' && (
  <p className="small muted row row--sm" style={{ alignItems: 'center', marginBottom: 'var(--s3)' }}>
    <IconLightbulb size={13} /> <span>Idea: {suggestion}</span>
  </p>
)}
```
Mantener `suggestion` (`:263`). Si `IconLightbulb` queda sin otro uso en el archivo, el import se conserva porque lo usa este bloque.

- [ ] **Step 4: Copy honesto**

- `Wizard.tsx:344`: `"Elegimos un tipo por las palabras de tu meta. Cámbialo si no encaja."`
- `Wizard.tsx:383`: `"El camino típico de este tipo de meta, en orden. Edita, reordena o agrega las que necesites."`
- `GoalSuggestions.tsx:67`: `'Metas listas para empezar, cada una con sus etapas típicas. Elige una o escribe la tuya.'`; `:68`: `` `Ideas de ${nicheInfo.label.toLowerCase()}, con etapas listas para empezar. Elige una o escribe la tuya.` ``

- [ ] **Step 5: Código muerto**

Borrar los 11 bloques `kickoffActions: [...]` de `src/domain/templates.ts`, el campo `kickoffActions?` de `GoalTemplate` en `src/lib/types.ts:113` y la función `IconSparkles` de `icons.tsx` (con su comentario). Verificar con `grep -rn 'kickoffActions\|IconSparkles' src` → 0 resultados.

- [ ] **Step 6: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(voz): una voz por vista en Hoy, idea de sesión plegada y copy honesto"
```

---

### Task 4: Tokens de motion, reduced-motion correcto y feedback barato (M1, M6, M7, M8, M9, M13)

**Files:**
- Modify: `src/styles/tokens.css:66-69`
- Modify: `src/styles/base.css:169-176`
- Modify: `src/styles/components.css` (barrido; `.ring__bar:2309`; `.blk__head:3108`, `.wk-day__head:3317`, `.ag-row:2982`; `.progress__bar:532` muerta; bloque vacío `:869-874`; `.learn-enter:2624`)
- Modify: `src/styles/today.css:14-17`, `src/styles/session-plan.css:33-34`
- Modify: `src/components/SessionRing.tsx`, `src/screens/SessionRun.tsx:534` (SessionRing con `reached`), `src/screens/Today.tsx` (raíz con `data-warm`)

**Interfaces:**
- Produces tokens: `--dur-tap: 120ms; --dur-state: 220ms; --dur-layout: 320ms; --dur-focal: 560ms;`
- Produces `SessionRing` prop `reached?: boolean` → clase `ring--reached`.

- [ ] **Step 1: Tokens** (`tokens.css`, tras `--ease-ios`)

```css
  /* Duraciones: acuse de recibo, cambio de estado, layout/overlay y UNA entrada focal. */
  --dur-tap: 120ms;
  --dur-state: 220ms;
  --dur-layout: 320ms;
  --dur-focal: 560ms;
```

- [ ] **Step 2: Reduced-motion que reduce sin apagar** (`base.css:169-176`)

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  /* El feedback significativo sobrevive como cambio de color/estado, sin desplazamiento. */
  .check,
  .task--done,
  .progress__bar,
  .ring__bar,
  .session-plan__check {
    transition-duration: 150ms !important;
  }
  .check--done,
  .celebrate-pop {
    animation: none !important;
  }
}
```
Borrar en `components.css` los bloques `@media (prefers-reduced-motion: reduce)` que solo repiten `transition: none` sobre `.ring__bar` (`:2311-2315`) y sobre los chevrons (`.blk__chev`, `.wk-day__chev`, `.disclosure__chev`); la regla global ya los cubre. Borrar el bloque vacío `@media (prefers-reduced-motion: no-preference) {}` y su comentario (`:869-874`).

- [ ] **Step 3: Barrido de duraciones y curvas** (los cuatro CSS)

- Cada `transition: … <n>s ease` o `ease` sin sufijo → `var(--ease-out)`; `ease-out` literal → `var(--ease-out)`; `ease-in` se conserva solo en salidas.
- `cubic-bezier(0.34, 1.56, 0.64, 1)` (`:853`, `:1753`) → `var(--ease-spring)`; `cubic-bezier(0.32, 0.72, 0.18, 1)` (`:1096`) → `var(--ease-ios)`; `cubic-bezier(0.22, 1, 0.36, 1)` → `var(--ease-out)`.
- Duraciones: 0.06–0.15 s → `var(--dur-tap)`; 0.18–0.28 s → `var(--dur-state)`; 0.3–0.45 s → `var(--dur-layout)`; 0.6 s en `.celebrate-pop` → `var(--dur-focal)`. Los skeletons/spinner (1.2–2.4 s, `infinite`) y `--ring` no cambian de duración.
- Borrar `transition: width .3s ease` muerta de `.progress__bar` (`:532`) dejando la de `:1733` como `transition: width var(--dur-layout) var(--ease-out)`.
- Verificar: `grep -nE '[0-9.]+m?s (ease|cubic-bezier)' src/styles/*.css` → solo skeletons, spinner y `sheet-*`/`toast-*` (que la Tarea 8 y 10 retocan).

- [ ] **Step 4: Anillo sincronizado** (`components.css:2309`, `SessionRing.tsx`, `SessionRun.tsx:534`)

```css
.ring__bar {
  transition: stroke-dashoffset 1000ms linear, stroke var(--dur-layout) var(--ease-out);
}
.ring--reached .ring__bar {
  stroke: var(--success);
}
.ring--reached .ring__center {
  animation: check-pop var(--dur-layout) var(--ease-spring);
}
```
`SessionRing` recibe `reached?: boolean` y renderiza `className={`ring${reached ? ' ring--reached' : ''}`}`. En `SessionRun.tsx:534` (`<SessionRing progress={1}>` del objetivo cumplido) pasar `reached`.

- [ ] **Step 5: Acuse de recibo en la agenda** (`components.css`)

```css
.blk__head,
.wk-day__head {
  transition: background-color var(--dur-tap) var(--ease-out), transform var(--dur-tap) var(--ease-out);
  border-radius: var(--radius-sm);
}
.blk__head:active,
.wk-day__head:active {
  background: var(--surface-2);
  transform: scale(0.995);
}
button.ag-row {
  transition: opacity var(--dur-tap) var(--ease-out);
}
```

- [ ] **Step 6: Cascadas solo en carga fría** (`today.css:14-17`, `Today.tsx`, `learn-enter`, `session-plan.css`)

```css
.today-enter {
  animation: today-rise var(--dur-state) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 24ms);
}
.screen[data-warm] .today-enter {
  animation: none;
}
```
En `Today.tsx`, `const warm = useRef(cached !== undefined).current` junto a `cached` (`:92`), y la raíz `<div className="screen">` (`:561`) pasa a `<div className="screen" data-warm={warm ? '' : undefined}>`. `.learn-enter`: `0.4s` → `var(--dur-layout)` y `55ms` → `36ms`. `.session-plan__item`: `0.3s` → `var(--dur-state)` y `40ms` → `32ms`.

- [ ] **Step 7: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(motion): tokens de duración, reduced-motion que conserva el feedback y anillo sincronizado"
```

---

### Task 5: Íconos — correcciones (I1, I2, I7, I8, I9, I10)

**Files:**
- Modify: `src/components/HabitRow.tsx:44-55`, `src/screens/Habits.tsx:554-561`, `src/components/MilestoneChecklist.tsx:68-75`, `src/screens/calendar/AgendaRow.tsx:112`, `src/components/SessionCard.tsx:122-129`
- Modify: `src/components/TaskItem.tsx:101-103`, `src/components/MilestoneChecklist.tsx:152`, `src/components/wizard/MilestonesStep.tsx:152`, `src/screens/Habits.tsx:117`, `src/components/wizard/CommitmentStep.tsx:165`
- Modify: `src/components/Hint.tsx:20-23`, `src/screens/Learn.tsx:256`
- Modify: `src/screens/Calendar.tsx:618-621`, `src/styles/components.css:3083` (`.ag-chev`)
- Modify: `src/components/icons.tsx` (`IconHito`, `IconProgress`, `IconFlag`, `IconQuote`), `src/assets/logo-96.png` (nuevo), `public/favicon.png`, `public/logo-previews.png` (borrar)
- Modify: `src/domain/niches.ts`, `src/domain/templates.ts` (campo `emoji`), `src/lib/types.ts`

- [ ] **Step 1: El ✓ en los cinco checks**

Abrir los botones autocerrados e insertar `<IconCheck size={16} />` (importar de `@/components/icons`): `HabitRow.tsx:44-55`, `Habits.tsx:554-561`, `MilestoneChecklist.tsx:68-75`, `SessionCard.tsx:122-129`. En `AgendaRow.tsx:112` (`span.check.check--sm`) insertar `<IconCheck size={12} />`.

- [ ] **Step 2: Papelera en lo destructivo**

`IconClose` → `IconTrash` en `MilestoneChecklist.tsx:152`, `MilestonesStep.tsx:152`, `Habits.tsx:117`, `CommitmentStep.tsx:165` (mismos `size`). En `TaskItem.tsx:101-103`: `{isGoalTask ? <IconArrowDown size={18} /> : <IconTrash size={18} />}`. Ajustar imports (quitar `IconClose` donde quede sin uso).

- [ ] **Step 3: La bombilla solo para catálogos de ideas**

`Hint.tsx`: borrar el `<span className="hint__icon">` y el import de `IconLightbulb`. `Learn.tsx:256`: `IconLightbulb` → `IconPlay` (mismo `size`), ajustar import.

- [ ] **Step 4: Chevron "Siguiente" y ranura de la agenda**

`Calendar.tsx:618-621`: reemplazar el `span` con `scaleX(-1)` por `<IconChevronRight size={24} />`. CSS `.ag-chev`:
```css
.ag-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--text-faint);
}
```

- [ ] **Step 5: Marca ligera y grilla óptica**

```bash
sips -Z 96 src/assets/logo.png --out src/assets/logo-96.png
sips -Z 192 public/favicon.png --out public/favicon.png
git rm -q public/logo-previews.png
```
En `icons.tsx`, `import logo96Url from '@/assets/logo-96.png'` y en `IconHito` usar `src={size <= 48 ? logo96Url : logoUrl}`. Borrar `color: var(--primary)` de `.brand__mark` (`components.css:929`) y el bloque `.screen--full .brand__mark` (`:1816-1819`), y los `style={{ color: 'var(--primary)' }}` de `Auth.tsx` sobre `brand__mark` (`:164`, `:177`): tiñen un `<img>`.
Redibujar:
- `IconProgress`: `<polyline points="3 17.5 9 10.5 13 14.5 21 5.5" />` y `<polyline points="15 5.5 21 5.5 21 11.5" />`.
- `IconFlag`: `<path d="M6.5 21V4" />` y `<path d="M6.5 4h11l-2 3.5L17.5 11h-11" />`.
- `IconQuote`: `<path d="M7 6c-2 0-3 1.5-3 3.5C4 12 5.5 14 8 14M8 6l-1 12" />` y `<path d="M17 6c-2 0-3 1.5-3 3.5C14 12 15.5 14 18 14M18 6l-1 12" />`.

- [ ] **Step 6: Campo `emoji` muerto**

Borrar el campo `emoji` de `niches.ts` (tipo y 8 valores) y de las 11 plantillas en `templates.ts` (y del tipo `GoalTemplate` en `types.ts` si allí vive). `grep -rn "emoji" src` → 0 (salvo comentarios que también se actualizan).

- [ ] **Step 7: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src public
git commit -m "feat(iconos): tick en todos los checks, papelera en borrar, marca ligera y glifos centrados"
```

---

### Task 6: Íconos — sistema (I3, I4, I5, I6) y píldora deslizante (M11a)

**Files:**
- Modify: `src/components/icons.tsx:8-9, 18` (`base`), `:31-38` (`IconToday`), `IconGoals`, `IconCalendar`, `IconFlame`, `IconProgress` (prop `filled`)
- Modify: `src/components/BottomNav.tsx`, `src/components/SideNav.tsx` (ítems de navegación)
- Modify: `src/styles/components.css:461-470` (`.glyph`), `:3154`, `:3385` (puntos), `:1737-1749` (píldora)

**Interfaces:**
- Produces `IconProps.filled?: boolean` (solo lo honran los 5 íconos de navegación; los demás lo ignoran).

- [ ] **Step 1: Trazo calibrado** (`icons.tsx:18`)

```ts
function base(size: number) {
  // Trazo renderizado ≈ 1,75 px entre 16 y 24 px; más fino en miniatura y
  // acotado en tamaños héroe (antes iba de 0,73 px a 4,7 px).
  const strokeWidth = Math.min(2.75, Math.max(1.6, 42 / size))
  …
}
```
Corregir el comentario de `:8-9` para que describa esto.

- [ ] **Step 2: `IconToday` nuevo y variante `filled`**

`IconProps` gana `filled?: boolean`. `IconToday`:
```tsx
export function IconToday({ size = 24, className, style, filled = false }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4.5" fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.2 : undefined} />
      <path d="M8.5 12.3l2.4 2.4 4.8-5.2" />
    </svg>
  )
}
```
Mismo patrón en `IconGoals` (círculo exterior), `IconCalendar` (el `rect`), `IconFlame` (primer `path`) e `IconProgress` (añadir `<path d="M15 5.5h6v6" fill=… />` cerrado como cabeza: `M15 5.5h6v6z`). El relleno es `currentColor` al 20 %: funciona en cualquier tema.

- [ ] **Step 3: Contraste de los glifos de nicho en claro** (`components.css:461-470`)

```css
.glyph {
  …
  background: color-mix(in srgb, var(--niche, var(--text)) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--niche, var(--text)) 22%, var(--border-soft));
  color: color-mix(in srgb, var(--niche, var(--primary)) 55%, var(--text));
}
[data-theme='oscuro'] .glyph {
  background: color-mix(in srgb, var(--niche, var(--text)) 14%, var(--surface-2));
  border-color: color-mix(in srgb, var(--niche, var(--text)) 26%, var(--border-soft));
  color: color-mix(in srgb, var(--niche, var(--primary)) 78%, var(--text));
}
```
`.blk__dot` y `.wk-day__dot`: `background: color-mix(in srgb, var(--niche, var(--text-faint)) 70%, var(--text))` y en `[data-theme='oscuro']` el `--niche` puro.

- [ ] **Step 4: Píldora deslizante y activo relleno** (`BottomNav.tsx`, `components.css:1737-1749`)

`BottomNav` calcula `const activeIndex = TABS.findIndex(...)` con la misma regla de `isActive`/`alsoMatch` (usar `pathname`: `to === '/' ? pathname === '/' : pathname.startsWith(to) || (alsoMatch && pathname.startsWith(alsoMatch))`) y pone `style={{ '--tab': Math.max(0, activeIndex) } as CSSProperties}` en `.bottomnav__inner`. Cada `<Icon size={23} filled={active} />`.
```css
.bottomnav__inner {
  position: relative;
  --tab: 0;
}
.bottomnav__inner::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 0;
  width: 20%;
  height: 30px;
  z-index: -1;
  background: var(--primary-soft);
  border-radius: var(--radius-pill);
  transform: translateX(calc(var(--tab) * 100%)) scaleX(0.5);
  transition: transform var(--dur-state) var(--ease-ios);
}
```
Borrar `.bottomnav__item--active::before`. `.bottomnav__item` conserva su color activo. En `SideNav.tsx` pasar `filled` al ícono del ítem activo (sin píldora).

- [ ] **Step 5: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(iconos): trazo calibrado, Hoy con dibujo propio, activo relleno y píldora deslizante"
```

---

### Task 7: Plegado animado (M2)

**Files:**
- Rewrite: `src/components/Disclosure.tsx`
- Modify: `src/screens/calendar/AgendaBlock.tsx:73-84`, `src/screens/calendar/WeekDay.tsx:69-73`
- Modify: `src/styles/components.css` (`.disclosure*` ~3438-3486, `.blk__body:3168`, `.wk-day__body:3399`)

**Interfaces:** `Disclosure` mantiene `summary`, `defaultOpen`, `className`, `children`.

- [ ] **Step 1: `Disclosure` sin `<details>`**

```tsx
import { useEffect, useId, useState, type ReactNode } from 'react'
import { IconChevronRight } from '@/components/icons'

/**
 * Desplegable con la gramática de "desplegar hacia abajo" de toda la app.
 * Botón + cuerpo siempre en el árbol: el cuerpo se pliega con
 * grid-template-rows (animable) y queda inert cuando está cerrado.
 */
export function Disclosure({ summary, defaultOpen = false, className, children }: {
  summary: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Igual que <details open={x}>: si el padre cambia defaultOpen, se sigue.
  useEffect(() => setOpen(defaultOpen), [defaultOpen])
  const id = useId()
  return (
    <div className={`disclosure${open ? ' disclosure--open' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="disclosure__summary" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="disclosure__label">{summary}</span>
        <span className="disclosure__chev" aria-hidden="true">
          <IconChevronRight size={16} />
        </span>
      </button>
      <div className="disclosure__wrap">
        <div className="disclosure__body" id={id} inert={!open}>
          {children}
        </div>
      </div>
    </div>
  )
}
```
CSS: `.disclosure__summary` suma `width: 100%; background: none; border: 0; font: inherit; text-align: left;`; `.disclosure[open] > …` pasa a `.disclosure--open > .disclosure__summary .disclosure__chev`; borrar `::-webkit-details-marker`.
```css
.disclosure__wrap,
.blk__wrap,
.wk-day__wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-layout) var(--ease-out);
}
.disclosure--open > .disclosure__wrap,
.blk--open > .blk__wrap,
.wk-day--open > .wk-day__wrap {
  grid-template-rows: 1fr;
}
.disclosure__wrap > .disclosure__body,
.blk__wrap > .blk__body,
.wk-day__wrap > .wk-day__body {
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 2: Bloques y días**

`AgendaBlock.tsx:73-84`: `const [mounted, setMounted] = useState(defaultOpen)`; al abrir (`setOpen`) también `setMounted(true)`. Reemplazar `{open && (<div className="blk__body" …>)}` por `<div className="blk__wrap"><div className="blk__body" id={bodyId} inert={!open}>{mounted && (…mismo contenido…)}</div></div>`. `aria-controls={bodyId}` siempre (el cuerpo existe). Igual en `WeekDay.tsx:69-73` con `wk-day__wrap`/`wk-day__body`.

- [ ] **Step 3: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(motion): plegado animado en bloques, días y desplegables"
```

---

### Task 8: Hojas con salida y arrastre (M4)

**Files:**
- Create: `src/components/Sheet.tsx`
- Modify: `src/screens/calendar/AddSheet.tsx`, `src/screens/Calendar.tsx` (cinco hojas: `:937`, `:1153`, `:1297`, `:1362`, `:1564`)
- Modify: `src/styles/components.css:1082-1132`

**Interfaces:**
```tsx
export function Sheet({ onClose, label, panelClassName = 'stack stack--lg', as = 'div', onSubmit, children }: {
  onClose: () => void
  /** aria-label del diálogo. */
  label: string
  panelClassName?: string
  as?: 'div' | 'form'
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** Recibe `close()` para los botones propios de la hoja. */
  children: (close: () => void) => ReactNode
}): JSX.Element
```

- [ ] **Step 1: `Sheet.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState, type FormEventHandler, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const DRAG_ZONE = 48 // px desde el borde superior del panel: el grabber
const DISMISS_AT = 80 // px arrastrados hacia abajo que cierran

export function Sheet({ onClose, label, panelClassName = 'stack stack--lg', as = 'div', onSubmit, children }: { … }) {
  const panelRef = useRef<HTMLElement>(null)
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const close = useCallback(() => setClosing(true), [])
  useFocusTrap(panelRef, close)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  // Arrastre desde el grabber: sigue el dedo; soltar lejos cierra, cerca vuelve.
  const drag = useRef<{ startY: number; dy: number } | null>(null)
  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    const top = e.currentTarget.getBoundingClientRect().top
    if (e.clientY - top > DRAG_ZONE) return
    drag.current = { startY: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
    e.currentTarget.style.transform = `translateY(${drag.current.dy}px)`
    e.currentTarget.style.transition = 'none'
  }
  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return
    const { dy } = drag.current
    drag.current = null
    e.currentTarget.style.transition = ''
    if (dy > DISMISS_AT) close()
    else e.currentTarget.style.transform = ''
  }
  const Panel = as
  return (
    <div className={`sheet${closing ? ' sheet--closing' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
      <div className="sheet__backdrop" onClick={close} />
      <Panel
        ref={panelRef as never}
        className={`sheet__panel ${panelClassName}`}
        onSubmit={onSubmit}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onAnimationEnd={(e) => { if (closing && e.animationName === 'sheet-down') onCloseRef.current() }}
      >
        {children(close)}
      </Panel>
    </div>
  )
}
```
CSS (`components.css`, junto a `sheet-up`):
```css
.sheet__panel {
  animation: sheet-up var(--dur-layout) var(--ease-ios);
  transition: transform var(--dur-state) var(--ease-out);
}
.sheet--closing .sheet__panel {
  animation: sheet-down var(--dur-state) var(--ease-ios) forwards;
}
.sheet--closing .sheet__backdrop {
  animation: sheet-fade 160ms ease-in reverse forwards;
}
@keyframes sheet-down {
  to {
    transform: translateY(100%);
  }
}
```
(`sheet-fade` pasa de `220ms ease-out` a `var(--dur-state) var(--ease-out)`.)

- [ ] **Step 2: Migrar las seis hojas**

`AddSheet.tsx` y las cinco de `Calendar.tsx`: reemplazar el `div.sheet` + `div.sheet__backdrop` + panel por `<Sheet onClose={onClose} label="…">{(close) => (<>…</>)}</Sheet>`; los botones "Cerrar"/"Cancelar" llaman a `close` (no a `onClose`); las hojas que guardan y cierran siguen llamando a `onClose`/`onSave` directamente (el desmontaje tras guardar no necesita animación). La hoja `form` (`:1564`) usa `as="form" onSubmit={handleSubmit}`. Quitar de cada hoja `useFocusTrap`, `panelRef` y el bloqueo de scroll propios. `label` = el `<h2>` de cada hoja.

- [ ] **Step 3: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(hojas): salida animada y arrastre para cerrar en todas las hojas"
```

---

### Task 9: View Transitions reales (M3)

**Files:**
- Create: `src/lib/viewTransition.ts`
- Modify: `src/components/BottomNav.tsx`, `src/components/SideNav.tsx` (NavLink con transición), `src/screens/Goals.tsx:86, 203` y el título del peek, `src/screens/GoalDetail.tsx` (`<h1>` del título)
- Modify: `src/styles/base.css:139-167`

**Interfaces:**
```ts
/** Ejecuta `fn` dentro de una View Transition si el navegador la soporta y el usuario no pidió menos movimiento. */
export function withViewTransition(fn: () => void): void
```

- [ ] **Step 1: Helper**

```ts
import { flushSync } from 'react-dom'

type WithVT = Document & { startViewTransition?: (cb: () => void) => unknown }

export function withViewTransition(fn: () => void): void {
  const doc = document as WithVT
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fn()
    return
  }
  doc.startViewTransition(() => {
    flushSync(fn)
  })
}
```

- [ ] **Step 2: Navegación con transición**

`BottomNav`/`SideNav`: en cada `NavLink`, `onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); withViewTransition(() => navigate(to)) }}` con `const navigate = useNavigate()`. `Goals.tsx:86` y `:203`: `withViewTransition(() => navigate(`/metas/${id}`))`. El título del peek recibe `style={{ viewTransitionName: `goal-${peek.id}` } as CSSProperties}` y el `<h1>` de `GoalDetail` `style={{ viewTransitionName: `goal-${goal.id}` } as CSSProperties}`.

- [ ] **Step 3: CSS** (`base.css`)

Borrar `@view-transition { navigation: auto; }` (solo aplica entre documentos) y su comentario; conservar las reglas `::view-transition-old/new(root)` con `animation-duration: 200ms` y añadir:
```css
::view-transition-group(*) {
  animation-duration: var(--dur-layout);
  animation-timing-function: var(--ease-ios);
}
```

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(motion): transiciones de vista reales entre pestañas y de la meta a su detalle"
```

---

### Task 10: Momentos focales, háptico y salidas (M5, M10, M11b, M12)

**Files:**
- Create: `src/components/Celebration.tsx`, `src/lib/haptics.ts`
- Modify: `src/screens/GoalDetail.tsx:202, 254`, `src/screens/Review.tsx:277, 306`, `src/components/MilestoneChecklist.tsx`
- Modify: `src/components/Roadmap.tsx`, `src/screens/GoalCreated.tsx:99-102`
- Modify: `src/components/TaskItem.tsx`, `HabitRow.tsx`, `SessionCard.tsx`, `src/screens/calendar/AgendaRow.tsx`, `EventCheck.tsx` (háptico al marcar)
- Modify: `src/hooks/useCheer.ts`, `src/app/toast.tsx`, `src/screens/Today.tsx` (cheer con `leaving`)
- Modify: `src/styles/components.css` (`.won`, `.mstone--just-done`, `.roadmap--intro`, `.toast--leaving`, `.cheer--leaving`)

**Interfaces:**
```ts
export function tapHaptic(): void        // navigator.vibrate?.(10)
export function successHaptic(): void    // navigator.vibrate?.([12, 40, 12])
export function Celebration({ title, onDone }: { title: string; onDone: () => void }): JSX.Element
// Roadmap: intro?: boolean · useCheer(): { cheerMessage, cheerLeaving, cheer }
```

- [ ] **Step 1: Háptico y celebración**

`haptics.ts` con las dos funciones (sin efecto si `navigator.vibrate` no existe). `Celebration.tsx`:
```tsx
export function Celebration({ title, onDone }: { title: string; onDone: () => void }) {
  useEffect(() => { successHaptic() }, [])
  return (
    <div className="won" role="status" aria-live="polite" onAnimationEnd={(e) => { if (e.animationName === 'won-out') onDone() }}>
      <span className="celebrate-pop won__icon"><IconCelebrate size={64} /></span>
      <strong className="won__title">{title}</strong>
    </div>
  )
}
```
```css
.won {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-content: center;
  gap: var(--s3);
  text-align: center;
  color: var(--primary);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  animation: won-in var(--dur-state) var(--ease-out) both, won-out var(--dur-state) ease-in 2.2s both;
  pointer-events: none;
}
.won__title {
  font-size: var(--fs-xl);
  color: var(--text);
}
@keyframes won-in { from { opacity: 0; } }
@keyframes won-out { to { opacity: 0; } }
```
`GoalDetail.tsx:202`: además del toast, `setWon('¡Meta lograda!')` y renderizar `{won && <Celebration title={won} onDone={() => setWon(null)} />}`. `Review.tsx:277` y `:306`: igual con `'¡Meta lograda!'`.

- [ ] **Step 2: Flash de etapa cumplida**

`MilestoneChecklist` recibe `justDoneId?: string | null`; la fila con ese id lleva `mstone--just-done`. `GoalDetail.tsx:254` (rama `willBeDone` con pendientes): `setJustDoneId(m.id); successHaptic()` y limpiar tras 700 ms (`setTimeout`).
```css
.mstone--just-done {
  animation: mstone-flash 700ms var(--ease-out);
  border-radius: var(--radius-sm);
}
@keyframes mstone-flash {
  from { background: color-mix(in srgb, var(--success) 22%, transparent); }
  to { background: transparent; }
}
```

- [ ] **Step 3: El camino se traza al crear la meta**

`Roadmap` recibe `intro?: boolean` → clase `roadmap roadmap--intro` y cada `roadmap__svg-step` con `style={{ '--i': i } as CSSProperties}`. `GoalCreated.tsx:99` pasa `intro`.
```css
.roadmap--intro .roadmap__path--base,
.roadmap--intro .roadmap__path--done {
  animation: path-draw 900ms var(--ease-out) both;
}
@keyframes path-draw { from { stroke-dasharray: 0 100; } }
.roadmap--intro .roadmap__svg-step {
  transform-box: fill-box;
  transform-origin: center;
  animation: celebrate-pop var(--dur-layout) var(--ease-spring) both;
  animation-delay: calc(240ms + var(--i, 0) * 120ms);
}
```
El `path--base` necesita `pathLength={100}` en el SVG para que `stroke-dasharray: 0 100` lo cubra (añadirlo en `Roadmap.tsx:56`).

- [ ] **Step 4: Háptico en los checks**

`tapHaptic()` al marcar (no al desmarcar) en `TaskItem.tsx:76`, `HabitRow.tsx:54`, `SessionCard.tsx:126` (quick done), `AgendaRow.tsx` (check de hábito) y `EventCheck.tsx`.

- [ ] **Step 5: Salida de toast y cheer**

`toast.tsx`: un segundo temporizador a `AUTO_DISMISS_MS - 160` que pone `leaving: true` en `current`; clase `toast--leaving`. `useCheer`: mismo patrón, devuelve `cheerLeaving`; `Today.tsx` renderiza `className={`cheer${cheerLeaving ? ' cheer--leaving' : ''}`}`.
```css
.toast--leaving { animation: toast-in 160ms ease-in reverse forwards; }
.cheer--leaving { animation: cheer-in 160ms ease-in reverse forwards; }
```

- [ ] **Step 6: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add -A src
git commit -m "feat(motion): celebración al lograr, etapa que se enciende, camino que se traza y háptico en los checks"
```

---

## Fuera de este plan (decisiones de producto, se listan en la PR)

- V7: consolidar la gamificación (chip de racha en Hoy, anillo de marco en TopBar/SideNav) en una sola superficie y renombrar "Leyenda".
- I6 (rótulo): renombrar la pestaña "Crecer" o la pantalla "Progreso".
- Reemplazar Blendy por la transición nativa y quitar el paso del peek.
- Remapear los ~150 tamaños de íconos a la escala 12/14/16/20/24/32.
- V8: ícono de alerta en `ErrorBoundary` (el copy actual asume una actualización).
