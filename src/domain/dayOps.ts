/**
 * Ejecución y reversión de las operaciones del borrador del día. Los
 * ejecutores (servicios reales) entran por parámetro: así se prueba sin red.
 */
import type { DayOp } from './dayPlan.js'

type Op<K extends DayOp['kind']> = Extract<DayOp, { kind: K }>

export interface DayOpExecutors {
  /** Los create* devuelven el id creado (para poder deshacer). */
  createEvent(op: Op<'createEvent'>): Promise<string>
  createSession(op: Op<'createSession'>): Promise<string>
  createTask(op: Op<'createTask'>): Promise<string>
  moveEvent(op: Op<'moveEvent'>): Promise<void>
  moveSession(op: Op<'moveSession'>): Promise<void>
  /** `times: []` = quitar la excepción del día (vuelve a su horario de siempre). */
  moveHabit(op: Op<'moveHabit'>): Promise<void>
  deleteEvent(id: string): Promise<void>
  deleteSession(id: string): Promise<void>
  deleteTask(id: string): Promise<void>
}

export interface DoneOp {
  op: DayOp
  createdId?: string
}

async function runOne(op: DayOp, ex: DayOpExecutors): Promise<DoneOp> {
  switch (op.kind) {
    case 'createEvent':
      return { op, createdId: await ex.createEvent(op) }
    case 'createSession':
      return { op, createdId: await ex.createSession(op) }
    case 'createTask':
      return { op, createdId: await ex.createTask(op) }
    case 'moveEvent':
      await ex.moveEvent(op)
      return { op }
    case 'moveSession':
      await ex.moveSession(op)
      return { op }
    case 'moveHabit':
      await ex.moveHabit(op)
      return { op }
  }
}

/** En orden; se detiene en el primer error y devuelve lo que sí se hizo. */
export async function runOps(ops: DayOp[], ex: DayOpExecutors): Promise<{ done: DoneOp[]; failed: DayOp | null }> {
  const done: DoneOp[] = []
  for (const op of ops) {
    try {
      done.push(await runOne(op, ex))
    } catch {
      return { done, failed: op }
    }
  }
  return { done, failed: null }
}

async function undoOne({ op, createdId }: DoneOp, ex: DayOpExecutors): Promise<void> {
  switch (op.kind) {
    case 'createEvent':
      if (createdId) await ex.deleteEvent(createdId)
      return
    case 'createSession':
      if (createdId) await ex.deleteSession(createdId)
      return
    case 'createTask':
      if (createdId) await ex.deleteTask(createdId)
      return
    case 'moveEvent':
      await ex.moveEvent({ ...op, start: op.prevStart ?? op.start, end: op.prevEnd, prevStart: op.start, prevEnd: op.end })
      return
    case 'moveSession':
      await ex.moveSession({ ...op, start: op.prevStart, prevStart: op.start })
      return
    case 'moveHabit':
      await ex.moveHabit({ ...op, times: op.prevTimes ?? [], prevTimes: op.times })
  }
}

/** Revierte en orden inverso solo lo que se ejecutó. */
export async function undoOps(done: DoneOp[], ex: DayOpExecutors): Promise<void> {
  for (const d of [...done].reverse()) await undoOne(d, ex)
}

/**
 * Título de lo que no se pudo guardar, para decírselo a la persona. Las altas
 * traen su título; los movimientos lo buscan por ref (un hábito, por su primera
 * repetición). null si no se encuentra.
 */
export function failedOpTitle(op: DayOp, titles: Map<string, string>): string | null {
  if ('title' in op) return op.title
  if (op.kind === 'moveHabit') {
    for (const [ref, title] of titles) if (ref.startsWith(`${op.ref}:`)) return title
    return null
  }
  return titles.get(op.ref) ?? null
}
