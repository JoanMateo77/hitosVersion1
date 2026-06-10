import type { GoalTemplate, Milestone, ScheduleBlock, Session } from '@/lib/types'
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

/**
 * Consistencia semanal: sesiones cumplidas (done|partial, incluidas las
 * espontáneas) sobre las comprometidas (una por bloque por semana).
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
  return { done, committed: blocks.length }
}

/** Día de la semana lunes=0 (espejo local de commitment.weekdayMon0 sin ciclo). */
function weekdayMon0Local(dateISO: string): number {
  return (parseISO(dateISO).getDay() + 6) % 7
}

/**
 * Racha sobre días comprometidos: los días sin compromiso no la rompen ni la
 * suman; hoy sin cumplir todavía no rompe (queda "en juego" hasta fin del día).
 * `doneDates` = fechas con >=1 sesión done|partial.
 */
export function currentStreakCommitted(
  doneDates: Set<string>,
  committedWeekdays: Set<number>,
  todayISO: string,
): number {
  if (committedWeekdays.size === 0) return 0
  let cursor = todayISO
  if (!doneDates.has(cursor)) cursor = addDays(cursor, -1)
  let streak = 0
  for (let i = 0; i < 365; i++) {
    if (committedWeekdays.has(weekdayMon0Local(cursor))) {
      if (doneDates.has(cursor)) streak++
      else break
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}
