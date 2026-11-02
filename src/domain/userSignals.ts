/**
 * Memoria de comportamiento: lo que la persona HACE en la app (no lo que dice).
 * Se calcula en el servidor con los datos del usuario y se le pasa a la IA para
 * dimensionar el plan. Dominio puro y testeado; sin alias "@/".
 */

export interface UserSignals {
  /** Sesiones con resultado en la ventana (hechas, parciales, perdidas, sin confirmar). */
  sessionsWithOutcome: number
  /** Proporción cumplida (hecha o parcial) sobre las sesiones con resultado; null si hay pocas. */
  completionRate: number | null
  /** Minutos semanales ya comprometidos en otras metas activas. */
  committedWeeklyMinutes: number
  activeGoals: number
  preferredMoment: 'morning' | 'midday' | 'evening' | null
}

/** Con menos sesiones que esto, la tasa de cumplimiento no dice nada todavía. */
export const MIN_SESSIONS_FOR_RATE = 6

export function computeUserSignals(input: {
  sessionStatuses: string[]
  schedule: { targetKind: string; targetValue: number }[]
  activeGoals: number
  preferredMoment: string | null
}): UserSignals {
  // Saltadas y pendientes no cuentan: saltar es una decisión, no un fallo.
  const counted = input.sessionStatuses.filter((s) =>
    ['done', 'partial', 'missed', 'unconfirmed'].includes(s),
  )
  const kept = counted.filter((s) => s === 'done' || s === 'partial').length
  const moment = input.preferredMoment
  return {
    sessionsWithOutcome: counted.length,
    completionRate: counted.length >= MIN_SESSIONS_FOR_RATE ? kept / counted.length : null,
    committedWeeklyMinutes: input.schedule
      .filter((b) => b.targetKind === 'time')
      .reduce((sum, b) => sum + b.targetValue, 0),
    activeGoals: input.activeGoals,
    preferredMoment: moment === 'morning' || moment === 'midday' || moment === 'evening' ? moment : null,
  }
}

const MOMENT_LABEL = { morning: 'en la mañana', midday: 'al mediodía', evening: 'en la tarde-noche' }

/**
 * Frases legibles: van al prompt Y se le muestran a la persona ("tuvimos en
 * cuenta que…"), así la memoria nunca es una caja negra.
 */
export function describeSignals(signals: UserSignals | null): string[] {
  if (!signals) return []
  const lines: string[] = []
  if (signals.completionRate !== null) {
    const pct = Math.round(signals.completionRate * 100)
    lines.push(
      pct < 50
        ? `Últimamente completas el ${pct}% de tus sesiones: conviene un arranque más liviano.`
        : `Completas el ${pct}% de tus sesiones.`,
    )
  }
  if (signals.activeGoals > 0) {
    const h = Math.round((signals.committedWeeklyMinutes / 60) * 10) / 10
    lines.push(
      `Ya tienes ${signals.activeGoals} ${signals.activeGoals === 1 ? 'meta activa' : 'metas activas'}` +
        (h > 0 ? ` con ${h} h por semana comprometidas.` : '.'),
    )
  }
  if (signals.preferredMoment) lines.push(`Prefieres trabajar ${MOMENT_LABEL[signals.preferredMoment]}.`)
  return lines
}
