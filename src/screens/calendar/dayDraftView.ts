/**
 * Cómo se lee el borrador de "Organizar el día": lo que se agrega y lo que se
 * mueve, arriba; el resto del día, aparte y compacto. También el texto del
 * botón y del aviso al aplicar. Spec:
 * docs/superpowers/specs/2026-11-08-organizar-dia-claridad-y-auto-design.md §3–4
 * y 2026-11-09-organizar-dia-razonar-y-limite-design.md §3
 */
import { isAddOnly, type DayItem, type DayOp, type DayPlan, type PlacedItem } from '@/domain/dayPlan'
import { formatTime12 } from '@/lib/date'

export interface DraftRow {
  item: DayItem
  placed: PlacedItem
  start: string
  end: string
  /** Hora de antes de un ítem movido. */
  from?: string
}

/** Una línea del resto del día: un hábito de varias veces junta todas sus horas. */
export interface RestRow {
  key: string
  title: string
  starts: string[]
}

export interface DraftSections {
  added: DraftRow[]
  addedUntimed: DayItem[]
  moved: DraftRow[]
  /** Nuevos que no cupieron. */
  unplaced: DayItem[]
  rest: RestRow[]
}

/** "habit:<id>:<slot>" → "habit:<id>"; el resto, su ref. */
const restKey = (i: DayItem) => (i.source === 'habit' ? i.ref.split(':').slice(0, 2).join(':') : i.ref)

export function draftSections(plan: DayPlan, items: DayItem[]): DraftSections {
  const byRef = new Map(items.map((i) => [i.ref, i]))
  const rows = [...plan.placed]
    .sort((a, b) => a.start.localeCompare(b.start))
    .flatMap((p): DraftRow[] => {
      const item = byRef.get(p.ref)
      return item ? [{ item, placed: p, start: p.start, end: p.end, ...(p.from ? { from: p.from } : {}) }] : []
    })
  const rest = new Map<string, RestRow>()
  for (const r of rows.filter((r) => r.placed.status === 'same')) {
    const key = restKey(r.item)
    const row = rest.get(key)
    if (row) row.starts.push(r.start)
    else rest.set(key, { key, title: r.item.title, starts: [r.start] })
  }
  const unplacedRefs = new Set(plan.conflicts.flatMap((c) => (c.kind === 'no_room' ? [c.ref] : [])))
  return {
    added: rows.filter((r) => r.placed.status === 'new'),
    addedUntimed: plan.untimed.flatMap((ref) => {
      const i = byRef.get(ref)
      return i?.source === 'new' ? [i] : []
    }),
    moved: rows.filter((r) => r.placed.status === 'moved'),
    unplaced: items.filter((i) => unplacedRefs.has(i.ref)),
    rest: [...rest.values()],
  }
}

const things = (n: number) => `${n} ${n === 1 ? 'cosa' : 'cosas'}`
const changes = (n: number) => `${n} ${n === 1 ? 'cambio' : 'cambios'}`

/** Texto del botón: qué pasa al tocarlo. */
export function applyLabel(ops: DayOp[]): string {
  return isAddOnly(ops) ? `Agregar ${things(ops.length)} a mi agenda` : `Guardar ${changes(ops.length)}`
}

/** Aviso después de aplicar: lo que ya quedó en la agenda. */
export function appliedLabel(ops: DayOp[]): string {
  return isAddOnly(ops) ? `Agregué ${things(ops.length)} a tu día.` : `Guardé ${changes(ops.length)} en tu día.`
}

/** "A, B y C". */
function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}

/**
 * Notas de una tarjeta del borrador: con qué va a la vez (todo el grupo en una
 * línea), si es exclusiva y si quedó fuera de su momento del día.
 */
export function cardNotes(item: DayItem, placed: PlacedItem, byRef: Map<string, DayItem>): string[] {
  const together = placed.overlapsWith.flatMap((ref) => byRef.get(ref)?.title ?? [])
  return [
    ...(together.length > 0 ? [`A la vez con ${joinNames(together)}`] : []),
    ...(item.solo ? ['Solo para ti'] : []),
    ...(placed.outsideWindow ? ['Fuera de su momento'] : []),
  ]
}

/** Hora límite que puso la persona, para mostrarla sobre el borrador. */
export function limitLabel(plan: DayPlan): string | null {
  return plan.limitEnd ? `Hasta las ${formatTime12(plan.limitEnd)}` : null
}
