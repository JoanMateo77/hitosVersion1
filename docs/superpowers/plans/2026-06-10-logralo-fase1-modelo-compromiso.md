# Lógralo Fase 1 — Modelo de datos y compromiso: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las metas pasan a tener hitos propios en la base (`milestones`), un compromiso real por bloques (`goal_schedule`) capturado obligatoriamente en el wizard, y la tabla `sessions` lista para la Fase 2 — con la app funcionando igual o mejor al final.

**Architecture:** Expand-contract: la migración 0004 AGREGA tablas sin tocar `current_milestone` (se elimina en Fase 2 cuando se reescriba GoalDetail). El wizard nuevo crea meta → hitos → bloques de compromiso → primera tarea legacy (Today sigue funcionando con el sistema viejo hasta Fase 2). La lógica pura vive en `src/domain/commitment.ts` con tests; los servicios son mappers finos de Supabase como los existentes.

**Tech Stack:** React + TypeScript estricto + Vite, Supabase (Postgres + RLS), Vitest. Spec fuente de verdad: `docs/superpowers/specs/2026-06-10-hito-base-solida-design.md`.

**Convenciones que ya rigen:** columnas snake_case ↔ tipos camelCase mapeados SOLO en `src/services/`; lógica de negocio pura en `src/domain/` con tests; copy nuevo en **español profesional neutro (tuteo, sin voseo)**; commits sin `Co-Authored-By`.

**Días de la semana:** en TODO el código nuevo, `weekday` usa **lunes=0 … domingo=6** (el spec lo fija así). `Date.getDay()` de JS usa domingo=0: convertir siempre con el helper `weekdayMon0` del Task 3.

---

### Task 1: Migración SQL 0004 (tablas nuevas + columnas de perfil)

**Files:**
- Create: `supabase/migrations/0004_compromiso.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- ============================================================================
-- 0004 — Compromiso medible (Fase 1 del spec 2026-06-10)
-- Cómo correrla: Supabase Dashboard → SQL Editor → pegar TODO → Run.
-- Idempotente. NO toca goals.current_milestone (se elimina en Fase 2).
-- ============================================================================

-- 1) HITOS propios de cada meta (dejan de ser texto de plantilla)
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  position    int  not null check (position >= 0),
  target_date date,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists milestones_goal_idx on public.milestones (goal_id, position);

-- 2) COMPROMISO: una fila por bloque/momento (un día puede tener varios)
--    weekday: lunes=0 … domingo=6
create table if not exists public.goal_schedule (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  target_kind  text not null default 'time' check (target_kind in ('time','count')),
  target_value int  not null check (target_value > 0),
  unit         text,
  start_time   time,
  created_at   timestamptz not null default now()
);
create index if not exists goal_schedule_goal_idx on public.goal_schedule (goal_id);
create index if not exists goal_schedule_user_idx on public.goal_schedule (user_id, weekday);

-- 3) SESIONES (la Fase 2 las usa; la tabla queda lista desde ya)
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  schedule_id  uuid references public.goal_schedule (id) on delete set null,
  session_date date not null,
  target_kind  text not null default 'time' check (target_kind in ('time','count')),
  target_value int  not null check (target_value > 0),
  unit         text,
  planned_time time,
  started_at   timestamptz,
  ended_at     timestamptz,
  actual_value int,
  status       text not null default 'pending'
               check (status in ('pending','running','done','partial','missed','unconfirmed')),
  created_at   timestamptz not null default now()
);
create index if not exists sessions_user_date_idx on public.sessions (user_id, session_date);
-- Idempotencia de generación diaria: un bloque genera UNA sesión por día.
create unique index if not exists sessions_schedule_day_uniq
  on public.sessions (schedule_id, session_date) where schedule_id is not null;

-- 4) PERFIL: defaults del onboarding nuevo + meta prioritaria
alter table public.profiles
  add column if not exists preferred_moment text
    check (preferred_moment in ('morning','midday','evening'));
alter table public.profiles
  add column if not exists default_session_minutes int
    check (default_session_minutes > 0);
alter table public.profiles
  add column if not exists priority_goal_id uuid references public.goals (id) on delete set null;

-- 5) RLS
alter table public.milestones    enable row level security;
alter table public.goal_schedule enable row level security;
alter table public.sessions      enable row level security;

drop policy if exists milestones_all_own on public.milestones;
create policy milestones_all_own on public.milestones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists goal_schedule_all_own on public.goal_schedule;
create policy goal_schedule_all_own on public.goal_schedule
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sessions_all_own on public.sessions;
create policy sessions_all_own on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_compromiso.sql
git commit -m "feat(db): tablas milestones, goal_schedule y sessions + prefs de perfil (fase 1)"
```

- [ ] **Step 3: CHECKPOINT — el usuario corre la migración**

Pedir al usuario: *"Abre Supabase Dashboard → SQL Editor → pega el contenido de `supabase/migrations/0004_compromiso.sql` → Run."* No continuar con tareas que toquen la BD (Task 5 en adelante en runtime) hasta que confirme. Las tareas 2-4 (tipos, dominio, tests) no necesitan la BD y pueden avanzar en paralelo.

---

### Task 2: Tipos nuevos en `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts` (agregar al final; y ampliar `Profile`)

- [ ] **Step 1: Ampliar `Profile` (líneas 33-41) y agregar tipos nuevos al final del archivo**

Reemplazar la interface `Profile` por:

```typescript
/** Momento del día en que al usuario le resulta más fácil cumplir. */
export type PreferredMoment = 'morning' | 'midday' | 'evening'

/** Perfil del usuario (1:1 con auth.users en Supabase). */
export interface Profile {
  id: string
  /** @deprecated El modo Enfoque se elimina en Fase 2; no usar en código nuevo. */
  focusMode: FocusMode
  primaryNiche: NicheId | null
  /** Fecha en que terminó el onboarding; null = todavía no lo completó. */
  onboardedAt: string | null
  /** Defaults capturados en onboarding (alimentan el wizard). */
  preferredMoment: PreferredMoment | null
  defaultSessionMinutes: number | null
  /** Meta prioritaria ⭐ opcional: ordena el día, no oculta nada. */
  priorityGoalId: string | null
  createdAt: string
}
```

Agregar al final del archivo:

```typescript
/** Cómo se mide una sesión: tiempo (minutos) o cantidad (páginas, km…). */
export type TargetKind = 'time' | 'count'

/** Hito propio de UNA meta. Editable; se marca individualmente. */
export interface Milestone {
  id: string
  goalId: string
  userId: string
  title: string
  /** Orden dentro del camino (0-based). */
  position: number
  targetDate: string | null
  /** Cuándo se cumplió; null = pendiente. */
  doneAt: string | null
  createdAt: string
}

/**
 * Un bloque/momento comprometido: "los lunes, 25 min, a las 19:00".
 * Un día puede tener varios bloques. weekday: lunes=0 … domingo=6.
 */
export interface ScheduleBlock {
  id: string
  goalId: string
  userId: string
  weekday: number
  targetKind: TargetKind
  /** Minutos si targetKind='time'; cantidad si 'count'. */
  targetValue: number
  /** Unidad para 'count' ("páginas", "km"…); null para 'time'. */
  unit: string | null
  /** Hora preferida "HH:MM", o null si todavía no la fijó. */
  startTime: string | null
  createdAt: string
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: sin errores (los campos nuevos de `Profile` van a romper `mapProfile` — si rompe, es la señal para hacer el Task 4 Step 3 junto a este; en ese caso completar ambos antes de commitear).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): Milestone, ScheduleBlock, TargetKind y prefs nuevas de Profile"
```

---

### Task 3: Dominio puro `src/domain/commitment.ts` (TDD)

**Files:**
- Create: `src/domain/commitment.ts`
- Test: `src/domain/commitment.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
import { describe, expect, it } from 'vitest'
import {
  WEEKDAY_LABELS,
  buildMilestonesFromTemplate,
  formatCommitmentSummary,
  overcommitWarning,
  validateCommitment,
  weekdayMon0,
  weekdaysForCadence,
  weeklyTotal,
  type CommitmentBlockDraft,
} from '@/domain/commitment'
import type { ScheduleBlock } from '@/lib/types'
import { formatDuration } from '@/lib/date'
import { getTemplate } from '@/domain/templates'

const time = (weekday: number, minutes: number, startTime: string | null = null): CommitmentBlockDraft => ({
  weekday,
  targetKind: 'time',
  targetValue: minutes,
  unit: null,
  startTime,
})

describe('weekdayMon0', () => {
  it('convierte getDay() (domingo=0) a lunes=0', () => {
    expect(weekdayMon0('2026-06-08')).toBe(0) // lunes
    expect(weekdayMon0('2026-06-14')).toBe(6) // domingo
  })
})

describe('weeklyTotal', () => {
  it('suma sesiones y minutos de bloques de tiempo', () => {
    const blocks = [time(0, 25), time(4, 30, '10:00'), time(4, 30, '14:00')]
    expect(weeklyTotal(blocks)).toEqual({ sessions: 3, minutes: 85 })
  })
  it('cuenta sesiones de cantidad pero no suma minutos', () => {
    const blocks: CommitmentBlockDraft[] = [
      { weekday: 1, targetKind: 'count', targetValue: 10, unit: 'páginas', startTime: null },
      time(2, 25),
    ]
    expect(weeklyTotal(blocks)).toEqual({ sessions: 2, minutes: 25 })
  })
})

describe('formatCommitmentSummary', () => {
  it('resume sesiones y tiempo semanal', () => {
    // El formato del tiempo lo define formatDuration (lib/date): no lo duplicamos.
    expect(formatCommitmentSummary([time(0, 25), time(2, 25), time(4, 45)])).toBe(
      `Tu compromiso: 3 sesiones · ${formatDuration(95)} por semana`,
    )
  })
  it('sin minutos (solo cantidad) omite el tiempo', () => {
    const blocks: CommitmentBlockDraft[] = [
      { weekday: 0, targetKind: 'count', targetValue: 10, unit: 'páginas', startTime: null },
    ]
    expect(formatCommitmentSummary(blocks)).toBe('Tu compromiso: 1 sesión por semana')
  })
})

describe('validateCommitment', () => {
  it('exige al menos un bloque', () => {
    expect(validateCommitment([])).toBe('Elige al menos un día para tu compromiso.')
  })
  it('acepta un compromiso válido', () => {
    expect(validateCommitment([time(0, 25)])).toBeNull()
  })
})

describe('overcommitWarning', () => {
  const existing = (weekday: number, minutes: number): ScheduleBlock => ({
    id: `e-${weekday}-${minutes}`,
    goalId: 'otra-meta',
    userId: 'u1',
    weekday,
    targetKind: 'time',
    targetValue: minutes,
    unit: null,
    startTime: null,
    createdAt: '2026-06-01T00:00:00Z',
  })

  it('avisa cuando un día elegido ya acumula 90 min o más de otras metas', () => {
    const msg = overcommitWarning([existing(0, 60), existing(0, 45)], [time(0, 25)])
    expect(msg).toBe(
      `Los lunes ya tienes 2 sesiones (${formatDuration(105)}) de otras metas. Revisa que el plan te entre.`,
    )
  })
  it('no avisa si los días elegidos están libres', () => {
    expect(overcommitWarning([existing(1, 120)], [time(0, 25)])).toBeNull()
  })
})

describe('buildMilestonesFromTemplate', () => {
  it('copia los hitos de la plantilla marcando los primeros N como cumplidos', () => {
    const template = getTemplate('salud_fisico')
    const drafts = buildMilestonesFromTemplate(template, 2)
    expect(drafts).toHaveLength(template.milestones.length)
    expect(drafts[0]).toEqual({ title: template.milestones[0], position: 0, targetDate: null, done: true })
    expect(drafts[2].done).toBe(false)
  })
})

describe('weekdaysForCadence', () => {
  it('mapea cada cadencia legacy a días lunes=0', () => {
    expect(weekdaysForCadence('daily')).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(weekdaysForCadence('weekdays')).toEqual([0, 1, 2, 3, 4])
    expect(weekdaysForCadence('thrice_week')).toEqual([0, 2, 4])
    expect(weekdaysForCadence('weekly')).toEqual([0])
  })
})

describe('WEEKDAY_LABELS', () => {
  it('arranca en lunes', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Lu')
    expect(WEEKDAY_LABELS[6]).toBe('Do')
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- --run src/domain/commitment.test.ts`
Expected: FAIL — "Cannot find module '@/domain/commitment'".

- [ ] **Step 3: Implementar `src/domain/commitment.ts`**

```typescript
import type { Cadence, GoalTemplate, ScheduleBlock, TargetKind } from '@/lib/types'
import { formatDuration, parseISO } from '@/lib/date'

/**
 * Compromiso medible (Fase 1 del spec base-solida).
 *
 * Convención de toda la lógica nueva: weekday lunes=0 … domingo=6.
 * Funciones puras, sin I/O.
 */

/** Etiquetas cortas de día, indexadas con lunes=0. */
export const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'] as const

/** Nombres completos en plural para mensajes ("Los lunes…"). */
export const WEEKDAY_PLURALS = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos',
] as const

/** Convierte una fecha ISO al índice de día con lunes=0 (getDay usa domingo=0). */
export function weekdayMon0(dateISO: string): number {
  return (parseISO(dateISO).getDay() + 6) % 7
}

/** Un bloque de compromiso todavía sin persistir (lo arma el wizard). */
export interface CommitmentBlockDraft {
  weekday: number
  targetKind: TargetKind
  targetValue: number
  unit: string | null
  startTime: string | null
}

/** Un hito todavía sin persistir (lo arma el wizard o el backfill). */
export interface MilestoneDraft {
  title: string
  position: number
  targetDate: string | null
  done: boolean
}

export function weeklyTotal(blocks: CommitmentBlockDraft[]): { sessions: number; minutes: number } {
  const minutes = blocks
    .filter((b) => b.targetKind === 'time')
    .reduce((sum, b) => sum + b.targetValue, 0)
  return { sessions: blocks.length, minutes }
}

export function formatCommitmentSummary(blocks: CommitmentBlockDraft[]): string {
  const { sessions, minutes } = weeklyTotal(blocks)
  const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`
  if (minutes === 0) return `Tu compromiso: ${sessionsLabel} por semana`
  return `Tu compromiso: ${sessionsLabel} · ${formatDuration(minutes)} por semana`
}

/** null = válido; string = mensaje de error para mostrar inline. */
export function validateCommitment(blocks: CommitmentBlockDraft[]): string | null {
  if (blocks.length === 0) return 'Elige al menos un día para tu compromiso.'
  if (blocks.some((b) => b.targetValue <= 0)) {
    return 'Cada momento necesita una duración o cantidad mayor a cero.'
  }
  return null
}

/**
 * Guardia de sobrecompromiso: si un día del borrador ya acumula >=90 min o
 * >=3 sesiones de OTRAS metas, devuelve un aviso (no bloquea). Reporta el día
 * más cargado entre los elegidos.
 */
export function overcommitWarning(
  existing: ScheduleBlock[],
  draft: CommitmentBlockDraft[],
): string | null {
  const draftDays = new Set(draft.map((b) => b.weekday))
  let worst: { weekday: number; sessions: number; minutes: number } | null = null
  for (const weekday of draftDays) {
    const sameDay = existing.filter((b) => b.weekday === weekday)
    const minutes = sameDay
      .filter((b) => b.targetKind === 'time')
      .reduce((sum, b) => sum + b.targetValue, 0)
    const sessions = sameDay.length
    if (sessions >= 3 || minutes >= 90) {
      if (!worst || minutes > worst.minutes) worst = { weekday, sessions, minutes }
    }
  }
  if (!worst) return null
  const day = WEEKDAY_PLURALS[worst.weekday]
  const sessionsLabel = worst.sessions === 1 ? '1 sesión' : `${worst.sessions} sesiones`
  return `Los ${day} ya tienes ${sessionsLabel} (${formatDuration(worst.minutes)}) de otras metas. Revisa que el plan te entre.`
}

/** Copia los hitos de una plantilla como borradores, marcando los primeros `doneCount`. */
export function buildMilestonesFromTemplate(
  template: GoalTemplate,
  doneCount: number,
): MilestoneDraft[] {
  return template.milestones.map((title, position) => ({
    title,
    position,
    targetDate: null,
    done: position < doneCount,
  }))
}

/** Mapea la cadencia legacy de plantillas a días comprometidos (backfill). */
export function weekdaysForCadence(cadence: Cadence): number[] {
  switch (cadence) {
    case 'daily':
      return [0, 1, 2, 3, 4, 5, 6]
    case 'weekdays':
      return [0, 1, 2, 3, 4]
    case 'thrice_week':
      return [0, 2, 4]
    case 'weekly':
      return [0]
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- --run src/domain/commitment.test.ts`
Expected: PASS (todos). Si `formatDuration(85)` no devuelve "1 h 25 min", ajustar el test al formato real de `src/lib/date.ts:111` — el formato existente manda, no se cambia.

- [ ] **Step 5: Correr la suite completa y commitear**

Run: `npm test -- --run`
Expected: los 41 tests previos + los nuevos, todos PASS.

```bash
git add src/domain/commitment.ts src/domain/commitment.test.ts
git commit -m "feat(domain): lógica pura de compromiso con tests (bloques, resumen, guardia, backfill)"
```

---

### Task 4: Servicios `milestones.ts`, `schedule.ts` y ampliaciones

**Files:**
- Create: `src/services/milestones.ts`
- Create: `src/services/schedule.ts`
- Modify: `src/services/profile.ts` (mapper + row)
- Modify: `src/services/goals.ts` (agregar `deleteGoal`)

- [ ] **Step 1: Crear `src/services/milestones.ts`**

```typescript
import type { Milestone } from '@/lib/types'
import type { MilestoneDraft } from '@/domain/commitment'
import { supabase } from '@/lib/supabase'

interface MilestoneRow {
  id: string
  goal_id: string
  user_id: string
  title: string
  position: number
  target_date: string | null
  done_at: string | null
  created_at: string
}

function mapMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    title: row.title,
    position: row.position,
    targetDate: row.target_date,
    doneAt: row.done_at,
    createdAt: row.created_at,
  }
}

export async function listMilestones(goalId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as MilestoneRow[]).map(mapMilestone)
}

/** Set de goal_ids del usuario que YA tienen hitos (para el backfill). */
export async function goalIdsWithMilestones(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('milestones')
    .select('goal_id')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set((data as { goal_id: string }[]).map((r) => r.goal_id))
}

export async function createMilestones(
  userId: string,
  goalId: string,
  drafts: MilestoneDraft[],
): Promise<Milestone[]> {
  if (drafts.length === 0) return []
  const { data, error } = await supabase
    .from('milestones')
    .insert(
      drafts.map((d) => ({
        goal_id: goalId,
        user_id: userId,
        title: d.title,
        position: d.position,
        target_date: d.targetDate,
        done_at: d.done ? new Date().toISOString() : null,
      })),
    )
    .select('*')
  if (error) throw new Error(error.message)
  return (data as MilestoneRow[]).map(mapMilestone)
}
```

- [ ] **Step 2: Crear `src/services/schedule.ts`**

```typescript
import type { ScheduleBlock } from '@/lib/types'
import type { CommitmentBlockDraft } from '@/domain/commitment'
import { supabase } from '@/lib/supabase'

interface ScheduleRow {
  id: string
  goal_id: string
  user_id: string
  weekday: number
  target_kind: string
  target_value: number
  unit: string | null
  start_time: string | null
  created_at: string
}

function mapBlock(row: ScheduleRow): ScheduleBlock {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    weekday: row.weekday,
    targetKind: row.target_kind as ScheduleBlock['targetKind'],
    targetValue: row.target_value,
    unit: row.unit,
    // Postgres devuelve "HH:MM:SS"; en la app usamos "HH:MM".
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    createdAt: row.created_at,
  }
}

/** Todos los bloques del usuario (guardia de sobrecompromiso, agenda futura). */
export async function listScheduleForUser(userId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('goal_schedule')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}

export async function listScheduleForGoal(goalId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('goal_schedule')
    .select('*')
    .eq('goal_id', goalId)
    .order('weekday', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}

export async function createScheduleBlocks(
  userId: string,
  goalId: string,
  drafts: CommitmentBlockDraft[],
): Promise<ScheduleBlock[]> {
  if (drafts.length === 0) return []
  const { data, error } = await supabase
    .from('goal_schedule')
    .insert(
      drafts.map((d) => ({
        goal_id: goalId,
        user_id: userId,
        weekday: d.weekday,
        target_kind: d.targetKind,
        target_value: d.targetValue,
        unit: d.unit,
        start_time: d.startTime,
      })),
    )
    .select('*')
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}
```

- [ ] **Step 3: Ampliar `src/services/profile.ts`**

En `ProfileRow` agregar:

```typescript
  preferred_moment: string | null
  default_session_minutes: number | null
  priority_goal_id: string | null
```

En `mapProfile` agregar (antes de `createdAt`):

```typescript
    preferredMoment: (row.preferred_moment as Profile['preferredMoment']) ?? null,
    defaultSessionMinutes: row.default_session_minutes ?? null,
    priorityGoalId: row.priority_goal_id ?? null,
```

(ajustar el import a `import type { FocusMode, NicheId, Profile } from '@/lib/types'` si ya está, no duplicar).

- [ ] **Step 4: Agregar `deleteGoal` al final de `src/services/goals.ts`**

```typescript
/**
 * Borra una meta. Las tablas hijas (milestones, goal_schedule, sessions, tasks)
 * caen por ON DELETE CASCADE. Se usa para deshacer una creación a medias.
 */
export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', goalId)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 5: Typecheck + tests + commit**

Run: `npx tsc -p tsconfig.json --noEmit && npm test -- --run`
Expected: sin errores, tests PASS.

```bash
git add src/services/milestones.ts src/services/schedule.ts src/services/profile.ts src/services/goals.ts
git commit -m "feat(services): milestones, goal_schedule, prefs de perfil y deleteGoal"
```

---

### Task 5: Backfill de metas existentes

**Files:**
- Create: `src/services/backfill.ts`
- Modify: `src/screens/Today.tsx` (una llamada dentro del init existente)

- [ ] **Step 1: Crear `src/services/backfill.ts`**

```typescript
import type { Goal } from '@/lib/types'
import { buildMilestonesFromTemplate, weekdaysForCadence } from '@/domain/commitment'
import { getTemplate } from '@/domain/templates'
import { createMilestones, goalIdsWithMilestones } from '@/services/milestones'
import { createScheduleBlocks, listScheduleForUser } from '@/services/schedule'

const FLAG = 'logralo.backfill-v1'

/**
 * Migración perezosa (Fase 1): a las metas creadas ANTES del modelo nuevo les
 * copia los hitos de su plantilla (marcando los primeros current_milestone como
 * cumplidos) y les crea un compromiso desde la cadencia legacy (25 min/sesión).
 * Corre una vez por sesión de navegador; es idempotente porque consulta qué
 * metas ya tienen datos.
 */
export async function ensureCommitmentBackfill(userId: string, goals: Goal[]): Promise<void> {
  try {
    if (sessionStorage.getItem(FLAG)) return
  } catch {
    /* sin sessionStorage igual seguimos: el chequeo de abajo es la verdad */
  }

  const candidates = goals.filter((g) => g.status === 'active' || g.status === 'paused')
  if (candidates.length > 0) {
    const withMilestones = await goalIdsWithMilestones(userId)
    const allBlocks = await listScheduleForUser(userId)
    const withSchedule = new Set(allBlocks.map((b) => b.goalId))

    for (const goal of candidates) {
      const template = getTemplate(goal.templateKey)
      if (!withMilestones.has(goal.id)) {
        await createMilestones(
          userId,
          goal.id,
          buildMilestonesFromTemplate(template, goal.currentMilestone),
        )
      }
      if (!withSchedule.has(goal.id)) {
        await createScheduleBlocks(
          userId,
          goal.id,
          weekdaysForCadence(template.cadence).map((weekday) => ({
            weekday,
            targetKind: 'time' as const,
            targetValue: 25,
            unit: null,
            startTime: null,
          })),
        )
      }
    }
  }

  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Llamarlo desde el init de `Today.tsx`**

Dentro del `useEffect` de carga inicial de Today (el que ya trae `loadedGoals` — alrededor de la línea 126 según la auditoría), después de obtener las metas y SIN bloquear el render del plan:

```typescript
// Migración perezosa al modelo de compromiso (Fase 1). No bloquea el plan:
// si falla, la app vieja sigue funcionando y se reintenta en la próxima sesión.
void ensureCommitmentBackfill(userId, loadedGoals).catch(() => {})
```

con el import: `import { ensureCommitmentBackfill } from '@/services/backfill'`.

- [ ] **Step 3: Typecheck + tests + commit**

Run: `npx tsc -p tsconfig.json --noEmit && npm test -- --run`
Expected: PASS.

```bash
git add src/services/backfill.ts src/screens/Today.tsx
git commit -m "feat(backfill): hitos y compromiso para metas existentes (migración perezosa)"
```

---

### Task 6: Componente `CommitmentStep` (el paso 3 del wizard)

**Files:**
- Create: `src/components/wizard/CommitmentStep.tsx`

UI según mockup validado (compromiso v4): chips de días; por día elegido, 1..n momentos con stepper de minutos (o cantidad+unidad), recuadro de hora opcional, "+ añadir otro momento"; resumen vivo; guardia de sobrecompromiso. Copy en tuteo profesional.

- [ ] **Step 1: Crear el componente completo**

```tsx
import type { ScheduleBlock, TargetKind } from '@/lib/types'
import {
  WEEKDAY_LABELS,
  formatCommitmentSummary,
  overcommitWarning,
  type CommitmentBlockDraft,
} from '@/domain/commitment'

interface CommitmentStepProps {
  blocks: CommitmentBlockDraft[]
  onChange: (blocks: CommitmentBlockDraft[]) => void
  /** Bloques de OTRAS metas del usuario, para la guardia de sobrecompromiso. */
  existing: ScheduleBlock[]
  /** Default de duración (del onboarding o 25). */
  defaultMinutes: number
  /** Hora sugerida según el momento preferido, o null. */
  defaultStart: string | null
}

const STEP_MINUTES = 5

export function CommitmentStep({
  blocks,
  onChange,
  existing,
  defaultMinutes,
  defaultStart,
}: CommitmentStepProps) {
  // El tipo de medida es uno solo por meta a nivel UI (los bloques lo copian).
  const kind: TargetKind = blocks[0]?.targetKind ?? 'time'
  const unit = blocks.find((b) => b.unit)?.unit ?? ''
  const selectedDays = [...new Set(blocks.map((b) => b.weekday))].sort()
  const warning = overcommitWarning(existing, blocks)

  function toggleDay(weekday: number) {
    if (selectedDays.includes(weekday)) {
      onChange(blocks.filter((b) => b.weekday !== weekday))
      return
    }
    onChange([
      ...blocks,
      {
        weekday,
        targetKind: kind,
        targetValue: kind === 'time' ? defaultMinutes : 10,
        unit: kind === 'count' ? unit || null : null,
        startTime: defaultStart,
      },
    ])
  }

  function setKind(next: TargetKind) {
    onChange(
      blocks.map((b) => ({
        ...b,
        targetKind: next,
        targetValue: next === 'time' ? defaultMinutes : 10,
        unit: next === 'count' ? unit || null : null,
      })),
    )
  }

  /** Los bloques de un día, con sus índices reales en `blocks`. */
  function dayBlocks(weekday: number): { block: CommitmentBlockDraft; index: number }[] {
    return blocks
      .map((block, index) => ({ block, index }))
      .filter((x) => x.block.weekday === weekday)
  }

  function patchBlock(index: number, patch: Partial<CommitmentBlockDraft>) {
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }

  function addMoment(weekday: number) {
    onChange([
      ...blocks,
      {
        weekday,
        targetKind: kind,
        targetValue: kind === 'time' ? defaultMinutes : 10,
        unit: kind === 'count' ? unit || null : null,
        startTime: null,
      },
    ])
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  return (
    <div className="stack">
      <div className="row wrap" role="group" aria-label="¿Qué días le vas a dedicar?">
        {WEEKDAY_LABELS.map((label, weekday) => (
          <button
            key={label}
            type="button"
            className={`chip${selectedDays.includes(weekday) ? ' chip--selected' : ''}`}
            aria-pressed={selectedDays.includes(weekday)}
            onClick={() => toggleDay(weekday)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="Cómo se mide cada sesión">
        <button
          type="button"
          className={`chip${kind === 'time' ? ' chip--selected' : ''}`}
          aria-pressed={kind === 'time'}
          onClick={() => setKind('time')}
        >
          ⏱ Tiempo
        </button>
        <button
          type="button"
          className={`chip${kind === 'count' ? ' chip--selected' : ''}`}
          aria-pressed={kind === 'count'}
          onClick={() => setKind('count')}
        >
          № Cantidad
        </button>
        {kind === 'count' && (
          <input
            className="input"
            style={{ maxWidth: 140 }}
            aria-label="Unidad (por ejemplo páginas)"
            placeholder="páginas, km…"
            value={unit}
            maxLength={30}
            onChange={(e) =>
              onChange(blocks.map((b) => ({ ...b, unit: e.target.value.trim() || null })))
            }
          />
        )}
      </div>

      <div className="stack stack--sm">
        {selectedDays.map((weekday) => (
          <div key={weekday} className="card card--tight stack stack--sm">
            <strong>{WEEKDAY_LABELS[weekday]}</strong>
            {dayBlocks(weekday).map(({ block, index }) => (
              <div key={index} className="row" style={{ alignItems: 'center' }}>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Restar"
                  onClick={() =>
                    patchBlock(index, {
                      targetValue: Math.max(
                        kind === 'time' ? STEP_MINUTES : 1,
                        block.targetValue - (kind === 'time' ? STEP_MINUTES : 1),
                      ),
                    })
                  }
                >
                  −
                </button>
                <span style={{ minWidth: 76, textAlign: 'center', fontWeight: 700 }}>
                  {kind === 'time' ? `${block.targetValue} min` : `${block.targetValue} ${block.unit ?? ''}`}
                </span>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Sumar"
                  onClick={() =>
                    patchBlock(index, {
                      targetValue: block.targetValue + (kind === 'time' ? STEP_MINUTES : 1),
                    })
                  }
                >
                  +
                </button>
                <input
                  className="input"
                  style={{ maxWidth: 120, marginLeft: 'auto' }}
                  type="time"
                  aria-label="Hora del momento (opcional)"
                  value={block.startTime ?? ''}
                  onChange={(e) => patchBlock(index, { startTime: e.target.value || null })}
                />
                {dayBlocks(weekday).length > 1 && (
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="Quitar este momento"
                    onClick={() => removeBlock(index)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn--link" onClick={() => addMoment(weekday)}>
              + añadir otro momento
            </button>
          </div>
        ))}
      </div>

      {blocks.length > 0 && <div className="alert">{formatCommitmentSummary(blocks)}</div>}
      {warning && <div className="alert alert--warn" role="status">{warning}</div>}
      <p className="faint tiny">La hora es opcional: puedes fijarla o cambiarla después desde tu agenda.</p>
    </div>
  )
}
```

Nota: si la clase `alert--warn` no existe en `src/styles/components.css`, agregar junto a las reglas `.alert` existentes:

```css
.alert--warn { border-color: var(--niche-finanzas); color: var(--niche-finanzas); }
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: sin errores.

```bash
git add src/components/wizard/CommitmentStep.tsx src/styles/components.css
git commit -m "feat(wizard): paso de compromiso — días, momentos, hora opcional y guardia"
```

---

### Task 7: Componente `MilestonesStep` (el paso 4 — "Tu camino")

**Files:**
- Create: `src/components/wizard/MilestonesStep.tsx`

Lista editable de hitos borrador: renombrar inline, quitar, agregar, mover ↑/↓, fecha opcional (el drag se pule en Fase 4).

- [ ] **Step 1: Crear el componente completo**

```tsx
import { todayISO } from '@/lib/date'
import type { MilestoneDraft } from '@/domain/commitment'

interface MilestonesStepProps {
  milestones: MilestoneDraft[]
  onChange: (milestones: MilestoneDraft[]) => void
}

/** Reasigna `position` según el orden del array (la única fuente de orden). */
function renumber(list: MilestoneDraft[]): MilestoneDraft[] {
  return list.map((m, position) => ({ ...m, position }))
}

export function MilestonesStep({ milestones, onChange }: MilestonesStepProps) {
  function patch(index: number, p: Partial<MilestoneDraft>) {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...p } : m)))
  }

  function remove(index: number) {
    onChange(renumber(milestones.filter((_, i) => i !== index)))
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= milestones.length) return
    const next = [...milestones]
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(renumber(next))
  }

  function add() {
    onChange(
      renumber([...milestones, { title: '', position: milestones.length, targetDate: null, done: false }]),
    )
  }

  return (
    <div className="stack stack--sm">
      {milestones.map((m, index) => (
        <div key={index} className="card card--tight stack stack--sm">
          <div className="row" style={{ alignItems: 'center' }}>
            <input
              className="input"
              aria-label={`Etapa ${index + 1}`}
              placeholder="Describe esta etapa…"
              value={m.title}
              maxLength={200}
              onChange={(e) => patch(index, { title: e.target.value })}
            />
            <button type="button" className="iconbtn" aria-label="Subir" onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="iconbtn" aria-label="Bajar" onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="iconbtn" aria-label="Quitar etapa" onClick={() => remove(index)}>✕</button>
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            <input
              className="input"
              style={{ maxWidth: 170 }}
              type="date"
              aria-label="Fecha objetivo de la etapa (opcional)"
              min={todayISO()}
              value={m.targetDate ?? ''}
              onChange={(e) => patch(index, { targetDate: e.target.value || null })}
            />
            {m.targetDate && (
              <button type="button" className="btn--link" onClick={() => patch(index, { targetDate: null })}>
                Quitar fecha
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn--ghost btn--block" onClick={add}>
        + Agregar etapa
      </button>
      <p className="faint tiny">Estas etapas son tuyas: edítalas, reordénalas o cámbialas cuando quieras.</p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc -p tsconfig.json --noEmit`

```bash
git add src/components/wizard/MilestonesStep.tsx
git commit -m "feat(wizard): paso de camino — etapas editables con fecha opcional"
```

---

### Task 8: Recablear `Wizard.tsx` (6 pasos nuevos + submit transaccional)

**Files:**
- Modify: `src/screens/Wizard.tsx`

Pasos nuevos: 0 título · 1 tipo · 2 **compromiso** (obligatorio) · 3 **camino** · 4 ancla (porqué + fecha + criterio juntos) · 5 resumen+crear. `STEPS` sigue en 6. El draft de sessionStorage suma `blocks` y `milestones` (cambiar `DRAFT_KEY` a `'logralo.wizard-draft-v2'` para invalidar borradores viejos). Copy nuevo en tuteo profesional.

- [ ] **Step 1: Actualizar estado, draft y datos auxiliares**

En `Wizard()`:
- Cambiar `const DRAFT_KEY = 'hito.wizard-draft'` → `'logralo.wizard-draft-v2'`.
- Agregar a `WizardDraft` y a `loadDraft()` (validando como los campos existentes): `blocks: CommitmentBlockDraft[]` (validar con `Array.isArray` y filtrar elementos con `typeof weekday === 'number'`) y `milestones: MilestoneDraft[]` (ídem con `typeof title === 'string'`).
- Estado nuevo:

```typescript
const [blocks, setBlocks] = useState<CommitmentBlockDraft[]>(draft.blocks ?? [])
const [milestones, setMilestones] = useState<MilestoneDraft[]>(draft.milestones ?? [])
const [existingBlocks, setExistingBlocks] = useState<ScheduleBlock[]>([])
```

- Cargar bloques de otras metas una vez (guardia de sobrecompromiso):

```typescript
useEffect(() => {
  listScheduleForUser(userId)
    .then(setExistingBlocks)
    .catch(() => setExistingBlocks([]))
}, [userId])
```

- Al salir del paso 1 (tipo elegido), sembrar `milestones` desde la plantilla si el usuario aún no los tocó:

```typescript
// dentro de next(), al pasar de step 1 a 2:
if (step === 1 && milestones.length === 0) {
  setMilestones(buildMilestonesFromTemplate(getTemplate(templateKey || 'personalizada'), 0))
}
```

- Defaults del compromiso desde el perfil:

```typescript
const defaultMinutes = profile.defaultSessionMinutes ?? 25
const defaultStart =
  profile.preferredMoment === 'morning' ? '08:00'
  : profile.preferredMoment === 'midday' ? '13:00'
  : profile.preferredMoment === 'evening' ? '19:00'
  : null
```

Imports nuevos:

```typescript
import { buildMilestonesFromTemplate, validateCommitment, type CommitmentBlockDraft, type MilestoneDraft } from '@/domain/commitment'
import type { ScheduleBlock } from '@/lib/types'
import { listScheduleForUser, createScheduleBlocks } from '@/services/schedule'
import { createMilestones } from '@/services/milestones'
import { deleteGoal } from '@/services/goals'
import { CommitmentStep } from '@/components/wizard/CommitmentStep'
import { MilestonesStep } from '@/components/wizard/MilestonesStep'
```

- [ ] **Step 2: Reordenar los pasos del render**

- `step === 2` pasa a ser el compromiso:

```tsx
{step === 2 && (
  <Question
    title="¿Cuánto y cuándo cada semana?"
    hint="Tu compromiso real: días, cuánto por sesión y, si quieres, a qué hora."
  >
    <CommitmentStep
      blocks={blocks}
      onChange={setBlocks}
      existing={existingBlocks}
      defaultMinutes={defaultMinutes}
      defaultStart={defaultStart}
    />
  </Question>
)}
```

- `step === 3` pasa a ser el camino:

```tsx
{step === 3 && (
  <Question title="Estas son tus etapas" hint="Las sugerimos según tu tipo de meta. Edítalas a tu medida.">
    <MilestonesStep milestones={milestones} onChange={setMilestones} />
  </Question>
)}
```

- `step === 4` es el ancla (fusionar los pasos viejos de porqué + fecha + criterio en una pantalla; conservar los inputs existentes de `why`, `targetDate` y `criteria` tal cual, uno debajo del otro, con título "Tu ancla" y hint "Por qué lo haces, para cuándo y cómo sabrás que lo lograste. Todo opcional."). Actualizar placeholders al tuteo: `"Porque…"` se mantiene, `"Lo voy a saber cuando…"` → `"Lo sabré cuando…"`.
- `step === 5` es el resumen: el `ReviewCard` existente + debajo el resumen del compromiso:

```tsx
{blocks.length > 0 && <div className="alert">{formatCommitmentSummary(blocks)}</div>}
```

(import `formatCommitmentSummary` de `@/domain/commitment`). Eliminar el paso viejo de "área" como pantalla propia: `area` queda fijada por la plantilla (paso 1) y editable en Fase 2 desde el detalle — registrarlo en el commit message.

- [ ] **Step 3: Gating del botón Continuar**

```typescript
const commitmentError = validateCommitment(blocks)
const canContinue =
  step === 0 ? title.trim().length > 0
  : step === 2 ? commitmentError === null
  : step === 3 ? milestones.every((m) => m.title.trim().length > 0) && milestones.length > 0
  : true
```

Mostrar el motivo cuando bloquea (debajo del contenido del paso 2): `{step === 2 && commitmentError && <p className="faint tiny">{commitmentError}</p>}`.

- [ ] **Step 4: Submit transaccional con deshacer**

Reemplazar el cuerpo de `submit()`:

```typescript
async function submit() {
  setSaving(true)
  setError(null)
  let createdGoalId: string | null = null
  try {
    const goal = await createGoal(userId, {
      title: title.trim(),
      why: why.trim() || null,
      targetDate: targetDate || null,
      area,
      successCriteria: criteria.trim() || null,
      templateKey: templateKey || 'personalizada',
    })
    createdGoalId = goal.id
    await createMilestones(userId, goal.id, milestones.map((m, position) => ({ ...m, position })))
    await createScheduleBlocks(userId, goal.id, blocks)
    // Compatibilidad Fase 1: Today sigue mostrando tareas legacy hasta la Fase 2.
    try {
      await createGoalTasks(userId, todayISO(), [
        { goalId: goal.id, title: pickAction(goal, todayISO()) },
      ])
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
    }
    clearDraft()
    navigate(`/meta/creada/${goal.id}`, { replace: true })
  } catch {
    // Si la meta quedó a medias (sin hitos o sin compromiso), la deshacemos:
    // una meta sin contrato es exactamente lo que este rediseño elimina.
    if (createdGoalId) await deleteGoal(createdGoalId).catch(() => {})
    setError('No pudimos crear tu meta. Inténtalo de nuevo en un momento.')
    setSaving(false)
  }
}
```

- [ ] **Step 5: Persistir el draft ampliado**

En el `useEffect` del draft, agregar `blocks` y `milestones` al objeto serializado y a las dependencias; en `isEmpty` sumar `&& blocks.length === 0 && milestones.length === 0`.

- [ ] **Step 6: Typecheck + tests + commit**

Run: `npx tsc -p tsconfig.json --noEmit && npm test -- --run`
Expected: PASS.

```bash
git add src/screens/Wizard.tsx
git commit -m "feat(wizard): compromiso obligatorio, etapas editables y ancla unificada (área queda de la plantilla)"
```

---

### Task 9: `GoalCreated.tsx` muestra el contrato

**Files:**
- Modify: `src/screens/GoalCreated.tsx`

- [ ] **Step 1: Cargar compromiso e hitos reales junto a la meta**

Donde hoy se carga la meta (`getGoal`), cargar en paralelo:

```typescript
import { listScheduleForGoal } from '@/services/schedule'
import { listMilestones } from '@/services/milestones'
import { WEEKDAY_LABELS, formatCommitmentSummary } from '@/domain/commitment'
import type { Milestone, ScheduleBlock } from '@/lib/types'

const [schedule, setSchedule] = useState<ScheduleBlock[]>([])
const [milestones, setMilestones] = useState<Milestone[]>([])

// dentro del efecto existente:
Promise.all([getGoal(goalId), listScheduleForGoal(goalId), listMilestones(goalId)])
  .then(([g, s, m]) => {
    if (!active) return
    setGoal(g)
    setSchedule(s)
    setMilestones(m)
  })
```

- [ ] **Step 2: Render del contrato**

Debajo del Roadmap existente (que ahora recibe `milestones={milestones.map((m) => m.title)}` y `currentIndex={0}` en lugar de los textos de plantilla), agregar:

```tsx
{schedule.length > 0 && (
  <div className="card card--tight stack stack--sm">
    <span className="kicker">Tu compromiso</span>
    <div className="row wrap">
      {schedule.map((b) => (
        <span key={b.id} className="tag">
          {WEEKDAY_LABELS[b.weekday]}
          {b.startTime ? ` ${b.startTime}` : ''} ·{' '}
          {b.targetKind === 'time' ? `${b.targetValue} min` : `${b.targetValue} ${b.unit ?? ''}`}
        </span>
      ))}
    </div>
    <p className="small">{formatCommitmentSummary(schedule)}</p>
  </div>
)}
```

(`formatCommitmentSummary` acepta `ScheduleBlock[]` porque su forma es superconjunto de `CommitmentBlockDraft` — no requiere cambios.)

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc -p tsconfig.json --noEmit && npm test -- --run`

```bash
git add src/screens/GoalCreated.tsx
git commit -m "feat(goal-created): el momento de pago muestra el contrato real (compromiso + camino propio)"
```

---

### Task 10: Verificación final de la Fase 1

- [ ] **Step 1: Suite completa y typecheck**

Run: `npm test -- --run && npx tsc -p tsconfig.json --noEmit`
Expected: todos los tests PASS, cero errores de tipos.

- [ ] **Step 2: Smoke manual (con la migración 0004 ya corrida)**

1. `npm run dev` → crear una meta nueva por el wizard: verificar que el paso de compromiso bloquea sin días, que un día acepta dos momentos con horas distintas, y que el resumen vivo suma bien.
2. En Supabase Table Editor: la meta nueva tiene filas en `milestones` y `goal_schedule`.
3. Abrir Today con una cuenta que tenga metas viejas: tras cargar, verificar en Supabase que el backfill les creó hitos y compromiso (y que volver a recargar NO duplica filas).
4. GoalCreated muestra chips del compromiso y el camino propio.
5. Las pantallas viejas (GoalDetail, Review, Calendar) siguen funcionando igual que antes.

- [ ] **Step 3: Commit de cierre (si quedó algo suelto) y aviso**

Reportar al usuario: Fase 1 completa, recordar pendientes personales (correr migración si no lo hizo; comprar `logralo.app`).

---

## Backlog de observaciones del usuario (smoke test Fase 1, 2026-06-10)

> Anotaciones del dueño del producto tras probar la Fase 1. NO se pierden: cada una tiene fase asignada.

1. **Paso "Tus etapas" del wizard: demasiado ruido visual** (prioridad ALTA, → Fase 2 junto al detalle de meta).
   Cada etapa renderiza tarjeta + input grande + input de fecha siempre visible + 3 botones circulares:
   "saca todo el feeling, la persona se siente perdida y da pereza". Rediseñar como lista compacta y
   calma: texto plano editable al tocar, fecha y reordenar detrás de un toque (menú/expansión), añadir
   al final. El mismo patrón compacto se usará en el checklist de etapas del detalle de meta (Fase 2),
   así que se diseña UNA vez ahí y se reusa en el wizard.
2. **Plantillas mal escritas** (→ Fase 4, pase de contenido). Los textos de hitos/acciones de las 9
   plantillas son flojos (ej. "Producir la primera pieza", "Publicarla"). Reescribir TODO el contenido
   de plantillas con criterio de experto por nicho cuando se haga el pase de copy profesional.
   El usuario pidió explícitamente dejarlo para después: "deja eso así ahora".
3. **El detalle de meta no muestra el compromiso** (prioridad ALTA, ya en alcance de Fase 2 — el usuario
   lo confirmó como carencia fuerte: "falta fuerte el visualizar ese tiempo que se va a dedicar").
   El bloque "Tu compromiso" (chips por momento: "Lu 19:00 · 25 min" + total semanal) debe ser de lo
   primero visible en GoalDetail, junto al progreso calculado.

Además, pendientes menores de la revisión final integral (Fase 4 salvo indicación):
- `backfill.ts`: FLAG de sessionStorage no está espaciado por usuario (logout/login en la misma pestaña).
- Costura de copy tuteo/voseo entre wizard nuevo y pantallas legacy (se resuelve con el pase de copy).
- `CommitmentStep`: unidad vacía renderiza "10 " con espacio; paso 3 no muestra razón cuando el botón se deshabilita.
- `key={index}` en filas dinámicas (wizard): salto de foco al borrar — pulir con ids estables.
- Comprar `logralo.app` (acción del usuario, sigue pendiente).

## Esqueleto de las fases siguientes (cada una recibe su plan detallado al llegar)

- **Fase 2 — El día vivo:** servicio + dominio de `sessions` (generación idempotente desde `goal_schedule`, máquina de estados, cronómetro por timestamps); pantalla de sesión en curso (anillo, pausar, terminar); flujo de regreso ("¿Cómo te fue?": completa/parcial/no pude; cierre >24 h como `unconfirmed`); Hoy rediseñado (sesiones + mini tira semanal con corrección de ayer + 1 aviso máximo); GoalDetail nuevo (checklist de hitos, compromiso editable, reglas de logro, "lograda" al menú ⋯); migración 0005: drop `goals.current_milestone` y retiro de `setGoalMilestone`/`pickAction` legacy; eliminación del modo Enfoque (`planningGoals`/`weeklyFocus` single).
- **Fase 3 — Calendario:** vista tira semanal + agenda del día + mes expandible; sesiones en agenda con estado; hoja "fijar hora" (este día / todos los X); validación `end > start` en eventos; refetch al mover eventos fuera de rango; semántica agendado vs invertido.
- **Fase 4 — Progreso, revisión y marca:** Progreso nuevo (anillo semanal, tarjetas por meta, 8 semanas, "Tu camino" con hitos); racha sobre días comprometidos; revisión semanal re-propósito (ajustar compromiso); lista de Metas con ⭐ prioritaria; **onboarding nuevo** (promesa → qué cambiar → dedicación sin techo → momento del día → wizard precargado, con salida discreta; captura `preferred_moment` y `default_session_minutes`); Perfil completo (Tu ritmo, apariencia, eliminar cuenta vía Edge Function); identidad visual completa (paleta funcional naranja/verde, tintes por meta, 2 variantes, retiro de neón/papel); rebranding Lógralo (manifest, ícono check, splash, index.html); copy profesional en TODAS las pantallas (candidato a reescritura paralela multi-agente); tarjetas de logro compartibles (Web Share API).
- **Fase 5 — Notificaciones:** service worker push + `push_subscriptions` + Edge Function con VAPID; permiso en contexto; recordatorio de sesión, fin de cronómetro y rescate de racha opt-in.
