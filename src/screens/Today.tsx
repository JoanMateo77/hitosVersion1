import { useEffect, useMemo, useRef, useState, type ReactNode, type SubmitEvent } from 'react'
import { IconSparkle } from '@/components/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, Habit, HabitCheck, HabitSkip, ScheduleBlock, Session, Task } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalStatus } from '@/services/goals'
import { createUserTask, listTasksForDate, moveTaskToDate, setTaskStatus } from '@/services/tasks'
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
  resumeSession,
  setSessionAccomplishment,
} from '@/services/sessions'
import { listEventsInRange, setEventDone } from '@/services/events'
import { milestoneProgressByGoal } from '@/services/milestones'
import {
  listHabits,
  listHabitChecksInRange,
  listHabitOverridesInRange,
  listHabitSkipsInRange,
  setHabitCheck,
} from '@/services/habits'
import {
  habitDoneCount,
  habitTarget,
  habitTogglePlan,
  habitsDueOn,
  habitWithDayTimes,
  skipSetOf,
} from '@/domain/habits'
import { compareEvents } from '@/domain/calendar'
import { carryoverCandidates, findForgottenGoal, goalsDueForReview } from '@/domain/dailyPlan'
import {
  activeBlocksOf,
  activeCommittedWeekdays,
  bestStreakCommitted,
  dayState,
  dueBlocksForDate,
  doneDatesOf,
  elapsedSeconds,
  globalStreak,
  isTimeReached,
  neutralDatesOf,
  appendAccomplishment,
} from '@/domain/sessions'
import { PinnedGoals } from '@/screens/today/PinnedGoals'
import { TodayStats, WeekStrip } from '@/screens/today/TodayStats'
import { NextStep, QuickNote, type StageProgress } from '@/screens/today/TodayHero'
import { TodayVoice } from '@/screens/today/TodayVoice'
import { LaterSection, type LaterLookup } from '@/screens/today/TodayLater'
import { goalsInView } from '@/domain/goals'
import { frameForStreak } from '@/domain/frames'
import { formatHeaderDate, greeting, laterTodayItems, nextPendingSession, type LaterItem } from '@/domain/today'
import { UserAvatar } from '@/components/UserAvatar'
import { addDays, todayISO } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { useCheer } from '@/hooks/useCheer'
import { useStreakBumps } from '@/hooks/useStreakBumps'
import { useNovedades } from '@/hooks/useNovedades'
import { useToast } from '@/app/toast'
import { ensureCommitmentBackfill } from '@/services/backfill'
import { syncTimezone } from '@/lib/push'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import { sessionCache } from '@/lib/sessionCache'
import { useCacheMirror } from '@/hooks/useCacheMirror'
import '@/styles/today.css'
import '@/styles/habits.css'

/** Progreso de hitos por meta (etapa X de Y en el héroe). */
type MilestoneProgress = Map<string, StageProgress>

/** Instantánea de datos cacheada por sesión para pintar Hoy al instante al volver. */
type TodaySnapshot = {
  goals: Goal[]
  blocks: ScheduleBlock[]
  sessions: Session[]
  history: Session[]
  tasks: Task[]
  yesterdayPending: Task[]
  events: CalendarEvent[]
  habits: Habit[]
  habitChecks: HabitCheck[]
  habitSkips: HabitSkip[]
  milestones: MilestoneProgress
}

/** "Buenos días, Ana" (o solo el saludo si no hay nombre). */
function headlineFor(displayName: string | null | undefined, hour: number): string {
  return displayName ? `${greeting(hour)}, ${displayName}` : greeting(hour)
}

function TodayHeader({ headline, today, children }: Readonly<{ headline: string; today: string; children?: ReactNode }>) {
  return (
    <header className="today-head">
      <div className="today-head__text">
        <h1 className="today-head__greet">{headline}</h1>
        <span className="today-head__date">{formatHeaderDate(today)}</span>
      </div>
      {children}
    </header>
  )
}

/**
 * La sesión del héroe: la que corre (si su meta sigue a la vista) o, si no, la
 * siguiente pendiente de una meta activa; con su meta resuelta.
 */
function pickHero(
  runningSession: Session | null,
  todaySessions: { session: Session; goal: Goal }[],
  goalById: Map<string, Goal>,
) {
  const running = runningSession && goalById.has(runningSession.goalId) ? runningSession : null
  const pending = running
    ? null
    : nextPendingSession(todaySessions.filter((x) => x.goal.status === 'active').map((x) => x.session))
  const session = running ?? pending
  return { running, pending, session, goal: session ? goalById.get(session.goalId) : undefined }
}

export function Today() {
  const { userId, displayName, profile } = useSession()
  const navigate = useNavigate()
  const today = todayISO()

  // Cache de sesión: al volver a Hoy se pinta al instante lo último y se revalida por
  // detrás (sin skeleton). La clave incluye la fecha: un día nuevo carga en frío.
  const cacheKey = `today:${userId}:${today}`
  const cached = sessionCache.get<TodaySnapshot>(cacheKey)

  const [goals, setGoals] = useState<Goal[]>(cached?.goals ?? [])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(cached?.blocks ?? [])
  const [sessions, setSessions] = useState<Session[]>(cached?.sessions ?? [])
  const [history, setHistory] = useState<Session[]>(cached?.history ?? [])
  const [tasks, setTasks] = useState<Task[]>(cached?.tasks ?? [])
  // Tareas propias de ayer que quedaron pendientes (carryover honesto, sin culpa).
  const [yesterdayPending, setYesterdayPending] = useState<Task[]>(cached?.yesterdayPending ?? [])
  const [events, setEvents] = useState<CalendarEvent[]>(cached?.events ?? [])
  const [habits, setHabits] = useState<Habit[]>(cached?.habits ?? [])
  const [habitChecks, setHabitChecks] = useState<HabitCheck[]>(cached?.habitChecks ?? [])
  const [habitSkips, setHabitSkips] = useState<HabitSkip[]>(cached?.habitSkips ?? [])
  const [milestones, setMilestones] = useState<MilestoneProgress>(
    cached?.milestones ?? new Map(),
  )
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  // Al abrir la entrada de tarea, el foco va al campo (sin autoFocus en el JSX).
  const addInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (addingTask) addInputRef.current?.focus()
  }, [addingTask])
  const [pickingSpontaneous, setPickingSpontaneous] = useState(false)
  // Tras un ✓ rápido ofrecemos anotar el avance: es el camino más usado y el
  // diario de la meta no debería quedarse sin entradas justo ahí.
  const [notePrompt, setNotePrompt] = useState<{ sessionId: string; text: string } | null>(null)
  const { cheerMessage, cheerLeaving } = useCheer()
  const { novedad, cerrar: cerrarNovedades } = useNovedades()
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
        // Solo skeleton en carga en frío (sin cache): al volver ya hay datos que mostrar.
        if (sessionCache.get(cacheKey) === undefined) setLoading(true)
        setError(null)

        // Sesiones que quedaron corriendo de otros días → "sin confirmar".
        if (shouldGenerate) await closeStaleSessions(userId, today).catch(() => {})

        const [
          loadedGoals,
          loadedBlocks,
          loadedTasks,
          loadedEvents,
          loadedHistory,
          loadedHabits,
          loadedChecks,
          loadedYesterday,
          loadedOverrides,
          loadedSkips,
          loadedMilestones,
        ] = await Promise.all([
          listGoals(userId),
          listScheduleForUser(userId),
          listTasksForDate(userId, today),
          listEventsInRange(userId, today, today),
          // 120 días para la racha; incluye la semana en curso.
          listSessionsInRange(userId, addDays(today, -119), addDays(today, -1)),
          listHabits(userId).catch(() => []),
          listHabitChecksInRange(userId, addDays(today, -119), today).catch(() => []),
          listTasksForDate(userId, addDays(today, -1)).catch(() => []),
          listHabitOverridesInRange(userId, today, today).catch(() => []),
          listHabitSkipsInRange(userId, today, today).catch(() => []),
          milestoneProgressByGoal(userId).catch(() => new Map() as MilestoneProgress),
        ])

        // Las sesiones de hoy nacen del compromiso, no de heurísticas.
        const todaySessionList = shouldGenerate
          ? await generateSessionsForDate(userId, today, loadedBlocks)
          : await listSessionsForDate(userId, today)

        // Migración perezosa al modelo de compromiso (Fase 1). No bloquea.
        void ensureCommitmentBackfill(userId, loadedGoals).catch(() => {})
        // Recordatorios en TU hora: mantiene profiles.tz al día.
        void syncTimezone(userId)

        if (active) {
          setGoals(loadedGoals)
          setBlocks(loadedBlocks)
          setSessions(todaySessionList)
          setHistory(loadedHistory)
          setTasks(loadedTasks)
          setEvents(loadedEvents)
          setMilestones(loadedMilestones)
          // Si hoy está reorganizado (0015), las horas del día reemplazan a las
          // de siempre y todo lo demás (próxima repetición, slots) las hereda.
          const overrideByHabit = new Map(loadedOverrides.map((o) => [o.habitId, o]))
          setHabits(loadedHabits.map((h) => habitWithDayTimes(h, overrideByHabit.get(h.id))))
          setHabitChecks(loadedChecks)
          setHabitSkips(loadedSkips)
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
  }, [userId, today, refreshKey, cacheKey])

  // Al volver a la app (cambiar de pestaña, reabrir la PWA) refrescamos el día.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Mantiene el cache al día con lo que se muestra (incluidos los cambios optimistas),
  // para que al volver a Hoy se pinte al instante.
  useCacheMirror(cacheKey, !loading && !error, {
    goals,
    blocks,
    sessions,
    history,
    tasks,
    yesterdayPending,
    events,
    habits,
    habitChecks,
    habitSkips,
    milestones,
  })

  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  // Sesión en curso: protagonista del héroe, con el reloj latiendo.
  const runningSession = useMemo(
    () =>
      sessions.find((x) => x.status === 'running' && !x.pausedAt) ??
      sessions.find((x) => x.status === 'running') ??
      null,
    [sessions],
  )
  const [nowTick, setNowTick] = useState(() => new Date())
  useEffect(() => {
    // El reloj late solo mientras la sesión corre de verdad: en pausa el número
    // se congela (y el tick gastaría batería sin cambiar nada en pantalla).
    if (!runningSession || runningSession.pausedAt) return
    const id = setInterval(() => setNowTick(new Date()), 1000)
    return () => clearInterval(id)
  }, [runningSession])
  const pinnedGoals = useMemo(() => goalsInView(goals, profile.priorityGoalId), [goals, profile.priorityGoalId])
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])

  // Sesiones de hoy de metas activas, con su meta resuelta. Las saltadas no
  // aparecen: no son pendientes ni cuentan en "Sesiones x / y" (se deshacen
  // desde la Agenda, igual que allí se saltan).
  const todaySessions = useMemo(
    () =>
      sessions
        .filter((s) => s.status !== 'skipped')
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
  const doneish = (s: Session) => s.status === 'done' || s.status === 'partial'
  // "Resuelta" = ya cerrada (incluye "no pude"); "cumplida" = done o partial.
  // Distinguirlas evita que cerrar con "hoy no pude" felicite y cuente como hecha.
  const resolvedCount = todaySessions.filter((x) =>
    ['done', 'partial', 'missed'].includes(x.session.status),
  ).length
  const doneCount = todaySessions.filter((x) => doneish(x.session)).length
  const allResolved = todaySessions.length > 0 && resolvedCount === todaySessions.length

  // Días de la semana con compromiso de alguna meta activa (misma vara para
  // la racha y para el estado de cada día de la tira semanal).
  const committedWeekdays = useMemo(() => activeCommittedWeekdays(goals, blocks), [goals, blocks])
  const activeBlocks = useMemo(() => activeBlocksOf(goals, blocks), [goals, blocks])

  // Racha sobre días comprometidos (los días sin compromiso no la rompen).
  const streak = useMemo(
    () => globalStreak(goals, blocks, [...history, ...sessions], today),
    [goals, history, sessions, blocks, today],
  )

  // La racha sube: la llama late y el número entra desde abajo (solo con la pantalla abierta).
  const streakBumps = useStreakBumps(streak, loading)

  // Racha recién rota: veníamos con racha (≥2) y el último día comprometido quedó
  // sin cumplir. El chip desaparecía sin explicación — el silencio es peor.
  const streakBroken = useMemo(() => {
    if (streak !== 0 || blocks.length === 0) return null
    const all = [...history, ...sessions]
    const doneDates = doneDatesOf(all)
    if (doneDates.size === 0) return null
    // Fechas yyyy-mm-dd: el orden de texto es el cronológico.
    const lastDone = [...doneDates].sort((a, b) => a.localeCompare(b)).pop()!
    if (lastDone < addDays(today, -14)) return null
    const best = bestStreakCommitted(
      doneDates,
      committedWeekdays,
      addDays(today, -119),
      today,
      neutralDatesOf(all, activeBlocks),
    )
    if (best < 2) return null
    return { best, lastDone }
  }, [streak, history, sessions, blocks, committedWeekdays, activeBlocks, today])

  const [streakNoticeDismissed, setStreakNoticeDismissed] = useState(false)
  const showStreakNotice =
    streakBroken !== null &&
    !streakNoticeDismissed &&
    safeGetItem(`logralo.streak-broken.${streakBroken.lastDone}`) !== '1'
  function dismissStreakNotice() {
    if (streakBroken) safeSetItem(`logralo.streak-broken.${streakBroken.lastDone}`, '1')
    setStreakNoticeDismissed(true)
  }

  // Una sesión de otro día que quedó sin confirmar: el aviso más importante.
  const toResolve = useMemo(
    () =>
      history.find(
        (s) => s.status === 'unconfirmed' && s.date >= addDays(today, -7) && goalById.has(s.goalId),
      ) ?? null,
    [history, today, goalById],
  )

  // ----- Hábitos de hoy: rutinas de un toque -----
  const habitSkipSet = useMemo(() => skipSetOf(habitSkips), [habitSkips])
  const todayHabits = useMemo(
    () => habitsDueOn(habits, today, habitSkipSet),
    [habits, today, habitSkipSet],
  )
  const habitChecksToday = useMemo(
    () => habitChecks.filter((c) => c.date === today),
    [habitChecks, today],
  )
  const habitTotal = useMemo(
    () => todayHabits.reduce((sum, h) => sum + habitTarget(h), 0),
    [todayHabits],
  )
  const habitDone = useMemo(
    () => todayHabits.reduce((sum, h) => sum + habitDoneCount(habitChecksToday, h.id, today), 0),
    [todayHabits, habitChecksToday, today],
  )

  /**
   * Un toque en el check: marca la SIGUIENTE repetición pendiente; si el día
   * ya está completo, desmarca la ÚLTIMA (simétrico). Optimista, con revert.
   */
  function toggleHabit(h: Habit) {
    const { slot, add } = habitTogglePlan(h, habitChecksToday, today)
    const check: HabitCheck = { habitId: h.id, date: today, slot }
    const without = (list: HabitCheck[]) =>
      list.filter((c) => !(c.habitId === h.id && c.date === today && c.slot === slot))
    setHabitChecks((prev) => (add ? [...prev, check] : without(prev)))
    void withErrorHandling(
      async () => {
        await setHabitCheck(userId, h.id, today, add, slot)
      },
      () => setHabitChecks((prev) => (add ? without(prev) : [...prev, check])),
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
    const scheduledGoalIds = new Set(blocks.map((b) => b.goalId))
    return findForgottenGoal(goals, lastDone, withSessionToday, scheduledGoalIds)
  }, [goals, history, sessions, blocks])

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

  /**
   * ■ del héroe: cierra la sesión en curso con el resultado honesto — `done` si
   * alcanzó el objetivo, `partial` si no — y abre el panel "¿Qué lograste?".
   */
  function stopRunning(s: Session) {
    const prev = { status: s.status, actualValue: s.actualValue, endedAt: s.endedAt, pausedAt: s.pausedAt }
    const now = new Date()
    const actualValue =
      s.targetKind === 'time' ? Math.floor(elapsedSeconds(s, now) / 60) : (s.actualValue ?? 0)
    const reached = s.targetKind === 'time' ? isTimeReached(s, now) : actualValue >= s.targetValue
    const status: 'done' | 'partial' = reached ? 'done' : 'partial'
    patchSession(s.id, { status, actualValue, pausedAt: null })
    setNotePrompt({ sessionId: s.id, text: '' })
    void withErrorHandling(
      async () => {
        const updated = await finishSession(s.id, { status, actualValue })
        patchSession(s.id, updated)
      },
      () => {
        patchSession(s.id, prev)
        setNotePrompt(null)
      },
    )
  }

  /**
   * "Continuar sesión": si está en pausa, reanuda contando el rato pausado
   * (misma fórmula que la pantalla de sesión) y abre el cronómetro.
   */
  function continueSession(s: Session) {
    const pausedAt = s.pausedAt
    if (!pausedAt) {
      navigate(`/sesion/${s.id}`)
      return
    }
    const accumulated =
      s.pausedTotalSeconds +
      Math.max(0, Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000))
    void withErrorHandling(async () => {
      const updated = await resumeSession(userId, s.id, accumulated)
      patchSession(s.id, updated)
      navigate(`/sesion/${s.id}`)
    })
  }

  function saveQuickNote() {
    const prompt = notePrompt
    setNotePrompt(null)
    const text = prompt?.text.trim()
    if (!prompt || !text) return
    void withErrorHandling(async () => {
      // Se suma a lo que ya hubiera (p. ej. un avance registrado desde el coach).
      const current = todaySessions.find((x) => x.session.id === prompt.sessionId)?.session.accomplishment ?? null
      await setSessionAccomplishment(prompt.sessionId, appendAccomplishment(current, text))
      toast('Avance anotado.', 'success')
    })
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
    // Si estaba abierto el panel "¿Qué lograste?" de esta sesión, lo cerramos:
    // deshacer la vuelve a pendiente, y una nota sobre una sesión no hecha
    // quedaría huérfana (avance fantasma).
    if (notePrompt?.sessionId === s.id) setNotePrompt(null)
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
  function stripState(date: string) {
    const day = (date === today ? sessions : history).filter((x) => x.date === date)
    return dayState(date, today, day, dueBlocksForDate(activeBlocks, date))
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

  /** Evento de la agenda marcado desde Hoy: optimista, con revert. */
  function toggleEvent(id: string, done: boolean) {
    const prev = events.find((e) => e.id === id)
    setEvents((list) =>
      list.map((e) => (e.id === id ? { ...e, doneAt: done ? new Date().toISOString() : null } : e)),
    )
    void withErrorHandling(
      async () => {
        const updated = await setEventDone(id, done)
        setEvents((list) => list.map((e) => (e.id === id ? updated : e)))
      },
      () => {
        if (prev) setEvents((list) => list.map((e) => (e.id === id ? prev : e)))
      },
    )
  }

  function addTask(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    setAddingTask(false)
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

  const headline = headlineFor(displayName, new Date().getHours())

  if (loading) {
    return (
      <div className="screen today">
        <TodayHeader headline={headline} today={today} />
        <SkeletonList rows={4} />
      </div>
    )
  }
  if (error) return <LoadingScreen error={error} />

  // ----- El héroe: una sola tarjeta, el primer paso del día -----
  const hero = pickHero(runningSession, todaySessions, goalById)

  // ----- Más tarde hoy -----
  const laterItems = laterTodayItems({
    sessions: todaySessions.map((x) => ({ session: x.session, goalTitle: x.goal.title })),
    habits: todayHabits,
    habitChecks: habitChecksToday,
    tasks: userTasks,
    events: todayEvents,
    today,
    excludeSessionId: hero.session?.id ?? null,
  })

  /** Un toque en el círculo de la lista: marca o desmarca, según el tipo.
   *  Las sesiones no pasan por aquí: se cumplen con el cronómetro. */
  function toggleLater(item: LaterItem) {
    if (item.kind === 'habit') {
      const h = todayHabits.find((x) => x.id === item.id)
      if (h) toggleHabit(h)
      return
    }
    if (item.kind === 'task') {
      const t = userTasks.find((x) => x.id === item.id)
      if (t) toggleTask(t)
      return
    }
    toggleEvent(item.id, !item.done)
  }

  const laterLookup: LaterLookup = {
    sessionOf: (id) => sessions.find((x) => x.id === id),
    habitOf: (id) => todayHabits.find((x) => x.id === id),
    goalOf: (id) => goalById.get(id),
    onToggle: toggleLater,
    onResume: resumeClosed,
    onReopen: reopen,
    onOpen: (s) => navigate(`/sesion/${s.id}`),
  }

  return (
    <div className="screen today">
      <TodayHeader headline={headline} today={today}>
        {/* El marco sale de la racha que Hoy ya calcula con sus propios datos. */}
        <Link to="/perfil" aria-label="Tu perfil" className="avatar-link">
          <UserAvatar frame={frameForStreak(streak)} />
        </Link>
      </TodayHeader>

      <TodayStats
        sessionsDone={doneCount}
        sessionsTotal={todaySessions.length}
        habitsDone={habitDone}
        habitsTotal={habitTotal}
        streak={streak}
        streakBumps={streakBumps}
      />

      <PinnedGoals goals={pinnedGoals} onOpen={(id) => navigate(`/metas/${id}`)} />

      {/* La ruta de la Agenda es /calendario (el nombre visible "Agenda" no es la URL). */}
      <WeekStrip today={today} stateOf={stripState} onOpenDay={(d) => navigate(`/calendario?d=${d}`)} />

      <button
        type="button"
        className="btn btn--secondary btn--block today-organize"
        onClick={() => navigate(`/calendario?d=${today}&organizar=1`)}
      >
        <IconSparkle size={16} /> Organizar mi día con IA
      </button>

      <section className="today-section" aria-label="Tu siguiente paso">
        <span className="section-title">Tu siguiente paso</span>
        <NextStep
          running={hero.running}
          pending={hero.pending}
          goal={hero.goal}
          stage={hero.goal && milestones.get(hero.goal.id)}
          now={nowTick}
          allResolved={allResolved}
          doneCount={doneCount}
          sessionCount={todaySessions.length}
          spontaneous={{
            picking: pickingSpontaneous,
            goals: activeGoals,
            onOpen: () => setPickingSpontaneous(true),
            onPick: addSpontaneous,
          }}
          onContinue={continueSession}
          onStop={stopRunning}
          onStart={(s) => navigate(`/sesion/${s.id}?start=1`)}
          onIdeas={() => navigate('/ideas')}
          onNewGoal={() => navigate('/meta/nueva')}
        />
        {notePrompt && (
          <QuickNote
            text={notePrompt.text}
            onChange={(text) => setNotePrompt({ sessionId: notePrompt.sessionId, text })}
            onSave={saveQuickNote}
            onSkip={() => setNotePrompt(null)}
          />
        )}
      </section>

      <TodayVoice
        novedad={novedad}
        onCloseNovedad={cerrarNovedades}
        cheerMessage={cheerMessage}
        cheerLeaving={cheerLeaving}
        streakBroken={showStreakNotice ? streakBroken : null}
        onDismissStreak={dismissStreakNotice}
        toResolve={toResolve && { goalTitle: goalById.get(toResolve.goalId)?.title }}
        onResolve={() => navigate(`/sesion/${toResolve?.id}`)}
        reviewCount={reviewDue.length}
        onReview={() => navigate('/revision')}
        forgotten={forgotten}
        onForgottenSession={addSpontaneous}
        onForgottenPause={pauseForgotten}
        onForgottenAccept={acceptForgotten}
      />

      <LaterSection
        pending={laterItems.filter((i) => !i.done)}
        done={laterItems.filter((i) => i.done)}
        lookup={laterLookup}
        hasPartialSession={todaySessions.some((x) => x.session.status === 'partial')}
        yesterday={yesterdayPending}
        onBringYesterday={bringYesterdayTasks}
        onDismissYesterday={dismissYesterdayTasks}
        addTask={{
          open: addingTask,
          title: newTitle,
          inputRef: addInputRef,
          onToggle: () => setAddingTask((v) => !v),
          onTitle: setNewTitle,
          onSubmit: addTask,
        }}
      />

      {actionError && (
        <div className="alert alert--error" role="alert">
          {actionError}
        </div>
      )}
    </div>
  )
}
