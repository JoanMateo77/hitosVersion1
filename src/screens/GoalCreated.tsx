import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getGoal } from '@/services/goals'
import { listMilestones } from '@/services/milestones'
import { listScheduleForGoal } from '@/services/schedule'
import { getTemplate } from '@/domain/templates'
import { blockTimeLabel, formatCommitmentSummary, weekdayMon0 } from '@/domain/commitment'
import { addDays, formatWeekday, todayISO } from '@/lib/date'
import type { Goal, Milestone, ScheduleBlock } from '@/lib/types'
import { LoadingScreen } from '@/components/LoadingScreen'
import { Roadmap } from '@/components/Roadmap'
import { IconPlay } from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'
import { PathIllustration } from '@/components/PathIllustration'
import { getNiche } from '@/domain/niches'
import { goalAccent, goalTone } from '@/lib/goalAccent'

/** "Hoy", "Mañana" o el día de la semana de la primera sesión. */
function dayWord(offset: number, date: string): string {
  if (offset === 0) return 'Hoy'
  if (offset === 1) return 'Mañana'
  return formatWeekday(date)
}

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
  if (goal.status !== 'active') return <Navigate to={`/metas/${goal.id}`} replace />

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
  const strippedWhy = goal.why?.trim().replace(/^porqu[eé]\s+/i, '')
  // Va después de "Porque": la primera letra en minúscula ("Porque quiero…").
  const cleanWhy = strippedWhy ? strippedWhy.charAt(0).toLowerCase() + strippedWhy.slice(1) : strippedWhy

  return (
    <div className="screen screen--full flow-screen goal-created" style={goalAccent(goal)}>
      <div className="stack stack--lg" style={{ flex: 1 }}>
        <header className="goal-created__head">
          {/* El camino con banderín: la idea de la app, dibujada una vez aquí. */}
          <PathIllustration width={112} done={1} stopColor="var(--vivid)" className="celebrate-pop goal-created__art" />
          <h1 ref={titleRef} tabIndex={-1} className="screen__title">
            ¡Meta creada!
          </h1>
          <p className="muted">Ya tienes el camino. Ahora, un paso a la vez.</p>
        </header>

        {/* La meta en su color: la misma tarjeta que verás en Metas (sin relieve:
            aquí no se toca). */}
        <section className="fc-card goal-created__card" aria-label="Tu meta">
          <span className="goal-card__top">
            <NicheGlyph area={goal.area} tone={goalTone(goal)} size="md" />
          </span>
          <span className="fc-card__title">{goal.title}</span>
          <span className="fc-card__meta">{getNiche(goal.area).label}</span>
          {cleanWhy && <span className="fc-card__meta goal-created__why">Porque {cleanWhy}</span>}
        </section>

        <div className="card stack goal-created__path">
          <span className="section-title">Así la vas a lograr</span>
          {/* Camino real de la meta (tabla milestones); plantilla solo como fallback
              para metas viejas que todavía no pasaron por el backfill. */}
          <Roadmap
            milestones={milestones.length > 0 ? milestones.map((m) => m.title) : template.milestones}
            currentIndex={milestones.filter((m) => m.doneAt !== null).length}
            intro
          />
        </div>

        {schedule.length > 0 && (
          <div className="card card--tight stack stack--sm">
            <span className="section-title">Tu compromiso</span>
            <p className="small">{formatCommitmentSummary(schedule)}</p>
          </div>
        )}

        {schedule.length === 0 && (
          <div className="card card--tight stack stack--sm">
            <span className="section-title">Tu compromiso</span>
            <p className="small">Sin agenda: la tendrás presente en Hoy</p>
          </div>
        )}

        {firstSession && (
          <div className="focus-card stack stack--sm">
            <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconPlay size={11} /> Tu primera sesión
            </span>
            <strong style={{ fontSize: 'var(--fs-xl)' }}>
              {dayWord(firstSession.offset, firstSession.date)}
              {' · '}
              {blockTimeLabel(firstSession.block)}
            </strong>
          </div>
        )}
      </div>

      <div className="stack stack--sm goal-created__actions">
        <button className="btn btn--primary btn--block" onClick={() => navigate('/', { replace: true })}>
          Ver mi plan de hoy
        </button>
        {/* Escape discreto: un typo recién creado se corrige sin rodeos. */}
        <button
          type="button"
          className="btn--link"
          style={{ alignSelf: 'center' }}
          onClick={() => navigate(`/metas/${goal.id}`, { replace: true })}
        >
          Ver o ajustar esta meta
        </button>
      </div>
    </div>
  )
}
