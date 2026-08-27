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

/* ---- Grilla horaria del día (0015) ---------------------------------------
   La vista día pinta una grilla tipo calendario (1 px = 1 min) donde el
   espacio libre se VE. Todo lo de aquí es puro layout en minutos. */

/** Ventana visible de la grilla, en minutos desde medianoche. */
export interface GridBounds {
  startMin: number
  endMin: number
}

/** Colocación de un ítem en la grilla: minutos + carril dentro de su clúster. */
export interface GridPlacement {
  key: string
  startMin: number
  endMin: number
  lane: number
  lanes: number
}

/** Ventana por defecto: 07:00–21:00. Se expande si el día tiene más. */
const GRID_DEFAULT_START = 7 * 60
const GRID_DEFAULT_END = 21 * 60
/** Duración visual mínima: un ítem puntual (sin fin) ocupa media hora de grilla. */
const MIN_EFFECTIVE_MINUTES = 30

/** Fin efectivo de un ítem: su fin real, nunca menos de 30 min tras el inicio. */
function effectiveEnd(startMin: number, end: string | null): number {
  const raw = end ? timeToMinutes(end) : startMin
  return Math.max(raw, startMin + MIN_EFFECTIVE_MINUTES)
}

/**
 * Ventana visible del día: 07:00–21:00 por defecto, expandida (redondeando a
 * la hora) hasta abarcar todo ítem con hora. Un ítem sin fin cuenta como
 * inicio + 30 min. Siempre dentro de [0, 1440].
 */
export function gridBounds(
  spans: Array<{ start: string | null; end: string | null }>,
): GridBounds {
  let startMin = GRID_DEFAULT_START
  let endMin = GRID_DEFAULT_END
  for (const s of spans) {
    if (!s.start) continue
    const st = timeToMinutes(s.start)
    const en = effectiveEnd(st, s.end)
    startMin = Math.min(startMin, Math.floor(st / 60) * 60)
    endMin = Math.max(endMin, Math.ceil(en / 60) * 60)
  }
  return { startMin: Math.max(0, startMin), endMin: Math.min(1440, endMin) }
}

/**
 * Carriles para solapes, estilo calendario: se ordena por inicio (empate: el
 * más largo primero) y cada ítem toma el primer carril libre de su clúster de
 * solape. `lanes` es el total de carriles de SU clúster (para repartir ancho);
 * un clúster nuevo (nadie lo toca) arranca de cero.
 */
export function layoutDay(
  items: Array<{ key: string; start: string; end: string | null }>,
): GridPlacement[] {
  const placed: GridPlacement[] = items
    .map((it) => {
      const startMin = timeToMinutes(it.start)
      return { key: it.key, startMin, endMin: effectiveEnd(startMin, it.end), lane: 0, lanes: 1 }
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  let cluster: GridPlacement[] = []
  let laneEnds: number[] = [] // fin del último ítem por carril, del clúster actual
  let clusterEnd = 0
  const closeCluster = () => {
    for (const p of cluster) p.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }
  for (const p of placed) {
    if (cluster.length > 0 && p.startMin >= clusterEnd) closeCluster()
    let lane = laneEnds.findIndex((end) => end <= p.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(p.endMin)
    } else {
      laneEnds[lane] = p.endMin
    }
    p.lane = lane
    cluster.push(p)
    clusterEnd = cluster.length === 1 ? p.endMin : Math.max(clusterEnd, p.endMin)
  }
  closeCluster()
  return placed
}

/**
 * Tramos SIN nada dentro de la ventana: fusiona la cobertura de todos los
 * ítems (fin efectivo mínimo de 30 min) y devuelve solo huecos de 60 min o
 * más, incluidos el tramo antes del primer ítem y después del último.
 */
export function uncoveredGaps(
  items: Array<{ start: string; end: string | null }>,
  bounds: GridBounds,
): Array<{ startMin: number; endMin: number }> {
  const covered = items
    .map((it) => {
      const s = timeToMinutes(it.start)
      return { s, e: effectiveEnd(s, it.end) }
    })
    .sort((a, b) => a.s - b.s)
  const gaps: Array<{ startMin: number; endMin: number }> = []
  let cursor = bounds.startMin
  for (const { s, e } of covered) {
    if (e <= cursor) continue
    const gapEnd = Math.min(s, bounds.endMin)
    if (gapEnd - cursor >= 60) gaps.push({ startMin: cursor, endMin: gapEnd })
    cursor = Math.max(cursor, e)
    if (cursor >= bounds.endMin) break
  }
  if (bounds.endMin - cursor >= 60) gaps.push({ startMin: cursor, endMin: bounds.endMin })
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
