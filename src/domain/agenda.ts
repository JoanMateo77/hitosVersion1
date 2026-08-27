import type { CalendarEvent, TargetKind } from '@/lib/types'
import { blockEndTime, timeToMinutes } from '@/domain/commitment'
import { formatDuration, formatTime12 } from '@/lib/date'

/**
 * Agenda como bloques (0014): lógica pura para pintar sesiones con rango de
 * horas, anidar eventos de una meta dentro de su sesión y detectar huecos
 * libres del día. Sin I/O; reutiliza las conversiones de commitment.ts.
 */

/** Rango horario de un ítem de agenda. Fin null = no derivable / abierto. */
export interface AgendaSpan {
  start: string | null
  end: string | null
}

/**
 * Rango de una sesión: el fin solo se deriva para compromisos de tiempo con
 * hora de inicio (inicio + duración). Si el fin derivado cruza medianoche
 * (quedaría <= inicio), se devuelve null para no romper el cálculo de huecos.
 */
export function sessionSpan(
  time: string | null,
  targetKind: TargetKind,
  targetValue: number,
): AgendaSpan {
  if (!time) return { start: null, end: null }
  const end = blockEndTime({ targetKind, targetValue, startTime: time })
  if (!end || timeToMinutes(end) <= timeToMinutes(time)) return { start: time, end: null }
  return { start: time, end }
}

/** Rango de un evento: null/null si es de día completo o no tiene hora. */
export function eventSpan(
  e: Pick<CalendarEvent, 'allDay' | 'startTime' | 'endTime'>,
): AgendaSpan {
  if (e.allDay || !e.startTime) return { start: null, end: null }
  if (!e.endTime || timeToMinutes(e.endTime) <= timeToMinutes(e.startTime)) {
    return { start: e.startTime, end: null }
  }
  return { start: e.startTime, end: e.endTime }
}

/** Lo mínimo de una sesión del día para poder anidarle eventos. */
export interface AgendaSessionSlot {
  key: string
  goalId: string
  start: string | null
  end: string | null
}

/** Orden dentro de un bloque: por hora de inicio, sin hora al final, empate por createdAt. */
function compareNested(a: CalendarEvent, b: CalendarEvent): number {
  const ka = a.allDay || !a.startTime ? '99' : a.startTime
  const kb = b.allDay || !b.startTime ? '99' : b.startTime
  return ka.localeCompare(kb) || a.createdAt.localeCompare(b.createdAt)
}

/**
 * Reparte los eventos del día entre las sesiones: un evento con meta se anida
 * en una sesión de SU meta — de preferencia la que lo contiene por horario
 * ([inicio, fin) incluye la hora de inicio del evento); si ninguna lo contiene
 * o el evento no tiene hora, va a la primera sesión de esa meta. Eventos sin
 * meta, o cuya meta no tiene sesión ese día, quedan sueltos (standalone).
 */
export function assignEventsToSessions(
  sessions: AgendaSessionSlot[],
  events: CalendarEvent[],
): { nested: Map<string, CalendarEvent[]>; standalone: CalendarEvent[] } {
  const nested = new Map<string, CalendarEvent[]>()
  const standalone: CalendarEvent[] = []
  for (const e of events) {
    const own = e.goalId ? sessions.filter((s) => s.goalId === e.goalId) : []
    if (own.length === 0) {
      standalone.push(e)
      continue
    }
    const evStart = e.allDay || !e.startTime ? null : timeToMinutes(e.startTime)
    const containing =
      evStart === null
        ? undefined
        : own.find(
            (s) =>
              s.start !== null &&
              s.end !== null &&
              evStart >= timeToMinutes(s.start) &&
              evStart < timeToMinutes(s.end),
          )
    const target = containing ?? own[0]
    const list = nested.get(target.key)
    if (list) list.push(e)
    else nested.set(target.key, [e])
  }
  for (const list of nested.values()) list.sort(compareNested)
  return { nested, standalone }
}

/**
 * Huecos libres del día: recibe los ítems CON hora ya ordenados por inicio y
 * devuelve índice → minutos libres ANTES de ese ítem. Solo huecos de 45 min o
 * más, medidos desde el fin del anterior (o su inicio si no tiene fin) hasta
 * el inicio del siguiente; los solapes (gap <= 0) se ignoran.
 */
export function freeGaps(items: Array<{ start: string; end: string | null }>): Map<number, number> {
  const gaps = new Map<number, number>()
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]
    const gap = timeToMinutes(items[i].start) - timeToMinutes(prev.end ?? prev.start)
    if (gap >= 45) gaps.set(i, gap)
  }
  return gaps
}

/** "8:00 pm–10:00 pm" (endash sin espacios, como blockTimeLabel) o solo "8:00 pm". */
export function rangeLabel(start: string, end: string | null): string {
  if (!end) return formatTime12(start)
  return `${formatTime12(start)}–${formatTime12(end)}`
}

/**
 * Texto de un hueco libre: "45 min libre", "2 h libre". A partir de 2 horas se
 * redondea a horas/medias para no fingir una precisión que el día no tiene.
 */
export function gapLabel(minutes: number): string {
  const rounded = minutes >= 120 ? Math.round(minutes / 30) * 30 : minutes
  return `${formatDuration(rounded)} libre`
}
