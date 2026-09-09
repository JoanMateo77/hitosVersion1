import { useState } from 'react'
import type { DayBlock } from '@/domain/agenda'
import { formatTime12 } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconChevronRight, IconPlus } from '@/components/icons'
import { AgendaRow, TimeColumn, type AgendaRowHandlers } from '@/screens/calendar/AgendaRow'
import { rowArea, rowTitle, type AgendaRowItem } from '@/screens/calendar/agendaItems'

/**
 * Bloque de tiempo con dos o más cosas a la vez. Cerrado: rango, títulos en
 * una línea y un punto de color por cosa. Abierto: una fila por cosa (cada
 * una con su hora) y "Agregar algo a las H:MM". El estado vive aquí; el padre
 * lo resetea con `key` cuando cambia el día.
 */
export function AgendaBlock({
  block,
  items,
  defaultOpen,
  past,
  onAdd,
  ...handlers
}: {
  block: DayBlock
  items: AgendaRowItem[]
  defaultOpen: boolean
  past: boolean
  onAdd?: () => void
} & AgendaRowHandlers) {
  const [open, setOpen] = useState(defaultOpen)
  const sessions = items.filter((i) => i.kind === 'session').length
  const first = items.find((i) => i.kind === 'session') ?? items[0]
  const titles = items.map(rowTitle).join(' · ')
  const meta = `${items.length} cosas${sessions > 0 ? ` · ${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}` : ''}`
  const bodyId = `blk-${block.key}`
  return (
    <div
      className={`blk${open ? ' blk--open' : ''}${sessions > 0 ? ' blk--session' : ''}${past ? ' ag-row--past' : ''}`}
      style={nicheAccent(rowArea(first))}
    >
      <button
        type="button"
        className="blk__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Plegar' : 'Desplegar'} el bloque de ${formatTime12(block.start)}: ${titles}`}
      >
        <TimeColumn start={block.start} end={block.end} />
        <span className="blk__sum">
          <span className="blk__titles">{titles}</span>
          <span className="blk__meta">
            {meta}
            <span className="blk__dots" aria-hidden="true">
              {items.map((it) => (
                <span key={it.key} className="blk__dot" style={nicheAccent(rowArea(it))} />
              ))}
            </span>
          </span>
        </span>
        <span className="blk__chev" aria-hidden="true">
          <IconChevronRight size={18} />
        </span>
      </button>
      {open && (
        <div className="blk__body" id={bodyId}>
          {items.map((it) => (
            <AgendaRow key={it.key} item={it} past={past} {...handlers} />
          ))}
          {onAdd && (
            <button type="button" className="blk__add" onClick={onAdd}>
              <IconPlus size={14} /> Agregar algo a las {formatTime12(block.start)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
