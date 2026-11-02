import type { Goal, Note } from '@/lib/types'
import { noteExcerpt, noteHeading, notePlace } from '@/domain/notes'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconPin } from '@/components/icons'
import { NicheIcon } from '@/components/NicheGlyph'
import { noteArea, noteTone, notePlaceLabel } from '@/screens/notes/noteUi'

/**
 * Tarjeta: encabezado, extracto, lugar (meta/área) y chincheta si está fijada.
 * Full color: si la nota vive en una meta o un área, lleva el color de esa
 * área en el canto y en la etiqueta del lugar (de qué meta se habla). Bandeja
 * e Ideas quedan neutras.
 */
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
  const area = noteArea(note, goals)
  // Color: el propio de la meta si lo eligió; el ícono sigue siendo el del área.
  const tone = noteTone(note, goals)
  const showPlace = withPlace && (place === 'goal' || place === 'area')
  return (
    <button
      type="button"
      className={`card note-card${area ? ' note-card--area' : ''}`}
      style={tone ? nicheAccent(tone) : undefined}
      onClick={onOpen}
    >
      <span className="note-card__head">
        <strong className="note-card__title">{heading || 'Nota sin texto'}</strong>
        {note.pinned && (
          <span className="note-card__pin" role="img" aria-label="Fijada">
            <IconPin size={15} />
          </span>
        )}
      </span>
      {excerpt && <span className="note-card__excerpt small muted">{excerpt}</span>}
      {showPlace && note.archivedAt === null && (
        <span className={area ? 'note-card__place' : 'tag'}>
          {area && <NicheIcon area={area} size={13} />}
          {notePlaceLabel(note, goals)}
        </span>
      )}
    </button>
  )
}
