/**
 * Borrador del día que arma la persona con ayuda de la IA. Dominio puro: la IA
 * solo extrae ítems (dayPlanAi.ts); aquí se decide DÓNDE va cada uno, qué se
 * puede hacer a la vez y qué no cuadra. Lo usan el cliente y el servidor:
 * imports relativos con .js (runtime ESM de Vercel).
 * Spec: docs/superpowers/specs/2026-11-07-ia-organizar-dia-design.md
 */
import { freeIntervals } from './agenda.js'
import { minutesToTime, timeToMinutes } from './commitment.js'

/** Cómo ocupa a la persona: decide qué se puede hacer a la vez. */
export type AttentionMode =
  /** Requiere toda la atención: reunión, estudiar, escribir, llamada. */
  | 'focus'
  /** Ocupa el cuerpo y deja libre el oído: gimnasio, manejar, caminar, cocinar. */
  | 'physical'
  /** Tarea mecánica: lavar platos, ordenar, doblar ropa. */
  | 'routine'
  /** Solo escuchar: pódcast, audiolibro, clase grabada. */
  | 'audio'

export const ATTENTION_MODES: readonly AttentionMode[] = ['focus', 'physical', 'routine', 'audio']

export type DayItemSource = 'new' | 'event' | 'session' | 'habit'
export type DayWindow = 'morning' | 'afternoon' | 'evening'
export const DAY_WINDOWS: readonly DayWindow[] = ['morning', 'afternoon', 'evening']

export interface DayItem {
  /** 'new:1' | 'event:<id>' | 'session:<key>' | 'habit:<id>:<slot>' */
  ref: string
  source: DayItemSource
  title: string
  /** Hora exacta que no se mueve (reunión, recoger a los niños). */
  fixed: boolean
  /** 'HH:MM'; obligatoria si fixed. En un flexible es la hora preferida. */
  start: string | null
  durationMin: number
  window: DayWindow | null
  mode: AttentionMode
  /** Solo ids de metas activas recibidas en el contexto. */
  goalId: string | null
  /** Ref del ítem con el que la persona confirmó que lo hace a la vez. */
  alongside: string | null
  /** "Cuando pueda", sin hora: se guarda como tarea. */
  untimed: boolean
  /** Hora que tenía un ítem existente antes del borrador (para "Movido de…"). */
  originalStart?: string | null
}

export interface PlacedItem {
  ref: string
  start: string
  end: string
  status: 'new' | 'moved' | 'same'
  /** Hora anterior de un ítem movido. */
  from?: string
  outsideWindow?: boolean
  /** Ítems con los que comparte tiempo (permitido por canOverlap). */
  overlapsWith: string[]
}

export type DayConflict =
  /** Dos fijos incompatibles a la vez; `a` empieza antes. */
  | { kind: 'fixed_overlap'; a: string; b: string }
  /** No cabe; freeMin = mayor hueco libre para ese ítem. */
  | { kind: 'no_room'; ref: string; freeMin: number }

export interface DayPlan {
  placed: PlacedItem[]
  untimed: string[]
  conflicts: DayConflict[]
}

export const DAY_DEFAULTS = { dayStart: '06:00', dayEnd: '22:00', bufferMin: 10, durationMin: 30 } as const

/** Ventanas del día en minutos; null = hasta el fin del día. */
export const WINDOWS: Record<DayWindow, [number, number | null]> = {
  morning: [360, 720],
  afternoon: [720, 1080],
  evening: [1080, null],
}

const LAST_MINUTE = 1439

export function canOverlap(a: DayItem, b: DayItem): boolean {
  if (a.alongside === b.ref || b.alongside === a.ref) return true
  const pair = (x: AttentionMode, y: AttentionMode) =>
    (a.mode === x && b.mode === y) || (a.mode === y && b.mode === x)
  return pair('audio', 'physical') || pair('audio', 'routine') || pair('routine', 'routine')
}

export interface PlanDayInput {
  items: DayItem[]
  /** Minuto actual si el día es hoy (nada flexible antes); null en otros días. */
  nowMin: number | null
  dayStart?: string
  dayEnd?: string
  bufferMin?: number
}

interface Slot {
  item: DayItem
  startMin: number
  endMin: number
  outsideWindow?: boolean
}

const overlaps = (a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }) =>
  a.startMin < b.endMin && b.startMin < a.endMin

const roundUp5 = (min: number) => Math.ceil(min / 5) * 5

function windowOfMinutes(min: number): DayWindow {
  if (min < WINDOWS.morning[1]!) return 'morning'
  if (min < WINDOWS.afternoon[1]!) return 'afternoon'
  return 'evening'
}

function slotAt(item: DayItem, startMin: number): Slot {
  return { item, startMin, endMin: Math.min(startMin + item.durationMin, LAST_MINUTE) }
}

/**
 * Coloca el día: fijos en su hora, anclados (hora preferida) si no chocan y
 * flexibles en el primer hueco de su ventana. Ver spec §3.2.
 */
export function planDay(input: PlanDayInput): DayPlan {
  const buffer = input.bufferMin ?? DAY_DEFAULTS.bufferMin
  const timed = input.items.filter((i) => !i.untimed)
  const fixed = timed.filter((i) => i.fixed && i.start)
  const placed: Slot[] = fixed.map((i) => slotAt(i, timeToMinutes(i.start as string)))

  // Los límites se amplían solos para incluir cualquier fijo fuera del rango.
  const dayStartMin = Math.min(timeToMinutes(input.dayStart ?? DAY_DEFAULTS.dayStart), ...placed.map((s) => s.startMin))
  const dayEndMin = Math.max(timeToMinutes(input.dayEnd ?? DAY_DEFAULTS.dayEnd), ...placed.map((s) => s.endMin))

  const conflicts: DayConflict[] = []
  const byStart = [...placed].sort((a, b) => a.startMin - b.startMin)
  for (let i = 0; i < byStart.length; i++) {
    for (let j = i + 1; j < byStart.length; j++) {
      const [a, b] = [byStart[i], byStart[j]]
      if (overlaps(a, b) && !canOverlap(a.item, b.item)) {
        conflicts.push({ kind: 'fixed_overlap', a: a.item.ref, b: b.item.ref })
      }
    }
  }

  // Anclados: un existente solo se mueve si choca con un fijo; uno nuevo con
  // hora preferida, si choca con cualquier cosa ya colocada.
  const queue: DayItem[] = []
  // Desplazados por un choque: buscan primero desde su hora de antes, no antes.
  const relocatedFrom = new Map<string, number>()
  const anchored = timed.filter((i) => !i.fixed && i.start)
  for (const it of anchored) {
    const slot = slotAt(it, timeToMinutes(it.start as string))
    const against = it.source === 'new' ? placed : placed.filter((s) => s.item.fixed)
    const clash = against.some((s) => overlaps(s, slot) && !canOverlap(s.item, it))
    if (clash) {
      relocatedFrom.set(it.ref, slot.startMin)
      queue.push({ ...it, window: it.window ?? windowOfMinutes(slot.startMin) })
    }
    else placed.push(slot)
  }

  const flexible = [...queue, ...timed.filter((i) => !i.fixed && !i.start)].sort((a, b) => {
    if (Boolean(a.window) !== Boolean(b.window)) return a.window ? -1 : 1
    return b.durationMin - a.durationMin
  })

  const lower = Math.max(dayStartMin, input.nowMin === null ? dayStartMin : roundUp5(input.nowMin))
  for (const it of flexible) {
    const slot = placeFlexible(it, placed, { lower, dayStartMin, dayEndMin, buffer }, relocatedFrom.get(it.ref))
    if (slot.kind === 'placed') placed.push(slot.slot)
    else conflicts.push({ kind: 'no_room', ref: it.ref, freeMin: slot.freeMin })
  }

  return {
    placed: placed.map((s) => toPlaced(s, placed)),
    untimed: input.items.filter((i) => i.untimed).map((i) => i.ref),
    conflicts,
  }
}

interface Bounds {
  lower: number
  dayStartMin: number
  dayEndMin: number
  buffer: number
}

function placeFlexible(
  it: DayItem,
  placed: Slot[],
  b: Bounds,
  preferFrom?: number,
): { kind: 'placed'; slot: Slot } | { kind: 'no_room'; freeMin: number } {
  const [ws, we] = it.window ? WINDOWS[it.window] : [b.dayStartMin, b.dayEndMin]
  const windowRange = { from: Math.max(ws, b.lower), to: Math.min(we ?? b.dayEndMin, b.dayEndMin) }

  // Audio: primero encima de algo que deje libre el oído (no consume hueco).
  if (it.mode === 'audio') {
    const host = [...placed]
      .sort((x, y) => x.startMin - y.startMin)
      .find((s) => canOverlap(s.item, it) && s.startMin >= b.lower && s.endMin - s.startMin >= it.durationMin)
    if (host) return { kind: 'placed', slot: slotAt(it, host.startMin) }
  }

  // Lo que choca con este ítem, ensanchado por el margen entre actividades.
  const busy = placed
    .filter((s) => !canOverlap(s.item, it))
    .map((s) => ({ startMin: s.startMin - b.buffer, endMin: s.endMin + b.buffer }))
  const free = freeIntervals(busy, b.lower, b.dayEndMin)
    .map((f) => ({ startMin: roundUp5(f.startMin), endMin: f.endMin }))
    .filter((f) => f.endMin > f.startMin)

  const fits = (f: { startMin: number; endMin: number }, from: number, to: number) => {
    const start = Math.max(f.startMin, from)
    return start + it.durationMin <= Math.min(f.endMin, to) ? start : null
  }
  const passes = preferFrom === undefined ? [windowRange.from] : [Math.max(windowRange.from, preferFrom), windowRange.from]
  for (const from of passes) {
    for (const f of free) {
      const start = fits(f, from, windowRange.to)
      if (start !== null) return { kind: 'placed', slot: slotAt(it, start) }
    }
  }
  for (const f of free) {
    const start = fits(f, b.lower, b.dayEndMin)
    if (start !== null) return { kind: 'placed', slot: { ...slotAt(it, start), outsideWindow: Boolean(it.window) } }
  }
  return { kind: 'no_room', freeMin: Math.max(0, ...free.map((f) => f.endMin - f.startMin)) }
}

function toPlaced(s: Slot, all: Slot[]): PlacedItem {
  const start = minutesToTime(s.startMin)
  const original = s.item.originalStart ?? null
  let status: PlacedItem['status'] = 'new'
  if (s.item.source !== 'new') status = original && original !== start ? 'moved' : 'same'
  const out: PlacedItem = {
    ref: s.item.ref,
    start,
    end: minutesToTime(s.endMin),
    status,
    overlapsWith: all
      .filter((o) => o !== s && overlaps(o, s) && canOverlap(o.item, s.item))
      .map((o) => o.item.ref),
  }
  if (status === 'moved' && original) out.from = original
  if (s.outsideWindow) out.outsideWindow = true
  return out
}
