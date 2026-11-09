import { useState, type ReactNode } from 'react'
import {
  IconArchive,
  IconChecklist,
  IconDots,
  IconFolderMove,
  IconPin,
  IconSparkle,
  IconTrash,
} from '@/components/icons'

function Tool({
  icon,
  label,
  pressed,
  expanded,
  disabled,
  onClick,
}: Readonly<{
  icon: ReactNode
  label: string
  pressed?: boolean
  expanded?: boolean
  disabled?: boolean
  onClick: () => void
}>) {
  return (
    <button
      type="button"
      className="note-tool"
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="note-tool__label">{label}</span>
    </button>
  )
}

/**
 * Acciones de la hoja de una nota: las de todos los días en una fila de íconos
 * con su nombre (Fijar, Lista, Mover, Archivar) y el resto en "Más", para que
 * no compitan con lo escrito.
 */
export function NoteActions({
  pinned,
  archived,
  isList,
  hasChecked,
  busy,
  onPin,
  onToggleList,
  onMove,
  onArchive,
  onConvert,
  onUncheckAll,
  onRemoveChecked,
  onDelete,
}: Readonly<{
  pinned: boolean
  archived: boolean
  isList: boolean
  hasChecked: boolean
  busy: boolean
  onPin: () => void
  onToggleList: () => void
  onMove: () => void
  onArchive: () => void
  onConvert: () => void
  onUncheckAll: () => void
  onRemoveChecked: () => void
  onDelete: () => void
}>) {
  const [more, setMore] = useState(false)
  const pick = (fn: () => void) => () => {
    setMore(false)
    fn()
  }

  return (
    <div className="note-tools-wrap">
      <div className="note-tools" role="group" aria-label="Acciones de la nota">
        <Tool icon={<IconPin size={20} />} label={pinned ? 'Fijada' : 'Fijar'} pressed={pinned} disabled={busy} onClick={onPin} />
        <Tool icon={<IconChecklist size={20} />} label="Lista" pressed={isList} onClick={onToggleList} />
        {!archived && <Tool icon={<IconFolderMove size={20} />} label="Mover" disabled={busy} onClick={onMove} />}
        <Tool
          icon={<IconArchive size={20} />}
          label={archived ? 'Recuperar' : 'Archivar'}
          disabled={busy}
          onClick={onArchive}
        />
        <Tool icon={<IconDots size={20} />} label="Más" expanded={more} onClick={() => setMore((v) => !v)} />
      </div>
      {more && (
        <div className="note-more">
          {!archived && (
            <button type="button" className="note-more__item" disabled={busy} onClick={pick(onConvert)}>
              <IconSparkle size={18} /> Convertir en meta, etapa o tarea
            </button>
          )}
          {isList && hasChecked && (
            <>
              <button type="button" className="note-more__item" onClick={pick(onUncheckAll)}>
                <IconChecklist size={18} /> Desmarcar todo
              </button>
              <button type="button" className="note-more__item" onClick={pick(onRemoveChecked)}>
                <IconTrash size={18} /> Borrar marcados
              </button>
            </>
          )}
          <button
            type="button"
            className="note-more__item note-more__item--danger"
            disabled={busy}
            onClick={pick(onDelete)}
          >
            <IconTrash size={18} /> Eliminar nota
          </button>
        </div>
      )}
    </div>
  )
}
