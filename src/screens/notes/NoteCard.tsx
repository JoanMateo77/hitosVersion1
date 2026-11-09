import type { Goal, Note } from '@/lib/types'
import { noteExcerpt, noteHeading, notePlace } from '@/domain/notes'
import { previewItems } from '@/domain/noteItems'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconCheck, IconPin } from '@/components/icons'
import { NicheIcon } from '@/components/NicheGlyph'
import { noteArea, noteTone, notePlaceLabel } from '@/screens/notes/noteUi'

/** Elementos de una lista que se ven en la tarjeta. */
const PREVIEW_ITEMS = 4

/**
 * Tarjeta: encabezado, extracto (o la lista con sus casillas), lugar
 * (meta/área) y chincheta si está fijada. Toda la tarjeta abre la nota; las
 * casillas marcan sin abrirla. Full color: si la nota vive en una meta o un
 * área, lleva el color de esa área en el canto y en la etiqueta del lugar.
 * Bandeja e Ideas quedan neutras.
 */
export function NoteCard({
  note,
  goals,
  withPlace = true,
  fresh = false,
  onOpen,
  onToggleItem,
}: Readonly<{
  note: Note
  goals: Goal[]
  /** false en el detalle de una meta: ahí el lugar ya se sabe. */
  withPlace?: boolean
  /** Recién creada: entra con una animación corta. */
  fresh?: boolean
  onOpen: () => void
  /** Marcar o desmarcar el elemento `index` (índice guardado) sin abrir la nota. */
  onToggleItem?: (index: number) => void
}>) {
  const heading = noteHeading(note)
  const place = notePlace(note)
  const area = noteArea(note, goals)
  // Color: el propio de la meta si lo eligió; el ícono sigue siendo el del área.
  const tone = noteTone(note, goals)
  const showPlace = withPlace && (place === 'goal' || place === 'area')
  const preview = note.items ? previewItems(note.items, PREVIEW_ITEMS) : null
  const excerpt = preview ? '' : noteExcerpt(note)
  // Una lista sin título no repite su primer elemento como título: se ven los
  // elementos con su casilla y el botón que abre la nota se nombra igual.
  const titled = !preview || (note.title?.trim() ?? '') !== ''
  const name = heading || 'Nota sin texto'

  return (
    <article
      className={`card note-card${area ? ' note-card--area' : ''}${fresh ? ' note-card--fresh' : ''}`}
      style={tone ? nicheAccent(tone) : undefined}
    >
      <span className="note-card__head">
        <button
          type="button"
          className="note-card__open"
          aria-label={titled ? undefined : name}
          onClick={onOpen}
        >
          {titled && <strong className="note-card__title">{name}</strong>}
        </button>
        {preview && preview.total > 0 && (
          <span className="note-card__count" aria-label={`${preview.done} de ${preview.total} hechos`}>
            {preview.done}/{preview.total}
          </span>
        )}
        {note.pinned && (
          <span className="note-card__pin" role="img" aria-label="Fijada">
            <IconPin size={15} />
          </span>
        )}
      </span>
      {excerpt && <span className="note-card__excerpt small muted">{excerpt}</span>}
      {preview && preview.shown.length > 0 && (
        <ul className="note-card__items">
          {preview.shown.map((it) => (
            <li key={it.index} className={`note-card__item${it.indented ? ' is-indented' : ''}`}>
              <button
                type="button"
                className={`note-card__check${it.done ? ' is-done' : ''}`}
                aria-pressed={it.done}
                aria-label={it.done ? `Desmarcar: ${it.text}` : `Marcar: ${it.text}`}
                disabled={!onToggleItem}
                onClick={() => onToggleItem?.(it.index)}
              >
                <span className="note-card__box" aria-hidden="true">
                  <IconCheck size={12} />
                </span>
              </button>
              <span className={`note-card__text small${it.done ? ' is-done' : ''}`}>{it.text}</span>
            </li>
          ))}
        </ul>
      )}
      {preview && (preview.hidden > 0 || preview.hiddenDone > 0) && (
        <span className="note-card__more small muted">
          {[
            preview.hidden > 0 ? `+${preview.hidden} más` : '',
            preview.hiddenDone > 0 ? `${preview.hiddenDone} ${preview.hiddenDone === 1 ? 'marcado' : 'marcados'}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {showPlace && note.archivedAt === null && (
        <span className={area ? 'note-card__place' : 'tag'}>
          {area && <NicheIcon area={area} size={13} />}
          {notePlaceLabel(note, goals)}
        </span>
      )}
    </article>
  )
}
