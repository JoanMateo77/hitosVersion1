import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Goal, Milestone, Session } from '@/lib/types'
import { getGoal } from '@/services/goals'
import { listMilestones, setMilestoneDone } from '@/services/milestones'
import {
  finishSession,
  getSession,
  pauseSession,
  resumeSession,
  startSession,
} from '@/services/sessions'
import { elapsedSeconds, formatClock, isTimeReached, pickSuggestion, remainingSeconds } from '@/domain/sessions'
import { getTemplate } from '@/domain/templates'
import { formatTime12, todayISO } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SessionRing } from '@/components/SessionRing'
import {
  IconBack,
  IconCelebrate,
  IconCheck,
  IconLightbulb,
  IconPause,
  IconPlay,
} from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'


interface ResolutionOptionsProps {
  title: string
  hint?: string
  isTime: boolean
  unit: string | null
  target: number
  defaultPartial: number
  saving: boolean
  partialValue: number | null
  onPartialChange: (v: number | null) => void
  onFinish: (status: 'done' | 'partial' | 'missed', actualValue: number) => void
}

/** Panel de cierre honesto, compartido por vencida / sin confirmar / anticipado. */
function ResolutionOptions({
  title,
  hint,
  isTime,
  unit,
  target,
  defaultPartial,
  saving,
  partialValue,
  onPartialChange,
  onFinish,
}: ResolutionOptionsProps) {
  const step = isTime ? 5 : 1
  return (
    <div className="stack stack--sm" style={{ width: '100%' }}>
      <h2 style={{ fontSize: 'var(--fs-lg)', textAlign: 'center' }}>{title}</h2>
      {hint && <p className="small muted center">{hint}</p>}
      <button className="btn btn--primary btn--block" disabled={saving} onClick={() => onFinish('done', target)}>
        <IconCheck size={16} /> La completé
      </button>
      {partialValue === null ? (
        <button className="btn btn--ghost btn--block" disabled={saving} onClick={() => onPartialChange(defaultPartial)}>
          Hice una parte…
        </button>
      ) : (
        <div className="card card--tight stack stack--sm" style={{ alignItems: 'center' }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <button
              type="button"
              className="iconbtn"
              aria-label="Restar"
              onClick={() => onPartialChange(Math.max(step, partialValue - step))}
            >
              −
            </button>
            <strong style={{ minWidth: 90, textAlign: 'center', fontSize: 'var(--fs-lg)' }}>
              {partialValue} {isTime ? 'min' : unit ?? ''}
            </strong>
            <button
              type="button"
              className="iconbtn"
              aria-label="Sumar"
              onClick={() => onPartialChange(Math.min(Math.max(step, target - step), partialValue + step))}
            >
              +
            </button>
          </div>
          <button className="btn btn--primary btn--sm" disabled={saving} onClick={() => onFinish('partial', partialValue)}>
            Guardar parcial
          </button>
        </div>
      )}
      <button className="btn btn--subtle btn--block" disabled={saving} onClick={() => onFinish('missed', 0)}>
        Hoy no pude
      </button>
      <p className="faint tiny center">Decir “no pude” no rompe nada: mañana se empieza de nuevo.</p>
    </div>
  )
}

/**
 * La sesión en vivo: cronómetro (tiempo) o contador (cantidad), pausa real por
 * timestamps, y el cierre honesto "¿cómo te fue?" cuando venció sin confirmar.
 */
export function SessionRun() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const today = todayISO()

  const [session, setSession] = useState<Session | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => new Date())
  /** Contador local para sesiones de cantidad (se persiste al cerrar). */
  const [count, setCount] = useState(0)
  /** Sub-panel "hice una parte": null = oculto. */
  const [partialValue, setPartialValue] = useState<number | null>(null)
  /** Hoja de cierre anticipado ("Terminé" antes del objetivo). */
  const [earlyFinish, setEarlyFinish] = useState(false)
  /** Objetivo cumplido pero el usuario quiere seguir: el reloj cuenta hacia arriba. */
  const [keepGoing, setKeepGoing] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  /** Tras guardar el cierre: ofrecer marcar la etapa actual (sesión → etapa). */
  const [finishedStatus, setFinishedStatus] = useState<'done' | 'partial' | null>(null)

  useEffect(() => {
    let active = true
    const id = sessionId ?? ''
    getSession(id)
      .then(async (s) => {
        if (!s) {
          if (active) setLoading(false)
          return
        }
        const [g, ms] = await Promise.all([getGoal(s.goalId), listMilestones(s.goalId)])
        if (!active) return
        setSession(s)
        setGoal(g)
        setMilestones(ms)
        setCount(s.actualValue ?? 0)
        setLoading(false)
      })
      .catch(() => {
        if (active) setError('No pudimos cargar la sesión. Inténtalo de nuevo.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [sessionId])

  // Tick del reloj: solo cuando hay un cronómetro visible avanzando. Recalcula
  // desde timestamps (cerrar la app no lo rompe). Se detiene al cumplir el
  // objetivo o al abrir un panel de cierre (ahí no hay reloj que mover).
  const ticking =
    session !== null &&
    session.status === 'running' &&
    !session.pausedAt &&
    session.targetKind === 'time' &&
    session.date === todayISO() &&
    (!isTimeReached(session, now) || keepGoing) &&
    !earlyFinish
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [ticking])

  // Auto-arranque desde la tarjeta (▶ en Hoy llega con ?start=1).
  const autostarted = useRef(false)
  useEffect(() => {
    if (!session || autostarted.current) return
    if (session.status === 'pending' && params.get('start') === '1') {
      autostarted.current = true
      void doStart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  const reachedToday =
    session !== null &&
    !keepGoing &&
    session.status === 'running' &&
    session.date === today &&
    isTimeReached(session, now)

  // Vibración corta al cumplir el objetivo (si el dispositivo lo soporta).
  const vibrated = useRef(false)
  useEffect(() => {
    if (reachedToday && !vibrated.current) {
      vibrated.current = true
      navigator.vibrate?.(30)
    }
  }, [reachedToday])

  if (loading) return <LoadingScreen />
  if (error) return <LoadingScreen error={error} />
  if (!session) return <Navigate to="/" replace />
  if (!goal) return <Navigate to="/" replace />

  const template = getTemplate(goal.templateKey)
  const currentMilestone = milestones.find((m) => m.doneAt === null) ?? null
  const suggestion = pickSuggestion(template, goal.id, today)
  const isTime = session.targetKind === 'time'
  const targetLabel = isTime ? `${session.targetValue} min` : `${session.targetValue} ${session.unit ?? ''}`.trim()
  const elapsed = elapsedSeconds(session, now)
  /** Minutos trabajados redondeados, mínimo 1 si llegó a arrancar. */
  const elapsedMinutes = Math.max(session.startedAt ? 1 : 0, Math.round(elapsed / 60))
  const partialStep = isTime ? 5 : 1
  const defaultPartial = isTime
    ? Math.min(Math.max(5, elapsedMinutes), Math.max(partialStep, session.targetValue - partialStep))
    : Math.max(1, Math.min(count || 1, session.targetValue - 1))
  // Cierre pendiente de confirmación: quedó sin confirmar, o corriendo de otro día.
  const needsResolution =
    session.status === 'unconfirmed' || (session.status === 'running' && session.date < today)
  const closed = ['done', 'partial', 'missed'].includes(session.status)

  async function doStart() {
    setSaving(true)
    try {
      const updated = await startSession(session!.userId, session!.id)
      setSession(updated)
      setNow(new Date())
    } catch {
      setError('No se pudo comenzar la sesión. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function doPause() {
    if (!session) return
    setSaving(true)
    try {
      setSession(await pauseSession(session.id, new Date().toISOString()))
    } catch {
      /* sin red: el reloj sigue por timestamps, no es crítico */
    } finally {
      setSaving(false)
    }
  }

  async function doResume() {
    if (!session?.pausedAt) return
    setSaving(true)
    const accumulated =
      session.pausedTotalSeconds +
      Math.max(0, Math.floor((Date.now() - new Date(session.pausedAt).getTime()) / 1000))
    try {
      setSession(await resumeSession(session.userId, session.id, accumulated))
      setNow(new Date())
    } catch {
      /* idem pausa */
    } finally {
      setSaving(false)
    }
  }

  async function finish(status: 'done' | 'partial' | 'missed', actualValue: number) {
    if (!session) return
    setSaving(true)
    try {
      await finishSession(session.id, { status, actualValue })
      // Conexión sesión → etapa: si hubo trabajo real y hay una etapa en curso,
      // ofrecemos marcarla antes de volver. "No pude" vuelve directo.
      if (status !== 'missed' && currentMilestone) {
        setFinishedStatus(status)
        setSaving(false)
      } else {
        navigate('/', { replace: true })
      }
    } catch {
      setError('No se pudo guardar el cierre. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  async function completeMilestoneAndLeave() {
    if (!currentMilestone) return navigate('/', { replace: true })
    setSaving(true)
    await setMilestoneDone(currentMilestone.id, true).catch(() => {})
    navigate('/', { replace: true })
  }

  return (
    <div
      className="screen screen--full flow-screen"
      style={{ ...nicheAccent(goal.area), width: '100%', maxWidth: 560, margin: '0 auto' }}
    >
      <div className="row" style={{ marginBottom: 'var(--s4)' }}>
        <button className="iconbtn" onClick={() => navigate('/')} aria-label="Volver a tu día">
          <IconBack />
        </button>
      </div>

      <div className="stack stack--lg center" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <span className="kicker row row--sm" style={{ alignItems: 'center' }}>
          <NicheGlyph area={goal.area} size="sm" />
          {goal.title} · {targetLabel}
        </span>

        {finishedStatus && currentMilestone ? (
          <div className="stack stack--sm center" style={{ width: '100%', alignItems: 'center' }}>
            <span className="empty__icon" style={{ width: 56, height: 56 }}>
              <IconCheck size={26} />
            </span>
            <h2 style={{ fontSize: 'var(--fs-lg)', textAlign: 'center' }}>
              {finishedStatus === 'done' ? 'Sesión cumplida' : 'Parcial guardado'}
            </h2>
            <p className="small muted center" style={{ maxWidth: 360 }}>
              ¿Completaste la etapa “{currentMilestone.title}”?
            </p>
            <button className="btn btn--primary btn--block" disabled={saving} onClick={() => void completeMilestoneAndLeave()}>
              Sí, cumplida
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => navigate('/', { replace: true })}>
              Aún no
            </button>
          </div>
        ) : (
          <>
        {!needsResolution && !closed && (
          <div className="stack stack--sm center" style={{ alignItems: 'center', width: '100%' }}>
            {currentMilestone && (
              <div
                className="focus-card stack"
                style={{ width: '100%', textAlign: 'center', gap: 4, padding: 'var(--s3) var(--s4)' }}
              >
                <span className="focus-card__kicker" style={{ justifyContent: 'center' }}>
                  Estás construyendo
                </span>
                <strong
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-xl)',
                    lineHeight: 1.25,
                  }}
                >
                  {currentMilestone.title}
                </strong>
              </div>
            )}
            <span className="tag" style={{ fontSize: 'var(--fs-sm)', padding: '6px 12px' }}>
              <IconLightbulb size={13} /> {suggestion}
            </span>
          </div>
        )}

        {/* --- Cierre pendiente (otro día / sin confirmar) --- */}
        {needsResolution && (
          <ResolutionOptions
            title={`Tu sesión de ${goal.title} quedó abierta`}
            hint={
              session.startedAt
                ? `La comenzaste ${session.date === today ? 'hoy' : `el ${session.date}`} · objetivo ${targetLabel}`
                : undefined
            }
            isTime={isTime}
            unit={session.unit}
            target={session.targetValue}
            defaultPartial={defaultPartial}
            saving={saving}
            partialValue={partialValue}
            onPartialChange={setPartialValue}
            onFinish={(st, v) => void finish(st, v)}
          />
        )}

        {/* --- Objetivo cumplido con la app abierta --- */}
        {!needsResolution && reachedToday && (
          <>
            <SessionRing progress={1}>
              <IconCelebrate size={34} style={{ color: 'var(--primary)' }} />
              <span className="small muted">{targetLabel} cumplidos</span>
            </SessionRing>
            <button
              className="btn btn--ghost btn--block"
              onClick={() => setKeepGoing(true)}
            >
              Seguir un rato más
            </button>
            <ResolutionOptions
              title="¡Lo lograste!"
              isTime={isTime}
            unit={session.unit}
            target={session.targetValue}
            defaultPartial={defaultPartial}
            saving={saving}
            partialValue={partialValue}
            onPartialChange={setPartialValue}
            onFinish={(st, v) => void finish(st, v)}
            />
          </>
        )}

        {/* --- Pendiente: por comenzar --- */}
        {!needsResolution && !reachedToday && session.status === 'pending' && (
          <>
            <SessionRing progress={0}>
              <strong style={{ fontSize: 'var(--fs-2xl, 28px)' }}>{targetLabel}</strong>
              {session.plannedTime && <span className="small muted">{formatTime12(session.plannedTime)}</span>}
            </SessionRing>
            {goal.why && <p className="small muted center" style={{ maxWidth: 360 }}>“{goal.why}”</p>}
            <button className="btn btn--primary btn--block" disabled={saving} onClick={doStart}>
              <IconPlay size={16} /> Comenzar
            </button>
          </>
        )}

        {/* --- En curso: tiempo --- */}
        {!needsResolution && !reachedToday && session.status === 'running' && isTime && (
          <>
            <SessionRing progress={keepGoing ? 1 : elapsed / (session.targetValue * 60)}>
              <strong className="ring__time">
                {keepGoing ? formatClock(elapsed) : formatClock(remainingSeconds(session, now))}
              </strong>
              <span className="small muted">
                {keepGoing ? `ya superaste tus ${targetLabel}` : `de ${targetLabel}`}
              </span>
            </SessionRing>
            {goal.why && <p className="small muted center" style={{ maxWidth: 360 }}>“{goal.why}”</p>}
            {!earlyFinish ? (
              <div className="row" style={{ width: '100%' }}>
                {session.pausedAt ? (
                  <button className="btn btn--ghost" style={{ flex: 1 }} disabled={saving} onClick={doResume}>
                    <IconPlay size={14} /> Reanudar
                  </button>
                ) : (
                  <button className="btn btn--ghost" style={{ flex: 1 }} disabled={saving} onClick={doPause}>
                    <IconPause size={15} /> Pausar
                  </button>
                )}
                <button
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  disabled={saving}
                  onClick={() => (keepGoing ? void finish('done', elapsedMinutes) : setEarlyFinish(true))}
                >
                  <IconCheck size={16} /> Terminé
                </button>
              </div>
            ) : (
              <ResolutionOptions
                title="¿Cómo cierro la sesión?"
                hint={`Llevas ${elapsedMinutes} min de ${session.targetValue}.`}
                isTime={isTime}
            unit={session.unit}
            target={session.targetValue}
            defaultPartial={defaultPartial}
            saving={saving}
            partialValue={partialValue}
            onPartialChange={setPartialValue}
            onFinish={(st, v) => void finish(st, v)}
              />
            )}
          </>
        )}

        {/* --- En curso: cantidad --- */}
        {!needsResolution && session.status === 'running' && !isTime && (
          <>
            <SessionRing progress={count / session.targetValue}>
              <strong className="ring__time">{count}</strong>
              <span className="small muted">de {session.targetValue} {session.unit ?? ''}</span>
            </SessionRing>
            <div className="row" style={{ alignItems: 'center', gap: 'var(--s4)' }}>
              <button
                type="button"
                className="iconbtn"
                style={{ width: 56, height: 56, fontSize: 24 }}
                aria-label="Restar uno"
                onClick={() => setCount((c) => Math.max(0, c - 1))}
              >
                −
              </button>
              <button
                type="button"
                className="iconbtn"
                style={{ width: 56, height: 56, fontSize: 24 }}
                aria-label="Sumar uno"
                onClick={() => setCount((c) => c + 1)}
              >
                +
              </button>
            </div>
            <button
              className="btn btn--primary btn--block"
              disabled={saving}
              onClick={() => {
                if (count >= session.targetValue) void finish('done', count)
                else if (count > 0) void finish('partial', count)
                else void finish('missed', 0)
              }}
            >
              <IconCheck size={16} /> Terminé
            </button>
          </>
        )}

        {/* --- Ya cerrada (llegó por URL) --- */}
        {closed && (
          <div className="stack stack--sm center" style={{ alignItems: 'center' }}>
            <p className="muted">Esta sesión ya está cerrada.</p>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
              Volver a tu día
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}
