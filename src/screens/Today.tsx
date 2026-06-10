import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, ScheduleBlock, Session, Task } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalStatus } from '@/services/goals'
import { createUserTask, deleteTask, listTasksForDate, setTaskStatus, updateTaskTitle } from '@/services/tasks'
import { listScheduleForUser } from '@/services/schedule'
import {
  closeStaleSessions,
  createSpontaneousSession,
  finishSession,
  generateSessionsForDate,
  listSessionsForDate,
  listSessionsInRange,
  reopenSession,
} from '@/services/sessions'
import { listEventsInRange } from '@/services/events'
import { compareEvents } from '@/domain/calendar'
import { findForgottenGoal, goalsDueForReview } from '@/domain/dailyPlan'
import { currentStreakCommitted, pickSuggestion } from '@/domain/sessions'
import { getTemplate } from '@/domain/templates'
import { addDays, formatWeekday, todayISO } from '@/lib/date'
import { TaskItem } from '@/components/TaskItem'
import { SessionCard } from '@/components/SessionCard'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import {
  IconCalendar,
  IconChevronRight,
  IconCompass,
  IconPlus,
  IconQuote,
  IconSprout,
} from '@/components/icons'
import { useCheer } from '@/hooks/useCheer'
import { useToast } from '@/app/toast'
import { ensureCommitmentBackfill } from '@/services/backfill'

export function Today() {
  const { userId, profile } = useSession()
  const navigate = useNavigate()
  const today = todayISO()

  const [goals, setGoals] = useState<Goal[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [pickingSpontaneous, setPickingSpontaneous] = useState(false)
  const { cheerMessage, cheer } = useCheer()
  const { toast } = useToast()

  // Garantiza que el cierre de sesiones viejas y la generación del día corran
  // una sola vez por día (incluso con el doble-render de StrictMode en dev).
  const genGuard = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const shouldGenerate = genGuard.current !== today
    if (shouldGenerate) genGuard.current = today

    async function init() {
      try {
        setLoading(true)
        setError(null)

        // Sesiones que quedaron corriendo de otros días → "sin confirmar".
        if (shouldGenerate) await closeStaleSessions(userId, today).catch(() => {})

        const [loadedGoals, loadedBlocks, loadedTasks, loadedEvents, loadedHistory] =
          await Promise.all([
            listGoals(userId),
            listScheduleForUser(userId),
            listTasksForDate(userId, today),
            listEventsInRange(userId, today, today),
            // 120 días para la racha; incluye la semana en curso.
            listSessionsInRange(userId, addDays(today, -119), addDays(today, -1)),
          ])

        // Las sesiones de hoy nacen del compromiso, no de heurísticas.
        const todaySessions = shouldGenerate
          ? await generateSessionsForDate(userId, today, loadedBlocks)
          : await listSessionsForDate(userId, today)

        // Migración perezosa al modelo de compromiso (Fase 1). No bloquea.
        void ensureCommitmentBackfill(userId, loadedGoals).catch(() => {})

        if (active) {
          setGoals(loadedGoals)
          setBlocks(loadedBlocks)
          setSessions(todaySessions)
          setHistory(loadedHistory)
          setTasks(loadedTasks)
          setEvents(loadedEvents)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar tu día.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void init()
    return () => {
      active = false
    }
  }, [userId, today, refreshKey])

  // Al volver a la app (cambiar de pestaña, reabrir la PWA) refrescamos el día.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])

  // Sesiones de hoy de metas activas, con su meta resuelta.
  const todaySessions = useMemo(
    () =>
      sessions
        .map((s) => ({ session: s, goal: goalById.get(s.goalId) }))
        .filter((x): x is { session: Session; goal: Goal } => x.goal !== undefined),
    [sessions, goalById],
  )
  const closedCount = todaySessions.filter((x) =>
    ['done', 'partial', 'missed'].includes(x.session.status),
  ).length
  const doneish = (s: Session) => s.status === 'done' || s.status === 'partial'

  // Racha sobre días comprometidos (los días sin compromiso no la rompen).
  const streak = useMemo(() => {
    const doneDates = new Set<string>()
    for (const s of history) if (doneish(s)) doneDates.add(s.date)
    for (const s of sessions) if (doneish(s)) doneDates.add(s.date)
    const committedWeekdays = new Set(blocks.map((b) => b.weekday))
    return currentStreakCommitted(doneDates, committedWeekdays, today)
  }, [history, sessions, blocks, today])

  // Una sesión de otro día que quedó sin confirmar: el aviso más importante.
  const toResolve = useMemo(
    () =>
      history.find(
        (s) => s.status === 'unconfirmed' && s.date >= addDays(today, -7) && goalById.has(s.goalId),
      ) ?? null,
    [history, today, goalById],
  )

  const userTasks = useMemo(
    () => tasks.filter((t) => t.source === 'user' && t.status !== 'postponed'),
    [tasks],
  )
  const todayEvents = useMemo(() => [...events].sort(compareEvents), [events])
  const reviewDue = useMemo(() => goalsDueForReview(goals), [goals])
  const forgotten = useMemo(() => {
    const lastDone = new Map<string, string>()
    for (const s of [...history, ...sessions]) {
      if (!doneish(s)) continue
      const prev = lastDone.get(s.goalId)
      if (!prev || s.date > prev) lastDone.set(s.goalId, s.date)
    }
    const withSessionToday = new Set(sessions.map((s) => s.goalId))
    return findForgottenGoal(goals, lastDone, withSessionToday)
  }, [goals, history, sessions])

  function patchSession(id: string, changes: Partial<Session>) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)))
  }
  function patchTask(id: string, changes: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)))
  }

  async function withErrorHandling(fn: () => Promise<void>, rollback?: () => void) {
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      rollback?.()
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.')
    }
  }

  function quickDone(s: Session) {
    const prev = { status: s.status, actualValue: s.actualValue, endedAt: s.endedAt }
    patchSession(s.id, { status: 'done', actualValue: s.targetValue })
    const willBeDone = todaySessions.filter((x) => doneish(x.session)).length + 1
    if (willBeDone === todaySessions.length && todaySessions.length > 0) {
      cheer('Cumpliste tu compromiso de hoy 🙌')
    } else if (willBeDone === 1) {
      cheer('Primera sesión del día. Así se empieza.')
    }
    void withErrorHandling(
      async () => {
        const updated = await finishSession(s.id, { status: 'done', actualValue: s.targetValue })
        patchSession(s.id, updated)
      },
      () => patchSession(s.id, prev),
    )
  }

  function reopen(s: Session) {
    const prev = { ...s }
    patchSession(s.id, { status: 'pending', actualValue: null, startedAt: null, endedAt: null })
    void withErrorHandling(
      async () => {
        const updated = await reopenSession(s.id)
        patchSession(s.id, updated)
      },
      () => patchSession(s.id, prev),
    )
  }

  function addSpontaneous(goal: Goal) {
    setPickingSpontaneous(false)
    void withErrorHandling(async () => {
      const ownBlock = blocks.find((b) => b.goalId === goal.id)
      const created = await createSpontaneousSession(userId, goal.id, today, {
        targetKind: ownBlock?.targetKind ?? 'time',
        targetValue: ownBlock?.targetValue ?? profile.defaultSessionMinutes ?? 25,
        unit: ownBlock?.unit ?? null,
      })
      setSessions((prev) => [...prev, created])
    })
  }

  function toggleTask(task: Task) {
    const prevStatus = task.status
    const next = task.status === 'done' ? 'pending' : 'done'
    patchTask(task.id, { status: next })
    void withErrorHandling(
      async () => {
        const updated = await setTaskStatus(task.id, next)
        patchTask(task.id, updated)
      },
      () => patchTask(task.id, { status: prevStatus }),
    )
  }

  function editTask(task: Task, title: string) {
    const prevTitle = task.title
    patchTask(task.id, { title })
    void withErrorHandling(
      async () => {
        await updateTaskTitle(task.id, title)
      },
      () => patchTask(task.id, { title: prevTitle }),
    )
  }

  function removeTask(task: Task) {
    void withErrorHandling(async () => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      await deleteTask(task.id)
      toast('Tarea borrada.')
    })
  }

  function addTask(e: FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    void withErrorHandling(async () => {
      const created = await createUserTask(userId, title, today)
      setTasks((prev) => [...prev, created])
    })
  }

  function acceptForgotten(goal: Goal) {
    void withErrorHandling(async () => {
      const updated = await markGoalReviewed(goal.id)
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)))
      toast('Listo. Te lo recordaremos más adelante.')
    })
  }

  function pauseForgotten(goal: Goal) {
    void withErrorHandling(async () => {
      const updated = await setGoalStatus(goal.id, 'paused')
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)))
      toast('Pausada. La retomas cuando quieras.')
    })
  }

  if (loading) {
    return (
      <div className="screen">
        <header className="screen__header">
          <p className="muted small">{formatWeekday(today)}</p>
          <h1 className="screen__title">Tu día</h1>
        </header>
        <SkeletonList rows={4} />
      </div>
    )
  }
  if (error) return <LoadingScreen error={error} />

  // UN solo aviso contextual sobre el plan (prioridad: sin confirmar > revisión > olvidada).
  const notice = toResolve ? 'resolve' : reviewDue.length > 0 ? 'review' : forgotten ? 'forgotten' : null

  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">
          {formatWeekday(today)}
          {streak >= 2 && ` · 🔥 ${streak} días`}
        </p>
        <h1 className="screen__title">Tu día</h1>
        {todaySessions.length > 0 && (
          <p className="screen__subtitle">
            {closedCount === todaySessions.length
              ? 'Cumpliste tu compromiso de hoy 🙌'
              : `${closedCount} de ${todaySessions.length} ${todaySessions.length === 1 ? 'sesión' : 'sesiones'}`}
          </p>
        )}
      </header>

      {cheerMessage && (
        <div className="cheer" role="status" aria-live="polite">
          {cheerMessage}
        </div>
      )}

      {notice === 'resolve' && toResolve && (
        <button
          className="card card--tight row row--between"
          style={{ width: '100%', textAlign: 'left', marginBottom: 'var(--s4)', borderColor: 'var(--warning)' }}
          onClick={() => navigate(`/sesion/${toResolve.id}`)}
        >
          <span className="small">
            ⏱ Quedó una sesión abierta de <strong>{goalById.get(toResolve.goalId)?.title}</strong>.
            ¿Cómo te fue?
          </span>
          <IconChevronRight size={16} className="faint" />
        </button>
      )}
      {notice === 'review' && (
        <button
          className="card card--tight row row--between"
          style={{ width: '100%', textAlign: 'left', marginBottom: 'var(--s4)' }}
          onClick={() => navigate('/revision')}
        >
          <span className="row row--sm small" style={{ alignItems: 'center' }}>
            <IconQuote size={16} className="muted" />
            <span>
              <strong>Revisión guiada</strong> — {reviewDue.length}{' '}
              {reviewDue.length === 1 ? 'meta para revisar' : 'metas para revisar'}
            </span>
          </span>
          <IconChevronRight size={16} className="faint" />
        </button>
      )}
      {notice === 'forgotten' && forgotten && (
        <div
          className="card card--tight stack stack--sm"
          style={{ borderColor: 'var(--warning)', marginBottom: 'var(--s4)' }}
        >
          <span className="row row--sm small" style={{ alignItems: 'flex-start' }}>
            <IconSprout size={16} className="muted" style={{ marginTop: 2, flex: 'none' }} />
            <span>
              Hace {forgotten.days} días que no tocas <strong>“{forgotten.goal.title}”</strong>.
              ¿La retomamos o la pausamos sin culpa?
            </span>
          </span>
          <div className="row wrap">
            <button className="btn btn--sm btn--primary" onClick={() => addSpontaneous(forgotten.goal)}>
              Sesión hoy
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => pauseForgotten(forgotten.goal)}>
              Pausar
            </button>
            <button className="btn btn--sm btn--subtle" onClick={() => acceptForgotten(forgotten.goal)}>
              Está bien así
            </button>
          </div>
        </div>
      )}

      {todaySessions.length > 0 && (
        <section className="stack stack--sm" aria-label="Tus sesiones de hoy">
          <span className="kicker">
            Tus sesiones de hoy · {closedCount} de {todaySessions.length}
          </span>
          {todaySessions.map(({ session, goal }) => (
            <SessionCard
              key={session.id}
              session={session}
              goal={goal}
              suggestion={pickSuggestion(getTemplate(goal.templateKey), goal.id, today)}
              onOpen={() => navigate(`/sesion/${session.id}`)}
              onQuickDone={() => quickDone(session)}
              onReopen={() => reopen(session)}
            />
          ))}
        </section>
      )}

      {todaySessions.length === 0 && activeGoals.length > 0 && (
        <div className="card stack stack--sm" style={{ alignItems: 'flex-start' }}>
          <strong>Hoy no comprometiste sesiones.</strong>
          <p className="small muted" style={{ margin: 0 }}>
            Día libre — o súmale una sesión espontánea a una meta.
          </p>
          {!pickingSpontaneous ? (
            <button className="btn btn--ghost btn--sm" onClick={() => setPickingSpontaneous(true)}>
              <IconPlus size={16} /> Sesión espontánea
            </button>
          ) : (
            <div className="row wrap">
              {activeGoals.map((g) => (
                <button key={g.id} type="button" className="chip" onClick={() => addSpontaneous(g)}>
                  {getTemplate(g.templateKey).emoji} {g.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeGoals.length === 0 && (
        <div className="card stack stack--sm center" style={{ alignItems: 'center' }}>
          <IconCompass size={32} className="muted" />
          <p className="small muted center">
            Cuando crees una meta, tu día se arma alrededor de tu compromiso.
          </p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/ideas')}>
              Ver ideas para empezar
            </button>
            <button className="btn--link" onClick={() => navigate('/meta/nueva')}>
              Escribir mi propia meta
            </button>
          </div>
        </div>
      )}

      <section style={{ marginTop: 'var(--s6)' }}>
        <span className="kicker">Lo que sumaste tú</span>
        {userTasks.length > 0 && (
          <ul className="stack stack--sm" style={{ marginTop: 'var(--s3)' }}>
            {userTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                goalTitle={null}
                goalWhy={null}
                onToggle={() => toggleTask(task)}
                onEdit={(title) => editTask(task, title)}
                onRemove={() => removeTask(task)}
              />
            ))}
          </ul>
        )}
        <form className="row" style={{ marginTop: 'var(--s3)' }} onSubmit={addTask}>
          <input
            className="input"
            placeholder="Agrega algo para hoy…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={300}
            autoCapitalize="sentences"
            autoCorrect="on"
            enterKeyHint="send"
            inputMode="text"
          />
          <button className="iconbtn" type="submit" aria-label="Agregar tarea" disabled={!newTitle.trim()}>
            <IconPlus size={22} />
          </button>
        </form>
      </section>

      {actionError && (
        <div className="alert alert--error" role="alert" style={{ marginTop: 'var(--s3)' }}>
          {actionError}
        </div>
      )}

      {todayEvents.length > 0 && (
        <div className="card card--tight stack stack--sm" style={{ marginTop: 'var(--s5)' }}>
          <div className="row row--between">
            <span className="kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconCalendar size={12} /> Tu agenda de hoy
            </span>
            <button className="btn--link" onClick={() => navigate('/calendario')}>
              Ver agenda
            </button>
          </div>
          {todayEvents.map((e) => (
            <button
              key={e.id}
              className="ev"
              aria-label={`Ver "${e.title}" en la agenda`}
              onClick={() => navigate(`/calendario?d=${e.date}`)}
            >
              <span className="ev__time">{e.allDay ? 'Día' : e.startTime}</span>
              <span className="ev__title">{e.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
