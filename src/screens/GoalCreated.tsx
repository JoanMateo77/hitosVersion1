import { useEffect, useRef, useState } from 'react'
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
  const titleRef = useRef<HTMLHeadingElement>(null)

  const [goal, setGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getGoal(goalId ?? '')
      .then((g) => {
        if (!active) return
        setGoal(g)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        // Distinguimos "falló la carga" de "no existe": no rebotamos en silencio.
        setError('No pudimos cargar tu meta recién creada. Probá de nuevo.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [goalId])

  // Al cargar, movemos el foco al título para anunciar la pantalla (teclado/SR).
  useEffect(() => {
    if (!loading && goal) titleRef.current?.focus()
  }, [loading, goal])

  if (loading) return <LoadingScreen />
  if (error) return <LoadingScreen error={error} />
  if (!goal) return <Navigate to="/" replace />
  // Una meta ya no activa (lograda/archivada/pausada) alcanzada por URL directa no
  // debe mostrar "¡Meta creada!": la mandamos a su detalle real.
  if (goal.status !== 'active') return <Navigate to={`/meta/${goal.id}`} replace />

  const template = getTemplate(goal.templateKey)
  const firstAction = pickAction(goal, todayISO())
  // Evita "Porque porque…": sacamos un "porque" inicial que el placeholder induce.
  const cleanWhy = goal.why?.trim().replace(/^porqu[eé]\s+/i, '')

  return (
    <div className="screen screen--full flow-screen">
      <div className="stack stack--lg" style={{ flex: 1 }}>
        <header
          className="center stack stack--sm"
          style={{ marginTop: 'var(--s6)', alignItems: 'center' }}
        >
          <span className="celebrate-pop" style={{ display: 'inline-flex' }}>
            <IconCelebrate size={44} style={{ color: 'var(--primary)' }} />
          </span>
          <h1 ref={titleRef} tabIndex={-1} className="screen__title">
            ¡Meta creada!
          </h1>
          <p className="muted">
            {template.emoji} {goal.title}
          </p>
          {cleanWhy && <p className="small muted center">Porque {cleanWhy}</p>}
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
