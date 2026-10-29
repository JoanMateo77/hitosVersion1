import type { CommitmentBlockDraft } from '@/domain/commitment'
import type { ScheduleBlock, Session, TargetKind } from '@/lib/types'

/**
 * Edición del compromiso por diferencias. Antes se borraban y recreaban todos
 * los bloques, lo que dejaba sesiones huérfanas (schedule_id → null): el
 * progreso dejaba de contarlas y las pendientes se duplicaban en la agenda.
 * Aquí se calcula qué bloques actualizar, insertar o quitar conservando los
 * ids, y qué sesiones pendientes sincronizar. Funciones puras, sin I/O.
 */

export interface ScheduleChange {
  update: { id: string; targetKind: TargetKind; targetValue: number; unit: string | null; startTime: string | null }[]
  insert: CommitmentBlockDraft[]
  remove: string[] // ids de bloques
}

export type EditScope = 'this' | 'all'

/** Orden de un "momento" dentro del día: por hora (sin hora al final) y luego por desempate. */
function compareMoments(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

function sameValues(block: ScheduleBlock, draft: CommitmentBlockDraft): boolean {
  return (
    block.targetKind === draft.targetKind &&
    block.targetValue === draft.targetValue &&
    block.unit === draft.unit &&
    block.startTime === draft.startTime
  )
}

function stripId(draft: CommitmentBlockDraft): CommitmentBlockDraft {
  return {
    weekday: draft.weekday,
    targetKind: draft.targetKind,
    targetValue: draft.targetValue,
    unit: draft.unit,
    startTime: draft.startTime,
  }
}

function toDraft(block: ScheduleBlock): CommitmentBlockDraft {
  return {
    id: block.id,
    weekday: block.weekday,
    targetKind: block.targetKind,
    targetValue: block.targetValue,
    unit: block.unit,
    startTime: block.startTime,
  }
}

/**
 * Empareja bloques actuales con los deseados. Primero por `id` (si existe en
 * `current` y es del mismo día); los drafts sin id (o con un id desconocido)
 * reutilizan los bloques libres del mismo día, emparejando ambos lados
 * ordenados por hora (sin hora al final) y luego por antigüedad / orden.
 * Mismo bloque → update (solo si cambió algo); draft sobrante → insert;
 * bloque sobrante → remove.
 */
export function diffSchedule(current: ScheduleBlock[], desired: CommitmentBlockDraft[]): ScheduleChange {
  const byId = new Map(current.map((b) => [b.id, b]))
  const matched = new Map<number, ScheduleBlock>() // índice en desired → bloque
  const used = new Set<string>()

  desired.forEach((draft, index) => {
    const block = draft.id ? byId.get(draft.id) : undefined
    if (block && !used.has(block.id) && block.weekday === draft.weekday) {
      matched.set(index, block)
      used.add(block.id)
    }
  })

  const weekdays = new Set(desired.map((d) => d.weekday))
  for (const weekday of weekdays) {
    const drafts = desired
      .map((draft, index) => ({ draft, index }))
      .filter((x) => x.draft.weekday === weekday && !matched.has(x.index))
      .sort((a, b) => compareMoments(a.draft.startTime, b.draft.startTime) || a.index - b.index)
    const blocks = current
      .filter((b) => b.weekday === weekday && !used.has(b.id))
      .sort(
        (a, b) =>
          compareMoments(a.startTime, b.startTime) || compareMoments(a.createdAt, b.createdAt),
      )
    drafts.forEach((x, i) => {
      const block = blocks[i]
      if (!block) return
      matched.set(x.index, block)
      used.add(block.id)
    })
  }

  const change: ScheduleChange = { update: [], insert: [], remove: [] }
  desired.forEach((draft, index) => {
    const block = matched.get(index)
    if (!block) {
      change.insert.push(stripId(draft))
    } else if (!sameValues(block, draft)) {
      change.update.push({
        id: block.id,
        targetKind: draft.targetKind,
        targetValue: draft.targetValue,
        unit: draft.unit,
        startTime: draft.startTime,
      })
    }
  })
  change.remove = current.filter((b) => !used.has(b.id)).map((b) => b.id)
  return change
}

/**
 * Aplica un cambio de valor/hora desde UN bloque. 'this': solo ese bloque.
 * 'all': el valor va a todos los bloques de la meta; la hora solo a los que
 * tenían la misma hora original que el tocado (el mismo "momento" en otros
 * días), para que los días con varios momentos no colapsen a una sola hora.
 * Devuelve los drafts deseados completos, con sus ids.
 */
export function editBlockValue(
  blocks: ScheduleBlock[],
  blockId: string,
  patch: { targetValue?: number; startTime?: string | null },
  scope: EditScope,
): CommitmentBlockDraft[] {
  const touched = blocks.find((b) => b.id === blockId)
  return blocks.map((block) => {
    const draft = toDraft(block)
    if (!touched) return draft
    const isTouched = block.id === blockId
    const applyValue = isTouched || scope === 'all'
    const applyTime = isTouched || (scope === 'all' && block.startTime === touched.startTime)
    if (applyValue && patch.targetValue !== undefined) draft.targetValue = patch.targetValue
    if (applyTime && patch.startTime !== undefined) draft.startTime = patch.startTime
    return draft
  })
}

/**
 * Cambia los días desde un bloque: los días quitados pierden todos sus
 * bloques; los que se quedan conservan todos (con ids); cada día nuevo recibe
 * UNA copia (sin id) del bloque tocado (tipo, valor, unidad y hora).
 */
export function editBlockDays(
  blocks: ScheduleBlock[],
  fromBlockId: string,
  weekdays: number[],
): CommitmentBlockDraft[] {
  const wanted = new Set(weekdays)
  const kept = blocks.filter((b) => wanted.has(b.weekday)).map(toDraft)
  const touched = blocks.find((b) => b.id === fromBlockId)
  const existingDays = new Set(blocks.map((b) => b.weekday))
  const added: CommitmentBlockDraft[] = touched
    ? [...wanted]
        .filter((weekday) => !existingDays.has(weekday))
        .map((weekday) => ({ ...stripId(toDraft(touched)), weekday }))
    : []
  return [...kept, ...added].sort((a, b) => a.weekday - b.weekday)
}

/** Sincronización de sesiones: qué borrar y qué actualizar (tipo, valor, unidad y hora). */
export interface SessionSync {
  deleteIds: string[]
  /** `plannedTime` solo viene si cambió la hora del bloque; si no, no se toca. */
  update: {
    id: string
    targetKind: TargetKind
    targetValue: number
    unit: string | null
    plannedTime?: string | null
  }[]
}

/**
 * Qué sesiones tocar al aplicar el cambio (solo fecha >= hoy):
 * - de bloques en `remove` con status pending|skipped → borrar;
 * - pending de bloques en `update` → actualizar tipo, valor y unidad (si
 *   cambió la medida, la sesión no puede quedar mezclada: "3 min"); la hora
 *   solo si cambió la del bloque (`current`), para no pisar la hora propia de
 *   un día fijada con Reorganizar.
 * Nunca toca running/done/partial/missed/unconfirmed ni fechas pasadas.
 */
export function sessionsToSync(
  change: ScheduleChange,
  current: ScheduleBlock[],
  sessions: Session[],
  todayISO: string,
): SessionSync {
  const removed = new Set(change.remove)
  const updated = new Map(change.update.map((u) => [u.id, u]))
  const previousTime = new Map(current.map((b) => [b.id, b.startTime]))
  const result: SessionSync = { deleteIds: [], update: [] }
  for (const s of sessions) {
    if (!s.scheduleId || s.date < todayISO) continue
    if (removed.has(s.scheduleId) && (s.status === 'pending' || s.status === 'skipped')) {
      result.deleteIds.push(s.id)
      continue
    }
    const u = updated.get(s.scheduleId)
    if (u && s.status === 'pending') {
      const timeChanged = previousTime.get(u.id) !== u.startTime
      result.update.push({
        id: s.id,
        targetKind: u.targetKind,
        targetValue: u.targetValue,
        unit: u.unit,
        ...(timeChanged ? { plannedTime: u.startTime } : {}),
      })
    }
  }
  return result
}
