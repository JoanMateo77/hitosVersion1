import type { NoteItem } from '@/lib/types'

/** Clave del borrador de una nota que no se pudo guardar al cerrar la hoja. */
export const NOTE_DRAFT_KEY = 'logralo.note-draft-v1'

/** Lo escrito en una nota cuyo guardado falló (noteId null = nota nueva). */
export interface NoteDraft {
  noteId: string | null
  goalId: string | null
  title: string
  body: string
  items: NoteItem[] | null
}

export function serializeNoteDraft(draft: NoteDraft): string {
  return JSON.stringify(draft)
}

function isItem(value: unknown): value is NoteItem {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.text === 'string' && typeof v.done === 'boolean'
}

const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

/** Lee un borrador validando campo por campo; cualquier cosa rara → null. */
export function parseNoteDraft(raw: string | null): NoteDraft | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return null
    const d = parsed as Record<string, unknown>
    if (!isNullableString(d.noteId) || !isNullableString(d.goalId)) return null
    if (typeof d.title !== 'string' || typeof d.body !== 'string') return null
    if (d.items !== null && !Array.isArray(d.items)) return null
    return {
      noteId: d.noteId,
      goalId: d.goalId,
      title: d.title,
      body: d.body,
      items: Array.isArray(d.items) ? d.items.filter(isItem) : null,
    }
  } catch {
    return null
  }
}

/**
 * ¿El borrador es de la hoja que se está abriendo? Una nota existente, por su
 * id; una nueva, solo desde la misma pantalla (la misma meta, o la bandeja con
 * goalId null): así no aparece en otra meta ni se lleva una meta ajena.
 */
export function draftMatches(
  draft: NoteDraft,
  noteId: string | null,
  newGoalId: string | null,
): boolean {
  if (draft.noteId !== null) return draft.noteId === noteId
  return noteId === null && draft.goalId === newGoalId
}

/* Sin sessionStorage (modo privado estricto) no hay rescate: el toast ya avisó. */
export function saveNoteDraft(draft: NoteDraft): void {
  try {
    sessionStorage.setItem(NOTE_DRAFT_KEY, serializeNoteDraft(draft))
  } catch {
    /* ignore */
  }
}

export function loadNoteDraft(): NoteDraft | null {
  try {
    return parseNoteDraft(sessionStorage.getItem(NOTE_DRAFT_KEY))
  } catch {
    return null
  }
}

export function clearNoteDraft(): void {
  try {
    sessionStorage.removeItem(NOTE_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
