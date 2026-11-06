import type { DayState } from '@/domain/sessions'
import { frameCaption } from '@/domain/today'
import { WEEKDAY_SHORT } from '@/domain/weekdays'
import { addDays, dayOfMonth, formatWeekday, startOfWeek } from '@/lib/date'
import { IconCheck, IconFlame, IconMinus } from '@/components/icons'

/** Máximo de segmentos de una barra: más allá se dibuja una barra proporcional. */
const MAX_SEGMENTS = 12

/** Estado de un día de la tira semanal, dicho en palabras (aria-label). */
const WEEK_STATE_TEXT: Record<DayState, string> = {
  done: 'cumplido',
  partial: 'a medias',
  missed: 'sin hacer',
  future: 'pendiente',
  free: 'sin compromiso',
}

/** Glifo de estado del día: el color nunca lo dice solo. */
function weekMark(state: DayState) {
  if (state === 'done') return <IconCheck size={12} />
  if (state === 'partial') return <span className="today-week__dot" />
  if (state === 'missed') return <IconMinus size={12} />
  return null
}

/** Barra segmentada de las tarjetas de resumen (proporcional si hay demasiados). */
function SegmentedBar({ done, total }: Readonly<{ done: number; total: number }>) {
  if (total > MAX_SEGMENTS) {
    return (
      <span className="progress" aria-hidden="true">
        <span className="progress__bar" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </span>
    )
  }
  return (
    <div className="segbar" aria-hidden="true">
      {total === 0 ? (
        <span />
      ) : (
        Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? 'done' : undefined} />)
      )}
    </div>
  )
}

interface TodayStatsProps {
  sessionsDone: number
  sessionsTotal: number
  habitsDone: number
  habitsTotal: number
  streak: number
  streakBumps: number
}

/** Las tres tarjetas de resumen: sesiones, hábitos y racha. */
export function TodayStats({
  sessionsDone,
  sessionsTotal,
  habitsDone,
  habitsTotal,
  streak,
  streakBumps,
}: Readonly<TodayStatsProps>) {
  const habitsComplete = habitsTotal > 0 && habitsDone === habitsTotal
  return (
    <div className="today-stats">
      <div className="today-stat">
        <span className="today-stat__label">Sesiones</span>
        <span className="today-stat__value">
          {sessionsDone}
          <span className="today-stat__total"> / {sessionsTotal}</span>
        </span>
        <SegmentedBar done={sessionsDone} total={sessionsTotal} />
      </div>
      <div className="today-stat">
        <span className="today-stat__label">Hábitos</span>
        <span className={`today-stat__value${habitsComplete ? ' today-stat__value--ok' : ''}`}>
          {habitsDone}
          <span className="today-stat__total"> / {habitsTotal}</span>
        </span>
        <SegmentedBar done={habitsDone} total={habitsTotal} />
      </div>
      <div className="today-stat">
        <span className="today-stat__label">Racha</span>
        {/* key: cada subida remonta el valor y la animación vuelve a correr. */}
        <span
          key={streakBumps}
          className={`today-stat__value today-stat__value--streak${streakBumps > 0 ? ' fc-bump' : ''}`}
        >
          <IconFlame size={16} className="today-stat__flame" />
          <span className="fc-bump__n">{streak}</span>
        </span>
        <span className="today-stat__caption">{frameCaption(streak)}</span>
      </div>
    </div>
  )
}

function weekDayLabel(date: string, index: number, isToday: boolean, stateText: string): string {
  if (isToday) return `${WEEKDAY_SHORT[index]} ${date.slice(8)}: hoy, ${stateText}`
  const dayName = formatWeekday(date)
  return `Ver ${dayName.charAt(0).toLowerCase()}${dayName.slice(1)} en la agenda: ${stateText}`
}

interface WeekStripProps {
  today: string
  stateOf: (date: string) => DayState
  onOpenDay: (date: string) => void
}

/** La tira de la semana: cada día con su estado; los demás días abren la Agenda. */
export function WeekStrip({ today, stateOf, onOpenDay }: Readonly<WeekStripProps>) {
  return (
    <fieldset className="today-week fieldset--plain" aria-label="Tu semana">
      {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i)).map((d, i) => {
        const st = stateOf(d)
        const isToday = d === today
        return (
          <button
            key={d}
            type="button"
            className={`today-week__day today-week__day--${st}${isToday ? ' today-week__day--today' : ''}`}
            disabled={isToday}
            aria-label={weekDayLabel(d, i, isToday, WEEK_STATE_TEXT[st])}
            // Pasado: la agenda de ese día muestra qué hiciste. Futuro: ahí se
            // planifica. Hoy no navega: ya estás en Hoy.
            onClick={() => onOpenDay(d)}
          >
            <span className="today-week__label">{WEEKDAY_SHORT[i]}</span>
            <span className="today-week__num">{dayOfMonth(d)}</span>
            <span className="today-week__mark" aria-hidden="true">
              {weekMark(st)}
            </span>
          </button>
        )
      })}
    </fieldset>
  )
}
