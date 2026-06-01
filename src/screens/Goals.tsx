import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBlendy, type Blendy } from 'blendy'
import { useSession } from '@/app/session'
import { listGoals } from '@/services/goals'
import { countDoneByGoal } from '@/services/tasks'
import { getTemplate } from '@/domain/templates'
import { getNiche } from '@/domain/niches'
import { clampedStage, isGoalClosed, isPathComplete } from '@/domain/goals'
import { relativeDeadline } from '@/lib/date'
import type { Goal, GoalStatus } from '@/lib/types'
import { useAsyncData } from '@/hooks/useAsyncData'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconCalendar, IconGoals, IconPlus } from '@/components/icons'

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

/**
 * Id seguro para Blendy. Su querySelector usa el valor SIN comillas
 * (`[data-blendy-to=ID]`), así que el id debe ser un identificador CSS válido: los
 * UUID empiezan con dígito y llevan guiones -> inválido. Prefijamos con letra y
 * sacamos los guiones.
 */
const bid = (id: string) => 'b' + id.replace(/-/g, '')

export function Goals() {
  const { userId } = useSession()
  const navigate = useNavigate()

  const { data, loading, error } = useAsyncData(async () => {
    const [goals, counts] = await Promise.all([listGoals(userId), countDoneByGoal(userId)])
    return { goals, counts }
  }, [userId])

  // Blendy: tocar una meta hace que la tarjeta se EXPANDA (morph FLIP) en su detalle,
  // saliendo desde su posición real en la grilla (izq/der/arriba) hacia el centro.
  const blendyRef = useRef<Blendy | null>(null)
  const reducedMotion = useRef(false)
  const [peek, setPeek] = useState<Goal | null>(null)

  useEffect(() => {
    blendyRef.current = createBlendy({ animation: 'spring' })
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // El overlay se monta (setPeek) y recién ahí animamos de la card al detalle.
  useLayoutEffect(() => {
    if (!peek) return
    blendyRef.current?.update() // re-escanea las cards (se renderizan tras cargar datos)
    blendyRef.current?.toggle(bid(peek.id))
  }, [peek])

  function openGoal(goal: Goal) {
    // Reduced-motion o Blendy no listo: directo al detalle completo (como antes).
    if (reducedMotion.current || !blendyRef.current) {
      navigate(`/metas/${goal.id}`)
      return
    }
    setPeek(goal)
  }
  function closePeek() {
    const g = peek
    if (!g || !blendyRef.current) {
      setPeek(null)
      return
    }
    // Cierre a prueba de balas: el untoggle morphea de vuelta y restaura la card; el
    // timeout garantiza el cierre aunque el callback no dispare.
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        setPeek(null)
      }
    }
    blendyRef.current.untoggle(bid(g.id), finish)
    setTimeout(finish, 700)
  }

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

  const goals = [...data.goals].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  // Lo accionable arriba; lo terminado/archivado en su propia sección colapsable,
  // para que las metas activas no queden empujadas hacia abajo.
  const live = goals.filter((g) => !isGoalClosed(g.status))
  const finished = goals.filter((g) => isGoalClosed(g.status))

  const renderCard = (goal: Goal) => (
    <li key={goal.id} data-blendy-from={bid(goal.id)}>
      <GoalCard
        goal={goal}
        doneCount={data.counts.get(goal.id) ?? 0}
        onClick={() => openGoal(goal)}
      />
    </li>
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
          <IconGoals size={48} className="muted" />
          <p className="empty__title" style={{ marginTop: 'var(--s4)' }}>Todavía no tenés metas</p>
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
        <>
          {live.length > 0 ? (
            <ul className="goals-grid">{live.map(renderCard)}</ul>
          ) : (
            <p className="muted" style={{ marginTop: 'var(--s4)' }}>
              No tenés metas en marcha ahora.{' '}
              <button
                className="btn--link"
                style={{ padding: 0 }}
                onClick={() => navigate('/meta/nueva')}
              >
                Creá una nueva
              </button>
              .
            </p>
          )}
          {finished.length > 0 && (
            <details className="goals-finished">
              <summary className="goals-finished__summary">
                Terminadas y archivadas ({finished.length})
              </summary>
              <ul className="goals-grid" style={{ marginTop: 'var(--s3)' }}>
                {finished.map(renderCard)}
              </ul>
            </details>
          )}
        </>
      )}

      {peek && (
        <GoalPeek
          goal={peek}
          doneCount={data.counts.get(peek.id) ?? 0}
          onOpen={() => navigate(`/metas/${peek.id}`)}
          onClose={closePeek}
        />
      )}
    </div>
  )
}

/**
 * Detalle "peek" que morphea desde la tarjeta (Blendy FLIP). El `data-blendy-to`
 * debe tener un ÚNICO hijo wrapper (Blendy accede a `children[0]`).
 */
function GoalPeek({
  goal,
  doneCount,
  onOpen,
  onClose,
}: {
  goal: Goal
  doneCount: number
  onOpen: () => void
  onClose: () => void
}) {
  const template = getTemplate(goal.templateKey)
  const niche = getNiche(goal.area)
  const milestones = template.milestones
  const stage = clampedStage(goal.currentMilestone, milestones.length)
  const pathComplete = isPathComplete(goal.currentMilestone, milestones.length)
  const deadline =
    isGoalClosed(goal.status) || pathComplete ? null : relativeDeadline(goal.targetDate)
  const showProgress =
    (goal.status === 'active' || goal.status === 'paused') && milestones.length > 1

  return (
    <div className="goal-peek-backdrop" onClick={onClose}>
      <div data-blendy-to={bid(goal.id)}>
        <div className="goal-peek" onClick={(e) => e.stopPropagation()}>
          <div className="goal-card__top">
            <span className="goal-card__emoji" aria-hidden="true">{template.emoji}</span>
            <span className="goal-card__title">{goal.title}</span>
          </div>
          <div className="row wrap" style={{ rowGap: 6 }}>
            <span className="tag">
              <span aria-hidden="true">{niche.emoji}</span> {niche.label}
            </span>
            {deadline && (
              <span className="faint tiny row row--sm" style={{ alignItems: 'center', gap: 4 }}>
                <IconCalendar size={12} /> {deadline}
              </span>
            )}
            {doneCount > 0 && (
              <span className="faint tiny">
                · {doneCount} {doneCount === 1 ? 'acción hecha' : 'acciones hechas'}
              </span>
            )}
          </div>
          {goal.why && <p className="small muted">Porque {goal.why}</p>}
          {showProgress && (
            <div className="stack stack--sm">
              <div className="progress">
                <div
                  className="progress__bar"
                  style={{ width: `${Math.round((stage / milestones.length) * 100)}%` }}
                />
              </div>
              <span className="faint tiny">
                {pathComplete ? 'Camino completo' : `Etapa ${stage + 1} de ${milestones.length}`}
              </span>
            </div>
          )}
          <button className="btn btn--primary btn--block" onClick={onOpen}>
            Abrir meta
          </button>
          <button className="btn--link" style={{ alignSelf: 'center' }} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
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
  const milestones = template.milestones
  const stage = clampedStage(goal.currentMilestone, milestones.length)
  const pathComplete = isPathComplete(goal.currentMilestone, milestones.length)
  // No mostramos deadline (ni "vencida") en metas cerradas NI con el camino completo.
  const deadline =
    isGoalClosed(goal.status) || pathComplete ? null : relativeDeadline(goal.targetDate)
  const badge = STATUS_BADGE[goal.status]
  const dimmed = isGoalClosed(goal.status)
  const showProgress =
    (goal.status === 'active' || goal.status === 'paused') && milestones.length > 1

  return (
    <button
      type="button"
      className="goal-card"
      onClick={onClick}
      aria-label={`Ver meta: ${goal.title}`}
      style={dimmed ? { opacity: 0.7 } : undefined}
    >
      <div className="goal-card__top">
        <span className="goal-card__emoji" aria-hidden="true">{template.emoji}</span>
        <span className="goal-card__title nowrap-ellipsis">{goal.title}</span>
        {badge && <span className="tag">{badge}</span>}
      </div>
      <div className="row wrap" style={{ rowGap: 6 }}>
        <span className="tag">
          <span aria-hidden="true">{niche.emoji}</span> {niche.label}
        </span>
        {deadline && (
          <span className="faint tiny row row--sm" style={{ alignItems: 'center', gap: 4 }}>
            <IconCalendar size={12} /> {deadline}
          </span>
        )}
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
            {pathComplete
              ? 'Camino completo'
              : `Etapa ${stage + 1} de ${milestones.length}`}
          </span>
        </div>
      )}
    </button>
  )
}
