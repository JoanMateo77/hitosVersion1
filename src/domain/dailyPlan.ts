import type { Cadence, FocusMode, Goal, NicheId, Task } from '@/lib/types'
import { addDays, daysUntil, parseISO, todayISO } from '@/lib/date'
import { getTemplate } from '@/domain/templates'

/**
 * Mecanismo G — Plan del día automático.
 *
 * Todas las funciones son puras (sin I/O): reciben metas + tareas existentes y
 * devuelven qué acciones derivadas de metas faltan para hoy. Esto las hace
 * fáciles de testear y mantiene la lógica de negocio fuera de la UI y la BD.
 *
 * El plan respeta el orden de prioridad del documento:
 *   1) lo que el usuario quiere hacer (tareas source='user', ya persistidas),
 *   2) una acción por cada meta activa que "toca" hoy según su cadencia,
 *   3) el botón "no sé qué hacer, proponé vos" fuerza una acción por meta.
 */

/** Día de la semana 0=domingo … 6=sábado, en hora local. */
function weekday(dateISO: string): number {
  return parseISO(dateISO).getDay()
}

/** Índice de día absoluto, usado para rotar acciones de forma estable. */
function dayIndex(dateISO: string): number {
  return Math.floor(parseISO(dateISO).getTime() / 86_400_000)
}

/** Hash estable de un string (variante FNV-1a) para repartir acciones por meta. */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Acciones semanales objetivo según la cadencia (denominador del "X de Y esta semana"). */
export function actionsPerWeek(cadence: Cadence): number {
  switch (cadence) {
    case 'daily':
      return 7
    case 'weekdays':
      return 5
    case 'thrice_week':
      return 3
    case 'weekly':
      return 1
  }
}

/** ¿Esta cadencia pide una acción en la fecha dada? */
export function isDueToday(cadence: Cadence, dateISO: string): boolean {
  const wd = weekday(dateISO)
  switch (cadence) {
    case 'daily':
      return true
    case 'weekdays':
      return wd >= 1 && wd <= 5
    case 'thrice_week':
      return wd === 1 || wd === 3 || wd === 5 // lunes, miércoles, viernes
    case 'weekly':
      return wd === 1 // lunes
  }
}

/**
 * Elige una acción concreta para una meta en un día dado. La rotación combina
 * el día con un hash de la meta: así dos metas del mismo tipo no proponen
 * siempre lo mismo, y la acción de una meta varía día a día.
 */
export function pickAction(goal: Goal, dateISO: string): string {
  const template = getTemplate(goal.templateKey)
  // En la primera etapa proponemos acciones de "arranque" (kickoff) si la
  // plantilla las trae; en etapas avanzadas, el pool de régimen.
  const pool =
    goal.currentMilestone <= 0 && template.kickoffActions?.length
      ? template.kickoffActions
      : template.actions
  if (pool.length === 0) return 'Avanzar 25 min en tu meta'
  // currentMilestone entra en la rotación: la acción evoluciona con la etapa.
  const index =
    (dayIndex(dateISO) + hashString(goal.id) + Math.max(0, goal.currentMilestone)) % pool.length
  return pool[index]
}

export interface PlannedAction {
  goalId: string
  title: string
}

/**
 * Acciones derivadas de metas que faltan para `dateISO`.
 *
 * Omite metas que ya tienen una tarea creada hoy (no duplica), y por defecto
 * solo incluye las que tocan hoy según su cadencia. Con `force: true` (botón
 * "proponé vos") incluye TODAS las metas activas, ideal para días de bloqueo.
 */
export function deriveGoalActions(
  goals: Goal[],
  existingTasks: Task[],
  dateISO: string,
  opts: { force?: boolean } = {},
): PlannedAction[] {
  const goalsWithTaskToday = new Set(
    existingTasks.filter((t) => t.goalId !== null).map((t) => t.goalId),
  )
  const plan: PlannedAction[] = []
  for (const goal of goals) {
    if (goal.status !== 'active') continue
    if (goalsWithTaskToday.has(goal.id)) continue
    if (!opts.force && !isDueToday(getTemplate(goal.templateKey).cadence, dateISO)) continue
    plan.push({ goalId: goal.id, title: pickAction(goal, dateISO) })
  }
  return plan
}

export interface ForgottenGoal {
  goal: Goal
  /** Días sin avances (desde la última acción hecha, o desde que se creó). */
  days: number
}

/**
 * Recomendación continua (5.2): detecta la meta activa más "olvidada" para
 * preguntarle al usuario, amablemente, si sigue vigente. Una meta está olvidada
 * si no tuvo una acción hecha en >=5 días (o nunca y se creó hace >=3 días).
 * Excluye metas que ya tienen una acción hoy (no molestar con lo que ya está en
 * el plan). Devuelve la más estancada, o null.
 */
export function findForgottenGoal(
  goals: Goal[],
  lastDoneByGoalId: Map<string, string>,
  todayTasks: Task[],
  now: Date = new Date(),
): ForgottenGoal | null {
  const hasTaskToday = new Set(todayTasks.filter((t) => t.goalId !== null).map((t) => t.goalId))
  // Diferencia en días-calendario (evita el off-by-one de mezclar hora local y UTC).
  const daysSince = (iso: string) => daysUntil(todayISO(now), todayISO(new Date(iso)))

  let worst: ForgottenGoal | null = null
  for (const goal of goals) {
    if (goal.status !== 'active') continue
    if (hasTaskToday.has(goal.id)) continue
    const last = lastDoneByGoalId.get(goal.id)
    const days = last ? daysSince(last) : daysSince(goal.createdAt)
    const stale = last ? days >= 5 : days >= 3
    if (!stale) continue
    if (!worst || days > worst.days) worst = { goal, days }
  }
  return worst
}

/**
 * Recomendación continua (sección 5.2): "punto fuerte de la semana".
 * Elige una meta activa como foco principal combinando proximidad de la fecha
 * límite y coincidencia con el nicho principal del usuario. Determinístico.
 * Devuelve null si no hay metas activas.
 */
export function weeklyFocus(goals: Goal[], primaryNiche: NicheId | null): Goal | null {
  const active = goals.filter((g) => g.status === 'active')
  if (active.length === 0) return null

  const score = (goal: Goal): number => {
    let s = 0
    if (goal.targetDate) {
      const d = daysUntil(goal.targetDate)
      // Más cerca (o vencida) => más urgente. Acotado para no dominar todo.
      s += Math.max(0, 90 - Math.max(d, -30))
    }
    if (primaryNiche && goal.area === primaryNiche) s += 25
    return s
  }

  return active.reduce((best, goal) => (score(goal) > score(best) ? goal : best))
}

/**
 * Metas que entran al plan del día según el modo de foco (§3.1.1):
 *  - 'single' (enfocado): solo la meta principal, para no dispersarse.
 *  - 'multi': todas las activas, con rotación inteligente por cadencia.
 */
export function planningGoals(
  goals: Goal[],
  focusMode: FocusMode,
  primaryNiche: NicheId | null,
): Goal[] {
  const active = goals.filter((g) => g.status === 'active')
  if (focusMode === 'single') {
    const top = weeklyFocus(active, primaryNiche)
    return top ? [top] : []
  }
  return active
}

/**
 * Metas activas que toca revisar (Sección 6): nunca revisadas, o cuya última
 * revisión es anterior al reviewEveryDays de su plantilla. Determinístico.
 */
/**
 * Racha de días activos consecutivos hasta hoy. `activeDates` son fechas
 * YYYY-MM-DD con al menos una tarea completada. Si hoy todavía no hubo actividad,
 * la racha NO se rompe: cuenta desde ayer (sigue "en juego" hasta fin del día).
 */
export function currentStreak(activeDates: string[], today: string): number {
  const set = new Set(activeDates)
  let cursor = today
  if (!set.has(cursor)) {
    cursor = addDays(today, -1)
    if (!set.has(cursor)) return 0
  }
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function goalsDueForReview(goals: Goal[], now: Date = new Date()): Goal[] {
  const today = todayISO(now)
  return goals.filter((g) => {
    if (g.status !== 'active') return false
    if (!g.lastReviewedAt) return true
    const every = getTemplate(g.templateKey).reviewEveryDays
    return daysUntil(today, todayISO(new Date(g.lastReviewedAt))) >= every
  })
}
