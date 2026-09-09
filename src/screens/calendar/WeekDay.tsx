import { useState, type ReactNode } from 'react'
import { WEEKDAY_LABELS } from '@/domain/calendar'
import { weekdayMon0 } from '@/domain/commitment'
import { dayOfMonth, formatWeekday, isToday } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconChevronRight } from '@/components/icons'
import type { WeekDaySummary } from '@/screens/calendar/agendaItems'

/**
 * Un día del acordeón de la semana: cabecera con fecha, resumen en dos
 * líneas y chevron; el cuerpo (la cronología del día) solo cuando está
 * abierto. El estado es local; el padre lo resetea con `key` al cambiar de semana.
 */
export function WeekDay({
  day,
  summary,
  defaultOpen,
  children,
}: {
  day: string
  summary: WeekDaySummary
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const today = isToday(day)
  const bodyId = `wk-${day}`
  return (
    <section className={`wk-day${today ? ' wk-day--today' : ''}${open ? ' wk-day--open' : ''}`}>
      <button
        type="button"
        className="wk-day__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        aria-label={`${open ? 'Plegar' : 'Desplegar'} ${formatWeekday(day)}: ${summary.main}`}
      >
        <span className="wk-day__date">
          <span className="wk-day__dow">{WEEKDAY_LABELS[weekdayMon0(day)]}</span>
          <span className="wk-day__num">{dayOfMonth(day)}</span>
        </span>
        <span className="wk-day__sum">
          <span className={`wk-day__sum-main${summary.sub === null && summary.main === 'Nada agendado' ? ' faint' : ''}`}>
            {summary.main}
            {summary.dots.length > 0 && (
              <span className="wk-day__dots" aria-hidden="true">
                {summary.dots.map((area) => (
                  <span key={area} className="wk-day__dot" style={nicheAccent(area)} />
                ))}
              </span>
            )}
          </span>
          {summary.sub && <span className="wk-day__sum-sub">{summary.sub}</span>}
        </span>
        <span className="wk-day__chev" aria-hidden="true">
          <IconChevronRight size={18} />
        </span>
      </button>
      {open && (
        <div className="wk-day__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  )
}
