import type { Goal, GoalTemplate, Milestone, ScheduleBlock, Session } from '@/lib/types'
import { addDays, parseISO } from '@/lib/date'

/**
 * El día vivo (Fase 2): lógica pura de sesiones.
 *
 * El cronómetro corre por TIMESTAMPS, no por timers en memoria: cerrar la app
 * no lo detiene. La pausa congela el reloj en paused_at y acumula en
 * paused_total_seconds al reanudar. Sin I/O; `now` siempre llega por parámetro.
 */

export function elapsedSeconds(s: Session, now: Date): number {
  if (!s.startedAt) return 0
  const start = new Date(s.startedAt).getTime()
  const endRef = s.pausedAt
    ? new Date(s.pausedAt).getTime()
    : s.endedAt
      ? new Date(s.endedAt).getTime()
      : now.getTime()
  const raw = Math.floor((endRef - start) / 1000) - s.pausedTotalSeconds
  return Math.max(0, raw)
}

/** Segundos que faltan para el objetivo (solo tiene sentido en kind 'time'). */
export function remainingSeconds(s: Session, now: Date): number {
  return Math.max(0, s.targetValue * 60 - elapsedSeconds(s, now))
}

/** ¿El cronómetro ya cumplió el objetivo de tiempo? */
export function isTimeReached(s: Session, now: Date): boolean {
  return s.targetKind === 'time' && elapsedSeconds(s, now) >= s.targetValue * 60
}

/** ¿Quedó corriendo de un día anterior? (se resuelve con "¿cómo te fue?") */
export function isStaleRunning(s: Session, todayISO: string): boolean {
  return s.status === 'running' && s.date < todayISO
}

/** Hash estable (FNV-1a) para repartir sugerencias por meta. */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Índice de día absoluto, para rotar sugerencias de forma estable. */
function dayIndex(dateISO: string): number {
  return Math.floor(parseISO(dateISO).getTime() / 86_400_000)
}

/**
 * Sugerencia de contenido para la tarjeta de sesión: rotación determinística
 * del pool de la plantilla por día+meta. Es una idea, no una tarea: la sesión
 * es el compromiso ("25 min"), la sugerencia solo propone con qué llenarlo.
 */
export function pickSuggestion(template: GoalTemplate, goalId: string, dateISO: string): string {
  const pool = template.actions
  if (pool.length === 0) return 'Avanza en tu meta'
  return pool[(dayIndex(dateISO) + hashString(goalId)) % pool.length]
}

/** Progreso estructural de la meta: hitos cumplidos sobre el total. */
export function milestoneProgress(milestones: Milestone[]): {
  done: number
  total: number
  ratio: number
} {
  const total = milestones.length
  const done = milestones.filter((m) => m.doneAt !== null).length
  return { done, total, ratio: total > 0 ? done / total : 0 }
}

/** Título de la próxima etapa por cumplir (la primera sin `doneAt` por posición), o null. */
export function nextMilestoneTitle(
  milestones: Array<Pick<Milestone, 'position' | 'doneAt' | 'title'>>,
): string | null {
  const next = [...milestones].sort((a, b) => a.position - b.position).find((m) => !m.doneAt)
  return next ? next.title : null
}

/**
 * Consistencia semanal: sesiones cumplidas (done|partial, incluidas las
 * espontáneas) sobre las comprometidas (una por bloque por semana, menos las
 * sesiones agendadas que se saltaron: un día saltado no cuenta como deuda).
 */
export function weekConsistency(
  blocks: ScheduleBlock[],
  sessions: Session[],
  weekStartISO: string,
): { done: number; committed: number } {
  const weekEnd = addDays(weekStartISO, 6)
  const done = sessions.filter(
    (s) =>
      s.date >= weekStartISO &&
      s.date <= weekEnd &&
      (s.status === 'done' || s.status === 'partial'),
  ).length
  const skipped = sessions.filter(
    (s) => s.date >= weekStartISO && s.date <= weekEnd && s.status === 'skipped' && s.scheduleId !== null,
  ).length
  return { done, committed: Math.max(0, blocks.length - skipped) }
}

/** Día de la semana lunes=0 (espejo local de commitment.weekdayMon0 sin ciclo). */
function weekdayMon0Local(dateISO: string): number {
  return (parseISO(dateISO).getDay() + 6) % 7
}

/**
 * Racha sobre días comprometidos: los días sin compromiso no la rompen ni la
 * suman; hoy sin cumplir todavía no rompe (queda "en juego" hasta fin del día).
 * `doneDates` = fechas con >=1 sesión done|partial. `neutralDates` = días
 * saltados a propósito: se tratan como no comprometidos (ni suman ni rompen).
 */
export function currentStreakCommitted(
  doneDates: Set<string>,
  committedWeekdays: Set<number>,
  todayISO: string,
  neutralDates: Set<string> = new Set(),
): number {
  if (committedWeekdays.size === 0) return 0
  let cursor = todayISO
  if (!doneDates.has(cursor)) cursor = addDays(cursor, -1)
  let streak = 0
  for (let i = 0; i < 365; i++) {
    if (committedWeekdays.has(weekdayMon0Local(cursor)) && !neutralDates.has(cursor)) {
      if (doneDates.has(cursor)) streak++
      else break
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Bloques de las metas ACTIVAS: las pausadas no comprometen ningún día. */
export function activeBlocksOf<B extends Pick<ScheduleBlock, 'goalId'>>(
  goals: Pick<Goal, 'id' | 'status'>[],
  blocks: B[],
): B[] {
  const active = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id))
  return blocks.filter((b) => active.has(b.goalId))
}

/** Días de la semana (lunes=0) con bloque de alguna meta ACTIVA. Es la única
 *  vara para la racha global: Hoy, Progreso y Perfil la comparten. */
export function activeCommittedWeekdays(
  goals: Pick<Goal, 'id' | 'status'>[],
  blocks: Pick<ScheduleBlock, 'goalId' | 'weekday'>[],
): Set<number> {
  return new Set(activeBlocksOf(goals, blocks).map((b) => b.weekday))
}

/** Fechas con al menos una sesión hecha o parcial. */
export function doneDatesOf(sessions: Pick<Session, 'date' | 'status'>[]): Set<string> {
  const out = new Set<string>()
  for (const s of sessions) if (s.status === 'done' || s.status === 'partial') out.add(s.date)
  return out
}

/**
 * ¿Día neutro (saltado a propósito)? Solo si CADA bloque comprometido ese día
 * tiene su sesión saltada y no hay ninguna otra sesión (aunque sea "no pude").
 * Las sesiones se generan al abrir la app ese día: saltar por adelantado solo
 * crea la fila de esa meta, así que las metas sin fila no cuentan como saltadas.
 */
export function isNeutralDay(
  daySessions: Pick<Session, 'status' | 'scheduleId'>[],
  dayBlocks: Pick<ScheduleBlock, 'id'>[],
): boolean {
  if (dayBlocks.length === 0) return false
  if (daySessions.some((s) => s.status !== 'skipped')) return false
  const skipped = new Set(daySessions.map((s) => s.scheduleId))
  return dayBlocks.every((b) => skipped.has(b.id))
}

/** Fechas neutras para la racha (ver isNeutralDay). `activeBlocks`: bloques de
 *  metas activas (activeBlocksOf). */
export function neutralDatesOf(
  sessions: Pick<Session, 'date' | 'status' | 'scheduleId'>[],
  activeBlocks: Pick<ScheduleBlock, 'id' | 'weekday'>[],
): Set<string> {
  const byDate = new Map<string, Pick<Session, 'status' | 'scheduleId'>[]>()
  for (const s of sessions) {
    const list = byDate.get(s.date)
    if (list) list.push(s)
    else byDate.set(s.date, [s])
  }
  const out = new Set<string>()
  for (const [date, daySessions] of byDate) {
    if (isNeutralDay(daySessions, dueBlocksForDate(activeBlocks, date))) out.add(date)
  }
  return out
}

/** Racha global actual con la misma métrica en toda la app. */
export function globalStreak(
  goals: Pick<Goal, 'id' | 'status'>[],
  blocks: Pick<ScheduleBlock, 'id' | 'goalId' | 'weekday'>[],
  sessions: Pick<Session, 'date' | 'status' | 'scheduleId'>[],
  todayISO: string,
): number {
  const active = activeBlocksOf(goals, blocks)
  return currentStreakCommitted(
    doneDatesOf(sessions),
    new Set(active.map((b) => b.weekday)),
    todayISO,
    neutralDatesOf(sessions, active),
  )
}

export type DayState = 'done' | 'partial' | 'missed' | 'future' | 'free'

/**
 * Estado de un día para las tiras de 7 días (Hoy y Progreso comparten reglas).
 * `dayBlocks`: bloques de metas activas que tocan ese día (dueBlocksForDate); sin
 * bloques el día no está comprometido.
 */
export function dayState(
  dateISO: string,
  todayISO: string,
  daySessions: Pick<Session, 'status' | 'scheduleId'>[],
  dayBlocks: Pick<ScheduleBlock, 'id'>[],
): DayState {
  // Día saltado a propósito: neutro, como un día sin compromiso.
  if (isNeutralDay(daySessions, dayBlocks)) return 'free'
  const committed = dayBlocks.length > 0
  if (dateISO > todayISO) return committed ? 'future' : 'free'
  // Sin compromiso, una sesión saltada (espontánea) tampoco lo vuelve deuda.
  if (!committed && daySessions.every((s) => s.status === 'skipped')) return 'free'
  if (daySessions.some((s) => s.status === 'done')) return 'done'
  if (daySessions.some((s) => s.status === 'partial')) return 'partial'
  if (dateISO === todayISO) return 'future'
  return 'missed'
}

/**
 * La mejor racha histórica sobre días comprometidos dentro de una ventana.
 * Recorre de fromISO a toISO contando rachas como currentStreakCommitted
 * (las fechas neutras, días saltados, ni suman ni cortan).
 */
export function bestStreakCommitted(
  doneDates: Set<string>,
  committedWeekdays: Set<number>,
  fromISO: string,
  toISO: string,
  neutralDates: Set<string> = new Set(),
): number {
  if (committedWeekdays.size === 0) return 0
  let best = 0
  let run = 0
  let cursor = fromISO
  while (cursor <= toISO) {
    if (committedWeekdays.has(weekdayMon0Local(cursor)) && !neutralDates.has(cursor)) {
      if (doneDates.has(cursor)) {
        run++
        if (run > best) best = run
      } else {
        run = 0
      }
    }
    cursor = addDays(cursor, 1)
  }
  return best
}

/** Bloques del compromiso que tocan en una fecha (proyección a futuro). */
export function dueBlocksForDate<B extends Pick<ScheduleBlock, 'weekday'>>(blocks: B[], dateISO: string): B[] {
  return blocks.filter((b) => b.weekday === weekdayMon0Local(dateISO))
}

/** mm:ss para relojes en pantalla (compartido por Hoy y la sesión en vivo). */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}
