import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getGoal } from '@/services/goals'
import { getTemplate } from '@/domain/templates'
import { pickAction } from '@/domain/dailyPlan'
import { todayISO } from '@/lib/date'
import type { Goal } from '@/lib/types'
import { LoadingScreen } from '@/components/LoadingScreen'
import { Roadmap } from '@/components/Roadmap'
import { IconCelebrate, IconPlay } from '@/components/icons'

/**
 * Momento de pago tras crear una meta: le mostramos AL USUARIO el camino
 * (hitos) y su primera acción para hoy. Es el "la app me guía" hecho visible.
 */
export function GoalCreated() {
  const { goalId } = useParams<{ goalId: string }>()
  const navigate = useNavigate()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getGoal(goalId ?? '')
      .then((g) => {
        if (!active) return
        setGoal(g)
        setLoading(false)
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [goalId])

  if (loading) return <LoadingScreen />
  if (!goal) return <Navigate to="/" replace />

  const template = getTemplate(goal.templateKey)
  const firstAction = pickAction(goal, todayISO())

  return (
    <div className="screen screen--full flow-screen">
      <div className="stack stack--lg" style={{ flex: 1 }}>
        <header
          className="center stack stack--sm"
          style={{ marginTop: 'var(--s6)', alignItems: 'center' }}
        >
          <IconCelebrate size={44} style={{ color: 'var(--primary)' }} />
          <h1 className="screen__title">¡Meta creada!</h1>
          <p className="muted">
            {template.emoji} {goal.title}
          </p>
          {goal.why && <p className="small muted center">Porque {goal.why}</p>}
        </header>

        <div className="card stack">
          <span className="kicker">Así la vas a lograr</span>
          <Roadmap milestones={template.milestones} currentIndex={goal.currentMilestone} />
        </div>

        <div className="focus-card stack stack--sm">
          <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
            <IconPlay size={11} /> Empezá hoy con
          </span>
          <strong style={{ fontSize: 'var(--fs-xl)' }}>{firstAction}</strong>
        </div>
      </div>

      <button className="btn btn--primary btn--block" onClick={() => navigate('/', { replace: true })}>
        Ver mi plan de hoy
      </button>
    </div>
  )
}
