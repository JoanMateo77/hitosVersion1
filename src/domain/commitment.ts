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
      if (
        !worst ||
        minutes > worst.minutes ||
        (minutes === worst.minutes && sessions > worst.sessions)
      ) {
        worst = { weekday, sessions, minutes }
      }
    }
  }
  if (!worst) return null
  const day = WEEKDAY_PLURALS[worst.weekday]
  const sessionsLabel = worst.sessions === 1 ? '1 sesión' : `${worst.sessions} sesiones`
  const durationPart = worst.minutes > 0 ? ` (${formatDuration(worst.minutes)})` : ''
  return `Los ${day} ya tienes ${sessionsLabel}${durationPart} de otras metas. Revisa que el plan te entre.`
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

/**
 * Mapea la cadencia legacy de plantillas a días comprometidos (backfill).
 * Paralelo a isDueToday (dailyPlan.ts), pero en convención lunes=0.
 */
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
