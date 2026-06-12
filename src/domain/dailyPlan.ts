import type { Goal, Task } from '@/lib/types'
import { addDays, daysUntil, todayISO } from '@/lib/date'
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
  excludeGoalIds: Set<string>,
  now: Date = new Date(),
): ForgottenGoal | null {
  const hasTaskToday = excludeGoalIds
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

/**
 * Tareas propias (source='user') que quedaron pendientes de un día anterior:
 * candidatas a traerse a hoy. Las acciones derivadas de metas no se arrastran
 * (su continuidad la maneja el compromiso de sesiones), y las pospuestas ya
 * fueron decisión del usuario.
 */
export function carryoverCandidates(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.source === 'user' && t.status === 'pending')
}
