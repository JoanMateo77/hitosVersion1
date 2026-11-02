import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBlendy, type Blendy } from 'blendy'
import { useSession } from '@/app/session'
import { listGoals } from '@/services/goals'
import { updatePriorityGoal } from '@/services/profile'
import { milestoneProgressByGoal } from '@/services/milestones'
import { isGoalClosed } from '@/domain/goals'
import { daysUntil, relativeDeadline } from '@/lib/date'
import { formatPercent } from '@/lib/format'
import { coverAccent, goalAccent, goalTone } from '@/lib/goalAccent'
import { withViewTransition } from '@/lib/viewTransition'
import type { Goal, GoalStatus } from '@/lib/types'
import { useCachedData } from '@/hooks/useCachedData'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconChevronRight, IconPlus, IconStar } from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'
import { GoalCover } from '@/components/GoalCover'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { PathIllustration } from '@/components/PathIllustration'

/** Orden de presentación por estado: lo activo primero. */
const STATUS_ORDER: Record<GoalStatus, number> = {
  active: 0,
  paused: 1,
  done: 2,
  archived: 3,
}

const STATUS_BADGE: Partial<Record<GoalStatus, string>> = {
  paused: 'Pausada',
  done: 'Lograda',
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
  const { userId, profile, setProfile } = useSession()
  const navigate = useNavigate()

  const { data, loading, error } = useCachedData(
    `goals:${userId}`,
    async () => {
      const [goals, progress] = await Promise.all([
        listGoals(userId),
        milestoneProgressByGoal(userId),
      ])
      return { goals, progress }
    },
    [userId],
  )

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

  async function togglePriority(goal: Goal) {
    const next = profile.priorityGoalId === goal.id ? null : goal.id
    try {
      setProfile(await updatePriorityGoal(userId, next))
    } catch {
      /* no crítico */
    }
  }

  function openGoal(goal: Goal) {
    // Reduced-motion o Blendy no listo: directo al detalle completo (como antes).
    if (reducedMotion.current || !blendyRef.current) {
      withViewTransition(() => navigate(`/metas/${goal.id}`))
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
        progress={data.progress.get(goal.id)}
        isPriority={profile.priorityGoalId === goal.id}
        onTogglePriority={goal.status === 'active' ? () => void togglePriority(goal) : undefined}
        onClick={() => openGoal(goal)}
      />
    </li>
  )

  return (
    <div className="screen">
      <header className="row row--between screen__header">
        <h1 className="screen__title">Tus metas</h1>
        <button
          type="button"
          className="btn btn--primary btn--sm screen__add"
          aria-label="Nueva meta"
          onClick={() => navigate('/meta/nueva')}
        >
          <IconPlus size={18} /> Nueva
        </button>
      </header>

      {goals.length === 0 ? (
        <div className="empty goals-empty">
          <PathIllustration width={200} className="goals-empty__art" />
          <p className="empty__title">Tu primera meta empieza aquí</p>
          <p className="muted" style={{ marginBottom: 'var(--s4)' }}>
            Mira ideas para tu foco y adopta una, o escribe la tuya. La dividimos en etapas.
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
              No tienes metas en marcha ahora.{' '}
              <button
                className="btn--link"
                style={{ padding: 0 }}
                onClick={() => navigate('/meta/nueva')}
              >
                Crea una nueva
              </button>
              .
            </p>
          )}
          {finished.length > 0 && (
            <button
              type="button"
              className="btn--link row row--sm"
              style={{ marginTop: 'var(--s5)', alignSelf: 'flex-start', padding: 0, alignItems: 'center' }}
              onClick={() => navigate('/progreso')}
            >
              Ver {finished.length}{' '}
              {finished.length === 1 ? 'meta lograda o archivada' : 'metas logradas o archivadas'} en
              Progreso <IconChevronRight size={14} />
            </button>
          )}
        </>
      )}

      {peek && (
        <GoalPeek
          goal={peek}
          nextTitle={data.progress.get(peek.id)?.nextTitle ?? null}
          onOpen={() => withViewTransition(() => navigate(`/metas/${peek.id}`))}
          onClose={closePeek}
        />
      )}
    </div>
  )
}

/**
 * Detalle "peek" que morphea desde la tarjeta (Blendy FLIP). El `data-blendy-to`
 * debe tener un ÚNICO hijo wrapper (Blendy accede a `children[0]`).
 *
 * Es un <dialog> nativo abierto con showModal(): el navegador vuelve inerte el
 * resto de la página y atrapa el foco. Escape (evento `cancel`) y el clic en el
 * fondo (el propio <dialog>, fuera de la tarjeta) cierran con la animación de
 * vuelta; al cerrarse el foco vuelve a la tarjeta que lo abrió.
 * No usa <Sheet>: la hoja entra desde abajo y rompería el morph desde la tarjeta.
 */
function GoalPeek({
  goal,
  nextTitle,
  onOpen,
  onClose,
}: {
  goal: Goal
  nextTitle: string | null
  onOpen: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // El cierre se lee desde un ref para abrir el diálogo UNA vez por montaje.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // useLayoutEffect del hijo corre antes que el del padre: el diálogo ya está en
  // el top layer (y medible) cuando Goals dispara el morph de Blendy.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (!dialog.open) dialog.showModal()

    function onCancel(e: Event) {
      // Escape: cerramos nosotros para animar de vuelta a la tarjeta.
      e.preventDefault()
      onCloseRef.current()
    }
    function onBackdropClick(e: MouseEvent) {
      // Solo el fondo: los clics dentro de la tarjeta tienen otro target.
      if (e.target === dialog) onCloseRef.current()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('click', onBackdropClick)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('click', onBackdropClick)
      if (dialog.open) dialog.close()
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <dialog ref={dialogRef} className="goal-peek-backdrop" aria-label={goal.title}>
      <div data-blendy-to={bid(goal.id)}>
        {/* El peek es la tarjeta de color agrandada; su view-transition-name es el
            mismo que la cabecera del detalle, así "Abrir meta" la convierte en ella. */}
        <div
          className="goal-peek fc-card"
          style={{ ...goalAccent(goal), viewTransitionName: `goal-${goal.id}` } as CSSProperties}
        >
          <div className="goal-card__top">
            <NicheGlyph area={goal.area} tone={goalTone(goal)} size="md" />
            <span className="fc-card__title goal-card__title">{goal.title}</span>
          </div>
          {nextTitle && (
            <p className="fc-card__meta" style={{ margin: 0 }}>
              Siguiente: {nextTitle}
            </p>
          )}
          <button type="button" className="btn btn--primary btn--block" onClick={onOpen}>
            Abrir meta
          </button>
          <button type="button" className="btn--link goal-peek__close" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}

/** Estado de la meta en una palabra, solo cuando aporta (verde = al día, ámbar = atrasada). */
function goalState(goal: Goal, pathComplete: boolean): { tone: 'ok' | 'late' | 'neutral'; label: string } | null {
  const badge = STATUS_BADGE[goal.status]
  if (badge) return { tone: goal.status === 'done' ? 'ok' : 'neutral', label: badge }
  if (pathComplete) return { tone: 'ok', label: 'Camino completo' }
  if (goal.targetDate && daysUntil(goal.targetDate) < 0) return { tone: 'late', label: 'Vencida' }
  return null
}

function GoalCard({
  goal,
  progress,
  isPriority = false,
  onTogglePriority,
  onClick,
}: {
  goal: Goal
  progress?: { done: number; total: number }
  isPriority?: boolean
  onTogglePriority?: () => void
  onClick: () => void
}) {
  const progressDone = progress?.done ?? 0
  const progressTotal = progress?.total ?? 0
  const pathComplete = progressTotal > 0 && progressDone >= progressTotal
  const closed = isGoalClosed(goal.status)
  const deadline = closed || pathComplete ? null : relativeDeadline(goal.targetDate)
  const overdue = deadline !== null && goal.targetDate !== null && daysUntil(goal.targetDate) < 0
  const showProgress = (goal.status === 'active' || goal.status === 'paused') && progressTotal > 1
  const pct = Math.round((progressDone / Math.max(1, progressTotal)) * 100)
  const state = goalState(goal, pathComplete)
  // Una sola línea de contexto: "2 de 5 etapas · faltan 6 semanas". "Vencida" ya
  // lo dice el chip de estado, así que no se repite aquí.
  const stageWord = progressTotal === 1 ? 'etapa' : 'etapas'
  const metaLine = [
    progressTotal > 0 ? `${progressDone} de ${progressTotal} ${stageWord}` : null,
    overdue ? null : deadline,
  ]
    .filter(Boolean)
    .join(' · ')

  const stateClass = state && state.tone !== 'neutral' ? `chip-state chip-state--${state.tone}` : 'chip-state'
  // Portada en la tarjeta solo si la persona lo pidió; la tinta pasa a blanco sobre la foto.
  const coverUrl = useCoverUrl(goal.coverOnCard ? goal.coverPath : null)
  const accent = coverUrl ? coverAccent(goal) : goalAccent(goal)

  return (
    <div className={`goal-card-wrap${closed ? ' goal-card-wrap--closed' : ''}`}>
      <button
        type="button"
        className={`fc-card goal-card${coverUrl ? ' fc-cover' : ''}`}
        onClick={onClick}
        style={accent}
      >
        {coverUrl && <GoalCover url={coverUrl} />}
        {/* Banda superior: ícono a la izquierda, patrón del área al centro y la
            estrella (hermana, superpuesta) a la derecha. El título va debajo
            a todo el ancho, así nunca choca con el patrón. */}
        <span className="goal-card__top">
          <NicheGlyph area={goal.area} tone={goalTone(goal)} size="md" />
        </span>
        <span className="fc-card__title goal-card__title">{goal.title}</span>
        {(metaLine || state) && (
          <span className="goal-card__meta">
            {metaLine && <span className="fc-card__meta">{metaLine}</span>}
            {state && (
              <span className={stateClass}>
                {state.label}
              </span>
            )}
          </span>
        )}
        {showProgress && (
          <span className="goal-card__prog">
            <span className="progress" aria-hidden="true">
              <span className="progress__bar" style={{ width: `${pct}%` }} />
            </span>
            <span className="goal-card__pct">{formatPercent(pct)}</span>
          </span>
        )}
      </button>
      {onTogglePriority && (
        <button
          type="button"
          aria-pressed={isPriority}
          aria-label={isPriority ? `Quitar prioridad: ${goal.title}` : `Marcar como prioritaria: ${goal.title}`}
          className={`goal-card__star${isPriority ? ' goal-card__star--on' : ''}`}
          style={accent}
          onClick={onTogglePriority}
        >
          <IconStar size={18} style={isPriority ? { fill: 'currentColor' } : undefined} />
        </button>
      )}
    </div>
  )
}
