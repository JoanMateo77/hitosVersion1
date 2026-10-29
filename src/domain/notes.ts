import type { Note, NoteItem, NotePlace } from '@/lib/types'

export type NoteView = 'inbox' | 'goals' | 'areas' | 'ideas' | 'archived'

/** Lugar efectivo: place 'goal' con goalId null (meta borrada) → 'inbox'. */
export function notePlace(n: Note): NotePlace {
  return n.place === 'goal' && n.goalId === null ? 'inbox' : n.place
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function matches(n: Note, q: string): boolean {
  if (q === '') return true
  const haystack = [n.title ?? '', n.body, ...(n.items ?? []).map((i) => i.text)].join('\n')
  return fold(haystack).includes(q)
}

/** Fijadas primero; luego la más recientemente editada. */
function byPinnedThenRecent(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return b.updatedAt.localeCompare(a.updatedAt)
}

const PLACE_OF_VIEW: Record<Exclude<NoteView, 'archived'>, NotePlace> = {
  inbox: 'inbox',
  goals: 'goal',
  areas: 'area',
  ideas: 'ideas',
}

/** Filtra por vista (archivadas solo en 'archived'), por texto y ordena. */
export function visibleNotes(notes: Note[], view: NoteView, query: string): Note[] {
  const q = fold(query.trim())
  return notes
    .filter((n) =>
      view === 'archived'
        ? n.archivedAt !== null
        : n.archivedAt === null && notePlace(n) === PLACE_OF_VIEW[view],
    )
    .filter((n) => matches(n, q))
    .sort(byPinnedThenRecent)
}

/** Notas no archivadas de una meta, con el mismo orden. */
export function notesForGoal(notes: Note[], goalId: string): Note[] {
  return notes
    .filter((n) => n.archivedAt === null && n.goalId === goalId && n.place === 'goal')
    .sort(byPinnedThenRecent)
}

/** Lo que define si una nota tiene contenido (título, cuerpo, lista). */
export type NoteContent = Pick<Note, 'title' | 'body' | 'items'>

function textLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function itemTexts(items: NoteItem[] | null): string[] {
  return (items ?? []).map((i) => i.text.trim()).filter((t) => t !== '')
}

/** Encabezado visible: el título, o la primera línea (o elemento) con texto. */
export function noteHeading(n: NoteContent): string {
  const title = n.title?.trim() ?? ''
  if (title !== '') return title
  return (n.items ? itemTexts(n.items) : textLines(n.body))[0] ?? ''
}

/** Extracto de una línea: el contenido que no quedó ya en el encabezado. */
export function noteExcerpt(n: NoteContent): string {
  const hasTitle = (n.title?.trim() ?? '') !== ''
  const parts = n.items ? itemTexts(n.items) : textLines(n.body)
  const rest = hasTitle ? parts : parts.slice(1)
  return rest.join(n.items ? ' · ' : ' ')
}

/** Texto → lista: cada línea con texto es un elemento sin marcar. */
export function linesToItems(body: string): NoteItem[] {
  return textLines(body).map((text) => ({ text, done: false }))
}

/** Lista → texto: una línea por elemento con texto. */
export function itemsToLines(items: NoteItem[]): string {
  return itemTexts(items).join('\n')
}

/** ¿No hay nada escrito? (una nota así no se guarda al cerrar). */
export function isBlankNote(n: NoteContent): boolean {
  return noteHeading(n) === '' && noteExcerpt(n) === ''
}

/**
 * El "por qué" de una meta nacida de la nota: el contenido sin repetir lo que
 * ya pasó a ser el título (sin título propio, la primera línea o elemento).
 */
export function noteWhy(n: NoteContent): string {
  const hasTitle = (n.title?.trim() ?? '') !== ''
  if (n.items) {
    const texts = itemTexts(n.items)
    return (hasTitle ? texts : texts.slice(1)).join('\n')
  }
  if (hasTitle) return n.body
  const lines = n.body.split('\n')
  const first = lines.findIndex((line) => line.trim() !== '')
  if (first === -1) return ''
  return lines
    .slice(first + 1)
    .join('\n')
    .trim()
}
