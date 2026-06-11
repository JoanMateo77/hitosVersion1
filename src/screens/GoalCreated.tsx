import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getGoal } from '@/services/goals'
import { listMilestones } from '@/services/milestones'
import { listScheduleForGoal } from '@/services/schedule'
import { getTemplate } from '@/domain/templates'
import { WEEKDAY_LABELS, formatCommitmentSummary, weekdayMon0 } from '@/domain/commitment'
import { formatTime12 } from '@/lib/date'
import { addDays, formatWeekday, todayISO } from '@/lib/date'
import type { Goal, Milestone, ScheduleBlock } from '@/lib/types'
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
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const id = goalId ?? ''
    Promise.all([getGoal(id), listMilestones(id), listScheduleForGoal(id)])
      .then(([g, m, s]) => {
        if (!active) return
        setGoal(g)
        setMilestones(m)
        setSchedule(s)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        // Distinguimos "falló la carga" de "no existe": no rebotamos en silencio.
        setError('No pudimos cargar tu meta recién creada. Inténtalo de nuevo.')
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
  // Próximo día comprometido (hoy..+6): el contrato se vuelve una cita concreta.
  const firstSession = (() => {
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(todayISO(), offset)
      const dayBlocks = schedule
        .filter((b) => b.weekday === weekdayMon0(date))
        .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))
      if (dayBlocks.length > 0) return { date, offset, block: dayBlocks[0] }
    }
    return null
  })()
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
          <p className="muted">{goal.title}</p>
          {cleanWhy && <p className="small muted center">Porque {cleanWhy}</p>}
        </header>

        <div className="card stack">
          <span className="kicker">Así la vas a lograr</span>
          {/* Camino real de la meta (tabla milestones); plantilla solo como fallback
              para metas viejas que todavía no pasaron por el backfill. */}
          <Roadmap
            milestones={milestones.length > 0 ? milestones.map((m) => m.title) : template.milestones}
            currentIndex={milestones.filter((m) => m.doneAt !== null).length}
          />
        </div>

        {schedule.length > 0 && (
          <div className="card card--tight stack stack--sm">
            <span className="kicker">Tu compromiso</span>
            <div className="row wrap">
              {schedule.map((b) => (
                <span key={b.id} className="tag">
                  {WEEKDAY_LABELS[b.weekday]}
                  {b.startTime ? ` ${formatTime12(b.startTime)}` : ''} ·{' '}
                  {b.targetKind === 'time' ? `${b.targetValue} min` : `${b.targetValue} ${b.unit ?? ''}`}
                </span>
              ))}
            </div>
            <p className="small">{formatCommitmentSummary(schedule)}</p>
          </div>
        )}

        {firstSession && (
          <div className="focus-card stack stack--sm">
            <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconPlay size={11} /> Tu primera sesión
            </span>
            <strong style={{ fontSize: 'var(--fs-xl)' }}>
              {firstSession.offset === 0 ? 'Hoy' : firstSession.offset === 1 ? 'Mañana' : formatWeekday(firstSession.date)}
              {firstSession.block.startTime ? ` a las ${formatTime12(firstSession.block.startTime)}` : ''} ·{' '}
              {firstSession.block.targetKind === 'time'
                ? `${firstSession.block.targetValue} min`
                : `${firstSession.block.targetValue} ${firstSession.block.unit ?? ''}`}
            </strong>
          </div>
        )}
      </div>

      <button className="btn btn--primary btn--block" onClick={() => navigate('/', { replace: true })}>
        Ver mi plan de hoy
      </button>
    </div>
  )
}
