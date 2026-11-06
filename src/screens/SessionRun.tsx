import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { CalendarEvent, Goal, Milestone, Session } from '@/lib/types'
import { getGoal } from '@/services/goals'
import { listMilestones, setMilestoneDone } from '@/services/milestones'
import { createEvent, listEventsInRange, setEventDone } from '@/services/events'
import {
  finishSession,
  getSession,
  pauseSession,
  resumeSession,
  setSessionAccomplishment,
  startSession,
} from '@/services/sessions'
import {
  appendAccomplishment,
  elapsedSeconds,
  formatClock,
  isTimeReached,
  pickSuggestion,
  remainingSeconds,
} from '@/domain/sessions'
import { getTemplate } from '@/domain/templates'
import { formatTime12, todayISO } from '@/lib/date'
import { goalAccent, goalTone } from '@/lib/goalAccent'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SessionRing } from '@/components/SessionRing'
import { Disclosure } from '@/components/Disclosure'
import { Hint } from '@/components/Hint'
import {
  IconCelebrate,
  IconCheck,
  IconChevronLeft,
  IconLightbulb,
  IconPause,
  IconPlay,
} from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'
import '@/styles/session-plan.css'

/** Orden del plan: por hora ascendente; sin hora al final; empates estables. */
function comparePlanItems(a: CalendarEvent, b: CalendarEvent): number {
  if (a.startTime !== b.startTime) {
    if (a.startTime === null) return 1
    if (b.startTime === null) return -1
    return a.startTime < b.startTime ? -1 : 1
  }
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

/** Cómo se cierra una sesión: cumplida, a medias o "hoy no pude". */
type Outcome = 'done' | 'partial' | 'missed'

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
  onFinish: (status: Outcome, actualValue: number) => void
  /** Solo con la sesión abierta o al cerrarla antes de tiempo: bajo "¡Lo lograste!" no se consuela. */
  showMissedHint?: boolean
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
  showMissedHint = false,
}: Readonly<ResolutionOptionsProps>) {
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
      {showMissedHint && (
        <Hint id="session-no-pude-2026-09">Decir “no pude” no rompe nada: mañana se empieza de nuevo.</Hint>
      )}
    </div>
  )
}

/**
 * La sesión en vivo: cronómetro (tiempo) o contador (cantidad), pausa real por
 * timestamps, y el cierre honesto "¿cómo te fue?" cuando venció sin confirmar.
 */
/** "Plan · 2 de 3" (o solo "Plan" si aún no hay pasos). */
function planSummary(items: CalendarEvent[]): string {
  if (items.length === 0) return 'Plan'
  return `Plan · ${items.filter((e) => e.doneAt !== null).length} de ${items.length}`
}

/** El plan de esta sesión: lo agendado para esta meta hoy, tachable, y sumar algo más. */
function SessionPlan({
  items,
  status,
  closed,
  suggestion,
  notice,
  draft,
  draftTime,
  adding,
  onDraft,
  onDraftTime,
  onAdd,
  onToggle,
}: Readonly<{
  items: CalendarEvent[]
  status: Session['status']
  closed: boolean
  suggestion: string
  notice: string | null
  draft: string
  draftTime: string
  adding: boolean
  onDraft: (value: string) => void
  onDraftTime: (value: string) => void
  onAdd: (e: FormEvent) => void
  onToggle: (item: CalendarEvent) => void
}>) {
  return (
    <section className="session-plan" aria-label="El plan de esta sesión">
      <Disclosure
        summary={planSummary(items)}
        defaultOpen={status !== 'running'}
      >
        {status === 'pending' && (
          <p className="small muted row row--sm" style={{ alignItems: 'center', marginBottom: 'var(--s3)' }}>
            <IconLightbulb size={13} /> <span>Idea: {suggestion}</span>
          </p>
        )}
        {notice && (
          <div className="alert alert--warn" role="alert" style={{ marginBottom: 'var(--s3)' }}>
            {notice}
          </div>
        )}
        <ul className="session-plan__list">
          {items.map((e) => {
            const done = e.doneAt !== null
            const noteLine = e.notes?.split('\n')[0].trim() || null
            return (
              <li key={e.id} className="session-plan__item">
                <button
                  type="button"
                  className={`session-plan__check${done ? ' session-plan__check--done' : ''}`}
                  aria-pressed={done}
                  aria-label={`${done ? 'Desmarcar' : 'Marcar'} ${e.title}`}
                  disabled={closed}
                  onClick={() => onToggle(e)}
                >
                  {done && <IconCheck size={12} />}
                </button>
                <span className="session-plan__time">
                  {e.startTime ? formatTime12(e.startTime) : '—'}
                </span>
                <span className={`session-plan__text${done ? ' session-plan__text--done' : ''}`}>
                  <span className="session-plan__name">{e.title}</span>
                  {noteLine && <span className="session-plan__note">{noteLine}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        {!closed && (
          <form className="session-plan__add" onSubmit={onAdd}>
            <input
              className="input session-plan__add-title"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder="Agregar al plan…"
              maxLength={200}
              aria-label="Agregar algo al plan de esta sesión"
            />
            <input
              type="time"
              className="input session-plan__add-time"
              value={draftTime}
              onChange={(e) => onDraftTime(e.target.value)}
              aria-label="Hora (opcional)"
            />
            <button
              type="submit"
              className="btn btn--sm"
              disabled={!draft.trim() || adding}
            >
              Sumar
            </button>
          </form>
        )}
      </Disclosure>
    </section>
  )
}

/** La sesión ya estaba cerrada al llegar (por URL). */
function ClosedNote({ skipped, onHome }: Readonly<{ skipped: boolean; onHome: () => void }>) {
  return (
    <div className="stack stack--sm center" style={{ alignItems: 'center' }}>
      <p className="muted">
        {skipped
          ? 'Saltaste esta sesión; tu racha no se rompe. Si quieres hacerla, deshaz el salto desde la Agenda.'
          : 'Esta sesión ya está cerrada.'}
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onHome}>
        Volver a tu día
      </button>
    </div>
  )
}

/** Cierre de una sesión de cantidad: hecho si llegó al objetivo, parcial si hizo algo, no hecho si nada. */
function countOutcome(count: number, target: number): Outcome {
  if (count >= target) return 'done'
  return count > 0 ? 'partial' : 'missed'
}

/** Sesión de cantidad en curso: contador con − y + y "Terminé". */
function CountRunner({
  count,
  target,
  unit,
  saving,
  onCount,
  onFinish,
}: Readonly<{
  count: number
  target: number
  unit: string | null
  saving: boolean
  onCount: (value: number) => void
  onFinish: (status: Outcome, value: number) => void
}>) {
  return (
    <>
      <SessionRing progress={count / target}>
        <strong className="ring__time">{count}</strong>
        <span className="small muted">de {target} {unit ?? ''}</span>
      </SessionRing>
      <div className="row" style={{ alignItems: 'center', gap: 'var(--s4)' }}>
        <button
          type="button"
          className="iconbtn"
          style={{ width: 56, height: 56, fontSize: 24 }}
          aria-label="Restar uno"
          onClick={() => onCount(Math.max(0, count - 1))}
        >
          −
        </button>
        <button
          type="button"
          className="iconbtn"
          style={{ width: 56, height: 56, fontSize: 24 }}
          aria-label="Sumar uno"
          onClick={() => onCount(count + 1)}
        >
          +
        </button>
      </div>
      <button
        className="btn btn--primary btn--block"
        disabled={saving}
        onClick={() => onFinish(countOutcome(count, target), count)}
      >
        <IconCheck size={16} /> Terminé
      </button>
    </>
  )
}

/** Tras guardar el cierre: nota de avance y, si hay, marcar la etapa. */
function SessionFinished({
  status,
  note,
  milestone,
  saving,
  onNote,
  onComplete,
  onLeave,
}: Readonly<{
  status: 'done' | 'partial'
  note: string
  milestone: Milestone | null
  saving: boolean
  onNote: (value: string) => void
  onComplete: () => void
  onLeave: () => void
}>) {
  return (
    <div className="stack stack--sm center" style={{ width: '100%', alignItems: 'center' }}>
      {/* Logro: disco de estado (verde = cumplido, ámbar = parcial) que entra con un pop. */}
      <span
        className={`session-done__badge${status === 'partial' ? ' session-done__badge--partial' : ''}`}
        aria-hidden="true"
      >
        <IconCheck size={28} />
      </span>
      <h2 style={{ fontSize: 'var(--fs-lg)', textAlign: 'center' }}>
        {status === 'done' ? 'Sesión cumplida' : 'Parcial guardado'}
      </h2>

      {/* Diario de avances: en el futuro podrás recordar cómo llegaste. */}
      <div className="field" style={{ width: '100%', maxWidth: 400, textAlign: 'left' }}>
        <label className="field__label" htmlFor="session-note">
          ¿Qué lograste en este tiempo? (opcional)
        </label>
        <input
          id="session-note"
          className="input"
          placeholder="Ej: terminé el capítulo 3, corrí 5 km…"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          maxLength={200}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="done"
          inputMode="text"
        />
        <span className="field__hint">Queda en tu meta, para ver el camino recorrido.</span>
      </div>

      {milestone ? (
        <>
          <p className="small muted center" style={{ maxWidth: 360 }}>
            ¿Completaste la etapa “{milestone.title}”?
          </p>
          <button className="btn btn--primary btn--block" disabled={saving} onClick={onComplete}>
            Sí, cumplida
          </button>
          <button className="btn btn--ghost btn--block" disabled={saving} onClick={onLeave}>
            Aún no
          </button>
        </>
      ) : (
        <button className="btn btn--primary btn--block" disabled={saving} onClick={onLeave}>
          Guardar y volver
        </button>
      )}
    </div>
  )
}

/** Sesión de tiempo en curso: reloj, avisos, pausar/reanudar y "Terminé". */
function TimeRunner({
  elapsed,
  remaining,
  target,
  targetLabel,
  keepGoing,
  paused,
  why,
  syncNotice,
  awayNotice,
  earlyFinish,
  saving,
  closeOptions,
  onPause,
  onResume,
  onDone,
}: Readonly<{
  elapsed: number
  remaining: number
  target: number
  targetLabel: string
  keepGoing: boolean
  paused: boolean
  why: string | null
  syncNotice: string | null
  /** Solo si el reloj está avanzando (si no, null). */
  awayNotice: string | null
  earlyFinish: boolean
  saving: boolean
  /** Opciones de cierre anticipado ("¿Cómo cierro la sesión?"). */
  closeOptions: ReactNode
  onPause: () => void
  onResume: () => void
  onDone: () => void
}>) {
  return (
    <>
      <SessionRing progress={keepGoing ? 1 : elapsed / (target * 60)}>
        <strong className="ring__time">
          {keepGoing ? formatClock(elapsed) : formatClock(remaining)}
        </strong>
        <span className="small muted">
          {keepGoing ? `ya superaste tus ${targetLabel}` : `de ${targetLabel}`}
        </span>
      </SessionRing>
      {/* La cita del porqué solo en pausa: corriendo, la pantalla respira. */}
      {why && paused && (
        <p className="small muted center" style={{ maxWidth: 360 }}>“{why}”</p>
      )}
      {syncNotice && (
        <div className="alert alert--warn" role="alert" style={{ width: '100%', maxWidth: 360 }}>
          {syncNotice}
        </div>
      )}
      {awayNotice && (
        <p className="small muted center" role="status" style={{ maxWidth: 360 }}>
          {awayNotice}
        </p>
      )}
      {!earlyFinish ? (
        <div className="row" style={{ width: '100%' }}>
          {paused ? (
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={saving} onClick={onResume}>
              <IconPlay size={14} /> Reanudar
            </button>
          ) : (
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={saving} onClick={onPause}>
              <IconPause size={15} /> Pausar
            </button>
          )}
          <button
            className="btn btn--primary"
            style={{ flex: 1 }}
            disabled={saving}
            onClick={onDone}
          >
            <IconCheck size={16} /> Terminé
          </button>
        </div>
      ) : (
        closeOptions
      )}
    </>
  )
}

/** ¿El reloj está avanzando? Solo con un cronómetro visible de hoy, sin pausa ni panel de cierre. */
function isTicking(session: Session | null, now: Date, keepGoing: boolean, earlyFinish: boolean): boolean {
  if (session?.status !== 'running' || session.pausedAt || session.targetKind !== 'time') return false
  if (session.date !== todayISO() || earlyFinish) return false
  return keepGoing || !isTimeReached(session, now)
}

/** ¿Cumplió hoy el objetivo de tiempo con la sesión aún corriendo? */
function isReachedToday(session: Session | null, now: Date, today: string): boolean {
  return session?.status === 'running' && session.date === today && isTimeReached(session, now)
}

/** Valor inicial de "hice una parte": lo trabajado, sin llegar al objetivo. */
function partialDefault(isTime: boolean, step: number, elapsedMinutes: number, count: number, target: number): number {
  if (isTime) return Math.min(Math.max(5, elapsedMinutes), Math.max(step, target - step))
  return Math.max(1, Math.min(count || 1, target - 1))
}

/** "La comenzaste hoy · objetivo 30 min" para una sesión que quedó abierta. */
function openSessionHint(session: Session, today: string, targetLabel: string): string | undefined {
  if (!session.startedAt) return undefined
  const when = session.date === today ? 'hoy' : `el ${session.date}`
  return `La comenzaste ${when} · objetivo ${targetLabel}`
}

/** Sesión por comenzar: objetivo, hora prevista, el porqué y "Comenzar". */
function PendingStart({
  targetLabel,
  plannedTime,
  why,
  saving,
  onStart,
}: Readonly<{ targetLabel: string; plannedTime: string | null; why: string | null; saving: boolean; onStart: () => void }>) {
  return (
    <>
      <SessionRing progress={0}>
        <strong style={{ fontSize: 'var(--fs-2xl, 28px)' }}>{targetLabel}</strong>
        {plannedTime && <span className="small muted">{formatTime12(plannedTime)}</span>}
      </SessionRing>
      {why && <p className="small muted center" style={{ maxWidth: 360 }}>“{why}”</p>}
      <button className="btn btn--primary btn--block" disabled={saving} onClick={onStart}>
        <IconPlay size={16} /> Comenzar
      </button>
    </>
  )
}

/** " · Etapa 2 de 4" mientras quede alguna etapa por cumplir; nada si no. */
function stageNote(milestones: Milestone[]): string | null {
  if (!milestones.some((m) => m.doneAt === null)) return null
  return ` · Etapa ${milestones.filter((m) => m.doneAt !== null).length + 1} de ${milestones.length}`
}

/** "30 min" o "20 páginas": el objetivo de la sesión. */
function sessionTargetLabel(session: Session): string {
  if (session.targetKind === 'time') return `${session.targetValue} min`
  return `${session.targetValue} ${session.unit ?? ''}`.trim()
}

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
  // Fallo no crítico (pausa/reanudar sin red): avisamos sin tirar la pantalla.
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  // Al volver a la pestaña tras >2 min con el reloj corriendo, lo decimos: el
  // tiempo siguió por timestamps y un salto mudo del reloj desconcierta.
  const [awayNotice, setAwayNotice] = useState<string | null>(null)
  const hiddenAt = useRef<number | null>(null)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const away = hiddenAt.current !== null ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (away > 120_000) {
        setNow(new Date())
        setAwayNotice(`El reloj siguió mientras no estabas (+${Math.round(away / 60_000)} min).`)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
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
  /** Tras guardar el cierre: registrar el avance y ofrecer marcar la etapa. */
  const [finishedStatus, setFinishedStatus] = useState<'done' | 'partial' | null>(null)
  /** Diario de avances: qué lograste en esta sesión (opcional). */
  const [note, setNote] = useState('')
  /** El plan de esta sesión: eventos de la agenda del día ligados a la meta. */
  const [planItems, setPlanItems] = useState<CalendarEvent[]>([])
  const [planDraft, setPlanDraft] = useState('')
  const [planDraftTime, setPlanDraftTime] = useState('')
  const [addingPlan, setAddingPlan] = useState(false)
  /** Aviso de "falta migración" al tachar: se muestra una sola vez. */
  const [planNotice, setPlanNotice] = useState<string | null>(null)
  const planNoticeShown = useRef(false)

  useEffect(() => {
    let active = true
    const id = sessionId ?? ''
    getSession(id)
      .then(async (s) => {
        if (!s) {
          if (active) setLoading(false)
          return
        }
        const [g, ms, events] = await Promise.all([
          getGoal(s.goalId),
          listMilestones(s.goalId),
          // El plan es un extra: si falla la carga, la sesión sigue funcionando.
          listEventsInRange(s.userId, s.date, s.date).catch(() => [] as CalendarEvent[]),
        ])
        if (!active) return
        setSession(s)
        setGoal(g)
        setMilestones(ms)
        setPlanItems(events.filter((e) => e.goalId === s.goalId).sort(comparePlanItems))
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
  const ticking = isTicking(session, now, keepGoing, earlyFinish)
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

  const reachedToday = !keepGoing && isReachedToday(session, now, today)

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
  const targetLabel = sessionTargetLabel(session)
  const elapsed = elapsedSeconds(session, now)
  /** Minutos trabajados redondeados, mínimo 1 si llegó a arrancar. */
  const elapsedMinutes = Math.max(session.startedAt ? 1 : 0, Math.round(elapsed / 60))
  const partialStep = isTime ? 5 : 1
  const defaultPartial = partialDefault(isTime, partialStep, elapsedMinutes, count, session.targetValue)
  // Cierre pendiente de confirmación: quedó sin confirmar, o corriendo de otro día.
  const needsResolution =
    session.status === 'unconfirmed' || (session.status === 'running' && session.date < today)
  // Saltada cuenta como cerrada: no se puede empezar (el salto se deshace desde la Agenda).
  const closed = ['done', 'partial', 'missed', 'skipped'].includes(session.status)

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
    setSyncNotice(null)
    setAwayNotice(null)
    try {
      setSession(await pauseSession(session.id, new Date().toISOString()))
    } catch {
      // El reloj sigue corriendo (la pausa no llegó al servidor): que se sepa.
      setSyncNotice('No se pudo pausar (¿sin conexión?). Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function doResume() {
    if (!session?.pausedAt) return
    setSaving(true)
    setSyncNotice(null)
    setAwayNotice(null)
    const accumulated =
      session.pausedTotalSeconds +
      Math.max(0, Math.floor((Date.now() - new Date(session.pausedAt).getTime()) / 1000))
    try {
      setSession(await resumeSession(session.userId, session.id, accumulated))
      setNow(new Date())
    } catch {
      setSyncNotice('No se pudo reanudar (¿sin conexión?). Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function finish(status: Outcome, actualValue: number) {
    if (!session) return
    setSaving(true)
    try {
      await finishSession(session.id, { status, actualValue })
      // Hubo trabajo real: pantalla de cierre para registrar el avance (y la
      // etapa, si hay una en curso). "No pude" vuelve directo, sin fricción.
      if (status !== 'missed') {
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

  /** Tacha/destacha un ítem del plan: optimista, con revert si el guardado falla. */
  async function togglePlanItem(item: CalendarEvent) {
    const nextDone = item.doneAt === null
    const optimistic = nextDone ? new Date().toISOString() : null
    setPlanItems((items) => items.map((e) => (e.id === item.id ? { ...e, doneAt: optimistic } : e)))
    try {
      const updated = await setEventDone(item.id, nextDone)
      setPlanItems((items) => items.map((e) => (e.id === item.id ? updated : e)))
    } catch (err) {
      setPlanItems((items) => items.map((e) => (e.id === item.id ? { ...e, doneAt: item.doneAt } : e)))
      if (
        err instanceof Error &&
        (err as Error & { code?: string }).code === 'missing-column' &&
        !planNoticeShown.current
      ) {
        planNoticeShown.current = true
        setPlanNotice(err.message)
      }
    }
  }

  /** Suma algo al plan sin salir del cronómetro: título y hora opcional. */
  async function addPlanItem(e: FormEvent) {
    e.preventDefault()
    const title = planDraft.trim()
    if (!title || !session?.goalId || addingPlan) return
    setAddingPlan(true)
    try {
      const created = await createEvent(session.userId, {
        title,
        date: session.date,
        allDay: !planDraftTime,
        startTime: planDraftTime || null,
        endTime: null,
        goalId: session.goalId,
        notes: null,
      })
      setPlanItems((items) => [...items, created].sort(comparePlanItems))
      setPlanDraft('')
      setPlanDraftTime('')
    } catch {
      setPlanNotice('No se pudo agregar al plan. Inténtalo de nuevo.')
    } finally {
      setAddingPlan(false)
    }
  }

  /** Guarda la nota de avance (si la hay) — nunca bloquea la salida. */
  async function saveNote() {
    const text = note.trim()
    // Se suma a lo que ya hubiera (p. ej. un avance registrado desde el coach).
    if (text && session) {
      await setSessionAccomplishment(session.id, appendAccomplishment(session.accomplishment, text)).catch(() => {})
    }
  }

  async function completeMilestoneAndLeave() {
    setSaving(true)
    await saveNote()
    if (currentMilestone) await setMilestoneDone(currentMilestone.id, true).catch(() => {})
    navigate('/', { replace: true })
  }

  async function leaveWithNote() {
    setSaving(true)
    await saveNote()
    navigate('/', { replace: true })
  }

  // Modo enfoque: con el reloj corriendo, esta pantalla es la única — para
  // Lo común a todas las opciones de cierre.
  const resolution = {
    isTime,
    unit: session.unit,
    target: session.targetValue,
    defaultPartial,
    saving,
    partialValue,
    onPartialChange: setPartialValue,
    onFinish: (st: Outcome, v: number) => void finish(st, v),
  }

  // salir hay que pausar (o terminar). Las sesiones de cantidad no tienen
  // reloj, así que no encierran.
  const focusLocked =
    !needsResolution && !reachedToday && !finishedStatus && isTime && session.status === 'running' && !session.pausedAt

  return (
    <main className="screen screen--full flow-screen flow-screen--session" style={goalAccent(goal)}>
      <div className="row" style={{ marginBottom: 'var(--s4)', minHeight: 34, alignItems: 'center' }}>
        {focusLocked ? (
          <span className="small faint" role="status">
            Modo enfoque — pausa el reloj para salir
          </span>
        ) : (
          /* Con texto: en esta pantalla sin navegación, una flecha sola no orienta.
             El Atrás canónico de la app (.back-link). */
          <Link className="back-link" to="/" aria-label="Volver a tu día">
            <IconChevronLeft size={18} />
            Tu día
          </Link>
        )}
      </div>

      <div className="stack stack--lg center session-body" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* De qué meta se habla: píldora del color del área; el resto, neutro. */}
        <div className="session-head">
          {/* El h1 de la pantalla es la meta, con aspecto de píldora del área. */}
          <h1 className="session-head__goal">
            <NicheGlyph area={goal.area} tone={goalTone(goal)} size="sm" />
            <span className="session-head__title">{goal.title}</span>
          </h1>
          <span className="session-head__meta">
            {targetLabel}
            {stageNote(milestones)}
          </span>
        </div>

        {finishedStatus ? (
          <SessionFinished
            status={finishedStatus}
            note={note}
            milestone={currentMilestone}
            saving={saving}
            onNote={setNote}
            onComplete={() => void completeMilestoneAndLeave()}
            onLeave={() => void leaveWithNote()}
          />
        ) : (
          <>
        {/* --- Cierre pendiente (otro día / sin confirmar) --- */}
        {needsResolution && (
          <ResolutionOptions
            title={`Tu sesión de ${goal.title} quedó abierta`}
            showMissedHint
            hint={openSessionHint(session, today, targetLabel)}
            {...resolution}
          />
        )}

        {/* --- Objetivo cumplido con la app abierta --- */}
        {!needsResolution && reachedToday && (
          <>
            <SessionRing progress={1} reached>
              <IconCelebrate size={34} className="session-ring__celebrate" />
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
              {...resolution}
            />
          </>
        )}

        {/* --- Pendiente: por comenzar --- */}
        {!needsResolution && !reachedToday && session.status === 'pending' && (
          <PendingStart
            targetLabel={targetLabel}
            plannedTime={session.plannedTime}
            why={goal.why}
            saving={saving}
            onStart={() => void doStart()}
          />
        )}

        {/* --- En curso: tiempo --- */}
        {!needsResolution && !reachedToday && session.status === 'running' && isTime && (
          <TimeRunner
            elapsed={elapsed}
            remaining={remainingSeconds(session, now)}
            target={session.targetValue}
            targetLabel={targetLabel}
            keepGoing={keepGoing}
            paused={Boolean(session.pausedAt)}
            why={goal.why}
            syncNotice={syncNotice}
            awayNotice={ticking ? awayNotice : null}
            earlyFinish={earlyFinish}
            saving={saving}
            closeOptions={
              <ResolutionOptions
                title="¿Cómo cierro la sesión?"
                showMissedHint
                hint={`Llevas ${elapsedMinutes} min de ${session.targetValue}.`}
                {...resolution}
              />
            }
            onPause={() => void doPause()}
            onResume={() => void doResume()}
            onDone={() => (keepGoing ? void finish('done', elapsedMinutes) : setEarlyFinish(true))}
          />
        )}

        {/* --- En curso: cantidad --- */}
        {!needsResolution && session.status === 'running' && !isTime && (
          <CountRunner
            count={count}
            target={session.targetValue}
            unit={session.unit}
            saving={saving}
            onCount={setCount}
            onFinish={(st, v) => void finish(st, v)}
          />
        )}

        {/* --- Ya cerrada (llegó por URL) --- */}
        {closed && <ClosedNote skipped={session.status === 'skipped'} onHome={() => navigate('/')} />}

        {/* --- El plan de esta sesión: lo agendado para esta meta hoy --- */}
        {!needsResolution && (planItems.length > 0 || !closed) && (
          <SessionPlan
            items={planItems}
            status={session.status}
            closed={closed}
            suggestion={suggestion}
            notice={planNotice}
            draft={planDraft}
            draftTime={planDraftTime}
            adding={addingPlan}
            onDraft={setPlanDraft}
            onDraftTime={setPlanDraftTime}
            onAdd={(e) => void addPlanItem(e)}
            onToggle={(e) => void togglePlanItem(e)}
          />
        )}
          </>
        )}
      </div>
    </main>
  )
}
