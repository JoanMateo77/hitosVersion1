import type { CalendarEvent } from '@/lib/types'
import { formatTime12, formatTimeShort } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconArrowReturn, IconCheck, IconChevronRight, IconPlay } from '@/components/icons'
import { EventCheck } from '@/screens/calendar/EventCheck'
import {
  CLOSED_STATES,
  isOpenToday,
  rowArea,
  sessionAriaLabel,
  sessionStateTitle,
  type AgendaRowItem,
  type DayAgendaSession,
  type DayHabitRowItem,
} from '@/screens/calendar/agendaItems'

export interface AgendaRowHandlers {
  onSession: (it: DayAgendaSession) => void
  onHabit: (it: DayHabitRowItem) => void
  onOpenEvent: (e: CalendarEvent) => void
  onToggleEvent: (e: CalendarEvent) => void
}

/** Columna de hora: inicio en negrita y, si hay, fin tenue debajo. "—" sin hora. */
export function TimeColumn({ start, end }: { start: string | null; end: string | null }) {
  return (
    <span className="ag-row__time">
      <span className={`ag-row__start${start ? '' : ' faint'}`}>{start ? formatTimeShort(start) : '—'}</span>
      {start && end && <span className="ag-row__end">{formatTimeShort(end)}</span>}
    </span>
  )
}

/**
 * Una fila de la cronología: hora · cuerpo (título + subtítulo opcional) ·
 * acción. Sesión = botón que abre su hoja (▶ si es de hoy y está abierta);
 * hábito = botón que marca la siguiente repetición; evento = cuerpo que abre
 * el editor + check al borde.
 */
export function AgendaRow({
  item,
  past = false,
  onSession,
  onHabit,
  onOpenEvent,
  onToggleEvent,
}: { item: AgendaRowItem; past?: boolean } & AgendaRowHandlers) {
  const accent = nicheAccent(rowArea(item))
  const pastCls = past ? ' ag-row--past' : ''

  if (item.kind === 'session') {
    const it = item.session
    const closed = CLOSED_STATES.includes(it.state)
    const play = isOpenToday(it)
    const parts: string[] = []
    if (it.state !== 'pending' && it.state !== 'projected') parts.push(sessionStateTitle(it.state))
    parts.push(it.targetLabel)
    if (item.planTotal > 0) parts.push(`plan ${item.planDone} de ${item.planTotal}`)
    return (
      <button
        type="button"
        className={`ag-row ag-row--session${closed ? ' ag-row--done' : ''}${pastCls}`}
        style={accent}
        onClick={() => onSession(it)}
        aria-label={sessionAriaLabel(it)}
      >
        <TimeColumn start={item.start} end={item.end} />
        <span className="ag-row__main">
          <span className="ag-row__title">{it.goal.title}</span>
          <span className="ag-row__sub">{parts.join(' · ')}</span>
        </span>
        <span className="ag-row__aside" aria-hidden="true">
          {play ? (
            <span className="ag-play">
              <IconPlay size={14} />
            </span>
          ) : (
            <span className="ag-chev">
              <IconChevronRight size={16} />
            </span>
          )}
        </span>
      </button>
    )
  }

  if (item.kind === 'habit') {
    const h = item.habit
    const multi = h.target > 1
    const sub = multi
      ? `${h.doneCount} de ${h.target}${h.time && !h.complete ? ` · siguiente ${formatTime12(h.time)}` : ''}`
      : null
    return (
      <button
        type="button"
        className={`ag-row${h.complete ? ' ag-row--done' : ''}${pastCls}`}
        style={accent}
        onClick={() => onHabit(h)}
        aria-pressed={h.complete}
        aria-label={
          h.complete
            ? `Desmarcar ${multi ? 'la última repetición de' : 'el hábito:'} ${h.habit.title}`
            : `Marcar ${multi ? `repetición ${h.doneCount + 1} de ${h.target} de` : 'el hábito:'} ${h.habit.title}`
        }
      >
        <TimeColumn start={item.start} end={null} />
        <span className="ag-row__main">
          <span className="ag-row__title">{h.habit.title}</span>
          {sub && <span className="ag-row__sub">{sub}</span>}
        </span>
        <span className="ag-row__aside" aria-hidden="true">
          <span className={`check check--sm${h.complete ? ' check--done' : ''}`}>
            <IconCheck size={12} />
          </span>
        </span>
      </button>
    )
  }

  const e = item.event
  const note = e.notes ? e.notes.trim().split('\n')[0] : null
  return (
    <div className={`ag-row${e.doneAt ? ' ag-row--done' : ''}${pastCls}`} style={accent}>
      <button type="button" className="ag-row__open" onClick={() => onOpenEvent(e)}>
        <TimeColumn start={item.start} end={item.end} />
        <span className="ag-row__main">
          <span className="ag-row__title">{e.title}</span>
          {(note || item.goal) && (
            <span className="ag-row__sub">
              {item.goal && (
                <>
                  <IconArrowReturn size={11} /> {item.goal.title}
                </>
              )}
              {item.goal && note ? ' · ' : ''}
              {note}
            </span>
          )}
        </span>
      </button>
      <span className="ag-row__aside">
        <EventCheck event={e} onToggle={() => onToggleEvent(e)} />
      </span>
    </div>
  )
}
