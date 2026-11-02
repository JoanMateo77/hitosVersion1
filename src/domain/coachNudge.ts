/**
 * Cuándo el coach levanta la mano en el detalle de una meta (el globo sobre el
 * botón ✦). Sin culpa y solo con algo útil que decir: si no hay motivo claro,
 * no hay globo.
 */
export interface NudgeInput {
  /** Sesiones comprometidas esta semana (sin las saltadas). */
  committed: number
  /** Sesiones hechas esta semana. */
  done: number
  /** Día de la semana, lunes = 0. */
  weekday: number
  /** Etapas sin cumplir. */
  pendingStages: number
  /** Días desde que se creó la meta. */
  ageDays: number
  /** Etapas cumplidas. */
  doneStages: number
}

export function coachNudge(n: NudgeInput): string | null {
  // Desde el jueves, menos de la mitad de lo comprometido: ofrecer ajustar.
  if (n.committed >= 2 && n.weekday >= 3 && n.done * 2 < n.committed) {
    return `Esta semana llevas ${n.done} de ${n.committed} sesiones. ¿Lo revisamos juntos?`
  }
  // Tres semanas sin cumplir ninguna etapa: quizá la primera es muy grande.
  if (n.ageDays >= 21 && n.doneStages === 0 && n.pendingStages > 0) {
    return 'Llevas un tiempo en la primera etapa. ¿La partimos en algo más pequeño?'
  }
  return null
}
