import type { Note, NotePlace } from '@/lib/types'

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
