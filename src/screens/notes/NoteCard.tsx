import type { Goal, Note } from '@/lib/types'
import { noteExcerpt, noteHeading, notePlace } from '@/domain/notes'
import { notePlaceLabel } from '@/screens/notes/noteUi'

/** Tarjeta: encabezado, extracto, lugar (meta/área) y 📌 si está fijada. */
export function NoteCard({
  note,
  goals,
  withPlace = true,
  onOpen,
}: Readonly<{
  note: Note
  goals: Goal[]
  /** false en el detalle de una meta: ahí el lugar ya se sabe. */
  withPlace?: boolean
  onOpen: () => void
}>) {
  const heading = noteHeading(note)
  const excerpt = noteExcerpt(note)
  const place = notePlace(note)
  const showPlace = withPlace && (place === 'goal' || place === 'area')
  return (
    <button type="button" className="card note-card" onClick={onOpen}>
      <span className="note-card__head">
        <strong className="note-card__title">{heading || 'Nota sin texto'}</strong>
        {note.pinned && (
          <span className="note-card__pin" role="img" aria-label="Fijada">
            📌
          </span>
        )}
      </span>
      {excerpt && <span className="note-card__excerpt small muted">{excerpt}</span>}
      {showPlace && note.archivedAt === null && (
        <span className="tag">{notePlaceLabel(note, goals)}</span>
      )}
    </button>
  )
}
