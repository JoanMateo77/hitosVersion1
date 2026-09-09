import { Fragment } from 'react'
import type { CalendarEvent, Goal } from '@/lib/types'
import {
  PERIOD_LABELS,
  PERIOD_ORDER,
  assignEventsToSessions,
  defaultOpenBlock,
  eventSpan,
  freeGaps,
  gapLabel,
  groupIntoBlocks,
  nowLineIndex,
  periodOfMinutes,
  type DayBlock,
  type DayPeriod,
} from '@/domain/agenda'
import { minutesToTime } from '@/domain/commitment'
import { formatTimeShort, todayISO } from '@/lib/date'
import { IconFlag } from '@/components/icons'
import { EventCheck } from '@/screens/calendar/EventCheck'
import { AgendaRow, type AgendaRowHandlers } from '@/screens/calendar/AgendaRow'
import { AgendaBlock } from '@/screens/calendar/AgendaBlock'
import type { AgendaRowItem, DayAgendaSession, DayHabitRowItem } from '@/screens/calendar/agendaItems'

export interface DayAgendaProps extends AgendaRowHandlers {
  day: string
  sessions: DayAgendaSession[]
  habits: DayHabitRowItem[]
  events: CalendarEvent[]
  deadlines: Goal[]
  goalById: Map<string, Goal>
  onGoal: (g: Goal) => void
  /** Planear en un hueco o en un bloque (solo hoy/futuro): inicio y fin en minutos. */
  onPlanAt?: (startMin: number, endMin: number) => void
  /** Reloj vivo, solo cuando `day` es hoy: pinta la línea "Ahora" y atenúa lo pasado. */
  now?: Date
}

/**
 * Hueco tocable antes de un bloque, o null si no hay uno que ofrecer. Hoy
 * (`nowMin` no nulo) el hueco se recorta a lo que falta desde ahora: nada de
 * huecos que ya pasaron, y el tramo restante debe seguir siendo >= 60 min. En
 * días futuros (`nowMin === null`) se usa el hueco completo, sin recorte.
 */
function planableGap(
  raw: number | undefined,
  prevEndMin: number,
  blockStartMin: number,
  nowMin: number | null,
): { start: number; minutes: number } | null {
  if (raw === undefined) return null
  if (nowMin === null) return { start: prevEndMin, minutes: raw }
  if (blockStartMin <= nowMin) return null
  const start = Math.max(prevEndMin, nowMin)
  const minutes = blockStartMin - start
  return minutes >= 60 ? { start, minutes } : null
}

/**
 * Cronología de un día: chips de "Todo el día", franjas Mañana/Tarde/Noche
 * con filas y bloques en orden de hora, huecos libres tocables, línea "Ahora"
 * (solo hoy) y "Sin hora" al final. La usan la vista Día, el panel del Mes y
 * cada día del acordeón de la Semana.
 */
export function DayAgenda({
  day,
  sessions,
  habits,
  events,
  deadlines,
  goalById,
  onGoal,
  onPlanAt,
  now,
  ...handlers
}: DayAgendaProps) {
  // Los eventos de una meta con sesión ese día viven en su hoja de bloque:
  // aquí solo cuentan en "plan X de Y". El resto son filas.
  const { nested, standalone } = assignEventsToSessions(
    sessions.map((s) => ({ key: s.key, goalId: s.goal.id, start: s.span.start, end: s.span.end })),
    events,
  )
  const allDayEvents = standalone.filter((e) => e.allDay)

  const rows: AgendaRowItem[] = [
    ...sessions.map((s) => {
      const plan = nested.get(s.key) ?? []
      return {
        kind: 'session' as const,
        key: s.key,
        start: s.span.start,
        end: s.span.end,
        session: s,
        planDone: plan.filter((e) => e.doneAt).length,
        planTotal: plan.length,
      }
    }),
    ...habits.map((h) => ({ kind: 'habit' as const, key: h.key, start: h.time, end: null, habit: h })),
    ...standalone
      .filter((e) => !e.allDay)
      .map((e) => {
        const span = eventSpan(e)
        return {
          kind: 'event' as const,
          key: e.id,
          start: span.start,
          end: span.end,
          event: e,
          goal: e.goalId ? (goalById.get(e.goalId) ?? null) : null,
        }
      }),
  ]
  const rowByKey = new Map(rows.map((r) => [r.key, r] as const))
  const timed = rows.filter((r) => r.start !== null)
  const untimed = rows.filter((r) => r.start === null)

  const blocks = groupIntoBlocks(timed.map((r) => ({ key: r.key, start: r.start as string, end: r.end })))
  const planable = Boolean(onPlanAt) && day >= todayISO()
  const gaps = planable
    ? freeGaps(blocks.map((b) => ({ start: minutesToTime(b.startMin), end: minutesToTime(b.endMin) })), 60)
    : new Map<number, number>()

  const isToday = day === todayISO()
  const nowMin = isToday && now ? now.getHours() * 60 + now.getMinutes() : null
  const openKey = nowMin !== null ? defaultOpenBlock(blocks, nowMin) : null
  const nowPeriod: DayPeriod | null = nowMin !== null ? periodOfMinutes(nowMin) : null

  const empty = rows.length === 0 && allDayEvents.length === 0 && deadlines.length === 0

  const renderBlock = (block: DayBlock, index: number) => {
    const past = nowMin !== null && block.endMin <= nowMin
    const items = block.items.map((it) => rowByKey.get(it.key) as AgendaRowItem)
    const gapInfo = planableGap(
      gaps.get(index),
      index > 0 ? blocks[index - 1].endMin : 0,
      block.startMin,
      nowMin,
    )
    const gapButton = gapInfo ? (
      <button
        key={`gap-${block.key}`}
        type="button"
        className="ag-gap"
        onClick={() => onPlanAt?.(gapInfo.start, block.startMin)}
        aria-label={`Planear algo entre ${formatTimeShort(minutesToTime(gapInfo.start))} y ${formatTimeShort(block.start)}`}
      >
        {gapLabel(gapInfo.minutes)}
      </button>
    ) : null
    const body =
      items.length === 1 ? (
        <AgendaRow key={block.key} item={items[0]} past={past} {...handlers} />
      ) : (
        <AgendaBlock
          key={`${day}-${block.key}`}
          day={day}
          block={block}
          items={items}
          defaultOpen={block.key === openKey}
          past={past}
          onAdd={planable ? () => onPlanAt?.(block.startMin, Math.max(block.endMin, block.startMin + 60)) : undefined}
          {...handlers}
        />
      )
    return [gapButton, body]
  }

  const nowLabel = nowMin !== null ? formatTimeShort(minutesToTime(nowMin)) : ''
  const nowLine = (
    <div className="ag-now" aria-hidden="true">
      Ahora · {nowLabel}
    </div>
  )

  return (
    <div className="ag">
      {(deadlines.length > 0 || allDayEvents.length > 0) && (
        <div className="ag-allday">
          {deadlines.map((g) => (
            <button
              key={`d-${g.id}`}
              type="button"
              className="ag-chip"
              onClick={() => onGoal(g)}
              aria-label={`Meta ${g.title}, fecha objetivo`}
            >
              <span className="ag-chip__flag">
                <IconFlag size={12} />
              </span>
              <span className="ag-chip__title">{g.title}</span>
            </button>
          ))}
          {allDayEvents.map((e) => (
            <div key={e.id} className={`ag-chip${e.doneAt ? ' ag-chip--done' : ''}`}>
              <EventCheck event={e} onToggle={() => handlers.onToggleEvent(e)} />
              <button type="button" className="ag-chip__title" onClick={() => handlers.onOpenEvent(e)}>
                {e.title}
              </button>
            </div>
          ))}
        </div>
      )}

      {empty && <p className="faint small">Nada agendado. Toca + para sumar algo.</p>}

      {/* Fragments, no divs: los selectores `.ag__kicker + .ag-row` etc. necesitan
          que kicker, hueco, línea "Ahora", filas y bloques sean hermanos reales. */}
      {PERIOD_ORDER.map((period) => {
        const inPeriod = blocks
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => periodOfMinutes(b.startMin) === period)
        const showNow = nowPeriod === period && !empty
        if (inPeriod.length === 0 && !showNow) return null
        const nowAt = showNow && nowMin !== null ? nowLineIndex(inPeriod.map(({ b }) => b), nowMin) : -1
        return (
          <Fragment key={period}>
            <p className="ag__kicker">{PERIOD_LABELS[period]}</p>
            {inPeriod.map(({ b, i }, k) => (
              <Fragment key={b.key}>
                {nowAt === k && nowLine}
                {renderBlock(b, i)}
              </Fragment>
            ))}
            {nowAt === inPeriod.length && nowLine}
          </Fragment>
        )
      })}

      {untimed.length > 0 && (
        <>
          <p className="ag__kicker">Sin hora</p>
          {untimed.map((r) => (
            <AgendaRow key={r.key} item={r} {...handlers} />
          ))}
        </>
      )}
    </div>
  )
}
