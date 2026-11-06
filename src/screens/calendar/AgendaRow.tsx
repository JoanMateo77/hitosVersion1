import type { CalendarEvent } from '@/lib/types'
import { formatTime12, formatTimeShort, meridiem } from '@/lib/date'
import { tapHaptic } from '@/lib/haptics'
import { IconArrowReturn, IconCheck, IconChevronRight, IconPlay } from '@/components/icons'
import { EventCheck } from '@/screens/calendar/EventCheck'
import { rowAccent } from '@/screens/calendar/rowAccent'
import {
  CLOSED_STATES,
  isOpenToday,
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

/** "8:30" + sufijo "pm" en pequeño: la hora manda, el am/pm desambigua. */
function ClockTime({ hhmm }: Readonly<{ hhmm: string }>) {
  return (
    <>
      {formatTimeShort(hhmm)}
      <span className="ag-row__ampm">{meridiem(hhmm)}</span>
    </>
  )
}

/** Columna de hora: inicio en negrita y, si hay, fin tenue debajo. "—" sin hora. */
export function TimeColumn({ start, end }: Readonly<{ start: string | null; end: string | null }>) {
  return (
    <span className="ag-row__time">
      <span className={`ag-row__start${start ? '' : ' faint'}`}>{start ? <ClockTime hhmm={start} /> : '—'}</span>
      {start && end && (
        <span className="ag-row__end">
          <ClockTime hhmm={end} />
        </span>
      )}
    </span>
  )
}

type SessionRowItem = Extract<AgendaRowItem, { kind: 'session' }>
type HabitRowItem = Extract<AgendaRowItem, { kind: 'habit' }>
type EventRowItem = Extract<AgendaRowItem, { kind: 'event' }>

/** Subtítulo de una sesión: estado (si ya no está pendiente), objetivo y avance del plan. */
function sessionSubtitle(item: SessionRowItem): string {
  const it = item.session
  const parts: string[] = []
  if (it.state !== 'pending' && it.state !== 'projected') parts.push(sessionStateTitle(it.state))
  parts.push(it.targetLabel)
  if (item.planTotal > 0) parts.push(`plan ${item.planDone} de ${item.planTotal}`)
  return parts.join(' · ')
}

function SessionRow({
  item,
  pastCls,
  onSession,
}: Readonly<{ item: SessionRowItem; pastCls: string; onSession: AgendaRowHandlers['onSession'] }>) {
  const it = item.session
  const closed = CLOSED_STATES.includes(it.state)
  return (
    <button
      type="button"
      className={`ag-row ag-row--session${closed ? ' ag-row--done' : ''}${pastCls}`}
      style={rowAccent(item)}
      onClick={() => onSession(it)}
      aria-label={sessionAriaLabel(it)}
    >
      <TimeColumn start={item.start} end={item.end} />
      <span className="ag-row__main">
        <span className="ag-row__title">{it.goal.title}</span>
        <span className="ag-row__sub">{sessionSubtitle(item)}</span>
      </span>
      <span className="ag-row__aside" aria-hidden="true">
        {isOpenToday(it) ? (
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

/** Subtítulo de un hábito de varias veces al día: "2 de 3 · siguiente 4:00 pm". */
function habitSubtitle(h: DayHabitRowItem): string | null {
  if (h.target <= 1) return null
  const next = h.time && !h.complete ? ` · siguiente ${formatTime12(h.time)}` : ''
  return `${h.doneCount} de ${h.target}${next}`
}

function habitAriaLabel(h: DayHabitRowItem): string {
  const multi = h.target > 1
  if (h.complete) return `Desmarcar ${multi ? 'la última repetición de' : 'el hábito:'} ${h.habit.title}`
  const what = multi ? `repetición ${h.doneCount + 1} de ${h.target} de` : 'el hábito:'
  return `Marcar ${what} ${h.habit.title}`
}

function HabitRow({
  item,
  pastCls,
  onHabit,
}: Readonly<{ item: HabitRowItem; pastCls: string; onHabit: AgendaRowHandlers['onHabit'] }>) {
  const h = item.habit
  const sub = habitSubtitle(h)
  return (
    <button
      type="button"
      className={`ag-row${h.complete ? ' ag-row--done' : ''}${pastCls}`}
      style={rowAccent(item)}
      onClick={() => {
        // Solo al marcar: desmarcar la última repetición no se celebra.
        if (!h.complete) tapHaptic()
        onHabit(h)
      }}
      aria-pressed={h.complete}
      aria-label={habitAriaLabel(h)}
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

function EventRow({
  item,
  pastCls,
  onOpenEvent,
  onToggleEvent,
}: Readonly<{ item: EventRowItem; pastCls: string } & Pick<AgendaRowHandlers, 'onOpenEvent' | 'onToggleEvent'>>) {
  const e = item.event
  const note = e.notes ? e.notes.trim().split('\n')[0] : null
  return (
    <div className={`ag-row${e.doneAt ? ' ag-row--done' : ''}${pastCls}`} style={rowAccent(item)}>
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
}: Readonly<{ item: AgendaRowItem; past?: boolean } & AgendaRowHandlers>) {
  const pastCls = past ? ' ag-row--past' : ''
  if (item.kind === 'session') return <SessionRow item={item} pastCls={pastCls} onSession={onSession} />
  if (item.kind === 'habit') return <HabitRow item={item} pastCls={pastCls} onHabit={onHabit} />
  return <EventRow item={item} pastCls={pastCls} onOpenEvent={onOpenEvent} onToggleEvent={onToggleEvent} />
}
