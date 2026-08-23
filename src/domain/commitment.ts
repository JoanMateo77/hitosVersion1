import type { Cadence, GoalTemplate, PreferredMoment, ScheduleBlock, TargetKind } from '@/lib/types'
import { formatDuration, formatTime12, parseISO } from '@/lib/date'

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

/** Un "momento" del día sin anclar a un weekday concreto (horario compartido). */
export type CommitmentMoment = Omit<CommitmentBlockDraft, 'weekday'>

/** Atajos de selección de días para el paso de compromiso. */
export const WEEKDAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Entre semana', days: [0, 1, 2, 3, 4] },
  { label: 'Todos los días', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Fin de semana', days: [5, 6] },
]

/** "08:30" → 510. Asume formato HH:MM válido (inputs nativos). */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 510 → "08:30". Envuelve sobre medianoche para horas derivadas. */
export function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Hora de fin derivada (inicio + duración). Solo aplica a bloques de tiempo
 * con hora de inicio; no se persiste, es puro azúcar de UI.
 */
export function blockEndTime(block: Pick<CommitmentBlockDraft, 'targetKind' | 'targetValue' | 'startTime'>): string | null {
  if (block.targetKind !== 'time' || !block.startTime) return null
  return minutesToTime(timeToMinutes(block.startTime) + block.targetValue)
}

/** Minutos entre inicio y fin, o null si el fin no queda después del inicio. */
export function rangeMinutes(start: string, end: string): number | null {
  const diff = timeToMinutes(end) - timeToMinutes(start)
  return diff > 0 ? diff : null
}

/** Paso adaptativo del stepper de duración: ±5 hasta 1 h, ±15 hasta 2 h, ±30 después. */
export function durationStep(value: number, direction: 1 | -1): number {
  const reference = direction === 1 ? value : value - 1
  if (reference >= 120) return 30
  if (reference >= 60) return 15
  return 5
}

/** Los momentos de un día concreto, en el orden en que aparecen en `blocks`. */
export function momentsOfDay(blocks: CommitmentBlockDraft[], weekday: number): CommitmentMoment[] {
  return blocks
    .filter((b) => b.weekday === weekday)
    .map((b) => ({
      targetKind: b.targetKind,
      targetValue: b.targetValue,
      unit: b.unit,
      startTime: b.startTime,
    }))
}

/**
 * Si todos los días elegidos comparten exactamente los mismos momentos,
 * devuelve ese horario común; si difieren (o no hay bloques), null.
 * Se usa para inferir el modo "mismo horario todos los días".
 */
export function uniformMoments(blocks: CommitmentBlockDraft[]): CommitmentMoment[] | null {
  const days = [...new Set(blocks.map((b) => b.weekday))].sort()
  if (days.length === 0) return null
  const signature = (moments: CommitmentMoment[]) =>
    JSON.stringify(moments.map((m) => [m.targetKind, m.targetValue, m.unit, m.startTime]))
  const first = momentsOfDay(blocks, days[0])
  const shared = days.every((d) => signature(momentsOfDay(blocks, d)) === signature(first))
  return shared ? first : null
}

/**
 * Etiqueta corta de un bloque para tags y resúmenes: "8:00 am–12:00 pm · 4 h",
 * "25 min" (sin hora) o "7:00 pm · 10 páginas". No incluye el día.
 */
export function blockTimeLabel(
  block: Pick<CommitmentBlockDraft, 'targetKind' | 'targetValue' | 'unit' | 'startTime'>,
): string {
  const amount =
    block.targetKind === 'time'
      ? formatDuration(block.targetValue)
      : `${block.targetValue} ${block.unit ?? ''}`.trim()
  const end = blockEndTime(block)
  if (block.startTime && end) return `${formatTime12(block.startTime)}–${formatTime12(end)} · ${amount}`
  if (block.startTime) return `${formatTime12(block.startTime)} · ${amount}`
  return amount
}

/** Hora sugerida según el momento preferido del perfil (mismo mapeo en toda la app). */
export function preferredStartTime(moment: PreferredMoment | null | undefined): string | null {
  switch (moment) {
    case 'morning':
      return '08:00'
    case 'midday':
      return '13:00'
    case 'evening':
      return '19:00'
    default:
      return null
  }
}

/** Replica un horario (lista de momentos) en cada día elegido. */
export function expandMomentsToDays(moments: CommitmentMoment[], days: number[]): CommitmentBlockDraft[] {
  return [...days]
    .sort((a, b) => a - b)
    .flatMap((weekday) => moments.map((moment) => ({ ...moment, weekday })))
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
 * Convención lunes=0; reemplaza a la cadencia fija de las plantillas legacy.
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
