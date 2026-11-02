import type { Goal, NicheId, Note } from '@/lib/types'
import { notePlace } from '@/domain/notes'
import { getNiche } from '@/domain/niches'
import { friendlyError } from '@/lib/errors'
import { goalTone } from '@/lib/goalAccent'

/**
 * Mensaje de un fallo de Notas. El servicio ya escribe para el usuario el caso
 * "falta la migración 0017": ese texto se muestra tal cual; el resto pasa por
 * friendlyError para no filtrar mensajes crudos de la base.
 */
export function noteErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.includes('migración')) return err.message
  return friendlyError(err, fallback)
}

/** Dónde vive la nota, en palabras ("Bandeja", el título de la meta, el área…). */
export function notePlaceLabel(note: Note, goals: Goal[]): string {
  const place = notePlace(note)
  if (place === 'goal') return goals.find((g) => g.id === note.goalId)?.title ?? 'Meta'
  if (place === 'area') return note.area ? getNiche(note.area).label : 'Área'
  return place === 'ideas' ? 'Ideas' : 'Bandeja'
}

/**
 * Área que tiñe la nota (full color): la de su meta o la suya propia. null en
 * Bandeja e Ideas, que no hablan de ninguna meta y quedan neutras.
 */
export function noteArea(note: Note, goals: Goal[]): NicheId | null {
  const place = notePlace(note)
  if (place === 'goal') return goals.find((g) => g.id === note.goalId)?.area ?? null
  if (place === 'area') return note.area
  return null
}

/** Color de la nota: el de su meta (propio o del área), el de su área o ninguno. */
export function noteTone(note: Note, goals: Goal[]): NicheId | null {
  if (notePlace(note) !== 'goal') return noteArea(note, goals)
  const goal = goals.find((g) => g.id === note.goalId)
  return goal ? goalTone(goal) : null
}
