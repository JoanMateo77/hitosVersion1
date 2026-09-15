import type { CalendarEvent } from '@/lib/types'
import { tapHaptic } from '@/lib/haptics'
import { IconCheck } from '@/components/icons'

/** Check circular para marcar un evento de la agenda como hecho. */
export function EventCheck({ event, onToggle }: { event: CalendarEvent; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`check check--sm${event.doneAt ? ' check--done' : ''}`}
      onClick={() => {
        // Solo al marcar: desmarcar no se celebra.
        if (!event.doneAt) tapHaptic()
        onToggle()
      }}
      aria-pressed={Boolean(event.doneAt)}
      aria-label={`${event.doneAt ? 'Desmarcar' : 'Marcar como hecho'} “${event.title}”`}
    >
      <IconCheck size={12} />
    </button>
  )
}
