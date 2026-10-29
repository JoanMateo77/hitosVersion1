import type { Goal, Note } from '@/lib/types'
import { notePlace } from '@/domain/notes'
import { getNiche } from '@/domain/niches'
import { friendlyError } from '@/lib/errors'

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
