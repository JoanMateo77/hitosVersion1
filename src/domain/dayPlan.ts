/**
 * Borrador del día que arma la persona con ayuda de la IA. Dominio puro: la IA
 * solo extrae ítems (dayPlanAi.ts); aquí se decide DÓNDE va cada uno, qué se
 * puede hacer a la vez y qué no cuadra. Lo usan el cliente y el servidor:
 * imports relativos con .js (runtime ESM de Vercel).
 * Spec: docs/superpowers/specs/2026-11-07-ia-organizar-dia-design.md
 */
import { freeIntervals, minutesToTime, timeToMinutes } from './clock.js'
import { formatDuration, formatTime12 } from './timeFormat.js'

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
  /** Hora de fin que tenía un evento existente (para deshacer el movimiento). */
  originalEnd?: string | null
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
  // Un existente sin hora (p. ej. una sesión sin hora) es contexto: no se le
  // asigna una sola por abrir la hoja; solo si la IA o la persona se la dan.
  const isUntimed = (i: DayItem) => i.untimed || (i.source !== 'new' && !i.start)
  const timed = input.items.filter((i) => !isUntimed(i))
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

  const lower = Math.max(dayStartMin, input.nowMin === null ? dayStartMin : roundUp5(input.nowMin))

  // Anclados: un existente solo se mueve si choca con un fijo; uno nuevo con
  // hora preferida, si choca con cualquier cosa ya colocada o si ya pasó.
  const queue: DayItem[] = []
  // Desplazados por un choque: buscan primero desde su hora de antes, no antes.
  const relocatedFrom = new Map<string, number>()
  const anchored = timed.filter((i) => !i.fixed && i.start)
  for (const it of anchored) {
    const slot = slotAt(it, timeToMinutes(it.start as string))
    const against = it.source === 'new' ? placed : placed.filter((s) => s.item.fixed)
    const clash = against.some((s) => overlaps(s, slot) && !canOverlap(s.item, it))
    const past = it.source === 'new' && slot.startMin < lower
    if (clash || past) {
      relocatedFrom.set(it.ref, slot.startMin)
      queue.push({ ...it, window: it.window ?? windowOfMinutes(slot.startMin) })
    }
    else placed.push(slot)
  }

  const flexible = [...queue, ...timed.filter((i) => !i.fixed && !i.start)].sort((a, b) => {
    if (Boolean(a.window) !== Boolean(b.window)) return a.window ? -1 : 1
    return b.durationMin - a.durationMin
  })

  for (const it of flexible) {
    const slot = placeFlexible(it, placed, { lower, dayStartMin, dayEndMin, buffer }, relocatedFrom.get(it.ref))
    if (slot.kind === 'placed') placed.push(slot.slot)
    else conflicts.push({ kind: 'no_room', ref: it.ref, freeMin: slot.freeMin })
  }

  return {
    placed: placed.map((s) => toPlaced(s, placed)),
    untimed: input.items.filter(isUntimed).map((i) => i.ref),
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

  // Audio: primero encima de algo que deje libre el oído (no consume hueco),
  // dentro de su ventana y sin chocar con nada incompatible ya colocado
  // (p. ej. otro audio sobre el mismo anfitrión).
  if (it.mode === 'audio') {
    const host = [...placed]
      .sort((x, y) => x.startMin - y.startMin)
      .find((s) => {
        if (!canOverlap(s.item, it) || s.endMin - s.startMin < it.durationMin) return false
        const cand = slotAt(it, s.startMin)
        if (cand.startMin < windowRange.from || cand.endMin > windowRange.to) return false
        return !placed.some((o) => overlaps(o, cand) && !canOverlap(o.item, it))
      })
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
  // Un existente sin hora que recibe una también cuenta como movido (sin "from").
  if (s.item.source !== 'new') status = original === start ? 'same' : 'moved'
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

/**
 * Borrador tras una respuesta de la IA: lo existente que no devolvió queda como
 * estaba (nunca se pierde lo que ya había en el día); lo nuevo es lo que devolvió.
 */
export function mergeAiItems(prev: DayItem[], next: DayItem[]): DayItem[] {
  const byRef = new Map(next.map((i) => [i.ref, i]))
  const existing = prev.filter((i) => i.source !== 'new').map((i) => byRef.get(i.ref) ?? i)
  return [...existing, ...next.filter((i) => i.source === 'new')]
}

/* ===== Preguntas del algoritmo, efectos y operaciones ===================== */

export type DayEffect =
  /** "Sí, a la vez". */
  | { kind: 'alongside'; ref: string; with: string }
  /** Partir en dos bloques (solo ítems nuevos). */
  | { kind: 'split'; ref: string }
  /** Ajustar al hueco libre. */
  | { kind: 'shorten'; ref: string; minutes: number }
  /** Dejarlo para otro día (no se agenda). */
  | { kind: 'drop'; ref: string }
  /** Dejarlo como tarea sin hora (solo ítems nuevos). */
  | { kind: 'untimed'; ref: string }
  /** Dejar un existente a su hora de siempre, aunque choque (pasa a fijo). */
  | { kind: 'pin'; ref: string }

export type DayOption =
  /** Pregunta del algoritmo: se aplica en el cliente, sin gastar IA. */
  | { label: string; effect: DayEffect }
  /** Pregunta de la IA: la respuesta vuelve a la IA. */
  | { label: string; reply: string }

export interface DayQuestion {
  id: string
  text: string
  options: DayOption[]
  from: 'plan' | 'ai'
}

/** Minutos mínimos para ofrecer "Hacer solo N min". */
const MIN_SHORTEN = 15

const halfOf = (min: number) => Math.round(min / 2 / 5) * 5

export function conflictQuestions(plan: DayPlan, items: DayItem[]): DayQuestion[] {
  const byRef = new Map(items.map((i) => [i.ref, i]))
  const placedByRef = new Map(plan.placed.map((p) => [p.ref, p]))
  const questions: DayQuestion[] = []
  for (const c of plan.conflicts) {
    if (c.kind === 'fixed_overlap') {
      const a = byRef.get(c.a)
      const b = byRef.get(c.b)
      const pa = placedByRef.get(c.a)
      const pb = placedByRef.get(c.b)
      if (!a || !b || !pa || !pb) continue
      const options: DayOption[] = [{ label: 'Sí, a la vez', effect: { kind: 'alongside', ref: b.ref, with: a.ref } }]
      if (b.source === 'new') {
        options.push(
          { label: `Dejar ${b.title} sin hora`, effect: { kind: 'untimed', ref: b.ref } },
          { label: `Quitar ${b.title}`, effect: { kind: 'drop', ref: b.ref } },
        )
      }
      questions.push({
        id: `conflict:fixed_overlap:${a.ref}|${b.ref}`,
        from: 'plan',
        text: `${a.title} (${formatTime12(pa.start)}–${formatTime12(pa.end)}) y ${b.title} (${formatTime12(pb.start)}) chocan. ¿Puedes hacerlas a la vez?`,
        options,
      })
      continue
    }
    const it = byRef.get(c.ref)
    if (!it) continue
    if (it.source !== 'new') {
      // De un existente solo se ofrece lo que se puede guardar: dejarlo a su
      // hora (si choca, la pregunta siguiente ofrece hacerlo a la vez).
      if (!it.originalStart) continue
      questions.push({
        id: `conflict:no_room:${it.ref}`,
        from: 'plan',
        text: `${it.title} ya no cabe en otro momento del día. ¿Qué hacemos?`,
        options: [{ label: 'Dejarla a su hora', effect: { kind: 'pin', ref: it.ref } }],
      })
      continue
    }
    const options: DayOption[] = []
    if (it.source === 'new' && halfOf(it.durationMin) <= c.freeMin) {
      options.push({ label: 'Partirla en dos bloques', effect: { kind: 'split', ref: it.ref } })
    }
    if (c.freeMin >= MIN_SHORTEN) {
      options.push({ label: `Hacer solo ${c.freeMin} min`, effect: { kind: 'shorten', ref: it.ref, minutes: c.freeMin } })
    }
    options.push(
      { label: 'Dejarla como tarea sin hora', effect: { kind: 'untimed', ref: it.ref } },
      { label: 'Pasarla a otro día', effect: { kind: 'drop', ref: it.ref } },
    )
    questions.push({
      id: `conflict:no_room:${it.ref}`,
      from: 'plan',
      text: `${it.title} (${formatDuration(it.durationMin)}) no cabe completa hoy. ¿Qué hacemos?`,
      options,
    })
  }
  return questions
}

/**
 * Si el cambio de duración se puede guardar: un ítem nuevo o un evento (que
 * guarda su fin). Las sesiones y los hábitos solo guardan la hora.
 */
export function canResize(item: DayItem): boolean {
  return item.source === 'new' || item.source === 'event'
}

export function applyEffect(items: DayItem[], effect: DayEffect): DayItem[] {
  switch (effect.kind) {
    case 'alongside':
      return items.map((i) => {
        if (i.ref === effect.ref) return { ...i, alongside: effect.with }
        if (i.ref === effect.with) return { ...i, alongside: effect.ref }
        return i
      })
    case 'split':
      return items.flatMap((i) => {
        if (i.ref !== effect.ref || i.source !== 'new') return [i]
        const half = halfOf(i.durationMin)
        return [1, 2].map((k) => ({ ...i, ref: `${i.ref}#${k}`, durationMin: half, fixed: false, start: null }))
      })
    case 'shorten':
      return items.map((i) => (i.ref === effect.ref && canResize(i) ? { ...i, durationMin: effect.minutes } : i))
    case 'drop':
      return items.filter((i) => i.ref !== effect.ref || i.source !== 'new')
    case 'untimed':
      return items.map((i) => (i.ref === effect.ref && i.source === 'new' ? { ...i, untimed: true } : i))
    case 'pin':
      return items.map((i) =>
        i.ref === effect.ref && i.source !== 'new' ? { ...i, fixed: true, start: i.originalStart ?? i.start } : i,
      )
  }
}

export type DayOp =
  | { kind: 'createEvent'; ref: string; title: string; start: string; end: string }
  | { kind: 'createSession'; ref: string; goalId: string; start: string; durationMin: number }
  | { kind: 'createTask'; ref: string; title: string }
  /** end null = el evento no tiene hora de fin (se conserva así al moverlo). */
  | { kind: 'moveEvent'; ref: string; eventId: string; start: string; end: string | null; prevStart: string | null; prevEnd: string | null }
  /** start null = la sesión vuelve a quedar sin hora (al deshacer). */
  | { kind: 'moveSession'; ref: string; sessionKey: string; start: string | null; prevStart: string | null }
  | { kind: 'moveHabit'; ref: string; habitId: string; times: string[]; prevTimes: string[] | null }

/** Horas efectivas de un hábito ese día (con la excepción, si la hay). */
export interface DayContextHabit {
  habitId: string
  times: string[]
  hasOverride: boolean
}

const after = (ref: string, prefix: string) => ref.slice(prefix.length)

/** Traduce el borrador a operaciones (spec §3.4). Lo que no cambia no genera nada. */
export function planToOps(plan: DayPlan, items: DayItem[], habits: DayContextHabit[]): DayOp[] {
  const byRef = new Map(items.map((i) => [i.ref, i]))
  const ops: DayOp[] = []
  const habitTimes = new Map<string, string[]>()
  for (const p of plan.placed) {
    const it = byRef.get(p.ref)
    if (!it || p.status === 'same') continue
    if (it.source === 'new') {
      ops.push(
        it.goalId
          ? { kind: 'createSession', ref: it.ref, goalId: it.goalId, start: p.start, durationMin: it.durationMin }
          : { kind: 'createEvent', ref: it.ref, title: it.title, start: p.start, end: p.end },
      )
    } else if (it.source === 'event') {
      ops.push({
        kind: 'moveEvent',
        ref: it.ref,
        eventId: after(it.ref, 'event:'),
        start: p.start,
        end: it.originalEnd === null ? null : p.end,
        prevStart: it.originalStart ?? null,
        prevEnd: it.originalEnd ?? null,
      })
    } else if (it.source === 'session') {
      ops.push({ kind: 'moveSession', ref: it.ref, sessionKey: after(it.ref, 'session:'), start: p.start, prevStart: it.originalStart ?? null })
    } else {
      const [habitId, slot] = after(it.ref, 'habit:').split(':')
      const ctx = habits.find((h) => h.habitId === habitId)
      if (!ctx) continue
      const times = habitTimes.get(habitId) ?? [...ctx.times]
      times[Number(slot)] = p.start
      habitTimes.set(habitId, times)
    }
  }
  for (const [habitId, times] of habitTimes) {
    const ctx = habits.find((h) => h.habitId === habitId) as DayContextHabit
    ops.push({ kind: 'moveHabit', ref: `habit:${habitId}`, habitId, times, prevTimes: ctx.hasOverride ? [...ctx.times] : null })
  }
  for (const ref of plan.untimed) {
    const it = byRef.get(ref)
    if (it?.source === 'new') ops.push({ kind: 'createTask', ref, title: it.title })
  }
  return ops
}

export function countChanges(ops: DayOp[]): number {
  return ops.length
}
