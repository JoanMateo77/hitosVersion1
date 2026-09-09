# Agenda por bloques de tiempo — Fase 1 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la grilla horaria de `/calendario` por una cronología del día en bloques de tiempo desplegables (una fila por hábito, huecos libres tocables, línea "Ahora") y convertir la vista Semana en un acordeón por día.

**Architecture:** La lógica de agrupar ítems con hora en bloques, decidir la franja del día y qué bloque abrir vive como funciones puras en `src/domain/agenda.ts` y `src/domain/habits.ts` (con tests Vitest). La UI nueva se reparte en archivos pequeños bajo `src/screens/calendar/` (`agendaItems.ts`, `EventCheck.tsx`, `AgendaRow.tsx`, `AgendaBlock.tsx`, `DayAgenda.tsx`, `WeekDay.tsx`, `AddSheet.tsx`); `Calendar.tsx` conserva la carga de datos, las mutaciones y las hojas existentes, y pierde la grilla y sus filas. El CSS de grilla se borra y entra el CSS de filas/bloques/acordeón.

**Tech Stack:** React 19 + TypeScript estricto + Vite 6, Vitest (entorno node, solo `src/**/*.test.ts`), CSS propio con tokens (`src/styles/tokens.css`, `components.css`). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-09-agenda-bloques-dieta-informacion-design.md` (§4, §5.1–5.4, §6–§8).

## Global Constraints

- Copy en español neutro profesional con tuteo ("tienes", "puedes"); nunca voseo.
- Lógica de negocio pura en `src/domain/` (sin I/O), separada de UI y servicios.
- TypeScript estricto: `npm run typecheck` y `npm run lint` limpios al cerrar cada tarea que toque `.ts/.tsx`.
- `npm test` verde en cada commit.
- Sin cambios de modelo de datos, servicios ni migraciones.
- `BlockSheet`, `ReorganizeSheet`, `TimeSheet`, `EventEditor` y `PlanSessionSheet` no cambian por dentro; solo cómo se abren.
- Nunca incluir `Co-Authored-By` ni atribución a Claude en los commits.
- Estilos solo con tokens (`var(--…)`); `prefers-reduced-motion` desactiva transiciones nuevas.
- Un ítem sin fin ocupa **30 min efectivos** (`MIN_EFFECTIVE_MINUTES`) solo para solapes y huecos.
- Huecos libres visibles solo si duran **60 min o más** y solo entre bloques.
- Franjas: `< 12:00` Mañana · `< 19:00` Tarde · resto Noche.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/domain/agenda.ts` (modificar) | + `DayItemSpan`, `DayBlock`, `groupIntoBlocks`, `DayPeriod`, `PERIOD_LABELS`, `PERIOD_ORDER`, `periodOf`, `periodOfMinutes`, `defaultOpenBlock`, `nowLineIndex`; `freeGaps(items, minMinutes)`. − `gridBounds`, `layoutDay`, `uncoveredGaps`, `GridBounds`, `GridPlacement`. |
| `src/domain/agenda.test.ts` (modificar) | Tests de lo anterior; se borran los de grilla. |
| `src/domain/habits.ts` (modificar) | + `HabitDayRow`, `habitDayRow`, `habitTogglePlan`. |
| `src/domain/habits.test.ts` (modificar) | Tests nuevos. |
| `src/lib/date.ts` + `src/lib/date.test.ts` (modificar) | + `formatTimeShort` ("7:00", "10:30"). |
| `src/screens/Today.tsx` (modificar) | `toggleHabit` usa `habitTogglePlan`. |
| `src/screens/calendar/agendaItems.ts` (crear) | Tipos e helpers de ítems de agenda (movidos desde `Calendar.tsx`) + `weekDaySummary`. |
| `src/screens/calendar/agendaItems.test.ts` (crear) | Tests de `weekDaySummary`. |
| `src/screens/calendar/EventCheck.tsx` (crear) | Check circular de evento (movido desde `Calendar.tsx`). |
| `src/screens/calendar/AgendaRow.tsx` (crear) | Fila de sesión / hábito / evento. |
| `src/screens/calendar/AgendaBlock.tsx` (crear) | Bloque desplegable de varios ítems. |
| `src/screens/calendar/DayAgenda.tsx` (crear) | Cronología completa de un día. |
| `src/screens/calendar/WeekDay.tsx` (crear) | Día del acordeón de la semana. |
| `src/screens/calendar/AddSheet.tsx` (crear) | Hoja del "+": Evento / Sesión para una meta. |
| `src/screens/Calendar.tsx` (modificar) | Cabecera con acciones, vistas Día/Semana/Mes con `DayAgenda`, sin grilla ni filas viejas. |
| `src/styles/components.css` (modificar) | + `ag-*`, `blk-*`, `wk-*`; − `tg-*`, `ev-gap`, `ev--block`, etc. |

---

### Task 1: `groupIntoBlocks` — agrupar ítems con hora en bloques

**Files:**
- Modify: `src/domain/agenda.ts` (después de `effectiveEnd`, línea ~163)
- Test: `src/domain/agenda.test.ts`

**Interfaces:**
- Consumes: `timeToMinutes` (`@/domain/commitment`), `effectiveEnd(startMin, end)` y `MIN_EFFECTIVE_MINUTES` ya existentes en `agenda.ts`.
- Produces:
  ```ts
  export interface DayItemSpan { key: string; start: string; end: string | null }
  export interface DayBlock {
    key: string; start: string; end: string | null; startMin: number; endMin: number; items: DayItemSpan[]
  }
  export function groupIntoBlocks(items: DayItemSpan[]): DayBlock[]
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/domain/agenda.test.ts` (y sumar `groupIntoBlocks` y `type DayItemSpan` al import de `@/domain/agenda`):

```ts
function span(over: Partial<DayItemSpan> = {}): DayItemSpan {
  return { key: 'a', start: '08:00', end: '09:00', ...over }
}

describe('groupIntoBlocks', () => {
  it('lista vacía → sin bloques', () => {
    expect(groupIntoBlocks([])).toEqual([])
  })

  it('ítems que no se tocan → un bloque por ítem, ordenados por inicio', () => {
    const blocks = groupIntoBlocks([
      span({ key: 'b', start: '10:00', end: '11:00' }),
      span({ key: 'a', start: '08:00', end: '09:00' }),
    ])
    expect(blocks.map((b) => b.items.map((i) => i.key))).toEqual([['a'], ['b']])
    expect(blocks[0]).toMatchObject({ key: 'b-08:00', start: '08:00', end: '09:00', startMin: 480, endMin: 540 })
  })

  it('solape parcial → un bloque con rango real y fin efectivo máximo', () => {
    const [b] = groupIntoBlocks([
      span({ key: 'a', start: '08:00', end: '08:45' }),
      span({ key: 'h', start: '08:00', end: null }),
      span({ key: 'c', start: '08:30', end: '09:30' }),
    ])
    expect(b.items.map((i) => i.key)).toEqual(['a', 'h', 'c'])
    expect(b.end).toBe('09:30')
    expect(b.endMin).toBe(570)
  })

  it('ítems que se tocan (fin == inicio) NO se unen', () => {
    const blocks = groupIntoBlocks([
      span({ key: 'a', start: '08:00', end: '08:30' }),
      span({ key: 'b', start: '08:30', end: '09:00' }),
    ])
    expect(blocks).toHaveLength(2)
  })

  it('un ítem puntual cubre 30 min efectivos y por eso absorbe lo que empieza dentro', () => {
    const blocks = groupIntoBlocks([
      span({ key: 'h', start: '20:00', end: null }),
      span({ key: 'e', start: '20:15', end: '20:45' }),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].end).toBe('20:45')
  })

  it('si ningún ítem tiene fin, el fin real del bloque es null pero el efectivo es inicio + 30', () => {
    const [b] = groupIntoBlocks([span({ key: 'h', start: '07:00', end: null })])
    expect(b.end).toBeNull()
    expect(b.endMin).toBe(450)
  })

  it('empate de inicio: el más largo va primero; luego por clave', () => {
    const [b] = groupIntoBlocks([
      span({ key: 'corto', start: '08:00', end: '08:15' }),
      span({ key: 'largo', start: '08:00', end: '09:00' }),
      span({ key: 'sin-fin', start: '08:00', end: null }),
    ])
    // largo: fin 09:00; corto y sin-fin: fin efectivo 08:30 (empate) → por clave
    expect(b.items.map((i) => i.key)).toEqual(['largo', 'corto', 'sin-fin'])
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run src/domain/agenda.test.ts -t groupIntoBlocks`
Expected: FAIL — `groupIntoBlocks is not a function` / import inexistente.

- [ ] **Step 3: Implementar**

En `src/domain/agenda.ts`, justo después de la función `effectiveEnd`, agregar:

```ts
/* ---- Bloques de tiempo del día (2026-09) --------------------------------
   La cronología agrupa lo que se solapa en el tiempo en UN bloque que la UI
   despliega. Todo es puro: minutos, orden y rangos. */

/** Ítem con hora del día, listo para agrupar. */
export interface DayItemSpan {
  key: string
  start: string
  end: string | null
}

/** Franja compartida: rango real y sus ítems, ordenados por inicio. */
export interface DayBlock {
  /** `b-${start}` del primer ítem (único: dos bloques no pueden empezar igual). */
  key: string
  /** Inicio del primer ítem. */
  start: string
  /** El mayor fin REAL de sus ítems; null si ninguno tiene fin. */
  end: string | null
  startMin: number
  /** Fin EFECTIVO (mínimo 30 min por ítem): para solapes, huecos y "ahora". */
  endMin: number
  items: DayItemSpan[]
}

/**
 * Agrupa los ítems con hora en bloques: se ordena por inicio (empate: el más
 * largo primero, luego por clave) y un ítem se une al bloque abierto SOLO si
 * empieza antes de su fin efectivo (solape estricto: lo que se toca no se
 * une). Un ítem sin fin cuenta 30 min efectivos.
 */
export function groupIntoBlocks(items: DayItemSpan[]): DayBlock[] {
  const sorted = items
    .map((it) => {
      const startMin = timeToMinutes(it.start)
      return { it, startMin, effEnd: effectiveEnd(startMin, it.end) }
    })
    .sort((a, b) => a.startMin - b.startMin || b.effEnd - a.effEnd || a.it.key.localeCompare(b.it.key))
  const blocks: DayBlock[] = []
  let current: DayBlock | null = null
  for (const { it, startMin, effEnd } of sorted) {
    if (current && startMin < current.endMin) {
      current.items.push(it)
      current.endMin = Math.max(current.endMin, effEnd)
      if (it.end && (!current.end || timeToMinutes(it.end) > timeToMinutes(current.end))) {
        current.end = it.end
      }
      continue
    }
    current = { key: `b-${it.start}`, start: it.start, end: it.end, startMin, endMin: effEnd, items: [it] }
    blocks.push(current)
  }
  return blocks
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run src/domain/agenda.test.ts`
Expected: PASS (todos, incluidos los viejos).

- [ ] **Step 5: Commit**

```bash
git add src/domain/agenda.ts src/domain/agenda.test.ts
git commit -m "feat(agenda): groupIntoBlocks agrupa lo que se solapa en bloques de tiempo"
```

---

### Task 2: Franjas del día, bloque abierto por defecto, línea "Ahora" y huecos ≥ 60 min; borrar la grilla del dominio

**Files:**
- Modify: `src/domain/agenda.ts`
- Test: `src/domain/agenda.test.ts`

**Interfaces:**
- Consumes: `DayBlock` (Task 1), `timeToMinutes`.
- Produces:
  ```ts
  export type DayPeriod = 'morning' | 'afternoon' | 'evening'
  export const PERIOD_ORDER: readonly DayPeriod[]
  export const PERIOD_LABELS: Record<DayPeriod, string>   // Mañana · Tarde · Noche
  export function periodOfMinutes(min: number): DayPeriod
  export function periodOf(hhmm: string): DayPeriod
  export function defaultOpenBlock(blocks: DayBlock[], nowMin: number): string | null
  export function nowLineIndex(blocks: DayBlock[], nowMin: number): number
  export function freeGaps(items: Array<{ start: string; end: string | null }>, minMinutes?: number): Map<number, number>
  ```
- Se eliminan `gridBounds`, `layoutDay`, `uncoveredGaps`, `GridBounds`, `GridPlacement`, `GRID_DEFAULT_START`, `GRID_DEFAULT_END`.

- [ ] **Step 1: Borrar los tests de grilla y escribir los nuevos**

En `src/domain/agenda.test.ts`:
1. Quitar `gridBounds`, `layoutDay`, `uncoveredGaps` del import y borrar los `describe('gridBounds')`, `describe('layoutDay')` y `describe('uncoveredGaps')` completos.
2. Sumar al import: `defaultOpenBlock, groupIntoBlocks, nowLineIndex, periodOf, periodOfMinutes, PERIOD_LABELS, PERIOD_ORDER`.
3. Agregar:

```ts
describe('periodOf', () => {
  it('11:59 es mañana, 12:00 tarde, 18:59 tarde, 19:00 noche', () => {
    expect(periodOf('11:59')).toBe('morning')
    expect(periodOf('12:00')).toBe('afternoon')
    expect(periodOf('18:59')).toBe('afternoon')
    expect(periodOf('19:00')).toBe('evening')
    expect(periodOfMinutes(0)).toBe('morning')
  })
  it('las etiquetas y el orden son Mañana · Tarde · Noche', () => {
    expect(PERIOD_ORDER.map((p) => PERIOD_LABELS[p])).toEqual(['Mañana', 'Tarde', 'Noche'])
  })
})

describe('defaultOpenBlock / nowLineIndex', () => {
  const blocks = groupIntoBlocks([
    span({ key: 'a', start: '08:00', end: '09:00' }),
    span({ key: 'b', start: '14:00', end: '15:00' }),
  ])
  it('dentro de un bloque: abre ese bloque y la línea va después de él', () => {
    expect(defaultOpenBlock(blocks, 8 * 60 + 30)).toBe('b-08:00')
    expect(nowLineIndex(blocks, 8 * 60 + 30)).toBe(1)
  })
  it('entre bloques: abre el próximo y la línea va antes de él', () => {
    expect(defaultOpenBlock(blocks, 10 * 60)).toBe('b-14:00')
    expect(nowLineIndex(blocks, 10 * 60)).toBe(1)
  })
  it('antes del primero: abre el primero, línea al índice 0', () => {
    expect(defaultOpenBlock(blocks, 6 * 60)).toBe('b-08:00')
    expect(nowLineIndex(blocks, 6 * 60)).toBe(0)
  })
  it('después del último: nada abierto, línea al final', () => {
    expect(defaultOpenBlock(blocks, 20 * 60)).toBeNull()
    expect(nowLineIndex(blocks, 20 * 60)).toBe(2)
  })
  it('sin bloques: null y 0', () => {
    expect(defaultOpenBlock([], 600)).toBeNull()
    expect(nowLineIndex([], 600)).toBe(0)
  })
})

describe('freeGaps con umbral', () => {
  it('con minMinutes 60 ignora huecos de 45 min y reporta los de 60', () => {
    const gaps = freeGaps(
      [
        { start: '08:00', end: '09:00' },
        { start: '09:45', end: '10:00' },
        { start: '11:00', end: '12:00' },
      ],
      60,
    )
    expect([...gaps.entries()]).toEqual([[2, 60]])
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/domain/agenda.test.ts`
Expected: FAIL por exports inexistentes (`periodOf`, `defaultOpenBlock`, …).

- [ ] **Step 3: Implementar y borrar la grilla**

En `src/domain/agenda.ts`:

1. Cambiar la firma y el umbral de `freeGaps`:

```ts
/**
 * Huecos libres: recibe los ítems CON hora ya ordenados por inicio y devuelve
 * índice → minutos libres ANTES de ese ítem. Solo huecos de `minMinutes` o
 * más (45 por defecto), medidos desde el fin del anterior (o su inicio si no
 * tiene fin) hasta el inicio del siguiente; los solapes (gap <= 0) se ignoran.
 */
export function freeGaps(
  items: Array<{ start: string; end: string | null }>,
  minMinutes = 45,
): Map<number, number> {
  const gaps = new Map<number, number>()
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]
    const gap = timeToMinutes(items[i].start) - timeToMinutes(prev.end ?? prev.start)
    if (gap >= minMinutes) gaps.set(i, gap)
  }
  return gaps
}
```

2. Borrar desde el comentario `/* ---- Grilla horaria del día (0015)` hasta el final de `uncoveredGaps` inclusive, **excepto** la constante `MIN_EFFECTIVE_MINUTES` y la función `effectiveEnd`, que se conservan (las usa `groupIntoBlocks`). Borrar también `GridBounds`, `GridPlacement`, `GRID_DEFAULT_START`, `GRID_DEFAULT_END`, `gridBounds`, `layoutDay`, `uncoveredGaps`. Dejar el bloque así:

```ts
/** Duración visual mínima: un ítem puntual (sin fin) ocupa media hora. */
const MIN_EFFECTIVE_MINUTES = 30

/** Fin efectivo de un ítem: su fin real, nunca menos de 30 min tras el inicio. */
function effectiveEnd(startMin: number, end: string | null): number {
  const raw = end ? timeToMinutes(end) : startMin
  return Math.max(raw, startMin + MIN_EFFECTIVE_MINUTES)
}
```

3. Después de `groupIntoBlocks`, agregar:

```ts
/** Franja del día, por hora de inicio. */
export type DayPeriod = 'morning' | 'afternoon' | 'evening'
export const PERIOD_ORDER: readonly DayPeriod[] = ['morning', 'afternoon', 'evening']
export const PERIOD_LABELS: Record<DayPeriod, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  evening: 'Noche',
}

/** < 12:00 mañana · < 19:00 tarde · resto noche. */
export function periodOfMinutes(min: number): DayPeriod {
  if (min < 12 * 60) return 'morning'
  if (min < 19 * 60) return 'afternoon'
  return 'evening'
}
export function periodOf(hhmm: string): DayPeriod {
  return periodOfMinutes(timeToMinutes(hhmm))
}

/** Qué bloque abrir por defecto hoy: el que contiene `nowMin` o, si no hay, el próximo. */
export function defaultOpenBlock(blocks: DayBlock[], nowMin: number): string | null {
  const containing = blocks.find((b) => nowMin >= b.startMin && nowMin < b.endMin)
  if (containing) return containing.key
  const next = blocks.find((b) => b.startMin >= nowMin)
  return next ? next.key : null
}

/**
 * Índice del primer bloque que empieza en o después de `nowMin` (ahí va la
 * línea "Ahora"); `blocks.length` si todos empezaron antes (línea al final).
 */
export function nowLineIndex(blocks: DayBlock[], nowMin: number): number {
  const i = blocks.findIndex((b) => b.startMin >= nowMin)
  return i === -1 ? blocks.length : i
}
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npx vitest run src/domain/agenda.test.ts && npm run typecheck`
Expected: tests PASS. El typecheck **fallará** en `src/screens/Calendar.tsx` por los imports `gridBounds`, `layoutDay`, `uncoveredGaps`, `GridPlacement`: es esperado y se resuelve en la Task 8. No commitear el typecheck roto sin nota: el commit de esta tarea es de dominio y la app queda en rojo hasta la Task 8 (todo va a `master` junto al final de la fase).

- [ ] **Step 5: Commit**

```bash
git add src/domain/agenda.ts src/domain/agenda.test.ts
git commit -m "feat(agenda): franjas del día, bloque abierto por defecto y huecos de 60 min; fuera la grilla del dominio"
```

---

### Task 3: `habitDayRow` y `habitTogglePlan`; Hoy los usa

**Files:**
- Modify: `src/domain/habits.ts`
- Modify: `src/screens/Today.tsx:325-360` (función `toggleHabit`)
- Test: `src/domain/habits.test.ts`

**Interfaces:**
- Consumes: `habitTarget`, `habitDoneCount`, `nextSlot` (ya existen).
- Produces:
  ```ts
  export interface HabitDayRow { doneCount: number; target: number; complete: boolean; time: string | null }
  export function habitDayRow(habit: Habit, checks: HabitCheck[], dateISO: string): HabitDayRow
  export function habitTogglePlan(habit: Habit, checks: HabitCheck[], dateISO: string): { slot: number; add: boolean }
  ```

- [ ] **Step 1: Tests que fallan**

Agregar `habitDayRow, habitTogglePlan` al import de `src/domain/habits.test.ts` y al final:

```ts
describe('habitDayRow', () => {
  it('sin horas: una repetición, sin hora, completo con una marca', () => {
    const h = habit({ times: null })
    expect(habitDayRow(h, [], '2026-06-08')).toEqual({ doneCount: 0, target: 1, complete: false, time: null })
    expect(habitDayRow(h, [check()], '2026-06-08')).toEqual({ doneCount: 1, target: 1, complete: true, time: null })
  })
  it('con horas: la hora es la de la PRÓXIMA repetición pendiente', () => {
    const h = habit({ times: ['08:00', '11:00', '14:00'] })
    const checks = [check({ slot: 0 })]
    expect(habitDayRow(h, checks, '2026-06-08')).toEqual({ doneCount: 1, target: 3, complete: false, time: '11:00' })
  })
  it('completo: la hora es la última y doneCount no supera el target', () => {
    const h = habit({ times: ['08:00', '11:00'] })
    const checks = [check({ slot: 0 }), check({ slot: 1 }), check({ slot: 2 })]
    expect(habitDayRow(h, checks, '2026-06-08')).toEqual({ doneCount: 2, target: 2, complete: true, time: '11:00' })
  })
  it('ignora marcas de otros días u otros hábitos', () => {
    const h = habit({ times: ['08:00'] })
    const checks = [check({ date: '2026-06-07' }), check({ habitId: 'otro' })]
    expect(habitDayRow(h, checks, '2026-06-08').doneCount).toBe(0)
  })
})

describe('habitTogglePlan', () => {
  it('con repeticiones pendientes marca la siguiente', () => {
    const h = habit({ times: ['08:00', '11:00', '14:00'] })
    expect(habitTogglePlan(h, [check({ slot: 0 })], '2026-06-08')).toEqual({ slot: 1, add: true })
  })
  it('completo: desmarca la ÚLTIMA', () => {
    const h = habit({ times: ['08:00', '11:00'] })
    expect(habitTogglePlan(h, [check({ slot: 0 }), check({ slot: 1 })], '2026-06-08')).toEqual({ slot: 1, add: false })
  })
  it('sin horas es el toggle de siempre (slot 0)', () => {
    const h = habit({ times: null })
    expect(habitTogglePlan(h, [], '2026-06-08')).toEqual({ slot: 0, add: true })
    expect(habitTogglePlan(h, [check()], '2026-06-08')).toEqual({ slot: 0, add: false })
  })
})
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/domain/habits.test.ts`
Expected: FAIL por exports inexistentes.

- [ ] **Step 3: Implementar en `src/domain/habits.ts`** (después de `nextSlot`)

```ts
/** Cómo se ve un hábito en la agenda de un día: UNA sola fila. */
export interface HabitDayRow {
  doneCount: number
  target: number
  complete: boolean
  /** Hora de la próxima repetición pendiente; si está completo, la última; null sin horas. */
  time: string | null
}

export function habitDayRow(habit: Habit, checks: HabitCheck[], dateISO: string): HabitDayRow {
  const target = habitTarget(habit)
  const doneCount = Math.min(habitDoneCount(checks, habit.id, dateISO), target)
  const complete = doneCount >= target
  const times = habit.times ?? []
  let time: string | null = null
  if (times.length > 0) {
    const next = nextSlot(habit, checks, dateISO)
    time = next === null ? times[times.length - 1] : times[next]
  }
  return { doneCount, target, complete, time }
}

/**
 * Qué slot tocar al marcar desde una fila única: la siguiente repetición
 * pendiente; si el día ya está completo, se desmarca la ÚLTIMA (simétrico).
 * Es la misma regla que usa el check de Hoy.
 */
export function habitTogglePlan(
  habit: Habit,
  checks: HabitCheck[],
  dateISO: string,
): { slot: number; add: boolean } {
  const next = nextSlot(habit, checks, dateISO)
  if (next !== null) return { slot: next, add: true }
  const own = checks.filter((c) => c.habitId === habit.id && c.date === dateISO)
  const last = own.length > 0 ? Math.max(...own.map((c) => c.slot)) : 0
  return { slot: last, add: false }
}
```

- [ ] **Step 4: Hoy usa `habitTogglePlan`**

En `src/screens/Today.tsx`, importar `habitTogglePlan` desde `@/domain/habits` y reemplazar la función `toggleHabit` completa (líneas ~325-360) por:

```ts
  /**
   * Un toque en el check: marca la SIGUIENTE repetición pendiente; si el día
   * ya está completo, desmarca la ÚLTIMA (simétrico). Optimista, con revert.
   */
  function toggleHabit(h: Habit) {
    const { slot, add } = habitTogglePlan(h, habitChecksToday, today)
    const check: HabitCheck = { habitId: h.id, date: today, slot }
    const without = (list: HabitCheck[]) =>
      list.filter((c) => !(c.habitId === h.id && c.date === today && c.slot === slot))
    setHabitChecks((prev) => (add ? [...prev, check] : without(prev)))
    void withErrorHandling(
      async () => {
        await setHabitCheck(userId, h.id, today, add, slot)
      },
      () => setHabitChecks((prev) => (add ? without(prev) : [...prev, check])),
    )
  }
```

Si `nextSlot` queda sin uso en `Today.tsx` tras el cambio, **no** quitarlo del import: sigue usado más abajo (línea ~852, `const next = nextSlot(...)`). Verificar con `npm run lint`.

- [ ] **Step 5: Tests + lint**

Run: `npx vitest run src/domain/habits.test.ts && npm run lint`
Expected: PASS; lint limpio (el typecheck global sigue en rojo por `Calendar.tsx`, esperado).

- [ ] **Step 6: Commit**

```bash
git add src/domain/habits.ts src/domain/habits.test.ts src/screens/Today.tsx
git commit -m "feat(habitos): habitDayRow y habitTogglePlan; Hoy comparte la regla del check"
```

---

### Task 4: `formatTimeShort`

**Files:**
- Modify: `src/lib/date.ts` (después de `formatTime12`)
- Test: `src/lib/date.test.ts`

**Interfaces:**
- Produces: `export function formatTimeShort(hhmm: string): string` — "07:00" → "7:00", "20:30" → "8:30".

- [ ] **Step 1: Test**

En `src/lib/date.test.ts`, sumar `formatTimeShort` al import de `@/lib/date` y agregar:

```ts
describe('formatTimeShort', () => {
  it('quita el sufijo am/pm y el cero inicial', () => {
    expect(formatTimeShort('07:00')).toBe('7:00')
    expect(formatTimeShort('12:05')).toBe('12:05')
    expect(formatTimeShort('20:30')).toBe('8:30')
    expect(formatTimeShort('00:15')).toBe('12:15')
  })
})
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/date.test.ts`
Expected: FAIL (`formatTimeShort` no existe).

- [ ] **Step 3: Implementar**

```ts
/**
 * "20:30" → "8:30": la hora en 12 h SIN sufijo, para columnas donde la
 * franja (Mañana/Tarde/Noche) ya deja claro el am/pm.
 */
export function formatTimeShort(hhmm: string): string {
  return formatTime12(hhmm).replace(/ [ap]m$/, '')
}
```

- [ ] **Step 4: Verificar y commit**

Run: `npx vitest run src/lib/date.test.ts`
Expected: PASS.

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "feat(date): formatTimeShort para columnas de hora sin am/pm"
```

---

### Task 5: `agendaItems.ts` — tipos y helpers compartidos + `weekDaySummary`

**Files:**
- Create: `src/screens/calendar/agendaItems.ts`
- Create: `src/screens/calendar/agendaItems.test.ts`
- Modify: `src/screens/Calendar.tsx` (borrar lo movido; importar desde el módulo nuevo)

**Interfaces:**
- Consumes: `AgendaSpan` (`@/domain/agenda`), `formatDuration`, `formatTime12`, `todayISO` (`@/lib/date`), `rangeLabel`, tipos de `@/lib/types`, `HabitDayRow` (Task 3).
- Produces (todo exportado):
  ```ts
  export interface DayAgendaSession { key; goal; time; span; state; targetLabel; session; block }  // igual que hoy en Calendar.tsx
  export type SessionState = DayAgendaSession['state']
  export interface DayHabitRowItem extends HabitDayRow { key: string; habit: Habit }
  export type AgendaRowItem =
    | { kind: 'session'; key: string; start: string | null; end: string | null; session: DayAgendaSession; planDone: number; planTotal: number }
    | { kind: 'habit'; key: string; start: string | null; end: null; habit: DayHabitRowItem }
    | { kind: 'event'; key: string; start: string | null; end: string | null; event: CalendarEvent; goal: Goal | null }
  export const CLOSED_STATES: readonly SessionState[]
  export const OPEN_STATUSES: readonly Session['status'][]
  export function agendaTargetLabel(kind: TargetKind, value: number, unit: string | null): string
  export function sessionStateLabel(state: SessionState): string      // minúsculas (tags)
  export function sessionStateTitle(state: SessionState): string      // Capitalizada (subtítulos)
  export function isOpenToday(it: DayAgendaSession): boolean
  export function sessionAriaLabel(it: DayAgendaSession): string
  export function rowTitle(item: AgendaRowItem): string
  export function rowArea(item: AgendaRowItem): NicheId
  export interface WeekDaySummary { main: string; sub: string | null; dots: NicheId[] }
  export function weekDaySummary(input: {
    day: string; today: string; sessions: DayAgendaSession[]; habits: DayHabitRowItem[]; events: CalendarEvent[]; deadlines: Goal[]
  }): WeekDaySummary
  ```

- [ ] **Step 1: Test de `weekDaySummary` (falla)**

Crear `src/screens/calendar/agendaItems.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { weekDaySummary, type DayAgendaSession, type DayHabitRowItem } from '@/screens/calendar/agendaItems'
import type { CalendarEvent, Goal, Habit } from '@/lib/types'

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1', userId: 'u1', title: 'Aprender inglés', why: null, targetDate: null, area: 'aprendizaje',
    successCriteria: null, templateKey: 'x', lastReviewedAt: null, status: 'active',
    createdAt: '2026-06-01T00:00:00Z', completedAt: null, ...over,
  }
}
function session(over: Partial<DayAgendaSession> = {}): DayAgendaSession {
  return {
    key: 's1', goal: goal(), time: '08:00', span: { start: '08:00', end: '08:45' }, state: 'pending',
    targetLabel: '45 min', session: null, block: null, ...over,
  }
}
function habitRow(over: Partial<DayHabitRowItem> = {}): DayHabitRowItem {
  const habit: Habit = {
    id: 'h1', userId: 'u1', title: 'Tomar agua', area: 'salud', weekdays: [], times: null,
    goalId: null, createdAt: '2026-06-01T00:00:00Z', archivedAt: null,
  }
  return { key: 'h-h1', habit, doneCount: 0, target: 1, complete: false, time: null, ...over }
}
function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1', userId: 'u1', goalId: null, title: 'Dentista', notes: null, date: '2026-06-09',
    startTime: null, endTime: null, allDay: false, doneAt: null, createdAt: '2026-06-01T00:00:00Z', ...over,
  }
}
const base = { day: '2026-06-09', today: '2026-06-09', sessions: [], habits: [], events: [], deadlines: [] }

describe('weekDaySummary', () => {
  it('día vacío', () => {
    expect(weekDaySummary(base)).toEqual({ main: 'Nada agendado', sub: null, dots: [] })
  })
  it('hoy: "X de N sesiones" y el resto en la línea secundaria, con un punto por meta', () => {
    const s = weekDaySummary({
      ...base,
      sessions: [session({ state: 'done' }), session({ key: 's2', goal: goal({ id: 'g2', area: 'salud' }) })],
      habits: [habitRow({ complete: true }), habitRow({ key: 'h-h2' })],
      events: [ev()],
      deadlines: [goal({ id: 'g9', title: 'Ahorrar para el viaje' })],
    })
    expect(s.main).toBe('1 de 2 sesiones')
    expect(s.sub).toBe('Hábitos 1 de 2 · 1 evento · Meta: Ahorrar para el viaje')
    expect(s.dots).toEqual(['aprendizaje', 'salud'])
  })
  it('día pasado con todo cumplido: "N sesiones cumplidas"', () => {
    const s = weekDaySummary({ ...base, day: '2026-06-08', sessions: [session({ state: 'done' })] })
    expect(s.main).toBe('1 sesión cumplida')
  })
  it('día futuro: "N sesiones" y "N hábitos"', () => {
    const s = weekDaySummary({ ...base, day: '2026-06-10', sessions: [session()], habits: [habitRow()] })
    expect(s.main).toBe('1 sesión')
    expect(s.sub).toBe('1 hábito')
  })
  it('sin sesiones, lo primero que exista es la línea principal', () => {
    const s = weekDaySummary({ ...base, events: [ev(), ev({ id: 'e2' })] })
    expect(s.main).toBe('2 eventos')
    expect(s.sub).toBeNull()
  })
  it('varias metas con fecha se cuentan', () => {
    const s = weekDaySummary({ ...base, deadlines: [goal({ id: 'a' }), goal({ id: 'b' })] })
    expect(s.main).toBe('2 metas con fecha')
  })
})
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/screens/calendar/agendaItems.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Crear `src/screens/calendar/agendaItems.ts`**

```ts
import type { CalendarEvent, Goal, Habit, NicheId, ScheduleBlock, Session, TargetKind } from '@/lib/types'
import type { AgendaSpan } from '@/domain/agenda'
import { rangeLabel } from '@/domain/agenda'
import type { HabitDayRow } from '@/domain/habits'
import { formatDuration, todayISO } from '@/lib/date'

/**
 * Tipos y helpers de los ítems que pinta la agenda de un día. Sin React ni
 * I/O: Calendar.tsx arma los ítems y los componentes de src/screens/calendar
 * los dibujan.
 */

/** Una sesión tal como se ve en la agenda: real (fila en BD) o proyectada del compromiso. */
export interface DayAgendaSession {
  key: string
  goal: Goal
  time: string | null
  /** Rango horario del bloque (fin derivado solo para compromisos de tiempo). */
  span: AgendaSpan
  state: 'pending' | 'running' | 'done' | 'partial' | 'missed' | 'unconfirmed' | 'projected'
  targetLabel: string
  session: Session | null
  block: ScheduleBlock | null
}
export type SessionState = DayAgendaSession['state']

/** Un hábito en la agenda de un día: UNA fila, con su progreso y su próxima hora. */
export interface DayHabitRowItem extends HabitDayRow {
  key: string
  habit: Habit
}

/** Lo que puede ocupar una fila de la cronología. */
export type AgendaRowItem =
  | {
      kind: 'session'
      key: string
      start: string | null
      end: string | null
      session: DayAgendaSession
      planDone: number
      planTotal: number
    }
  | { kind: 'habit'; key: string; start: string | null; end: null; habit: DayHabitRowItem }
  | { kind: 'event'; key: string; start: string | null; end: string | null; event: CalendarEvent; goal: Goal | null }

/** Estados que ya no admiten cronómetro (la sesión quedó cerrada). */
export const CLOSED_STATES: readonly SessionState[] = ['done', 'partial', 'missed']
/** Estados de una sesión real de HOY que llevan directo al cronómetro. */
export const OPEN_STATUSES: readonly Session['status'][] = ['pending', 'running', 'unconfirmed']

/** "4 h", "25 min" o la cantidad con su unidad. */
export function agendaTargetLabel(kind: TargetKind, value: number, unit: string | null): string {
  if (kind !== 'time') return `${value} ${unit ?? ''}`.trim()
  return formatDuration(value)
}

export function sessionStateLabel(state: SessionState): string {
  switch (state) {
    case 'done':
      return 'hecha'
    case 'partial':
      return 'parcial'
    case 'missed':
      return 'no pudiste'
    case 'running':
      return 'en curso'
    case 'unconfirmed':
      return 'sin confirmar'
    case 'projected':
      return 'comprometida'
    default:
      return 'pendiente'
  }
}

/** Misma etiqueta, capitalizada, para abrir un subtítulo. */
export function sessionStateTitle(state: SessionState): string {
  const s = sessionStateLabel(state)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** ¿Sesión real de hoy, todavía abierta? (la que invita a darle play). */
export function isOpenToday(it: DayAgendaSession): boolean {
  return Boolean(
    it.session && it.session.date === todayISO() && OPEN_STATUSES.includes(it.session.status),
  )
}

/** Aria-label de una sesión: qué es y qué pasa al tocarla. */
export function sessionAriaLabel(it: DayAgendaSession): string {
  const range = it.span.start ? `, de ${rangeLabel(it.span.start, it.span.end)}` : ''
  if (it.session && isOpenToday(it)) return `Abrir la sesión de ${it.goal.title}${range}`
  if (it.session) {
    return `Ver el detalle de la sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}${range}`
  }
  return `Sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}${range}`
}

export function rowTitle(item: AgendaRowItem): string {
  if (item.kind === 'session') return item.session.goal.title
  if (item.kind === 'habit') return item.habit.habit.title
  return item.event.title
}

/** Área para teñir la fila; los eventos sueltos usan el gris neutro. */
export function rowArea(item: AgendaRowItem): NicheId {
  if (item.kind === 'session') return item.session.goal.area
  if (item.kind === 'habit') return item.habit.habit.area
  return item.goal?.area ?? 'otra'
}

/* ---- Resumen de un día para el acordeón de la semana --------------------- */

export interface WeekDaySummary {
  main: string
  sub: string | null
  /** Un punto por meta con sesión (áreas, sin repetir). */
  dots: NicheId[]
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function weekDaySummary(input: {
  day: string
  today: string
  sessions: DayAgendaSession[]
  habits: DayHabitRowItem[]
  events: CalendarEvent[]
  deadlines: Goal[]
}): WeekDaySummary {
  const { day, today, sessions, habits, events, deadlines } = input
  const parts: string[] = []

  if (sessions.length > 0) {
    const n = sessions.length
    const done = sessions.filter((s) => s.state === 'done' || s.state === 'partial').length
    if (day > today) parts.push(plural(n, 'sesión', 'sesiones'))
    else if (day < today && done === n) parts.push(`${plural(n, 'sesión cumplida', 'sesiones cumplidas')}`)
    else parts.push(`${done} de ${plural(n, 'sesión', 'sesiones')}`)
  }
  if (habits.length > 0) {
    const n = habits.length
    if (day > today) parts.push(plural(n, 'hábito', 'hábitos'))
    else parts.push(`Hábitos ${habits.filter((h) => h.complete).length} de ${n}`)
  }
  if (events.length > 0) parts.push(plural(events.length, 'evento', 'eventos'))
  if (deadlines.length === 1) parts.push(`Meta: ${deadlines[0].title}`)
  else if (deadlines.length > 1) parts.push(`${deadlines.length} metas con fecha`)

  const dots: NicheId[] = []
  for (const s of sessions) if (!dots.includes(s.goal.area)) dots.push(s.goal.area)

  if (parts.length === 0) return { main: 'Nada agendado', sub: null, dots }
  const [main, ...rest] = parts
  return { main, sub: rest.length > 0 ? rest.join(' · ') : null, dots }
}
```

- [ ] **Step 4: Tests pasan**

Run: `npx vitest run src/screens/calendar/agendaItems.test.ts`
Expected: PASS.

- [ ] **Step 5: `Calendar.tsx` importa lo movido**

En `src/screens/Calendar.tsx`:
1. Borrar la interfaz `DayAgendaSession`, las funciones `agendaTargetLabel` y `sessionStateLabel`, las constantes `CLOSED_STATES` y `OPEN_STATUSES`, y las funciones `isOpenToday` y `sessionAriaLabel`.
2. Agregar el import:

```ts
import {
  CLOSED_STATES,
  agendaTargetLabel,
  isOpenToday,
  sessionAriaLabel,
  sessionStateLabel,
  type DayAgendaSession,
} from '@/screens/calendar/agendaItems'
```

3. En `ReorganizeSheet` y en la vista, donde se usa `CLOSED_STATES.includes(s.state)` sigue compilando porque `CLOSED_STATES` es `readonly SessionState[]`.

Run: `npm run lint`
Expected: limpio (el typecheck sigue en rojo por la grilla hasta la Task 8; `sessionAriaLabel`/`isOpenToday` aún se usan en `SessionRow`/`DayTimeGrid`, que se borran en la Task 8).

- [ ] **Step 6: Commit**

```bash
git add src/screens/calendar/agendaItems.ts src/screens/calendar/agendaItems.test.ts src/screens/Calendar.tsx
git commit -m "refactor(agenda): tipos y helpers de ítems en screens/calendar/agendaItems + resumen del día"
```

---

### Task 6: `EventCheck` + `AgendaRow` (fila de sesión / hábito / evento) y su CSS

**Files:**
- Create: `src/screens/calendar/EventCheck.tsx`
- Create: `src/screens/calendar/AgendaRow.tsx`
- Modify: `src/screens/Calendar.tsx` (borrar `EventCheck` local, importar el nuevo)
- Modify: `src/styles/components.css` (agregar al final)

**Interfaces:**
- Consumes: `AgendaRowItem`, `DayAgendaSession`, `DayHabitRowItem`, `CLOSED_STATES`, `isOpenToday`, `sessionAriaLabel`, `sessionStateTitle`, `rowArea` (Task 5); `formatTimeShort`, `formatTime12` (Task 4); `nicheAccent`; `IconPlay`, `IconChevronRight`, `IconCheck`, `IconArrowReturn`.
- Produces:
  ```tsx
  export function EventCheck({ event, onToggle }: { event: CalendarEvent; onToggle: () => void }): JSX.Element
  export interface AgendaRowHandlers {
    onSession: (it: DayAgendaSession) => void
    onHabit: (it: DayHabitRowItem) => void
    onOpenEvent: (e: CalendarEvent) => void
    onToggleEvent: (e: CalendarEvent) => void
  }
  export function AgendaRow({ item, past, ...handlers }: { item: AgendaRowItem; past?: boolean } & AgendaRowHandlers): JSX.Element
  ```

- [ ] **Step 1: Crear `src/screens/calendar/EventCheck.tsx`**

```tsx
import type { CalendarEvent } from '@/lib/types'
import { IconCheck } from '@/components/icons'

/** Check circular para marcar un evento de la agenda como hecho. */
export function EventCheck({ event, onToggle }: { event: CalendarEvent; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`check check--sm${event.doneAt ? ' check--done' : ''}`}
      onClick={onToggle}
      aria-pressed={Boolean(event.doneAt)}
      aria-label={`${event.doneAt ? 'Desmarcar' : 'Marcar como hecho'} “${event.title}”`}
    >
      <IconCheck size={12} />
    </button>
  )
}
```

En `src/screens/Calendar.tsx` borrar la función local `EventCheck` y agregar `import { EventCheck } from '@/screens/calendar/EventCheck'` (la usan `EventSubRow`, `DaySection`/`DayTimeGrid` hasta la Task 8, y las chips de "Todo el día").

- [ ] **Step 2: Crear `src/screens/calendar/AgendaRow.tsx`**

```tsx
import type { CalendarEvent } from '@/lib/types'
import { formatTime12, formatTimeShort } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconArrowReturn, IconChevronRight, IconPlay } from '@/components/icons'
import { EventCheck } from '@/screens/calendar/EventCheck'
import {
  CLOSED_STATES,
  isOpenToday,
  rowArea,
  sessionAriaLabel,
  sessionStateTitle,
  type AgendaRowItem,
  type DayAgendaSession,
  type DayHabitRowItem,
} from '@/screens/calendar/agendaItems'

export interface AgendaRowHandlers {
  onSession: (it: DayAgendaSession) => void
  onHabit: (it: DayHabitRowItem) => void
  onOpenEvent: (e: CalendarEvent) => void
  onToggleEvent: (e: CalendarEvent) => void
}

/** Columna de hora: inicio en negrita y, si hay, fin tenue debajo. "—" sin hora. */
function TimeColumn({ start, end }: { start: string | null; end: string | null }) {
  return (
    <span className="ag-row__time">
      <span className={`ag-row__start${start ? '' : ' faint'}`}>{start ? formatTimeShort(start) : '—'}</span>
      {start && end && <span className="ag-row__end">{formatTimeShort(end)}</span>}
    </span>
  )
}

/**
 * Una fila de la cronología: hora · cuerpo (título + subtítulo opcional) ·
 * acción. Sesión = botón que abre su hoja (▶ si es de hoy y está abierta);
 * hábito = botón que marca la siguiente repetición; evento = cuerpo que abre
 * el editor + check al borde.
 */
export function AgendaRow({
  item,
  past = false,
  onSession,
  onHabit,
  onOpenEvent,
  onToggleEvent,
}: { item: AgendaRowItem; past?: boolean } & AgendaRowHandlers) {
  const accent = nicheAccent(rowArea(item))
  const pastCls = past ? ' ag-row--past' : ''

  if (item.kind === 'session') {
    const it = item.session
    const closed = CLOSED_STATES.includes(it.state)
    const play = isOpenToday(it)
    const parts: string[] = []
    if (it.state !== 'pending' && it.state !== 'projected') parts.push(sessionStateTitle(it.state))
    parts.push(it.targetLabel)
    if (item.planTotal > 0) parts.push(`plan ${item.planDone} de ${item.planTotal}`)
    return (
      <button
        type="button"
        className={`ag-row ag-row--session${closed ? ' ag-row--done' : ''}${pastCls}`}
        style={accent}
        onClick={() => onSession(it)}
        aria-label={sessionAriaLabel(it)}
      >
        <TimeColumn start={item.start} end={item.end} />
        <span className="ag-row__main">
          <span className="ag-row__title">{it.goal.title}</span>
          <span className="ag-row__sub">{parts.join(' · ')}</span>
        </span>
        <span className="ag-row__aside" aria-hidden="true">
          {play ? (
            <span className="ag-play">
              <IconPlay size={14} />
            </span>
          ) : (
            <span className="ag-chev">
              <IconChevronRight size={16} />
            </span>
          )}
        </span>
      </button>
    )
  }

  if (item.kind === 'habit') {
    const h = item.habit
    const multi = h.target > 1
    const sub = multi
      ? `${h.doneCount} de ${h.target} hoy${h.time && !h.complete ? ` · siguiente ${formatTime12(h.time)}` : ''}`
      : null
    return (
      <button
        type="button"
        className={`ag-row${h.complete ? ' ag-row--done' : ''}${pastCls}`}
        style={accent}
        onClick={() => onHabit(h)}
        aria-pressed={h.complete}
        aria-label={
          h.complete
            ? `Desmarcar ${multi ? 'la última repetición de' : 'el hábito:'} ${h.habit.title}`
            : `Marcar ${multi ? `repetición ${h.doneCount + 1} de ${h.target} de` : 'el hábito:'} ${h.habit.title}`
        }
      >
        <TimeColumn start={item.start} end={null} />
        <span className="ag-row__main">
          <span className="ag-row__title">{h.habit.title}</span>
          {sub && <span className="ag-row__sub">{sub}</span>}
        </span>
        <span className="ag-row__aside" aria-hidden="true">
          <span className={`check check--sm${h.complete ? ' check--done' : ''}`} />
        </span>
      </button>
    )
  }

  const e = item.event
  const note = e.notes ? e.notes.trim().split('\n')[0] : null
  return (
    <div className={`ag-row${e.doneAt ? ' ag-row--done' : ''}${pastCls}`} style={accent}>
      <button type="button" className="ag-row__open" onClick={() => onOpenEvent(e)}>
        <TimeColumn start={item.start} end={item.end} />
        <span className="ag-row__main">
          <span className="ag-row__title">{e.title}</span>
          {(note || item.goal) && (
            <span className="ag-row__sub">
              {item.goal && (
                <>
                  <IconArrowReturn size={11} /> {item.goal.title}
                </>
              )}
              {item.goal && note ? ' · ' : ''}
              {note}
            </span>
          )}
        </span>
      </button>
      <span className="ag-row__aside">
        <EventCheck event={e} onToggle={() => onToggleEvent(e)} />
      </span>
    </div>
  )
}
```

- [ ] **Step 3: CSS de filas** — agregar al final de `src/styles/components.css`:

```css
/* ==== Agenda: cronología del día (2026-09) =================================
   Filas del mismo alto separadas por hairline, sin tarjeta ni sombra. La
   sesión se distingue por forma (barra del área + título 600 + ▶), no por
   tamaño. Todo con tokens; las transiciones se apagan con reduced-motion. */
.ag {
  display: flex;
  flex-direction: column;
}
.ag__kicker {
  margin: var(--s4) 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.ag__kicker:first-child {
  margin-top: var(--s1);
}
.ag-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 36px;
  column-gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 54px;
  padding: 7px 0;
  background: none;
  border: 0;
  border-top: 1px solid var(--border-soft);
  border-radius: 0;
  text-align: left;
  color: var(--text);
}
.ag__kicker + .ag-row,
.ag-now + .ag-row,
.ag-gap + .ag-row {
  border-top: 0;
}
.ag-row__time {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.ag-row__start {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.ag-row__end {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-faint);
}
.ag-row__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 10px;
  border-left: 3px solid transparent;
}
.ag-row--session .ag-row__main {
  border-left-color: var(--niche, var(--primary));
}
.ag-row__title {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-row--session .ag-row__title {
  font-weight: 600;
}
.ag-row__sub {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-row__aside {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
/* Evento: el cuerpo (hora + texto) es un botón invisible que abre el editor;
   el check queda en la tercera columna, fuera del botón. */
.ag-row__open {
  grid-column: 1 / 3;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 0;
  background: none;
  border: 0;
  text-align: left;
  color: inherit;
  font: inherit;
}
.ag-play {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--niche, var(--primary));
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px color-mix(in srgb, var(--niche, var(--primary)) 35%, transparent);
}
.ag-chev {
  display: inline-flex;
  color: var(--text-faint);
}
.ag-row--past {
  opacity: 0.5;
}
.ag-row--done .ag-row__title {
  text-decoration: line-through;
  color: var(--text-faint);
  font-weight: 500;
}
button.ag-row:active,
.ag-row__open:active {
  opacity: 0.7;
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: limpio. (`AgendaRow` aún no se usa: eslint no marca componentes exportados sin uso.)

- [ ] **Step 5: Commit**

```bash
git add src/screens/calendar/EventCheck.tsx src/screens/calendar/AgendaRow.tsx src/screens/Calendar.tsx src/styles/components.css
git commit -m "feat(agenda): AgendaRow, la fila de sesión, hábito y evento de la cronología"
```

---

### Task 7: `AgendaBlock` — bloque desplegable y su CSS

**Files:**
- Create: `src/screens/calendar/AgendaBlock.tsx`
- Modify: `src/styles/components.css` (agregar)

**Interfaces:**
- Consumes: `DayBlock` (Task 1), `AgendaRow`, `AgendaRowHandlers` (Task 6), `AgendaRowItem`, `rowTitle`, `rowArea` (Task 5), `formatTimeShort`, `formatTime12`, `nicheAccent`, `IconChevronRight`, `IconPlus`.
- Produces:
  ```tsx
  export function AgendaBlock(props: {
    block: DayBlock
    items: AgendaRowItem[]        // en el orden de block.items
    defaultOpen: boolean
    past: boolean
    /** Agregar algo a la hora de inicio del bloque (solo hoy/futuro). */
    onAdd?: () => void
  } & AgendaRowHandlers): JSX.Element
  ```

- [ ] **Step 1: Crear `src/screens/calendar/AgendaBlock.tsx`**

```tsx
import { useState } from 'react'
import type { DayBlock } from '@/domain/agenda'
import { formatTime12, formatTimeShort } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconChevronRight, IconPlus } from '@/components/icons'
import { AgendaRow, type AgendaRowHandlers } from '@/screens/calendar/AgendaRow'
import { rowArea, rowTitle, type AgendaRowItem } from '@/screens/calendar/agendaItems'

/**
 * Bloque de tiempo con dos o más cosas a la vez. Cerrado: rango, títulos en
 * una línea y un punto de color por cosa. Abierto: una fila por cosa (cada
 * una con su hora) y "Agregar algo a las H:MM". El estado vive aquí; el padre
 * lo resetea con `key` cuando cambia el día.
 */
export function AgendaBlock({
  block,
  items,
  defaultOpen,
  past,
  onAdd,
  ...handlers
}: {
  block: DayBlock
  items: AgendaRowItem[]
  defaultOpen: boolean
  past: boolean
  onAdd?: () => void
} & AgendaRowHandlers) {
  const [open, setOpen] = useState(defaultOpen)
  const sessions = items.filter((i) => i.kind === 'session').length
  const first = items.find((i) => i.kind === 'session') ?? items[0]
  const titles = items.map(rowTitle).join(' · ')
  const meta = `${items.length} cosas${sessions > 0 ? ` · ${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}` : ''}`
  const bodyId = `blk-${block.key}`
  return (
    <div
      className={`blk${open ? ' blk--open' : ''}${sessions > 0 ? ' blk--session' : ''}${past ? ' ag-row--past' : ''}`}
      style={nicheAccent(rowArea(first))}
    >
      <button
        type="button"
        className="blk__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Plegar' : 'Desplegar'} el bloque de ${formatTime12(block.start)}: ${titles}`}
      >
        <span className="ag-row__time">
          <span className="ag-row__start">{formatTimeShort(block.start)}</span>
          {block.end && <span className="ag-row__end">{formatTimeShort(block.end)}</span>}
        </span>
        <span className="blk__sum">
          <span className="blk__titles">{titles}</span>
          <span className="blk__meta">
            {meta}
            <span className="blk__dots" aria-hidden="true">
              {items.map((it) => (
                <span key={it.key} className="blk__dot" style={nicheAccent(rowArea(it))} />
              ))}
            </span>
          </span>
        </span>
        <span className="blk__chev" aria-hidden="true">
          <IconChevronRight size={18} />
        </span>
      </button>
      {open && (
        <div className="blk__body" id={bodyId}>
          {items.map((it) => (
            <AgendaRow key={it.key} item={it} past={past} {...handlers} />
          ))}
          {onAdd && (
            <button type="button" className="blk__add" onClick={onAdd}>
              <IconPlus size={14} /> Agregar algo a las {formatTime12(block.start)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: CSS del bloque** — agregar al final de `components.css`:

```css
/* Bloque de tiempo: varias cosas en la misma franja, desplegable. */
.blk {
  border-top: 1px solid var(--border-soft);
}
.ag__kicker + .blk,
.ag-now + .blk,
.ag-gap + .blk {
  border-top: 0;
}
.blk__head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 24px;
  column-gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 56px;
  padding: 8px 0;
  background: none;
  border: 0;
  border-radius: 0;
  text-align: left;
  color: var(--text);
}
.blk__sum {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 10px;
  border-left: 3px solid var(--border);
}
.blk--session .blk__sum {
  border-left-color: var(--niche, var(--primary));
}
.blk__titles {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.blk__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
}
.blk__dots {
  display: inline-flex;
  gap: 4px;
}
.blk__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--niche, var(--text-faint));
}
.blk__chev {
  display: inline-flex;
  color: var(--text-faint);
  transition: transform 0.2s var(--ease-out);
}
.blk--open .blk__chev {
  transform: rotate(90deg);
}
.blk__body {
  padding-bottom: 6px;
}
.blk__body .ag-row {
  min-height: 48px;
  padding: 6px 0;
  border-top: 1px dashed var(--border-soft);
}
.blk__add {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 0 4px 54px;
  background: none;
  border: 0;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
}
@media (prefers-reduced-motion: reduce) {
  .blk__chev {
    transition: none;
  }
}
```

- [ ] **Step 3: Lint y commit**

Run: `npm run lint`
Expected: limpio.

```bash
git add src/screens/calendar/AgendaBlock.tsx src/styles/components.css
git commit -m "feat(agenda): AgendaBlock, el bloque de tiempo que se despliega"
```

---

### Task 8: `DayAgenda` + `AddSheet`, cableados en Día y Mes; fuera la grilla y las filas viejas

**Files:**
- Create: `src/screens/calendar/DayAgenda.tsx`
- Create: `src/screens/calendar/AddSheet.tsx`
- Modify: `src/screens/Calendar.tsx`
- Modify: `src/styles/components.css` (agregar kickers/hueco/ahora/chips; renombrar `tg-allday`/`tg-chip*`)

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces:
  ```tsx
  export interface DayAgendaProps extends AgendaRowHandlers {
    day: string
    sessions: DayAgendaSession[]
    habits: DayHabitRowItem[]
    events: CalendarEvent[]
    deadlines: Goal[]
    goalById: Map<string, Goal>
    onGoal: (g: Goal) => void
    /** Planear en un hueco o en un bloque (solo hoy/futuro): inicio y fin en minutos. */
    onPlanAt?: (startMin: number, endMin: number) => void
    /** Reloj vivo, solo cuando `day` es hoy: pinta la línea "Ahora" y atenúa lo pasado. */
    now?: Date
  }
  export function DayAgenda(props: DayAgendaProps): JSX.Element
  export function AddSheet(props: { date: string; canPlanSession: boolean; onEvent: () => void; onSession: () => void; onClose: () => void }): JSX.Element
  ```

- [ ] **Step 1: Crear `src/screens/calendar/DayAgenda.tsx`**

```tsx
import { Fragment } from 'react'
import type { CalendarEvent, Goal } from '@/lib/types'
import {
  PERIOD_LABELS,
  PERIOD_ORDER,
  assignEventsToSessions,
  defaultOpenBlock,
  eventSpan,
  freeGaps,
  groupIntoBlocks,
  nowLineIndex,
  periodOfMinutes,
  type DayBlock,
  type DayPeriod,
} from '@/domain/agenda'
import { minutesToTime } from '@/domain/commitment'
import { formatDuration, formatTimeShort, todayISO } from '@/lib/date'
import { IconFlag } from '@/components/icons'
import { EventCheck } from '@/screens/calendar/EventCheck'
import { AgendaRow, type AgendaRowHandlers } from '@/screens/calendar/AgendaRow'
import { AgendaBlock } from '@/screens/calendar/AgendaBlock'
import type { AgendaRowItem, DayAgendaSession, DayHabitRowItem } from '@/screens/calendar/agendaItems'

export interface DayAgendaProps extends AgendaRowHandlers {
  day: string
  sessions: DayAgendaSession[]
  habits: DayHabitRowItem[]
  events: CalendarEvent[]
  deadlines: Goal[]
  goalById: Map<string, Goal>
  onGoal: (g: Goal) => void
  /** Planear en un hueco o en un bloque (solo hoy/futuro): inicio y fin en minutos. */
  onPlanAt?: (startMin: number, endMin: number) => void
  /** Reloj vivo, solo cuando `day` es hoy: pinta la línea "Ahora" y atenúa lo pasado. */
  now?: Date
}

/** "2 h libres", "1 h libre": redondea a media hora desde las 2 h, como gapLabel. */
function gapText(minutes: number): string {
  const rounded = minutes >= 120 ? Math.round(minutes / 30) * 30 : minutes
  return `${formatDuration(rounded)} ${rounded === 60 ? 'libre' : 'libres'}`
}

/**
 * Cronología de un día: chips de "Todo el día", franjas Mañana/Tarde/Noche
 * con filas y bloques en orden de hora, huecos libres tocables, línea "Ahora"
 * (solo hoy) y "Sin hora" al final. La usan la vista Día, el panel del Mes y
 * cada día del acordeón de la Semana.
 */
export function DayAgenda({
  day,
  sessions,
  habits,
  events,
  deadlines,
  goalById,
  onGoal,
  onPlanAt,
  now,
  ...handlers
}: DayAgendaProps) {
  // Los eventos de una meta con sesión ese día viven en su hoja de bloque:
  // aquí solo cuentan en "plan X de Y". El resto son filas.
  const { nested, standalone } = assignEventsToSessions(
    sessions.map((s) => ({ key: s.key, goalId: s.goal.id, start: s.span.start, end: s.span.end })),
    events,
  )
  const allDayEvents = standalone.filter((e) => e.allDay)

  const rows: AgendaRowItem[] = [
    ...sessions.map((s) => {
      const plan = nested.get(s.key) ?? []
      return {
        kind: 'session' as const,
        key: s.key,
        start: s.span.start,
        end: s.span.end,
        session: s,
        planDone: plan.filter((e) => e.doneAt).length,
        planTotal: plan.length,
      }
    }),
    ...habits.map((h) => ({ kind: 'habit' as const, key: h.key, start: h.time, end: null, habit: h })),
    ...standalone
      .filter((e) => !e.allDay)
      .map((e) => {
        const span = eventSpan(e)
        return {
          kind: 'event' as const,
          key: e.id,
          start: span.start,
          end: span.end,
          event: e,
          goal: e.goalId ? (goalById.get(e.goalId) ?? null) : null,
        }
      }),
  ]
  const rowByKey = new Map(rows.map((r) => [r.key, r] as const))
  const timed = rows.filter((r) => r.start !== null)
  const untimed = rows.filter((r) => r.start === null)

  const blocks = groupIntoBlocks(timed.map((r) => ({ key: r.key, start: r.start as string, end: r.end })))
  const planable = Boolean(onPlanAt) && day >= todayISO()
  const gaps = planable
    ? freeGaps(blocks.map((b) => ({ start: minutesToTime(b.startMin), end: minutesToTime(b.endMin) })), 60)
    : new Map<number, number>()

  const isToday = day === todayISO()
  const nowMin = isToday && now ? now.getHours() * 60 + now.getMinutes() : null
  const openKey = nowMin !== null ? defaultOpenBlock(blocks, nowMin) : null
  const nowPeriod: DayPeriod | null = nowMin !== null ? periodOfMinutes(nowMin) : null

  const empty = rows.length === 0 && allDayEvents.length === 0 && deadlines.length === 0

  const renderBlock = (block: DayBlock, index: number) => {
    const past = nowMin !== null && block.endMin <= nowMin
    const items = block.items.map((it) => rowByKey.get(it.key) as AgendaRowItem)
    const gap = gaps.get(index)
    const gapButton =
      gap !== undefined ? (
        <button
          key={`gap-${block.key}`}
          type="button"
          className="ag-gap"
          onClick={() => onPlanAt?.(blocks[index - 1].endMin, block.startMin)}
          aria-label={`Planear algo entre ${formatTimeShort(minutesToTime(blocks[index - 1].endMin))} y ${formatTimeShort(block.start)}`}
        >
          {gapText(gap)}
        </button>
      ) : null
    const body =
      items.length === 1 ? (
        <AgendaRow key={block.key} item={items[0]} past={past} {...handlers} />
      ) : (
        <AgendaBlock
          key={`${day}-${block.key}`}
          block={block}
          items={items}
          defaultOpen={block.key === openKey}
          past={past}
          onAdd={planable ? () => onPlanAt?.(block.startMin, Math.max(block.endMin, block.startMin + 60)) : undefined}
          {...handlers}
        />
      )
    return [gapButton, body]
  }

  const nowLabel = nowMin !== null ? formatTimeShort(minutesToTime(nowMin)) : ''
  const nowLine = (
    <div className="ag-now" role="status" aria-label={`Ahora, ${nowLabel}`}>
      Ahora · {nowLabel}
    </div>
  )

  return (
    <div className="ag">
      {(deadlines.length > 0 || allDayEvents.length > 0) && (
        <div className="ag-allday">
          {deadlines.map((g) => (
            <button
              key={`d-${g.id}`}
              type="button"
              className="ag-chip"
              onClick={() => onGoal(g)}
              aria-label={`Meta ${g.title}, fecha objetivo`}
            >
              <span className="ag-chip__flag">
                <IconFlag size={12} />
              </span>
              <span className="ag-chip__title">{g.title}</span>
            </button>
          ))}
          {allDayEvents.map((e) => (
            <div key={e.id} className={`ag-chip${e.doneAt ? ' ag-chip--done' : ''}`}>
              <EventCheck event={e} onToggle={() => handlers.onToggleEvent(e)} />
              <button type="button" className="ag-chip__title" onClick={() => handlers.onOpenEvent(e)}>
                {e.title}
              </button>
            </div>
          ))}
        </div>
      )}

      {empty && <p className="faint small">Nada agendado. Toca + para sumar algo.</p>}

      {/* Fragments, no divs: los selectores `.ag__kicker + .ag-row` etc. necesitan
          que kicker, hueco, línea "Ahora", filas y bloques sean hermanos reales. */}
      {PERIOD_ORDER.map((period) => {
        const inPeriod = blocks
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => periodOfMinutes(b.startMin) === period)
        const showNow = nowPeriod === period && !empty
        if (inPeriod.length === 0 && !showNow) return null
        const nowAt = showNow && nowMin !== null ? nowLineIndex(inPeriod.map(({ b }) => b), nowMin) : -1
        return (
          <Fragment key={period}>
            <p className="ag__kicker">{PERIOD_LABELS[period]}</p>
            {inPeriod.map(({ b, i }, k) => (
              <Fragment key={b.key}>
                {nowAt === k && nowLine}
                {renderBlock(b, i)}
              </Fragment>
            ))}
            {nowAt === inPeriod.length && nowLine}
          </Fragment>
        )
      })}

      {untimed.length > 0 && (
        <>
          <p className="ag__kicker">Sin hora</p>
          {untimed.map((r) => (
            <AgendaRow key={r.key} item={r} {...handlers} />
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Crear `src/screens/calendar/AddSheet.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { formatWeekday } from '@/lib/date'
import { IconCalendar, IconClose, IconPlay } from '@/components/icons'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/** Hoja del "+": un evento propio o una sesión espontánea para una meta. */
export function AddSheet({
  date,
  canPlanSession,
  onEvent,
  onSession,
  onClose,
}: {
  date: string
  /** Solo hoy/futuro con metas activas. */
  canPlanSession: boolean
  onEvent: () => void
  onSession: () => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <div ref={panelRef} className="sheet__panel stack stack--lg">
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿Qué agregas?</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Para el {formatWeekday(date)}.
        </p>
        <div className="stack stack--sm">
          <button type="button" className="btn btn--ghost btn--block" onClick={onEvent}>
            <IconCalendar size={16} /> Evento
          </button>
          {canPlanSession && (
            <button type="button" className="btn btn--ghost btn--block" onClick={onSession}>
              <IconPlay size={16} /> Sesión para una meta
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Reescribir la parte de vista de `src/screens/Calendar.tsx`**

Cambios, en orden. Hacerlos todos y luego compilar.

**3a. Imports.** Quitar: `gridBounds`, `layoutDay`, `uncoveredGaps`, `type GridPlacement`, `eventSpan`, `rangeMinutes`, `Hint`, `IconFlag`, `IconPlay`, `IconChevronRight`, `IconArrowReturn`, `type CSSProperties`, `habitTarget` (si queda sin uso), `sessionAriaLabel`, `isOpenToday` (si quedan sin uso tras borrar las filas viejas; `isOpenToday` sigue usado por `BlockSheet`: conservarlo). Agregar:

```ts
import { habitDayRow, habitTogglePlan, habitWithDayTimes, habitsDueOn } from '@/domain/habits'
import { DayAgenda } from '@/screens/calendar/DayAgenda'
import { AddSheet } from '@/screens/calendar/AddSheet'
import type { DayHabitRowItem } from '@/screens/calendar/agendaItems'
```

**3b. Borrar** la interfaz `DayHabitItem`, la función `dayHabits`, la función `toggleHabitSlot`, y más abajo: `TimeColumn`, `SessionGoIcon`, `SessionRow`, `HabitRow`, `EventRow`, `DayCommonProps`, `DaySection`, `axisHourLabel`, `freeLabel`, `DayTimeGrid`. Conservar `SessionStateTag`, `EventSubRow`, `BlockSheet`, `ReorganizeSheet`, `PlanSessionSheet`, `TimeSheet`, `EventEditor`.

**3c. Hábitos: una fila por hábito.** Donde estaba `dayHabits`, poner:

```ts
  /** Hábitos que tocan en un día: UNA fila por hábito, con las horas efectivas de esa fecha. */
  function dayHabitRows(day: string): DayHabitRowItem[] {
    const effective = habits.map((h) => habitWithDayTimes(h, overrideFor(h.id, day)))
    return habitsDueOn(effective, day).map((h) => ({
      key: `h-${h.id}-${day}`,
      habit: h,
      ...habitDayRow(h, habitChecks, day),
    }))
  }

  /** Marca la siguiente repetición (o desmarca la última) desde la agenda; optimista, con revert. */
  async function toggleHabitRow(it: DayHabitRowItem, day: string) {
    const { slot, add } = habitTogglePlan(it.habit, habitChecks, day)
    const check: HabitCheck = { habitId: it.habit.id, date: day, slot }
    const without = (list: HabitCheck[]) =>
      list.filter((c) => !(c.habitId === check.habitId && c.date === day && c.slot === slot))
    setHabitChecks((prev) => (add ? [...prev, check] : without(prev)))
    try {
      await setHabitCheck(userId, it.habit.id, day, add, slot)
    } catch {
      setHabitChecks((prev) => (add ? without(prev) : [...prev, check]))
      toast('No se pudo marcar el hábito.')
    }
  }
```

**3d. Estado nuevo** junto a los otros `useState`:

```ts
  // Día para el que se abrió la hoja del "+".
  const [adding, setAdding] = useState<string | null>(null)
  // Reloj de la línea "Ahora": un tick por minuto alcanza.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
```

**3e. `dayProps`** reemplaza al anterior:

```ts
  const dayProps = (day: string) => ({
    day,
    sessions: daySessions(day),
    habits: dayHabitRows(day),
    events: eventsByDate.get(day) ?? [],
    deadlines: deadlinesByDate.get(day) ?? [],
    goalById,
    onSession: (it: DayAgendaSession) => handleSession(it, day),
    onHabit: (it: DayHabitRowItem) => void toggleHabitRow(it, day),
    onOpenEvent: (e: CalendarEvent) => setEditing({ event: e, date: e.date }),
    onToggleEvent: (e: CalendarEvent) => void toggleEventDone(e),
    onGoal: (g: Goal) => navigate(`/metas/${g.id}`),
    onPlanAt: day >= today ? (s: number, e: number) => planGap(day, s, e) : undefined,
    now: day === today ? now : undefined,
  })
```

**3f. Cabecera** — reemplazar el `<header className="screen__header">…</header>` y la fila de navegación por:

```tsx
      <header className="screen__header ag-hdr">
        <div>
          <p className="muted small">Tu agenda</p>
          <h1 className="screen__title">{headerTitle}</h1>
        </div>
        <div className="row row--sm ag-hdr__actions">
          {selected >= today && (
            <button
              className="iconbtn iconbtn--sm"
              onClick={() => setReorganizing(selected)}
              aria-label="Reorganizar el día"
              title="Reorganizar el día"
            >
              <IconPencil size={16} />
            </button>
          )}
          <button className="iconbtn iconbtn--sm" onClick={() => setAdding(selected)} aria-label="Agregar">
            <IconPlus size={18} />
          </button>
        </div>
      </header>

      <div className="row row--between" style={{ marginBottom: 'var(--s4)' }}>
        {/* ‹ · Hoy · › y el segmentado Día / Semana / Mes: SIN cambios */}
      </div>
```

Borrar el bloque `{ready && !error && (<div …><Hint id="calendar-uses-2026-06">…</Hint></div>)}`.

**3g. Vistas.** Reemplazar el ternario `view === 'month' ? … : view === 'week' ? … : …` así:

```tsx
      ) : view === 'month' ? (
        <div className="cal-month">
          <div className="cal-month__grid">{/* grilla mensual: SIN cambios */}</div>
          <div className="cal-month__day stack">
            {dayContextBanner}
            <p className={`cal-day__label${isToday(selected) ? ' cal-day__label--today' : ''}`}>
              {formatWeekday(selected)}
            </p>
            <DayAgenda {...dayProps(selected)} />
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="stack cal-week">
          {week.map((day) => (
            <DayAgenda key={day} {...dayProps(day)} />
          ))}
        </div>
      ) : (
        <div className="stack">
          {dayContextBanner}
          <DayAgenda {...dayProps(selected)} />
        </div>
      )}
```

(La semana queda provisionalmente como siete `DayAgenda` apilados; la Task 9 la convierte en acordeón.)

**3h. Hoja del "+"** — junto a las otras hojas al final del JSX:

```tsx
      {adding && (
        <AddSheet
          date={adding}
          canPlanSession={adding >= today && activeGoals.length > 0}
          onEvent={() => {
            const day = adding
            setAdding(null)
            setEditing({ event: null, date: day })
          }}
          onSession={() => {
            const day = adding
            setAdding(null)
            setPlanning(day)
          }}
          onClose={() => setAdding(null)}
        />
      )}
```

**3i.** En `BlockSheet` (sin cambios funcionales), asegurarse de que sigue importando `EventCheck` del módulo nuevo vía `EventSubRow`.

**3j. `planGap` redondea a 5 minutos, no a media hora.** Ahora también lo llama "Agregar algo a las H:MM" desde un bloque, y las 8:15 deben quedar en 8:15. Reemplazar la primera línea del cuerpo de `planGap`:

```ts
    const start = Math.ceil(gapStartMin / 5) * 5 // al múltiplo de 5 min siguiente
```

- [ ] **Step 4: CSS de la cronología (kickers, hueco, ahora, chips, cabecera)** — agregar al final de `components.css` y **renombrar** todas las reglas `.tg-allday` → `.ag-allday`, `.tg-chip` → `.ag-chip`, `.tg-chip__flag` → `.ag-chip__flag`, `.tg-chip__title` → `.ag-chip__title`, `.tg-chip--done` → `.ag-chip--done` (mover esas reglas junto a las nuevas):

```css
/* Cabecera de la agenda: fecha a la izquierda, acciones (✎, +) a la derecha. */
.ag-hdr {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s3);
}
.ag-hdr__actions {
  padding-top: var(--s2);
}
/* Línea "Ahora": punto + hairline en color de acción; solo hoy. */
.ag-now {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 4px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ag-now::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
}
.ag-now::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--primary);
  opacity: 0.7;
}
/* Hueco libre: renglón tenue y tocable entre bloques (solo hoy/futuro). */
.ag-gap {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 5px 0 5px 54px;
  background: none;
  border: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-faint);
  text-align: left;
}
.ag-gap::after {
  content: '';
  flex: 1;
  border-top: 1px dashed var(--border);
}
@media (hover: hover) {
  .ag-gap:hover {
    color: var(--primary);
  }
}
.ag-gap:active {
  color: var(--primary);
}
/* Franja "Todo el día": fechas objetivo y eventos sin hora, en chips. */
.ag-allday {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  margin-bottom: var(--s2);
}
.ag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-pill);
  font-size: var(--fs-sm);
  color: var(--text);
  box-shadow: var(--shadow-sm);
  text-align: left;
}
.ag-chip__flag {
  display: inline-flex;
  flex: none;
  color: var(--primary);
}
.ag-chip__title {
  min-width: 0;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-chip--done .ag-chip__title {
  text-decoration: line-through;
  color: var(--text-faint);
}
```

- [ ] **Step 5: Compilar, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: todo verde. Si el typecheck marca imports sin uso en `Calendar.tsx`, quitarlos (no agregar `eslint-disable`).

- [ ] **Step 6: Verificación visual mínima**

Run: `npm run dev` y abrir `http://localhost:5173/calendario` con sesión iniciada (si no hay sesión, dejar constancia y seguir; la verificación queda para el cierre de fase). Comprobar: vista Día con filas y bloques, bloque actual abierto, línea "Ahora", hueco tocable abre el editor con horas prellenadas, "+" abre la hoja con dos opciones, tocar un hábito marca la siguiente repetición.

- [ ] **Step 7: Commit**

```bash
git add src/screens/calendar/DayAgenda.tsx src/screens/calendar/AddSheet.tsx src/screens/Calendar.tsx src/styles/components.css
git commit -m "feat(agenda): cronología del día por bloques de tiempo en Día y Mes; fuera la grilla horaria"
```

---

### Task 9: `WeekDay` — la semana como acordeón

**Files:**
- Create: `src/screens/calendar/WeekDay.tsx`
- Modify: `src/screens/Calendar.tsx` (vista semana)
- Modify: `src/styles/components.css` (agregar `wk-*`, retocar `.cal-week` en escritorio)

**Interfaces:**
- Consumes: `weekDaySummary`, `WeekDaySummary` (Task 5), `DayAgenda` (Task 8), `WEEKDAY_LABELS` (`@/domain/calendar`), `weekdayMon0` (`@/domain/commitment`), `dayOfMonth`, `isToday`, `formatWeekday` (`@/lib/date`), `nicheAccent`, `IconChevronRight`.
- Produces:
  ```tsx
  export function WeekDay(props: { day: string; summary: WeekDaySummary; defaultOpen: boolean; children: ReactNode }): JSX.Element
  ```

- [ ] **Step 1: Crear `src/screens/calendar/WeekDay.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import { WEEKDAY_LABELS } from '@/domain/calendar'
import { weekdayMon0 } from '@/domain/commitment'
import { dayOfMonth, formatWeekday, isToday } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconChevronRight } from '@/components/icons'
import type { WeekDaySummary } from '@/screens/calendar/agendaItems'

/**
 * Un día del acordeón de la semana: cabecera con fecha, resumen en dos
 * líneas y chevron; el cuerpo (la cronología del día) solo cuando está
 * abierto. El estado es local; el padre lo resetea con `key` al cambiar de semana.
 */
export function WeekDay({
  day,
  summary,
  defaultOpen,
  children,
}: {
  day: string
  summary: WeekDaySummary
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const today = isToday(day)
  const bodyId = `wk-${day}`
  return (
    <section className={`wk-day${today ? ' wk-day--today' : ''}${open ? ' wk-day--open' : ''}`}>
      <button
        type="button"
        className="wk-day__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Plegar' : 'Desplegar'} ${formatWeekday(day)}: ${summary.main}`}
      >
        <span className="wk-day__date">
          <span className="wk-day__dow">{WEEKDAY_LABELS[weekdayMon0(day)]}</span>
          <span className="wk-day__num">{dayOfMonth(day)}</span>
        </span>
        <span className="wk-day__sum">
          <span className={`wk-day__sum-main${summary.sub === null && summary.main === 'Nada agendado' ? ' faint' : ''}`}>
            {summary.main}
            {summary.dots.length > 0 && (
              <span className="wk-day__dots" aria-hidden="true">
                {summary.dots.map((area) => (
                  <span key={area} className="wk-day__dot" style={nicheAccent(area)} />
                ))}
              </span>
            )}
          </span>
          {summary.sub && <span className="wk-day__sum-sub">{summary.sub}</span>}
        </span>
        <span className="wk-day__chev" aria-hidden="true">
          <IconChevronRight size={18} />
        </span>
      </button>
      {open && (
        <div className="wk-day__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Cablear en `Calendar.tsx`**

Importar `WeekDay` y `weekDaySummary`. Agregar un estado para escritorio junto a `view`:

```ts
  // En escritorio la semana abre todos los días (hay espacio); en móvil, solo hoy.
  const [desktop] = useState(() => {
    try {
      return window.matchMedia('(min-width: 1024px)').matches
    } catch {
      return false
    }
  })
```

Reemplazar la vista semana provisional por:

```tsx
      ) : view === 'week' ? (
        <div className="stack cal-week">
          {week.map((day) => {
            const props = dayProps(day)
            return (
              <WeekDay
                key={day}
                day={day}
                summary={weekDaySummary({
                  day,
                  today,
                  sessions: props.sessions,
                  habits: props.habits,
                  events: props.events,
                  deadlines: props.deadlines,
                })}
                defaultOpen={desktop || day === today}
              >
                <DayAgenda {...props} />
              </WeekDay>
            )
          })}
        </div>
      ) : (
```

- [ ] **Step 3: CSS del acordeón** — agregar al final de `components.css` y **reemplazar** el bloque de escritorio de `.cal-week` (el que hoy dice `.cal-week { display: grid; … }` y `.cal-week .cal-day { … }` dentro de `@media (min-width: 1024px)`):

```css
/* Semana como acordeón: cabecera con fecha y resumen; hoy abierto. */
.wk-day {
  border-top: 1px solid var(--border-soft);
}
.cal-week .wk-day:first-child {
  border-top: 0;
}
.wk-day__head {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 24px;
  column-gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 0;
  background: none;
  border: 0;
  border-radius: 0;
  text-align: left;
  color: var(--text);
}
.wk-day__date {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}
.wk-day__dow {
  margin-bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.wk-day__num {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
}
.wk-day--today .wk-day__num,
.wk-day--today .wk-day__dow {
  color: var(--primary);
}
.wk-day__sum {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wk-day__sum-main {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wk-day__sum-sub {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wk-day__dots {
  display: inline-flex;
  gap: 4px;
  margin-left: 6px;
  vertical-align: 1px;
}
.wk-day__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--niche, var(--text-faint));
}
.wk-day__chev {
  display: inline-flex;
  color: var(--text-faint);
  transition: transform 0.2s var(--ease-out);
}
.wk-day--open .wk-day__chev {
  transform: rotate(90deg);
}
.wk-day__body {
  padding: 0 0 10px 52px;
}
.wk-day__body .ag-row {
  min-height: 46px;
  padding: 5px 0;
}
.wk-day__body .ag-row__title,
.wk-day__body .blk__titles {
  font-size: 14px;
}
@media (prefers-reduced-motion: reduce) {
  .wk-day__chev {
    transition: none;
  }
}
/* Escritorio: los siete días como tarjetas en cuadrícula, todos abiertos. */
@media (min-width: 1024px) {
  .cal-week {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--s4);
    align-items: start;
  }
  .cal-week .wk-day {
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface);
    padding: var(--s2) var(--s4);
    box-shadow: var(--shadow-sm);
  }
  .wk-day__body {
    padding-left: 0;
  }
}
```

- [ ] **Step 4: Compilar, lint, tests, commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

```bash
git add src/screens/calendar/WeekDay.tsx src/screens/Calendar.tsx src/styles/components.css
git commit -m "feat(agenda): la semana como acordeón por día, hoy abierto"
```

---

### Task 10: Limpieza de CSS de grilla y listas viejas; verificación de cierre de fase

**Files:**
- Modify: `src/styles/components.css`
- Modify: `src/screens/Calendar.tsx` (solo si el grep encuentra restos)

- [ ] **Step 1: Borrar reglas muertas**

En `src/styles/components.css` eliminar por completo:
- El bloque `/* ---- Agenda: grilla horaria del día (0015)` hasta justo antes de `/* Sesión cerrada en lista` (`.tg`, `.tg__hour*`, `.tg__items`, `.tg-item*`, `.tg-gap`, `.tg-untimed`, `.ev-go*`; las reglas `.tg-allday`/`.tg-chip*` ya fueron renombradas en la Task 8: si siguen ahí con el nombre viejo, borrarlas).
- `.ev--closed`.
- Del bloque `/* --- Hábitos en la agenda (0013` y `/* ---- Agenda: bloques, rangos y huecos (0014`: `.ev--habit-done`, `.ev--done` y sus `.ev__title`, `.ev__time-end`, `.ev--block`, `.ev-block__head`, `.ev-block__head:disabled`, `.ev__open`, `.ev-gap`, `.ev-gap::before/::after`. **Conservar** `.cal-dot--habit`, `.ev__sublist`, `.ev-sub`, `.ev-sub__time`, `.ev-sub__title`, `.ev-sub--done …`, `.check--sm`, `.tag--done`, `.bsheet__*`.
- `.ev--session`, `.ev--session:disabled` (sección `/* --- Sesiones en la agenda (Fase 3) --- */`, conservar `.cal-dot--session`).
- `.cal-day`, `.cal-day:first-child` y, dentro de `@media (min-width: 1024px)`, `.cal-month__day .cal-day { … }`. Conservar `.cal-day__label` y `.cal-day__label--today` (los usa el panel del Mes).

- [ ] **Step 2: Verificar que nada quedó colgado**

Run:
```bash
grep -n "tg-\|ev-go\|ev--block\|ev-block\|ev--session\|ev--closed\|ev-gap\|ev__open\|ev__time-end\|ev--habit-done\|DayTimeGrid\|DaySection\|layoutDay\|gridBounds\|uncoveredGaps" src/screens/Calendar.tsx src/screens/calendar/*.tsx src/styles/components.css src/domain/agenda.ts; echo "exit=$?"
```
Expected: sin coincidencias (`exit=1`).

- [ ] **Step 3: Cierre de fase**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: todo verde.

Run (una sola vez): `node .claude/skills/impeccable/scripts/detect.mjs --json src/screens/calendar src/screens/Calendar.tsx src/styles/components.css`
Corregir lo que reporte que sea real (no reglas de estilo que contradigan el spec) en el mismo commit.

- [ ] **Step 4: Verificación visual completa**

Con `npm run dev` y sesión iniciada en el navegador, recorrer en 390 px y en escritorio:
1. Día de hoy con: dos cosas a la misma hora (bloque cerrado/abierto), una sola cosa (fila), hábito con repeticiones (una fila, "2 de 5 hoy · siguiente …"), hueco ≥ 60 min tocable, línea "Ahora", "Sin hora", chips de "Todo el día".
2. Día pasado: sin huecos tocables, sin línea "Ahora", sin "Reorganizar"; día futuro: huecos sí, línea no.
3. Semana: hoy abierto, resto cerrado con resumen; abrir/cerrar; en escritorio todos abiertos en cuadrícula.
4. Mes: panel del día con la cronología y la etiqueta de fecha.
5. "+" → Evento / Sesión para una meta; "Agregar algo a las H:MM" desde un bloque prellena las horas.
6. Tocar sesión abre su hoja; tocar evento abre el editor; check de evento; tocar hábito marca/desmarca.

Si no hay sesión disponible en el navegador, dejarlo escrito en el mensaje final: la verificación visual queda pendiente para el usuario.

- [ ] **Step 5: Commit**

```bash
git add src/styles/components.css src/screens/Calendar.tsx
git commit -m "chore(agenda): fuera el CSS de la grilla y de las filas viejas"
```

---

## Auto-revisión del plan

- **Cobertura del spec (Fase 1):** §4.1 → Tasks 1–2; §4.2 → Task 3; §4.3 → Tasks 1–3 y 5; §5.1 cabecera/AddSheet/DayAgenda/filas/bloques/huecos/ahora/sin hora → Tasks 6–8; hábito una fila → Tasks 3, 8; eventos anidados solo en la hoja → Task 8 (`nested` solo cuenta); §5.2 → Task 9; §5.3 → Task 8 (panel del mes con etiqueta); §5.4 CSS → Tasks 6–10; §6 → mutaciones existentes reutilizadas (Task 8); §7 → Task 10.
- **Sin placeholders:** cada paso trae código o comando concreto.
- **Consistencia de nombres:** `DayItemSpan`/`DayBlock`/`groupIntoBlocks`/`defaultOpenBlock`/`nowLineIndex`/`periodOfMinutes` (Tasks 1–2) son los que consume `DayAgenda` (Task 8); `HabitDayRow`/`habitDayRow`/`habitTogglePlan` (Task 3) los consumen `agendaItems.ts` (Task 5), `AgendaRow` (Task 6) y `Calendar.tsx` (Task 8); `AgendaRowHandlers` (Task 6) lo extienden `AgendaBlock`, `DayAgenda` y `dayProps`; `weekDaySummary`/`WeekDaySummary` (Task 5) los usan `WeekDay` y `Calendar.tsx` (Task 9); `formatTimeShort` (Task 4) lo usan Tasks 6–8; `EventCheck` (Task 6) lo usan `AgendaRow`, `DayAgenda` y `EventSubRow`.
