import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, Habit, HabitCheck, Milestone, Session } from '@/lib/types'
import { listGoals } from '@/services/goals'
import { listDoneMilestones, milestoneProgressByGoal } from '@/services/milestones'
import { listScheduleForUser } from '@/services/schedule'
import { listSessionsInRange } from '@/services/sessions'
import { listHabitChecksInRange, listHabits } from '@/services/habits'
import { habitCompleteDates, habitStreak } from '@/domain/habits'
import { getNiche } from '@/domain/niches'
import { isGoalClosed } from '@/domain/goals'
import {
  activeCommittedWeekdays,
  bestStreakCommitted,
  dayState as domainDayState,
  dueBlocksForDate,
  doneDatesOf,
  globalStreak,
  neutralDatesOf,
  weekConsistency,
  type DayState,
} from '@/domain/sessions'
import { WEEKDAY_SHORT } from '@/domain/weekdays'
import { formatPercent } from '@/lib/format'
import { addDays, formatLongDate, parseISO, startOfWeek, todayISO } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { useCachedData } from '@/hooks/useCachedData'
import { Disclosure } from '@/components/Disclosure'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconCheck, IconFlame, IconMinus, IconProgress } from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'

const HISTORY_DAYS = 120
/** Etiqueta corta de semana en el gráfico de 8 semanas: "19 oct". */
const WEEK_LABEL = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

/** Texto del estado de un día de la semana (para el lector de pantalla y el title). */
const DAY_STATE_LABELS: Record<DayState, string> = {
  done: 'cumplido',
  partial: 'parcial',
  missed: 'sin cumplir',
  future: 'por venir',
  free: 'libre',
}

/** Una entrada de "Tu camino": un hito cumplido o una meta cerrada. */
type Entry =
  | { kind: 'milestone'; date: string; milestone: Milestone; goal: Goal }
  | { kind: 'goal'; date: string; goal: Goal }

/**
 * Progreso: ¿cómo viene mi semana? ¿cómo avanza cada meta? ¿qué construí?
 * Todo calculado de sesiones e hitos reales — nada se inventa.
 */
export function Progress() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const today = todayISO()
  const weekStart = startOfWeek(today)

  const { data, loading, error } = useCachedData(
    `progress:${userId}`,
    async () => {
      const [goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks] =
        await Promise.all([
          listGoals(userId),
          listScheduleForUser(userId),
          listSessionsInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today),
          milestoneProgressByGoal(userId),
          listDoneMilestones(userId, 10),
          // Los hábitos también son progreso: degradan a vacío sin romper la pantalla.
          listHabits(userId).catch(() => [] as Habit[]),
          listHabitChecksInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today).catch(
            () => [] as HabitCheck[],
          ),
        ])
      return { goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks }
    },
    [userId],
  )

  if (loading) {
    return (
      <div className="screen">
        <header className="screen__header">
          <h1 className="screen__title">Progreso</h1>
        </header>
        <SkeletonList rows={3} />
      </div>
    )
  }
  if (error || !data) return <LoadingScreen error={error ?? 'No se pudo cargar tu progreso.'} />

  const { goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks } = data
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const activeGoals = goals.filter((g) => g.status === 'active')
  const doneish = (s: Session) => s.status === 'done' || s.status === 'partial'

  // ----- Tus hábitos: semana y racha por hábito (mismo lenguaje visual que Hábitos) -----
  const activeHabits = habits.filter((h) => h.archivedAt === null)
  // Solo los días COMPLETOS (todas las repeticiones) cuentan para racha y
  // semana: la misma vara que Hoy y Hábitos, o las pantallas se contradicen.
  const habitDates = new Map(activeHabits.map((h) => [h.id, habitCompleteDates(h, habitChecks)]))
  const bestHabitStreak = Math.max(
    0,
    ...activeHabits.map((h) => habitStreak(habitDates.get(h.id) ?? new Set<string>(), h.weekdays, today)),
  )

  // ----- Tu semana -----
  // Solo cuentan los bloques de metas ACTIVAS: las pausadas no aparecen en la
  // lista "Tus metas" de abajo, así que sumar su compromiso hacía que el total
  // de la semana nunca cuadrara con lo listado (y nunca pudiera completarse).
  const activeBlocks = blocks.filter((b) => goalById.get(b.goalId)?.status === 'active')
  const weekSessions = sessions.filter((s) => s.date >= weekStart)
  const week = weekConsistency(activeBlocks, weekSessions, weekStart)
  const committedWeekdays = activeCommittedWeekdays(goals, blocks)
  const streak = globalStreak(goals, blocks, sessions, today)
  const doneDates = doneDatesOf(sessions)
  const best = Math.max(
    streak,
    bestStreakCommitted(
      doneDates,
      committedWeekdays,
      addDays(today, -(HISTORY_DAYS - 1)),
      today,
      neutralDatesOf(sessions, activeBlocks),
    ),
  )

  /** Estado visual de cada día de la semana en curso. */
  function dayState(date: string) {
    return domainDayState(
      date,
      today,
      sessions.filter((s) => s.date === date),
      dueBlocksForDate(activeBlocks, date),
    )
  }
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // ----- Últimas 8 semanas (sobre filas reales de sesiones comprometidas) -----
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(weekStart, -7 * (7 - i))
    const end = addDays(start, 6)
    // Las saltadas no cuentan: un día saltado no es deuda (ni suma ni resta).
    const rows = sessions.filter(
      (s) => s.date >= start && s.date <= end && s.scheduleId !== null && s.status !== 'skipped',
    )
    const done = rows.filter(doneish).length
    return { start, ratio: rows.length > 0 ? done / rows.length : 0, total: rows.length }
  })
  const anyHistory = weeks.some((w) => w.total > 0)

  // ----- Tu camino: hitos cumplidos + metas cerradas, por fecha -----
  const entries: Entry[] = []
  for (const m of doneMilestones) {
    const goal = goalById.get(m.goalId)
    if (goal && m.doneAt) entries.push({ kind: 'milestone', date: m.doneAt, milestone: m, goal })
  }
  for (const g of goals) {
    if (isGoalClosed(g.status))
      entries.push({ kind: 'goal', date: g.completedAt ?? g.createdAt, goal: g })
  }
  entries.sort((a, b) => b.date.localeCompare(a.date))
  const timeline = entries

  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">Cómo vas avanzando</p>
        <h1 className="screen__title">Progreso</h1>
      </header>

      {/* La pestaña Crecer tiene dos caras: tu progreso y lo que aprendes. */}
      <div className="seg mb-4" role="tablist" aria-label="Progreso o Aprender">
        <button type="button" role="tab" aria-selected={true} className="seg__btn seg__btn--active">
          Progreso
        </button>
        <button type="button" role="tab" aria-selected={false} className="seg__btn" onClick={() => navigate('/aprender')}>
          Aprender
        </button>
      </div>

      <div className="progress-grid">
      {/* ----- Tu semana ----- */}
      <section className="card prog-week" aria-label="Tu semana">
        <div className="row row--between">
          <h2 className="section-title">Tu semana</h2>
          {streak >= 2 && (
            <span className="streak-chip prog-streak">
              <IconFlame size={13} /> {streak} días{best > streak ? ` · récord ${best}` : ''}
            </span>
          )}
        </div>
        <div className="prog-week__body">
          {/* Anillo de cumplimiento (verde = cumplido). Se llena una vez al entrar. */}
          <div
            className="prog-ring"
            style={{ '--prog-ring': `${week.committed > 0 ? (week.done / week.committed) * 360 : 0}deg` } as CSSProperties}
            role="img"
            aria-label={`${week.done} de ${week.committed} sesiones cumplidas esta semana`}
          >
            <span className="prog-ring__hole" aria-hidden="true">
              <strong className="prog-ring__n">
                {week.done}/{week.committed}
              </strong>
              <span className="prog-ring__lbl">sesiones</span>
            </span>
          </div>
          <ol className="prog-days">
            {weekDates.map((d, i) => {
              const st = dayState(d)
              const stateLabel = DAY_STATE_LABELS[st]
              const isToday = d === today
              const dayLabel = `${WEEKDAY_SHORT[i]}${isToday ? ' (hoy)' : ''}: ${stateLabel}`
              return (
                <li key={d} className={`prog-day${isToday ? ' prog-day--today' : ''}`}>
                  {/* Forma además de color: ✓ cumplido, rayas parcial, – sin cumplir. */}
                  <span
                    className={`prog-day__box prog-day__box--${st}`}
                    role="img"
                    aria-label={dayLabel}
                    title={dayLabel}
                  >
                    {st === 'done' && <IconCheck size={13} />}
                    {st === 'missed' && <IconMinus size={13} />}
                  </span>
                  <span className="prog-day__lbl" aria-hidden="true">
                    {WEEKDAY_SHORT[i]}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {/* ----- Tus metas: barras por meta en el color de su área ----- */}
      {activeGoals.length > 0 && (
        <section className="card prog-goals" aria-label="Tus metas">
          <div className="row row--between">
            <h2 className="section-title">Tus metas</h2>
            <span className="faint tiny">Etapas cumplidas</span>
          </div>
          <ul className="prog-goals__list">
            {activeGoals.map((g) => {
              const prog = progressByGoal.get(g.id) ?? { done: 0, total: 0 }
              const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0
              const goalBlocks = blocks.filter((b) => b.goalId === g.id)
              const goalWeek = weekConsistency(
                goalBlocks,
                weekSessions.filter((s) => s.goalId === g.id),
                weekStart,
              )
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    className="prog-goal"
                    style={nicheAccent(g.area)}
                    onClick={() => navigate(`/metas/${g.id}`)}
                  >
                    <span className="prog-goal__head">
                      <NicheGlyph area={g.area} size="sm" />
                      <strong className="prog-goal__title">{g.title}</strong>
                      <span className="prog-goal__pct">{formatPercent(pct)}</span>
                    </span>
                    <span className="progress prog-goal__bar" aria-hidden="true">
                      <span className="progress__bar" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="prog-goal__meta">
                      {prog.total > 0 ? `${prog.done} de ${prog.total} etapas` : 'Sin etapas aún'}
                      {goalWeek.committed > 0 &&
                        ` · ${goalWeek.done} de ${goalWeek.committed} ${
                          goalWeek.committed === 1 ? 'sesión' : 'sesiones'
                        } esta semana`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ----- Tus hábitos ----- */}
      {activeHabits.length > 0 && (
        <section aria-label="Tus hábitos" className="card card--tight row row--between prog-habits">
          <span className="small">
            {activeHabits.length} {activeHabits.length === 1 ? 'hábito activo' : 'hábitos activos'}
            {bestHabitStreak >= 2 ? ` · mejor racha ${bestHabitStreak} días` : ''}
          </span>
          <button className="btn--link" onClick={() => navigate('/habitos')}>
            Ver hábitos
          </button>
        </section>
      )}

      {/* ----- Últimas 8 semanas: % cumplido por semana, con etiqueta en cada barra ----- */}
      {anyHistory && (
        <section className="card card--tight" aria-label="Últimas 8 semanas">
          <Disclosure summary={<span className="section-title">Últimas 8 semanas</span>}>
            <ol className="prog-weeks">
              {weeks.map((w, i) => {
                const pct = Math.round(w.ratio * 100)
                const current = i === 7
                return (
                  <li
                    key={w.start}
                    className={`prog-weeks__col${current ? ' prog-weeks__col--now' : ''}`}
                  >
                    <span className="prog-weeks__val" aria-hidden="true">
                      {w.total === 0 ? '—' : formatPercent(pct)}
                    </span>
                    {/* La barra es la imagen: su nombre accesible dice semana y %. */}
                    <span
                      className="prog-weeks__track"
                      role="img"
                      aria-label={`Semana del ${formatLongDate(w.start)}: ${
                        w.total === 0 ? 'sin sesiones' : `${formatPercent(pct)} cumplido`
                      }`}
                    >
                      <span
                        className={`prog-weeks__bar${w.total === 0 ? ' prog-weeks__bar--empty' : ''}`}
                        style={{ height: `${Math.max(4, pct)}%` }}
                      />
                    </span>
                    <span className="prog-weeks__lbl" aria-hidden="true">
                      {current ? 'Esta' : WEEK_LABEL.format(parseISO(w.start)).replace('.', '')}
                    </span>
                  </li>
                )
              })}
            </ol>
          </Disclosure>
        </section>
      )}

      {/* ----- Tu camino ----- (en escritorio, columna izquierda bajo la semana) */}
      <section className="prog-path-sec" aria-labelledby="prog-path-title">
      <div className="section-head">
        <h2 className="section-title" id="prog-path-title">Tu camino</h2>
      </div>
      {timeline.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">
            <IconProgress size={30} />
          </span>
          <p className="empty__title">Tu camino empieza hoy</p>
          <p className="muted">Cada etapa que cumplas y cada meta que logres queda aquí.</p>
        </div>
      ) : (
        <>
          <TimelineList entries={timeline.slice(0, 5)} onOpen={(goalId) => navigate(`/metas/${goalId}`)} />
          {timeline.length > 5 && (
            <Disclosure summary={`Ver más (${timeline.length - 5})`}>
              <TimelineList entries={timeline.slice(5)} onOpen={(goalId) => navigate(`/metas/${goalId}`)} />
            </Disclosure>
          )}
        </>
      )}
      </section>
      </div>
    </div>
  )
}

/** Lista de entradas de "Tu camino": hitos cumplidos y metas cerradas. */
function TimelineList({ entries, onOpen }: { entries: Entry[]; onOpen: (goalId: string) => void }) {
  return (
    <ul className="timeline prog-path">
      {entries.map((e) => (
        <li
          key={e.kind === 'milestone' ? `m-${e.milestone.id}` : `g-${e.goal.id}`}
          className="timeline__item"
          style={nicheAccent(e.goal.area)}
        >
          <span
            className={`timeline__dot${
              e.kind === 'goal' && e.goal.status === 'done' ? ' timeline__dot--done' : ''
            }`}
            aria-hidden="true"
          />
          <button type="button" className="timeline__card" onClick={() => onOpen(e.goal.id)}>
            <div className="prog-path__head">
              <span className="timeline__title prog-path__title">
                {e.kind === 'milestone' ? (
                  <>
                    <IconCheck size={14} className="prog-path__check" />
                    {e.milestone.title}
                  </>
                ) : (
                  <>
                    <NicheGlyph area={e.goal.area} size="sm" />
                    {e.goal.title}
                  </>
                )}
              </span>
              {e.kind === 'milestone' ? (
                <span className="tag">Etapa</span>
              ) : (
                <span className={`chip-state${e.goal.status === 'done' ? ' chip-state--ok' : ''}`}>
                  {e.goal.status === 'done' ? 'Lograda' : 'Archivada'}
                </span>
              )}
            </div>
            <span className="faint tiny">
              {e.kind === 'milestone' ? e.goal.title : getNiche(e.goal.area).label} ·{' '}
              {formatLongDate(e.date.slice(0, 10))}
              {/* Si la meta de este hito está en pausa, decirlo: si no, aparece
                  en el camino pero no en "Tus metas", y confunde. */}
              {e.goal.status === 'paused' && ' · en pausa'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
