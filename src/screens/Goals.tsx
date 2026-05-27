import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { listGoals } from '@/services/goals'
import { countDoneByGoal } from '@/services/tasks'
import { getTemplate } from '@/domain/templates'
import { getNiche } from '@/domain/niches'
import { relativeDeadline } from '@/lib/date'
import type { Goal, GoalStatus } from '@/lib/types'
import { useAsyncData } from '@/hooks/useAsyncData'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconPlus } from '@/components/icons'

/** Orden de presentación por estado: lo activo primero. */
const STATUS_ORDER: Record<GoalStatus, number> = {
  active: 0,
  paused: 1,
  done: 2,
  archived: 3,
}

const STATUS_BADGE: Partial<Record<GoalStatus, string>> = {
  paused: 'Pausada',
  done: 'Lograda 🎉',
  archived: 'Archivada',
}

export function Goals() {
  const { userId } = useSession()
  const navigate = useNavigate()

  const { data, loading, error } = useAsyncData(async () => {
    const [goals, counts] = await Promise.all([listGoals(userId), countDoneByGoal(userId)])
    return { goals, counts }
  }, [userId])

  if (loading) {
    return (
      <div className="screen">
        <header className="row row--between screen__header">
          <h1 className="screen__title">Tus metas</h1>
        </header>
        <SkeletonList rows={3} />
      </div>
    )
  }
  if (error || !data) return <LoadingScreen error={error ?? 'No se pudieron cargar tus metas.'} />

  const goals = [...data.goals].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  )

  return (
    <div className="screen">
      <header className="row row--between screen__header">
        <h1 className="screen__title">Tus metas</h1>
        <button className="btn btn--primary btn--sm" onClick={() => navigate('/meta/nueva')}>
          <IconPlus size={18} /> Nueva
        </button>
      </header>

      {goals.length === 0 ? (
        <div className="empty">
          <div className="empty__emoji">🎯</div>
          <p className="empty__title">Todavía no tenés metas</p>
          <p className="muted" style={{ marginBottom: 'var(--s4)' }}>
            Mirá ideas para tu foco y adoptá una, o escribí la tuya.
          </p>
          <div className="stack stack--sm" style={{ alignItems: 'center' }}>
            <button className="btn btn--primary" onClick={() => navigate('/ideas')}>
              Ver ideas para empezar
            </button>
            <button className="btn--link" onClick={() => navigate('/meta/nueva')}>
              Escribir mi propia meta
            </button>
          </div>
        </div>
      ) : (
        <ul className="stack stack--sm">
          {goals.map((goal) => (
            <li key={goal.id}>
              <GoalCard
                goal={goal}
                doneCount={data.counts.get(goal.id) ?? 0}
                onClick={() => navigate(`/metas/${goal.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function GoalCard({
  goal,
  doneCount,
  onClick,
}: {
  goal: Goal
  doneCount: number
  onClick: () => void
}) {
  const template = getTemplate(goal.templateKey)
  const niche = getNiche(goal.area)
  const deadline = relativeDeadline(goal.targetDate)
  const badge = STATUS_BADGE[goal.status]
  const dimmed = goal.status === 'done' || goal.status === 'archived'
  const milestones = template.milestones
  const stage = Math.min(goal.currentMilestone, milestones.length)
  const showProgress =
    (goal.status === 'active' || goal.status === 'paused') && milestones.length > 1

  return (
    <button className="goal-card" onClick={onClick} style={dimmed ? { opacity: 0.7 } : undefined}>
      <div className="goal-card__top">
        <span className="goal-card__emoji">{template.emoji}</span>
        <span className="goal-card__title nowrap-ellipsis">{goal.title}</span>
        {badge && <span className="tag">{badge}</span>}
      </div>
      <div className="row wrap" style={{ rowGap: 6 }}>
        <span className="tag">
          {niche.emoji} {niche.label}
        </span>
        {deadline && <span className="faint tiny">📅 {deadline}</span>}
        {doneCount > 0 && (
          <span className="faint tiny">· {doneCount} {doneCount === 1 ? 'acción hecha' : 'acciones hechas'}</span>
        )}
      </div>
      {showProgress && (
        <div className="stack stack--sm">
          <div className="progress">
            <div
              className="progress__bar"
              style={{ width: `${Math.round((stage / milestones.length) * 100)}%` }}
            />
          </div>
          <span className="faint tiny">
            {stage >= milestones.length
              ? 'Camino completo'
              : `Etapa ${stage + 1} de ${milestones.length}`}
          </span>
        </div>
      )}
    </button>
  )
}
