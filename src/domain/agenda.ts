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

/** Qué tan lejos de la ventana de la sesión puede empezar un evento y aun así anidarse. */
const NEAR_MINUTES = 60

/**
 * Reparte los eventos del día entre las sesiones: un evento con meta se anida
 * en una sesión de SU meta — de preferencia la que lo contiene por horario
 * ([inicio, fin) incluye la hora de inicio del evento) y, si ninguna, una que
 * quede cerca (a menos de una hora de la ventana). Sin hora, va a la primera
 * sesión de esa meta. Un evento con hora LEJOS de toda sesión queda suelto en
 * su lugar de la línea de tiempo (anidarlo lo escondería a otra hora); también
 * quedan sueltos los eventos sin meta o cuya meta no tiene sesión ese día.
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
    let target: AgendaSessionSlot | undefined
    if (evStart === null) {
      target = own[0]
    } else {
      const containing = own.find(
        (s) =>
          s.start !== null &&
          s.end !== null &&
          evStart >= timeToMinutes(s.start) &&
          evStart < timeToMinutes(s.end),
      )
      const near = own.find((s) => {
        if (s.start === null) return false
        const start = timeToMinutes(s.start)
        const end = s.end ? timeToMinutes(s.end) : start
        return evStart >= start - NEAR_MINUTES && evStart < end + NEAR_MINUTES
      })
      // Si la meta solo tiene sesiones sin hora, no hay ventana que respetar.
      const anyTimed = own.some((s) => s.start !== null)
      target = containing ?? near ?? (anyTimed ? undefined : own[0])
    }
    if (!target) {
      standalone.push(e)
      continue
    }
    const list = nested.get(target.key)
    if (list) list.push(e)
    else nested.set(target.key, [e])
  }
  for (const list of nested.values()) list.sort(compareNested)
  return { nested, standalone }
}

/**
 * Huecos libres en minutos: recibe los ítems CON hora ya ordenados por inicio
 * y devuelve índice → minutos libres ANTES de ese ítem. Solo huecos de
 * `minMinutes` o más (45 por defecto), medidos desde `items[i-1].endMin`
 * hasta `items[i].startMin`; los solapes (gap <= 0) se ignoran.
 */
export function freeGapsMinutes(
  items: Array<{ startMin: number; endMin: number }>,
  minMinutes = 45,
): Map<number, number> {
  const gaps = new Map<number, number>()
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].startMin - items[i - 1].endMin
    if (gap >= minMinutes) gaps.set(i, gap)
  }
  return gaps
}

/**
 * Huecos libres: recibe los ítems CON hora ya ordenados por inicio y devuelve
 * índice → minutos libres ANTES de ese ítem. Solo huecos de `minMinutes` o
 * más (45 por defecto), medidos desde el fin del anterior (o su inicio si no
 * tiene fin) hasta el inicio del siguiente; los solapes (gap <= 0) se ignoran.
 */
export function freeGaps(
  items: Array<{ start: string; end: string | null }>,
  minMinutes = 45,
): Map<number, number> {
  return freeGapsMinutes(
    items.map((it) => ({
      startMin: timeToMinutes(it.start),
      endMin: timeToMinutes(it.end ?? it.start),
    })),
    minMinutes,
  )
}

/** Duración visual mínima: un ítem puntual (sin fin) ocupa media hora. */
const MIN_EFFECTIVE_MINUTES = 30

/** Fin efectivo de un ítem: su fin real, nunca menos de 30 min tras el inicio. */
function effectiveEnd(startMin: number, end: string | null): number {
  const raw = end ? timeToMinutes(end) : startMin
  return Math.max(raw, startMin + MIN_EFFECTIVE_MINUTES)
}

/* ---- Bloques de tiempo del día (2026-09) --------------------------------
   La cronología agrupa lo que se solapa en el tiempo en UN bloque que la UI
   despliega. Todo es puro: minutos, orden y rangos. */

/** Ítem con hora del día, listo para agrupar. */
export interface DayItemSpan {
  key: string
  start: string
  end: string | null
}

/** Franja compartida: rango real y sus ítems, ordenados por inicio. */
export interface DayBlock {
  /** `b-${start}` del primer ítem (único: dos bloques no pueden empezar igual). */
  key: string
  /** Inicio del primer ítem. */
  start: string
  /** El mayor fin REAL de sus ítems; null si ninguno tiene fin. */
  end: string | null
  startMin: number
  /** Fin EFECTIVO (mínimo 30 min por ítem): para solapes, huecos y "ahora". */
  endMin: number
  items: DayItemSpan[]
}

/**
 * Agrupa los ítems con hora en bloques: se ordena por inicio (empate: el más
 * largo primero, luego por clave) y un ítem se une al bloque abierto SOLO si
 * empieza antes de su fin efectivo (solape estricto: lo que se toca no se
 * une). Un ítem sin fin cuenta 30 min efectivos.
 */
export function groupIntoBlocks(items: DayItemSpan[]): DayBlock[] {
  const sorted = items
    .map((it) => {
      const startMin = timeToMinutes(it.start)
      return { it, startMin, effEnd: effectiveEnd(startMin, it.end) }
    })
    .sort((a, b) => a.startMin - b.startMin || b.effEnd - a.effEnd || a.it.key.localeCompare(b.it.key))
  const blocks: DayBlock[] = []
  let current: DayBlock | null = null
  for (const { it, startMin, effEnd } of sorted) {
    if (current && startMin < current.endMin) {
      current.items.push(it)
      current.endMin = Math.max(current.endMin, effEnd)
      if (it.end && (!current.end || timeToMinutes(it.end) > timeToMinutes(current.end))) {
        current.end = it.end
      }
      continue
    }
    current = { key: `b-${it.start}`, start: it.start, end: it.end, startMin, endMin: effEnd, items: [it] }
    blocks.push(current)
  }
  return blocks
}

/** Franja del día, por hora de inicio. */
export type DayPeriod = 'morning' | 'afternoon' | 'evening'
export const PERIOD_ORDER: readonly DayPeriod[] = ['morning', 'afternoon', 'evening']
export const PERIOD_LABELS: Record<DayPeriod, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  evening: 'Noche',
}

/** < 12:00 mañana · < 19:00 tarde · resto noche. */
export function periodOfMinutes(min: number): DayPeriod {
  if (min < 12 * 60) return 'morning'
  if (min < 19 * 60) return 'afternoon'
  return 'evening'
}
export function periodOf(hhmm: string): DayPeriod {
  return periodOfMinutes(timeToMinutes(hhmm))
}

/** Qué bloque abrir por defecto hoy: el que contiene `nowMin` o, si no hay, el próximo. */
export function defaultOpenBlock(blocks: DayBlock[], nowMin: number): string | null {
  const containing = blocks.find((b) => nowMin >= b.startMin && nowMin < b.endMin)
  if (containing) return containing.key
  const next = blocks.find((b) => b.startMin >= nowMin)
  return next ? next.key : null
}

/**
 * Índice del primer bloque que empieza en o después de `nowMin` (ahí va la
 * línea "Ahora"); `blocks.length` si todos empezaron antes (línea al final).
 */
export function nowLineIndex(blocks: DayBlock[], nowMin: number): number {
  const i = blocks.findIndex((b) => b.startMin >= nowMin)
  return i === -1 ? blocks.length : i
}

/** "8:00 pm–10:00 pm" (endash sin espacios, como blockTimeLabel) o solo "8:00 pm". */
export function rangeLabel(start: string, end: string | null): string {
  if (!end) return formatTime12(start)
  return `${formatTime12(start)}–${formatTime12(end)}`
}

/**
 * Texto de un hueco libre: "45 min libres", "1 h libre", "3 h libres". A
 * partir de 2 horas se redondea a horas/medias para no fingir una precisión
 * que el día no tiene.
 */
export function gapLabel(minutes: number): string {
  const rounded = minutes >= 120 ? Math.round(minutes / 30) * 30 : minutes
  return `${formatDuration(rounded)} ${rounded === 60 ? 'libre' : 'libres'}`
}

/**
 * Hueco tocable antes de un bloque, o null si no hay uno que ofrecer. Con
 * `nowMin` (hoy) el hueco se recorta a lo que falta desde ahora: nada de
 * huecos ya pasados, y el tramo restante debe seguir siendo >= minMinutes.
 * Sin `nowMin` (día futuro) se usa el hueco completo.
 */
export function planableGap(
  rawMinutes: number | undefined,
  prevEndMin: number,
  blockStartMin: number,
  nowMin: number | null,
  minMinutes = 60,
): { start: number; minutes: number } | null {
  if (rawMinutes === undefined) return null
  if (nowMin === null) return { start: prevEndMin, minutes: rawMinutes }
  if (blockStartMin <= nowMin) return null
  const start = Math.max(prevEndMin, nowMin)
  const minutes = blockStartMin - start
  return minutes >= minMinutes ? { start, minutes } : null
}
