import type { GoalStatus } from '@/lib/types'

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
