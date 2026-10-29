import type { Goal, GoalStatus } from '@/lib/types'

/**
 * ¿La meta está "cerrada" (lograda o archivada)? En ese caso no tiene sentido
 * mostrarle deadline ni regañarla con "vencida".
 *
 * Ojo: las metas pausadas y activas NO cuentan como cerradas — una meta pausada
 * con fecha pasada sí sigue vencida.
 */
export function isGoalClosed(status: GoalStatus): boolean {
  return status === 'done' || status === 'archived'
}

/**
 * Metas que se muestran fijadas en Hoy: solo las activas, la prioritaria
 * primero y luego las más recientes.
 */
export function goalsInView(goals: Goal[], priorityGoalId: string | null): Goal[] {
  return goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => {
      const ap = a.id === priorityGoalId ? 0 : 1
      const bp = b.id === priorityGoalId ? 0 : 1
      if (ap !== bp) return ap - bp
      return b.createdAt.localeCompare(a.createdAt)
    })
}
