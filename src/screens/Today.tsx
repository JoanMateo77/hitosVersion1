import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, Habit, HabitCheck, ScheduleBlock, Session, Task } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalStatus } from '@/services/goals'
import { createUserTask, deleteTask, listTasksForDate, moveTaskToDate, setTaskStatus, updateTaskTitle } from '@/services/tasks'
import { listScheduleForUser } from '@/services/schedule'
import {
  closeStaleSessions,
  createSpontaneousSession,
  finishSession,
  generateSessionsForDate,
  listSessionsForDate,
  listSessionsInRange,
  reopenSession,
  resumeClosedSession,
} from '@/services/sessions'
import { listEventsInRange } from '@/services/events'
import { listHabits, listHabitChecksInRange, setHabitCheck } from '@/services/habits'
import { habitsDueOn, habitStreak } from '@/domain/habits'
import { HabitRow } from '@/components/HabitRow'
import { compareEvents } from '@/domain/calendar'
import { carryoverCandidates, findForgottenGoal, goalsDueForReview } from '@/domain/dailyPlan'
import { currentStreakCommitted, formatClock, pickSuggestion, remainingSeconds } from '@/domain/sessions'
import { WEEKDAY_LABELS, weekdayMon0 } from '@/domain/commitment'
import { getTemplate } from '@/domain/templates'
import { addDays, formatTime12, formatWeekday, startOfWeek, todayISO } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { nicheAccent } from '@/lib/nicheAccent'
import { TaskItem } from '@/components/TaskItem'
import { SessionCard } from '@/components/SessionCard'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import {
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCompass,
  IconFlame,
  IconPlus,
  IconQuote,
  IconSprout,
} from '@/components/icons'
import { NicheGlyph, NicheIcon } from '@/components/NicheGlyph'
import { useCheer } from '@/hooks/useCheer'
import { useToast } from '@/app/toast'
import { ensureCommitmentBackfill } from '@/services/backfill'
import { syncTimezone } from '@/lib/push'

export function Today() {
  const { userId, profile } = useSession()
  const navigate = useNavigate()
  const today = todayISO()

  const [goals, setGoals] = useState<Goal[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  // Tareas propias de ayer que quedaron pendientes (carryover honesto, sin culpa).
  const [yesterdayPending, setYesterdayPending] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitChecks, setHabitChecks] = useState<HabitCheck[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [pickingSpontaneous, setPickingSpontaneous] = useState(false)
  // Día pasado expandido desde la tira semanal ("ayer sí la hice").
  const [stripDay, setStripDay] = useState<string | null>(null)
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

        const [loadedGoals, loadedBlocks, loadedTasks, loadedEvents, loadedHistory, loadedHabits, loadedChecks, loadedYesterday] =
          await Promise.all([
            listGoals(userId),
            listScheduleForUser(userId),
            listTasksForDate(userId, today),
            listEventsInRange(userId, today, today),
            // 120 días para la racha; incluye la semana en curso.
            listSessionsInRange(userId, addDays(today, -119), addDays(today, -1)),
            listHabits(userId).catch(() => []),
            listHabitChecksInRange(userId, addDays(today, -119), today).catch(() => []),
            listTasksForDate(userId, addDays(today, -1)).catch(() => []),
          ])

        // Las sesiones de hoy nacen del compromiso, no de heurísticas.
        const todaySessions = shouldGenerate
          ? await generateSessionsForDate(userId, today, loadedBlocks)
          : await listSessionsForDate(userId, today)

        // Migración perezosa al modelo de compromiso (Fase 1). No bloquea.
        void ensureCommitmentBackfill(userId, loadedGoals).catch(() => {})
        // Recordatorios en TU hora: mantiene profiles.tz al día.
        void syncTimezone(userId)

        if (active) {
          setGoals(loadedGoals)
          setBlocks(loadedBlocks)
          setSessions(todaySessions)
          setHistory(loadedHistory)
          setTasks(loadedTasks)
          setEvents(loadedEvents)
          setHabits(loadedHabits)
          setHabitChecks(loadedChecks)
          setYesterdayPending(carryoverCandidates(loadedYesterday))
        }
      } catch (err) {
        if (active) setError(friendlyError(err, 'No se pudo cargar tu día.'))
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
  // Sesión en curso: protagonista arriba de todo, con el reloj latiendo.
  const runningSession = useMemo(
    () =>
      sessions.find((x) => x.status === 'running' && !x.pausedAt) ??
      sessions.find((x) => x.status === 'running') ??
      null,
    [sessions],
  )
  const [nowTick, setNowTick] = useState(() => new Date())
  useEffect(() => {
    if (!runningSession || runningSession.pausedAt || runningSession.targetKind !== 'time') return
    const id = setInterval(() => setNowTick(new Date()), 1000)
    return () => clearInterval(id)
  }, [runningSession])
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])

  // Sesiones de hoy de metas activas, con su meta resuelta.
  const todaySessions = useMemo(
    () =>
      sessions
        .map((s) => ({ session: s, goal: goalById.get(s.goalId) }))
        .filter((x): x is { session: Session; goal: Goal } => x.goal !== undefined)
        // La meta prioritaria ⭐ va primero; no oculta nada, solo ordena.
        .sort((a, b) => {
          const ap = a.goal.id === profile.priorityGoalId ? 0 : 1
          const bp = b.goal.id === profile.priorityGoalId ? 0 : 1
          return ap - bp
        }),
    [sessions, goalById, profile.priorityGoalId],
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

  // ----- Hábitos de hoy: rutinas de un toque -----
  const todayHabits = useMemo(() => habitsDueOn(habits, today), [habits, today])
  const habitDoneToday = useMemo(
    () => new Set(habitChecks.filter((c) => c.date === today).map((c) => c.habitId)),
    [habitChecks, today],
  )
  const habitStreaks = useMemo(() => {
    const byHabit = new Map<string, Set<string>>()
    for (const c of habitChecks) {
      const set = byHabit.get(c.habitId) ?? new Set<string>()
      set.add(c.date)
      byHabit.set(c.habitId, set)
    }
    const m = new Map<string, number>()
    for (const h of todayHabits) {
      m.set(h.id, habitStreak(byHabit.get(h.id) ?? new Set(), h.weekdays, today))
    }
    return m
  }, [habitChecks, todayHabits, today])

  function toggleHabit(h: Habit) {
    const wasDone = habitDoneToday.has(h.id)
    // Optimista: la marca cambia al instante; si falla la red, se revierte.
    setHabitChecks((prev) =>
      wasDone
        ? prev.filter((c) => !(c.habitId === h.id && c.date === today))
        : [...prev, { habitId: h.id, date: today }],
    )
    void withErrorHandling(
      async () => {
        await setHabitCheck(userId, h.id, today, !wasDone)
      },
      () =>
        setHabitChecks((prev) =>
          wasDone
            ? [...prev, { habitId: h.id, date: today }]
            : prev.filter((c) => !(c.habitId === h.id && c.date === today)),
        ),
    )
  }

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
      setActionError(friendlyError(err, 'No se pudo guardar el cambio.'))
    }
  }

  function quickDone(s: Session) {
    const prev = { status: s.status, actualValue: s.actualValue, endedAt: s.endedAt }
    patchSession(s.id, { status: 'done', actualValue: s.targetValue })
    const willBeDone = todaySessions.filter((x) => doneish(x.session)).length + 1
    if (willBeDone === todaySessions.length && todaySessions.length > 0) {
      cheer('Cumpliste tu compromiso de hoy. Bien hecho.')
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

  function resumeClosed(s: Session) {
    void withErrorHandling(async () => {
      const updated = await resumeClosedSession(s)
      patchSession(s.id, updated)
      navigate(`/sesion/${updated.id}`)
    })
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

  /** Estado agregado de un día para la tira semanal. */
  function stripState(date: string): 'done' | 'partial' | 'missed' | 'future' | 'free' {
    const isCommitted = blocks.some((b) => b.weekday === weekdayMon0(date))
    const day = (date === today ? sessions : history).filter((x) => x.date === date)
    if (date > today) return isCommitted ? 'future' : 'free'
    if (day.some((x) => x.status === 'done')) return 'done'
    if (day.some((x) => x.status === 'partial')) return 'partial'
    if (date === today) return isCommitted || day.length > 0 ? 'future' : 'free'
    return day.length > 0 || isCommitted ? 'missed' : 'free'
  }

  /** Corrección honesta de un día pasado: "esa sesión sí la hice". */
  function fixPastSession(x: Session) {
    void withErrorHandling(async () => {
      const updated = await finishSession(x.id, { status: 'done', actualValue: x.targetValue })
      setHistory((prev) => prev.map((h) => (h.id === x.id ? updated : h)))
      toast('Día corregido. Tu racha lo refleja.', 'success')
    })
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

  function bringYesterdayTasks() {
    const pending = yesterdayPending
    setYesterdayPending([])
    void withErrorHandling(
      async () => {
        const moved = await Promise.all(pending.map((t) => moveTaskToDate(t.id, today)))
        setTasks((prev) => [...prev, ...moved])
        toast(moved.length === 1 ? 'Tarea traída a hoy.' : 'Tareas traídas a hoy.', 'success')
      },
      () => setYesterdayPending(pending),
    )
  }

  function dismissYesterdayTasks() {
    const pending = yesterdayPending
    setYesterdayPending([])
    void withErrorHandling(
      async () => {
        await Promise.all(pending.map((t) => setTaskStatus(t.id, 'postponed')))
      },
      () => setYesterdayPending(pending),
    )
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
        <div className="screen__meta">
          <span>{formatWeekday(today)}</span>
          {streak >= 2 && (
            <span className="streak-chip">
              <IconFlame size={13} /> {streak} días
            </span>
          )}
        </div>
        <h1 className="screen__title">Tu día</h1>
        {todaySessions.length > 0 && (
          <p className="screen__subtitle">
            {closedCount === todaySessions.length
              ? 'Cumpliste tu compromiso de hoy.'
              : `${closedCount} de ${todaySessions.length} ${todaySessions.length === 1 ? 'sesión' : 'sesiones'}`}
          </p>
        )}
      </header>

      <div className="today-grid">
        <div className="stack stack--lg">
          <div>
            <div className="weekstrip" role="group" aria-label="Tu semana">
              {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i)).map((d, i) => {
                const st = stripState(d)
                const isToday = d === today
                const clickable = d < today && st !== 'free'
                return (
                  <button
                    key={d}
                    type="button"
                    className={`weekstrip__day${isToday ? ' weekstrip__day--today' : ''}`}
                    disabled={!clickable}
                    aria-label={`${WEEKDAY_LABELS[i]} ${d.slice(8)}: ${
                      st === 'done' ? 'cumplido' : st === 'partial' ? 'parcial' : st === 'missed' ? 'sin cumplir' : st === 'future' ? 'por venir' : 'libre'
                    }`}
                    onClick={() => setStripDay(stripDay === d ? null : d)}
                  >
                    <span className="weekstrip__label">{WEEKDAY_LABELS[i]}</span>
                    <span className={`weekstrip__dot weekstrip__dot--${st}`} aria-hidden="true" />
                  </button>
                )
              })}
            </div>

            {stripDay && (
              <div className="card card--tight stack stack--sm">
                <div className="section-head" style={{ marginBottom: 0 }}>
                  <span className="kicker">{formatWeekday(stripDay)}</span>
                  <button className="btn--link" onClick={() => setStripDay(null)}>
                    Cerrar
                  </button>
                </div>
                {history.filter((x) => x.date === stripDay).length === 0 ? (
                  <p className="small muted m-0">Ese día no hubo sesiones.</p>
                ) : (
                  history
                    .filter((x) => x.date === stripDay)
                    .map((x) => {
                      const g = goalById.get(x.goalId)
                      if (!g) return null
                      const closedOk = x.status === 'done'
                      return (
                        <div key={x.id} className="row row--between" style={{ alignItems: 'center' }}>
                          <span className="small row row--sm" style={{ alignItems: 'center', minWidth: 0 }}>
                            <NicheGlyph area={g.area} size="sm" />
                            <span className="nowrap-ellipsis">
                              {g.title} ·{' '}
                              <span className="muted">
                                {x.status === 'done'
                                  ? 'hecha'
                                  : x.status === 'partial'
                                    ? `parcial (${x.actualValue ?? 0})`
                                    : x.status === 'missed'
                                      ? 'no pudiste'
                                      : 'sin registrar'}
                              </span>
                            </span>
                          </span>
                          {!closedOk && (
                            <button className="btn btn--sm btn--ghost" onClick={() => fixPastSession(x)}>
                              <IconCheck size={14} /> Sí la hice
                            </button>
                          )}
                        </div>
                      )
                    })
                )}
              </div>
            )}
          </div>

          {runningSession && goalById.get(runningSession.goalId) && (
            <button
              className="hero-session"
              style={nicheAccent(goalById.get(runningSession.goalId)!.area)}
              onClick={() => navigate(`/sesion/${runningSession.id}`)}
            >
              <span className="kicker">En curso · {goalById.get(runningSession.goalId)!.title}</span>
              <strong className="hero-session__time">
                {runningSession.targetKind === 'time'
                  ? formatClock(remainingSeconds(runningSession, nowTick))
                  : `${runningSession.actualValue ?? 0} / ${runningSession.targetValue}`}
              </strong>
              <span className="small muted">
                {runningSession.pausedAt ? 'En pausa — toca para continuar' : 'Toca para abrir el cronómetro'}
              </span>
            </button>
          )}

          {cheerMessage && (
            <div className="cheer" role="status" aria-live="polite">
              {cheerMessage}
            </div>
          )}

          {notice === 'resolve' && toResolve && (
            <button
              className="card card--tight card--warn row row--between"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => navigate(`/sesion/${toResolve.id}`)}
            >
              <span className="row row--sm small" style={{ alignItems: 'flex-start' }}>
                <IconClock size={16} className="muted" style={{ marginTop: 2, flex: 'none' }} />
                <span>
                  Quedó una sesión abierta de <strong>{goalById.get(toResolve.goalId)?.title}</strong>.
                  ¿Cómo te fue?
                </span>
              </span>
              <IconChevronRight size={16} className="faint" />
            </button>
          )}
          {notice === 'review' && (
            <button
              className="card card--tight row row--between"
              style={{ width: '100%', textAlign: 'left' }}
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
            <div className="card card--tight card--warn stack stack--sm">
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
            <section aria-label="Tus sesiones de hoy">
              <div className="section-head">
                <span className="kicker">Tus sesiones de hoy</span>
                <span className="small muted">
                  {closedCount} de {todaySessions.length}
                </span>
              </div>
              <div className="stack stack--sm">
                {todaySessions
                  .filter(({ session }) => session.id !== runningSession?.id)
                  .map(({ session, goal }) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      goal={goal}
                      suggestion={pickSuggestion(getTemplate(goal.templateKey), goal.id, today)}
                      onOpen={() => navigate(`/sesion/${session.id}`)}
                      onQuickDone={() => quickDone(session)}
                      onReopen={() => reopen(session)}
                      onResume={() => resumeClosed(session)}
                    />
                  ))}
              </div>
            </section>
          )}

          {todaySessions.length === 0 && activeGoals.length > 0 && (
            <div className="card stack stack--sm" style={{ alignItems: 'flex-start' }}>
              <strong>Hoy no comprometiste sesiones.</strong>
              <p className="small muted m-0">Día libre — o súmale una sesión espontánea a una meta.</p>
              {!pickingSpontaneous ? (
                <button className="btn btn--ghost btn--sm" onClick={() => setPickingSpontaneous(true)}>
                  <IconPlus size={16} /> Sesión espontánea
                </button>
              ) : (
                <div className="row wrap">
                  {activeGoals.map((g) => (
                    <button key={g.id} type="button" className="chip" onClick={() => addSpontaneous(g)}>
                      <NicheIcon area={g.area} size={14} /> {g.title}
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

          {/* ----- Hábitos de hoy: un toque y listo ----- */}
          {todayHabits.length > 0 ? (
            <section aria-label="Tus hábitos de hoy">
              <div className="section-head">
                <span className="kicker">Tus hábitos de hoy</span>
                <button className="btn--link" onClick={() => navigate('/habitos')}>
                  Gestionar
                </button>
              </div>
              <div className="stack stack--sm">
                {todayHabits.map((h) => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    done={habitDoneToday.has(h.id)}
                    streak={habitStreaks.get(h.id) ?? 0}
                    onToggle={() => toggleHabit(h)}
                  />
                ))}
              </div>
            </section>
          ) : (
            habits.length === 0 && (
              <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/habitos')}>
                <IconPlus size={16} /> Sumar un hábito diario
              </button>
            )
          )}

          {actionError && (
            <div className="alert alert--error" role="alert">
              {actionError}
            </div>
          )}
        </div>

        <aside className="today-side">
          <section aria-label="Lo que sumaste tú">
            <div className="section-head">
              <span className="kicker">Lo que sumaste tú</span>
            </div>
            {yesterdayPending.length > 0 && (
              <div className="card card--tight stack stack--sm mb-3">
                <span className="small">
                  {yesterdayPending.length === 1
                    ? 'Te quedó 1 tarea pendiente de ayer:'
                    : `Te quedaron ${yesterdayPending.length} tareas pendientes de ayer:`}{' '}
                  <span className="muted">{yesterdayPending.map((t) => t.title).join(' · ')}</span>
                </span>
                <div className="row wrap">
                  <button className="btn btn--sm btn--primary" onClick={bringYesterdayTasks}>
                    Traer a hoy
                  </button>
                  <button className="btn btn--sm btn--subtle" onClick={dismissYesterdayTasks}>
                    Descartar
                  </button>
                </div>
              </div>
            )}
            {userTasks.length > 0 && (
              <ul className="stack stack--sm mb-3">
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
            <form className="row" onSubmit={addTask}>
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

          {todayEvents.length > 0 && (
            <div className="card card--tight stack stack--sm">
              <div className="section-head" style={{ marginBottom: 0 }}>
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
                  <span className="ev__time">{e.allDay || !e.startTime ? 'Día' : formatTime12(e.startTime)}</span>
                  <span className="ev__title">{e.title}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
