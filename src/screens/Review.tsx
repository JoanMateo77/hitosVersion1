import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalMilestone, setGoalStatus } from '@/services/goals'
import { getTemplate } from '@/domain/templates'
import { goalsDueForReview } from '@/domain/dailyPlan'
import { LoadingScreen } from '@/components/LoadingScreen'
import { useToast } from '@/app/toast'
import { Roadmap } from '@/components/Roadmap'
import { IconBack, IconCelebrate, IconCheck, IconSprout } from '@/components/icons'

/**
 * Revisión semanal guiada (Sección 6): recorre tus metas activas una por una y
 * te deja confirmar que seguís, avanzar de etapa o pausarla. Cada confirmación
 * marca la meta como revisada (last_reviewed_at), así no vuelve a pedirla hasta
 * que pase su frecuencia de revisión.
 */
export function Review() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [goals, setGoals] = useState<Goal[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let active = true
    listGoals(userId)
      .then((gs) => {
        if (!active) return
        setGoals(goalsDueForReview(gs))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus metas.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  function act(fn: () => Promise<unknown>) {
    setWorking(true)
    setError(null)
    fn()
      .then(() => setIndex((i) => i + 1))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'No se pudo guardar. Probá de nuevo.'),
      )
      .finally(() => setWorking(false))
  }

  if (loading) return <LoadingScreen />

  const total = goals.length
  const goal = goals[index]

  if (total === 0) {
    return (
      <div className="screen screen--full flow-screen">
        <Header onClose={() => navigate('/')} />
        <div className="empty" style={{ marginTop: 'var(--s8)' }}>
          <IconSprout size={48} className="muted" />
          <p className="empty__title" style={{ marginTop: 'var(--s4)' }}>
            Nada para revisar por ahora
          </p>
          <p className="muted">Cuando una de tus metas toque revisión, la repasamos acá.</p>
        </div>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="screen screen--full flow-screen">
        <div
          className="stack stack--lg center"
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <IconCelebrate size={56} style={{ color: 'var(--primary)' }} />
          <h1 className="screen__title">Revisión lista</h1>
          <p className="muted">
            Repasaste {total} {total === 1 ? 'meta' : 'metas'}. Así se mantiene el rumbo.
          </p>
        </div>
        <button className="btn btn--primary btn--block" onClick={() => navigate('/')}>
          Volver a hoy
        </button>
      </div>
    )
  }

  const template = getTemplate(goal.templateKey)
  const milestones = template.milestones
  const stage = Math.min(goal.currentMilestone, milestones.length)
  const canAdvance = stage < milestones.length

  return (
    <div className="screen screen--full flow-screen">
      <Header onClose={() => navigate('/')} />

      <p className="faint small" style={{ marginTop: 'var(--s4)' }}>
        Meta {index + 1} de {total}
      </p>

      <div className="stack stack--lg" style={{ flex: 1 }}>
        <header>
          <h1 className="screen__title">
            {template.emoji} {goal.title}
          </h1>
          {goal.why && <p className="screen__subtitle">Tu porqué: {goal.why}</p>}
        </header>

        <div className="card stack">
          <span className="faint tiny">
            {stage >= milestones.length
              ? 'CAMINO COMPLETO'
              : `ETAPA ${stage + 1} DE ${milestones.length}`}
          </span>
          <Roadmap milestones={milestones} currentIndex={stage} />
        </div>

        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>

      <div className="stack stack--sm">
        <button
          className="btn btn--primary btn--block"
          disabled={working}
          onClick={() =>
            act(async () => {
              await markGoalReviewed(goal.id)
              toast('Revisada. Seguimos.', 'success')
            })
          }
        >
          <IconCheck size={18} /> Sigo con esto
        </button>
        {canAdvance && (
          <button
            className="btn btn--ghost btn--block"
            disabled={working}
            onClick={() =>
              act(async () => {
                await setGoalMilestone(goal.id, stage + 1)
                await markGoalReviewed(goal.id)
                toast('Etapa cumplida. Bien ahí.', 'success')
              })
            }
          >
            Avancé de etapa 🎯
          </button>
        )}
        <button
          className="btn btn--subtle btn--block"
          disabled={working}
          onClick={() =>
            act(async () => {
              await setGoalStatus(goal.id, 'paused')
              toast('Pausada. La retomás cuando quieras.')
            })
          }
        >
          Pausar esta meta
        </button>
      </div>
    </div>
  )
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="row row--between">
      <button className="iconbtn" onClick={onClose} aria-label="Salir">
        <IconBack />
      </button>
      <span className="small faint">Revisión guiada</span>
    </div>
  )
}
