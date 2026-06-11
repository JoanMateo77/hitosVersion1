import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal } from '@/lib/types'
import { listGoals } from '@/services/goals'
import { milestoneProgressByGoal } from '@/services/milestones'
import { countDoneTasks, listActiveDates } from '@/services/tasks'
import { getTemplate } from '@/domain/templates'
import { getNiche } from '@/domain/niches'
import { isGoalClosed } from '@/domain/goals'
import { currentStreak } from '@/domain/dailyPlan'
import { addDays, formatLongDate, startOfWeek, todayISO } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { useAsyncData } from '@/hooks/useAsyncData'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconProgress } from '@/components/icons'

/**
 * Progreso (histórico + reportes): "cómo venís avanzando". Junta el resumen de
 * avance (racha, metas activas/logradas, acciones hechas) con la línea de tiempo
 * de tu camino — las metas logradas y archivadas viven acá, no en Metas, para que
 * Metas quede solo con lo que está en marcha.
 */
export function Progress() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const today = todayISO()

  const { data, loading, error } = useAsyncData(async () => {
    const weekStart = startOfWeek(today)
    const [goals, doneTotal, doneWeek, activeDates, progress] = await Promise.all([
      listGoals(userId),
      countDoneTasks(userId),
      countDoneTasks(userId, weekStart),
      listActiveDates(userId, addDays(today, -120)),
      milestoneProgressByGoal(userId),
    ])
    return { goals, doneTotal, doneWeek, activeDates, progress }
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

  const { goals, doneTotal, doneWeek, activeDates, progress } = data
  const streak = currentStreak(activeDates, today)
  const active = goals.filter((g) => g.status === 'active').length
  const achieved = goals.filter((g) => g.status === 'done').length
  // Vitrina / línea de tiempo: las metas cerradas (logradas + archivadas), de la
  // más reciente a la más vieja.
  const finished = goals
    .filter((g) => isGoalClosed(g.status))
    .sort((a, b) =>
      (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt),
    )

  const stats = [
    { label: 'Racha', value: streak > 0 ? `🔥 ${streak}` : '0', hint: 'días seguidos' },
    { label: 'Metas en marcha', value: active, hint: 'activas' },
    {
      label: 'Metas logradas',
      value: achieved,
      hint: achieved === 1 ? 'completada' : 'completadas',
    },
    { label: 'Acciones hechas', value: doneTotal, hint: `${doneWeek} esta semana` },
  ]

  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">Cómo vas avanzando</p>
        <h1 className="screen__title">Progreso</h1>
      </header>

      <section className="stat-grid" aria-label="Resumen de avance">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <span className="stat-card__value">{s.value}</span>
            <span className="stat-card__label">{s.label}</span>
            <span className="faint tiny">{s.hint}</span>
          </div>
        ))}
      </section>

      <h2 className="section-title">Tu camino</h2>
      {finished.length === 0 ? (
        <div className="empty">
          <IconProgress size={40} className="muted" />
          <p className="empty__title" style={{ marginTop: 'var(--s4)' }}>
            Todavía no cerraste ninguna meta
          </p>
          <p className="muted">
            Cuando logres o archives una meta, queda aquí como parte de tu camino.
          </p>
        </div>
      ) : (
        <ul className="timeline">
          {finished.map((goal) => (
            <TimelineItem key={goal.id} goal={goal} progress={progress.get(goal.id)} onClick={() => navigate(`/metas/${goal.id}`)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TimelineItem({
  goal,
  progress,
  onClick,
}: {
  goal: Goal
  progress?: { done: number; total: number }
  onClick: () => void
}) {
  const template = getTemplate(goal.templateKey)
  const niche = getNiche(goal.area)
  const done = goal.status === 'done'
  const dateISO = (goal.completedAt ?? goal.createdAt).slice(0, 10)

  return (
    <li className="timeline__item" style={nicheAccent(goal.area)}>
      <span className={`timeline__dot${done ? ' timeline__dot--done' : ''}`} aria-hidden="true" />
      <button type="button" className="timeline__card" onClick={onClick}>
        <div className="row row--between" style={{ alignItems: 'flex-start', gap: 'var(--s2)' }}>
          <span className="timeline__title">
            <span aria-hidden="true">{template.emoji}</span> {goal.title}
          </span>
          <span className="tag">{done ? 'Lograda 🎉' : 'Archivada'}</span>
        </div>
        <span className="faint tiny">
          {niche.label} ·{' '}
          {done
            ? 'Camino completo'
            : progress && progress.total > 0
              ? `Llegó a etapa ${Math.min(progress.done + 1, progress.total)} de ${progress.total}`
              : 'En pausa indefinida'}{' '}
          · {formatLongDate(dateISO)}
        </span>
      </button>
    </li>
  )
}
