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

/**
 * Etapa actual acotada al rango [0, milestoneCount]. Evita que un
 * currentMilestone fuera de rango pinte el roadmap en una posición inválida.
 * Centraliza el `Math.min(currentMilestone, length)` que repetían Review,
 * GoalDetail y Goals.
 */
export function clampedStage(currentMilestone: number, milestoneCount: number): number {
  return Math.max(0, Math.min(currentMilestone, milestoneCount))
}

/** ¿La meta ya recorrió todos sus hitos (camino completo)? */
export function isPathComplete(currentMilestone: number, milestoneCount: number): boolean {
  return currentMilestone >= milestoneCount
}
