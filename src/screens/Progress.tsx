import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, Milestone, Session } from '@/lib/types'
import { listGoals } from '@/services/goals'
import { listDoneMilestones, milestoneProgressByGoal } from '@/services/milestones'
import { listScheduleForUser } from '@/services/schedule'
import { listSessionsInRange } from '@/services/sessions'
import { getTemplate } from '@/domain/templates'
import { getNiche } from '@/domain/niches'
import { isGoalClosed } from '@/domain/goals'
import { bestStreakCommitted, currentStreakCommitted, weekConsistency } from '@/domain/sessions'
import { weekdayMon0, WEEKDAY_LABELS } from '@/domain/commitment'
import { addDays, formatDuration, formatLongDate, startOfWeek, todayISO } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { useAsyncData } from '@/hooks/useAsyncData'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconProgress } from '@/components/icons'

const HISTORY_DAYS = 120

/**
 * Progreso: ¿cómo viene mi semana? ¿cómo avanza cada meta? ¿qué construí?
 * Todo calculado de sesiones e hitos reales — nada se inventa.
 */
export function Progress() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const today = todayISO()
  const weekStart = startOfWeek(today)

  const { data, loading, error } = useAsyncData(async () => {
    const [goals, blocks, sessions, progressByGoal, doneMilestones] = await Promise.all([
      listGoals(userId),
      listScheduleForUser(userId),
      listSessionsInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today),
      milestoneProgressByGoal(userId),
      listDoneMilestones(userId, 10),
    ])
    return { goals, blocks, sessions, progressByGoal, doneMilestones }
  }, [userId])

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

  const { goals, blocks, sessions, progressByGoal, doneMilestones } = data
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const activeGoals = goals.filter((g) => g.status === 'active')
  const doneish = (s: Session) => s.status === 'done' || s.status === 'partial'

  // ----- Tu semana -----
  const weekSessions = sessions.filter((s) => s.date >= weekStart)
  const week = weekConsistency(blocks, weekSessions, weekStart)
  const doneDates = new Set(sessions.filter(doneish).map((s) => s.date))
  const committedWeekdays = new Set(blocks.map((b) => b.weekday))
  const streak = currentStreakCommitted(doneDates, committedWeekdays, today)
  const best = Math.max(
    streak,
    bestStreakCommitted(doneDates, committedWeekdays, addDays(today, -(HISTORY_DAYS - 1)), today),
  )

  /** Estado visual de cada día de la semana en curso. */
  function dayState(date: string): 'done' | 'partial' | 'missed' | 'future' | 'free' {
    const isCommitted = committedWeekdays.has(weekdayMon0(date))
    if (date > today) return isCommitted ? 'future' : 'free'
    const day = sessions.filter((s) => s.date === date)
    if (!isCommitted && day.length === 0) return 'free'
    if (day.some((s) => s.status === 'done')) return 'done'
    if (day.some((s) => s.status === 'partial')) return 'partial'
    if (date === today) return 'future' // hoy sigue en juego
    return 'missed'
  }
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // ----- Últimas 8 semanas (sobre filas reales de sesiones comprometidas) -----
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(weekStart, -7 * (7 - i))
    const end = addDays(start, 6)
    const rows = sessions.filter((s) => s.date >= start && s.date <= end && s.scheduleId !== null)
    const done = rows.filter(doneish).length
    return { start, ratio: rows.length > 0 ? done / rows.length : 0, total: rows.length }
  })
  const anyHistory = weeks.some((w) => w.total > 0)

  // ----- Minutos invertidos por meta (ventana de 120 días) -----
  const minutesByGoal = new Map<string, number>()
  for (const s of sessions) {
    if (!doneish(s) || s.targetKind !== 'time') continue
    minutesByGoal.set(s.goalId, (minutesByGoal.get(s.goalId) ?? 0) + (s.actualValue ?? 0))
  }

  // ----- Tu camino: hitos cumplidos + metas cerradas, por fecha -----
  type Entry =
    | { kind: 'milestone'; date: string; milestone: Milestone; goal: Goal }
    | { kind: 'goal'; date: string; goal: Goal }
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
  const timeline = entries.slice(0, 12)

  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">Cómo vas avanzando</p>
        <h1 className="screen__title">Progreso</h1>
      </header>

      {/* ----- Tu semana ----- */}
      <section className="card stack stack--sm" aria-label="Tu semana">
        <div className="row row--between">
          <span className="kicker">Tu semana</span>
          {streak >= 2 && (
            <span className="tag" style={{ color: 'var(--primary)' }}>
              🔥 {streak} días{best > streak ? ` · récord ${best}` : ''}
            </span>
          )}
        </div>
        <div className="row" style={{ alignItems: 'center', gap: 'var(--s5)' }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `conic-gradient(var(--success) ${
                week.committed > 0 ? (week.done / week.committed) * 360 : 0
              }deg, var(--surface-2) 0deg)`,
            }}
            role="img"
            aria-label={`${week.done} de ${week.committed} sesiones cumplidas esta semana`}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <strong style={{ fontSize: 'var(--fs-lg)' }}>
                {week.done}/{week.committed}
              </strong>
              <span className="faint" style={{ fontSize: 10 }}>
                sesiones
              </span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ gap: 6 }}>
              {weekDates.map((d, i) => {
                const st = dayState(d)
                const bg =
                  st === 'done'
                    ? 'var(--success)'
                    : st === 'partial'
                      ? 'var(--warning)'
                      : st === 'missed'
                        ? 'var(--surface-3)'
                        : 'transparent'
                const border =
                  st === 'future'
                    ? '1.5px dashed var(--border)'
                    : st === 'free'
                      ? '1px solid var(--border-soft)'
                      : 'none'
                return (
                  <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                    <div
                      style={{ height: 26, borderRadius: 7, background: bg, border }}
                      role="img"
                      aria-label={`${WEEKDAY_LABELS[i]}: ${
                        st === 'done'
                          ? 'cumplido'
                          : st === 'partial'
                            ? 'parcial'
                            : st === 'missed'
                              ? 'sin cumplir'
                              : st === 'future'
                                ? 'por venir'
                                : 'libre'
                      }`}
                    />
                    <span className="faint" style={{ fontSize: 9 }}>
                      {WEEKDAY_LABELS[i]}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="faint tiny" style={{ marginTop: 4 }}>
              Verde: cumplido · ámbar: parcial · punteado: por venir
            </p>
          </div>
        </div>
      </section>

      {/* ----- Tus metas ----- */}
      {activeGoals.length > 0 && (
        <section style={{ marginTop: 'var(--s5)' }} aria-label="Tus metas">
          <span className="kicker">Tus metas</span>
          <div className="stack stack--sm" style={{ marginTop: 'var(--s3)' }}>
            {activeGoals.map((g) => {
              const prog = progressByGoal.get(g.id) ?? { done: 0, total: 0 }
              const goalBlocks = blocks.filter((b) => b.goalId === g.id)
              const goalWeek = weekConsistency(
                goalBlocks,
                weekSessions.filter((s) => s.goalId === g.id),
                weekStart,
              )
              const minutes = minutesByGoal.get(g.id) ?? 0
              return (
                <button
                  key={g.id}
                  className="card card--tight stack stack--sm"
                  style={{ ...nicheAccent(g.area), width: '100%', textAlign: 'left' }}
                  onClick={() => navigate(`/metas/${g.id}`)}
                >
                  <div className="row row--between">
                    <strong>
                      {getTemplate(g.templateKey).emoji} {g.title}
                    </strong>
                    {goalWeek.committed > 0 && (
                      <span className="faint tiny" style={{ flex: 'none' }}>
                        {goalWeek.done}/{goalWeek.committed} esta semana
                      </span>
                    )}
                  </div>
                  <div className="progress">
                    <div
                      className="progress__bar"
                      style={{
                        width: `${prog.total > 0 ? (prog.done / prog.total) * 100 : 0}%`,
                        background: 'var(--niche, var(--success))',
                      }}
                    />
                  </div>
                  <span className="faint tiny">
                    {prog.total > 0
                      ? `Etapa ${Math.min(prog.done + 1, prog.total)} de ${prog.total}`
                      : 'Sin etapas'}
                    {minutes > 0 ? ` · ${formatDuration(minutes)} invertidas` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ----- Últimas 8 semanas ----- */}
      {anyHistory && (
        <section
          className="card stack stack--sm"
          style={{ marginTop: 'var(--s5)' }}
          aria-label="Últimas 8 semanas"
        >
          <span className="kicker">Últimas 8 semanas</span>
          <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 56 }}>
            {weeks.map((w, i) => (
              <div
                key={w.start}
                style={{
                  flex: 1,
                  borderRadius: '4px 4px 0 0',
                  background: i === 7 ? 'var(--success)' : 'var(--success-soft)',
                  height: `${Math.max(6, w.ratio * 100)}%`,
                  border: w.total === 0 ? '1px dashed var(--border-soft)' : 'none',
                }}
                role="img"
                aria-label={`Semana del ${formatLongDate(w.start)}: ${Math.round(w.ratio * 100)}% cumplido`}
              />
            ))}
          </div>
          <p className="faint tiny">
            % de sesiones cumplidas por semana · esta semana:{' '}
            {week.committed > 0 ? Math.round((week.done / week.committed) * 100) : 0}%
          </p>
        </section>
      )}

      {/* ----- Tu camino ----- */}
      <h2 className="section-title">Tu camino</h2>
      {timeline.length === 0 ? (
        <div className="empty">
          <IconProgress size={40} className="muted" />
          <p className="empty__title" style={{ marginTop: 'var(--s4)' }}>
            Tu camino empieza hoy
          </p>
          <p className="muted">Cada etapa que cumplas y cada meta que logres queda aquí.</p>
        </div>
      ) : (
        <ul className="timeline">
          {timeline.map((e) => (
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
              <button
                type="button"
                className="timeline__card"
                onClick={() => navigate(`/metas/${e.goal.id}`)}
              >
                <div className="row row--between" style={{ alignItems: 'flex-start', gap: 'var(--s2)' }}>
                  <span className="timeline__title">
                    {e.kind === 'milestone' ? (
                      <>✓ {e.milestone.title}</>
                    ) : (
                      <>
                        <span aria-hidden="true">{getTemplate(e.goal.templateKey).emoji}</span>{' '}
                        {e.goal.title}
                      </>
                    )}
                  </span>
                  <span className="tag">
                    {e.kind === 'milestone' ? 'Etapa' : e.goal.status === 'done' ? 'Lograda 🎉' : 'Archivada'}
                  </span>
                </div>
                <span className="faint tiny">
                  {e.kind === 'milestone' ? e.goal.title : getNiche(e.goal.area).label} ·{' '}
                  {formatLongDate(e.date.slice(0, 10))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
