import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
  type DayState,
  appendAccomplishment,
} from '@/domain/sessions'
import { PinnedGoals } from '@/screens/today/PinnedGoals'
import { goalsInView } from '@/domain/goals'
import { rangeLabel, sessionSpan } from '@/domain/agenda'
import { frameForStreak } from '@/domain/frames'
import {
  formatCommitted,
  formatElapsed,
  formatHeaderDate,
  frameCaption,
  greeting,
  laterTodayItems,
  nextPendingSession,
  progressLine,
  SHORT_NICHE_LABELS,
  type LaterItem,
} from '@/domain/today'
import { WEEKDAY_SHORT } from '@/domain/weekdays'
import { UserAvatar } from '@/components/UserAvatar'
import { addDays, dayOfMonth, formatWeekday, startOfWeek, todayISO } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { Disclosure } from '@/components/Disclosure'
import { Hint } from '@/components/Hint'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { HabitIcon } from '@/components/HabitIcon'
import {
  IconBriefcase,
  IconCalendar,
  IconCelebrate,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFlame,
  IconLightbulb,
  IconMinus,
  IconPlay,
  IconPlus,
  IconQuote,
  IconSprout,
  IconStop,
} from '@/components/icons'
import { NicheGlyph, NicheIcon } from '@/components/NicheGlyph'
import { PathIllustration } from '@/components/PathIllustration'
import { goalAccent, goalTone } from '@/lib/goalAccent'
import { useCheer } from '@/hooks/useCheer'
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
type MilestoneProgress = Map<string, { done: number; total: number; nextTitle: string | null }>

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

/** Máximo de segmentos de una barra: más allá se dibuja una barra proporcional. */
const MAX_SEGMENTS = 12

/** Estado de un día de la tira semanal, dicho en palabras (aria-label). */
const WEEK_STATE_TEXT: Record<DayState, string> = {
  done: 'cumplido',
  partial: 'a medias',
  missed: 'sin hacer',
  future: 'pendiente',
  free: 'sin compromiso',
}

/** Glifo de estado del día: el color nunca lo dice solo. */
function weekMark(state: DayState) {
  if (state === 'done') return <IconCheck size={12} />
  if (state === 'partial') return <span className="today-week__dot" />
  if (state === 'missed') return <IconMinus size={12} />
  return null
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

  // La racha sube: la llama late y el número entra desde abajo (.fc-bump), SOLO
  // cuando el valor sube con la pantalla abierta. La carga inicial no cuenta
  // como cambio: se toma como punto de partida el primer valor ya cargado.
  const [streakSeen, setStreakSeen] = useState<number | null>(loading ? null : streak)
  const [streakBumps, setStreakBumps] = useState(0)
  if (!loading && streak !== streakSeen) {
    if (streakSeen !== null && streak > streakSeen) setStreakBumps((n) => n + 1)
    setStreakSeen(streak)
  }

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

  function addTask(e: FormEvent) {
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

  const headline = displayName ? `${greeting(new Date().getHours())}, ${displayName}` : greeting(new Date().getHours())

  if (loading) {
    return (
      <div className="screen today">
        <header className="today-head">
          <div className="today-head__text">
            <h1 className="today-head__greet">{headline}</h1>
            <span className="today-head__date">{formatHeaderDate(today)}</span>
          </div>
        </header>
        <SkeletonList rows={4} />
      </div>
    )
  }
  if (error) return <LoadingScreen error={error} />

  // ----- El héroe: una sola tarjeta, el primer paso del día -----
  const heroRunning =
    runningSession && goalById.has(runningSession.goalId) ? runningSession : null
  const heroPending = heroRunning
    ? null
    : nextPendingSession(
        todaySessions.filter((x) => x.goal.status === 'active').map((x) => x.session),
      )
  const heroSessionId = heroRunning?.id ?? heroPending?.id ?? null

  // ----- Más tarde hoy -----
  const laterItems = laterTodayItems({
    sessions: todaySessions.map((x) => ({ session: x.session, goalTitle: x.goal.title })),
    habits: todayHabits,
    habitChecks: habitChecksToday,
    tasks: userTasks,
    events: todayEvents,
    today,
    excludeSessionId: heroSessionId,
  })
  const laterPending = laterItems.filter((i) => !i.done)
  const laterDone = laterItems.filter((i) => i.done)
  const hasPartialSession = todaySessions.some((x) => x.session.status === 'partial')

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

  function laterGlyph(kind: LaterItem['kind']) {
    if (kind === 'session') return <IconBriefcase size={15} />
    if (kind === 'habit') return <IconFlame size={16} />
    if (kind === 'task') return <IconCheck size={16} />
    return <IconCalendar size={16} />
  }

  function renderLater(item: LaterItem) {
    const session = item.kind === 'session' ? sessions.find((x) => x.id === item.id) : undefined
    const partial = session?.status === 'partial'
    // El hábito muestra su propio azulejo de identidad (icono + color); el resto
    // sigue con el glifo genérico gris de la fila.
    const habit = item.kind === 'habit' ? todayHabits.find((x) => x.id === item.id) : undefined
    // La sesión es de una meta: su glifo lleva el color del área.
    const sessionGoal = session ? goalById.get(session.goalId) : undefined
    let glyph: ReactNode
    if (habit) {
      glyph = <HabitIcon habit={habit} size="sm" />
    } else if (sessionGoal) {
      glyph = (
        <span
          className="today-item__glyph today-item__glyph--goal"
          style={goalAccent(sessionGoal)}
          aria-hidden="true"
        >
          <NicheIcon area={sessionGoal.area} size={16} />
        </span>
      )
    } else {
      glyph = (
        <span className="today-item__glyph" aria-hidden="true">
          {laterGlyph(item.kind)}
        </span>
      )
    }
    return (
      <li key={`${item.kind}:${item.id}`} className={`today-item${item.done ? ' today-item--done' : ''}`}>
        {glyph}
        <span className="today-item__text">
          <span className="today-item__title">{item.title}</span>
          <span className="today-item__sub">{item.subtitle}</span>
        </span>
        {session ? (
          // Una sesión (25 min, 1 h…) no se cierra con un toque: se abre y se
          // cumple con el cronómetro. Hecha: check fijo y "Deshacer"; parcial: "Retomar".
          <>
            {partial && (
              <button type="button" className="btn--link today-item__link" onClick={() => resumeClosed(session)}>
                Retomar
              </button>
            )}
            {session.status === 'done' && (
              <button type="button" className="btn--link today-item__link" onClick={() => reopen(session)}>
                Deshacer
              </button>
            )}
            {item.done ? (
              <span className="today-item__check today-item__check--done today-item__check--static" aria-hidden="true">
                <IconCheck size={14} />
              </span>
            ) : (
              <button
                type="button"
                className="today-item__open"
                aria-label={`Abrir la sesión "${item.title}"`}
                onClick={() => navigate(`/sesion/${session.id}`)}
              >
                <IconChevronRight size={16} />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className={`today-item__check${item.done ? ' today-item__check--done' : ''}`}
            aria-pressed={item.done}
            aria-label={item.done ? `Desmarcar "${item.title}"` : `Marcar "${item.title}" como hecho`}
            onClick={() => toggleLater(item)}
          >
            {item.done && <IconCheck size={14} />}
          </button>
        )}
      </li>
    )
  }

  // UNA sola voz por vista. Prioridad: consecuencia de una acción del usuario
  // (celebración, racha rota) > pregunta que la app necesita (sin confirmar,
  // revisión, olvidada). Las tareas pendientes de ayer no compiten por esta
  // voz: viven en la lista de "Más tarde hoy".
  type Voice = 'novedades' | 'cheer' | 'streak' | 'resolve' | 'review' | 'forgotten' | null
  const voice: Voice = novedad
    ? 'novedades'
    : cheerMessage
      ? 'cheer'
      : showStreakNotice && streakBroken
        ? 'streak'
        : toResolve
          ? 'resolve'
          : reviewDue.length > 0
            ? 'review'
            : forgotten
              ? 'forgotten'
              : null

  const frame = frameForStreak(streak)
  const heroGoal = heroRunning
    ? goalById.get(heroRunning.goalId)
    : heroPending
      ? goalById.get(heroPending.goalId)
      : undefined

  /** Barra segmentada de las tarjetas de resumen (proporcional si hay demasiados). */
  function segmentedBar(done: number, total: number) {
    if (total > MAX_SEGMENTS) {
      return (
        <span className="progress" aria-hidden="true">
          <span className="progress__bar" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </span>
      )
    }
    return (
      <div className="segbar" aria-hidden="true">
        {total === 0 ? (
          <span />
        ) : (
          Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? 'done' : undefined} />)
        )}
      </div>
    )
  }

  /** Botón (o selector de meta) para sumar una sesión espontánea al día. */
  function renderSpontaneous() {
    if (!pickingSpontaneous) {
      return (
        <div className="today-hero__actions">
          <button
            type="button"
            className="today-hero__ghost"
            onClick={() => setPickingSpontaneous(true)}
          >
            <IconPlus size={16} /> Sesión espontánea
          </button>
        </div>
      )
    }
    return (
      <div className="row wrap">
        {activeGoals.map((g) => (
          <button key={g.id} type="button" className="chip today-spont" onClick={() => addSpontaneous(g)}>
            <NicheGlyph area={g.area} tone={goalTone(g)} size="sm" /> {g.title}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="screen today">
      <header className="today-head">
        <div className="today-head__text">
          <h1 className="today-head__greet">{headline}</h1>
          <span className="today-head__date">{formatHeaderDate(today)}</span>
        </div>
        {/* El marco sale de la racha que Hoy ya calcula con sus propios datos. */}
        <Link to="/perfil" aria-label="Tu perfil" className="avatar-link">
          <UserAvatar frame={frame} />
        </Link>
      </header>

      <div className="today-stats">
        <div className="today-stat">
          <span className="today-stat__label">Sesiones</span>
          <span className="today-stat__value">
            {doneCount}
            <span className="today-stat__total"> / {todaySessions.length}</span>
          </span>
          {segmentedBar(doneCount, todaySessions.length)}
        </div>
        <div className="today-stat">
          <span className="today-stat__label">Hábitos</span>
          <span className={`today-stat__value${habitTotal > 0 && habitDone === habitTotal ? ' today-stat__value--ok' : ''}`}>
            {habitDone}
            <span className="today-stat__total"> / {habitTotal}</span>
          </span>
          {segmentedBar(habitDone, habitTotal)}
        </div>
        <div className="today-stat">
          <span className="today-stat__label">Racha</span>
          {/* key: cada subida remonta el valor y la animación vuelve a correr. */}
          <span
            key={streakBumps}
            className={`today-stat__value today-stat__value--streak${streakBumps > 0 ? ' fc-bump' : ''}`}
          >
            <IconFlame size={16} className="today-stat__flame" />
            <span className="fc-bump__n">{streak}</span>
          </span>
          <span className="today-stat__caption">{frameCaption(streak)}</span>
        </div>
      </div>

      <PinnedGoals goals={pinnedGoals} onOpen={(id) => navigate(`/metas/${id}`)} />

      <fieldset className="today-week fieldset--plain" aria-label="Tu semana">
        {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i)).map((d, i) => {
          const st = stripState(d)
          const isToday = d === today
          const dayName = formatWeekday(d)
          const stateText = WEEK_STATE_TEXT[st]
          return (
            <button
              key={d}
              type="button"
              className={`today-week__day today-week__day--${st}${isToday ? ' today-week__day--today' : ''}`}
              disabled={isToday}
              aria-label={
                isToday
                  ? `${WEEKDAY_SHORT[i]} ${d.slice(8)}: hoy, ${stateText}`
                  : `Ver ${dayName.charAt(0).toLowerCase()}${dayName.slice(1)} en la agenda: ${stateText}`
              }
              // Pasado: la agenda de ese día muestra qué hiciste. Futuro: ahí se
              // planifica. Hoy no navega: ya estás en Hoy. La ruta de la Agenda
              // es /calendario (el nombre visible "Agenda" no es la URL).
              onClick={() => navigate(`/calendario?d=${d}`)}
            >
              <span className="today-week__label">{WEEKDAY_SHORT[i]}</span>
              <span className="today-week__num">{dayOfMonth(d)}</span>
              <span className="today-week__mark" aria-hidden="true">
                {weekMark(st)}
              </span>
            </button>
          )
        })}
      </fieldset>

      <section className="today-section" aria-label="Tu siguiente paso">
        <span className="section-title">Tu siguiente paso</span>

        {heroRunning && heroGoal ? (
          // La sesión es de una meta: la franja superior lleva el color de su área
          // (de qué se habla); el botón azul, la acción.
          <div className="today-hero today-hero--goal" style={goalAccent(heroGoal)}>
            <div className="today-hero__band">
              <div className="today-hero__top">
                <span className="today-hero__state">
                  <span className="today-hero__dot" aria-hidden="true" />
                  {heroRunning.pausedAt ? 'Sesión en pausa' : 'Sesión en curso'}
                </span>
                <span className="today-hero__meta">
                  {SHORT_NICHE_LABELS[heroGoal.area]}
                  {(() => {
                    const ms = milestones.get(heroGoal.id)
                    if (!ms || ms.total === 0) return ''
                    return ` · Etapa ${Math.min(ms.done + 1, ms.total)} de ${ms.total}`
                  })()}
                </span>
              </div>
              <div className="today-hero__head">
                <NicheGlyph area={heroGoal.area} tone={goalTone(heroGoal)} size="md" />
                <span className="today-hero__title">{heroGoal.title}</span>
              </div>
            </div>
            <div className="today-hero__body">
              <span className="today-hero__sub">{progressLine(heroRunning, nowTick)}</span>
              <span className="today-hero__clock">
                {heroRunning.targetKind === 'time'
                  ? formatElapsed(elapsedSeconds(heroRunning, nowTick))
                  : `${heroRunning.actualValue ?? 0}/${heroRunning.targetValue}`}
              </span>
            </div>
            <div className="today-hero__actions">
              <button
                type="button"
                className="btn btn--primary today-hero__cta"
                onClick={() => continueSession(heroRunning)}
              >
                <IconPlay size={16} /> Continuar sesión
              </button>
              <button
                type="button"
                className="today-hero__square"
                aria-label="Terminar la sesión"
                onClick={() => stopRunning(heroRunning)}
              >
                <IconStop size={18} />
              </button>
            </div>
          </div>
        ) : heroPending && heroGoal ? (
          <div className="today-hero today-hero--goal" style={goalAccent(heroGoal)}>
            <div className="today-hero__band">
              <div className="today-hero__top">
                <span className="today-hero__state">
                  <span className="today-hero__dot" aria-hidden="true" />Siguiente sesión
                </span>
                <span className="today-hero__meta">
                  {(() => {
                    const span = sessionSpan(
                      heroPending.plannedTime,
                      heroPending.targetKind,
                      heroPending.targetValue,
                    )
                    return span.start ? rangeLabel(span.start, span.end) : 'Sin hora'
                  })()}
                </span>
              </div>
              <div className="today-hero__head">
                <NicheGlyph area={heroGoal.area} tone={goalTone(heroGoal)} size="md" />
                <span className="today-hero__title">{heroGoal.title}</span>
              </div>
            </div>
            <div className="today-hero__body">
              <span className="today-hero__sub">
                {heroPending.targetKind === 'time'
                  ? `${formatCommitted(heroPending)} comprometidos`
                  : formatCommitted(heroPending)}
              </span>
            </div>
            <div className="today-hero__actions">
              <button
                type="button"
                className="btn btn--primary today-hero__cta"
                onClick={() => navigate(`/sesion/${heroPending.id}?start=1`)}
              >
                <IconPlay size={16} /> Empezar sesión
              </button>
            </div>
          </div>
        ) : allResolved ? (
          <div className="today-hero">
            <div className="today-hero__top">
              {/* Estado del día: verde si se cumplió todo; neutro si no (sin culpa). */}
              <span
                className={`chip-state${doneCount === todaySessions.length ? ' chip-state--ok' : ''}`}
              >
                {doneCount === todaySessions.length && <IconCheck size={12} />}
                Compromiso de hoy
              </span>
            </div>
            <span className="today-hero__title">
              {doneCount === todaySessions.length
                ? 'Cumpliste tu compromiso de hoy.'
                : doneCount === 0
                  ? 'Hoy no pudiste. Mañana se empieza de nuevo.'
                  : `Cerraste el día: ${doneCount} de ${todaySessions.length} ${doneCount === 1 ? 'cumplida' : 'cumplidas'}.`}
            </span>
            {renderSpontaneous()}
          </div>
        ) : activeGoals.length > 0 ? (
          <div className="today-hero">
            <div className="today-hero__top">
              <span className="today-hero__state">
                <span className="today-hero__dot" aria-hidden="true" />Día libre
              </span>
            </div>
            <span className="today-hero__title">Hoy no comprometiste sesiones.</span>
            {renderSpontaneous()}
          </div>
        ) : (
          <div className="today-hero today-hero--empty">
            <PathIllustration width={180} done={1} className="today-hero__art" />
            <div className="today-hero__top">
              <span className="today-hero__state">Empieza aquí</span>
            </div>
            <span className="today-hero__title">Tu día se arma alrededor de una meta.</span>
            <div className="today-hero__actions">
              <button type="button" className="btn btn--primary today-hero__cta" onClick={() => navigate('/ideas')}>
                Ver ideas para empezar
              </button>
            </div>
            <button type="button" className="btn--link today-hero__link" onClick={() => navigate('/meta/nueva')}>
              Escribir mi propia meta
            </button>
          </div>
        )}

        {notePrompt && (
          <div className="today-note">
            <label className="field__label" htmlFor="quick-note">
              ¿Qué lograste? (opcional)
            </label>
            <div className="row">
              <input
                id="quick-note"
                className="input"
                autoFocus
                maxLength={200}
                placeholder="Ej: terminé el capítulo 3…"
                value={notePrompt.text}
                onChange={(e) => setNotePrompt({ sessionId: notePrompt.sessionId, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveQuickNote()
                  if (e.key === 'Escape') setNotePrompt(null)
                }}
              />
              <button className="btn btn--sm btn--primary" onClick={saveQuickNote}>
                Guardar
              </button>
              <button className="btn btn--sm btn--subtle" onClick={() => setNotePrompt(null)}>
                Omitir
              </button>
            </div>
          </div>
        )}
      </section>

      {voice === 'novedades' && novedad && (
        <output className="today-row">
          <span className="today-row__glyph" aria-hidden="true">
            <IconLightbulb size={16} />
          </span>
          <span className="today-row__text">
            <span className="today-row__title">Novedades · {novedad.titulo}</span>
            <span className="today-row__sub">{novedad.items[0]}</span>
          </span>
          <button className="btn--link today-row__action" onClick={cerrarNovedades}>
            Entendido
          </button>
        </output>
      )}

      {voice === 'cheer' && cheerMessage && (
        <div
          className={`today-row cheer${cheerLeaving ? ' cheer--leaving' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="today-row__glyph" aria-hidden="true">
            <IconCelebrate size={16} />
          </span>
          <span className="today-row__text">
            <span className="today-row__title">{cheerMessage}</span>
          </span>
        </div>
      )}

      {voice === 'streak' && streakBroken && (
        <output className="today-row">
          <span className="today-row__glyph" aria-hidden="true">
            <IconFlame size={16} />
          </span>
          <span className="today-row__text">
            <span className="today-row__title">Tu racha se reinició</span>
            <span className="today-row__sub">
              Récord: {streakBroken.best} días. Hoy se empieza otra.
            </span>
          </span>
          <button className="btn--link today-row__action" onClick={dismissStreakNotice}>
            Entendido
          </button>
        </output>
      )}

      {voice === 'resolve' && toResolve && (
        <button
          type="button"
          className="today-row today-row--link"
         
          onClick={() => navigate(`/sesion/${toResolve.id}`)}
        >
          <span className="today-row__glyph" aria-hidden="true">
            <IconClock size={16} />
          </span>
          <span className="today-row__text">
            <span className="today-row__title">Quedó una sesión abierta</span>
            <span className="today-row__sub">
              {goalById.get(toResolve.goalId)?.title} · ¿Cómo te fue?
            </span>
          </span>
          <IconChevronRight size={16} className="today-row__chev" />
        </button>
      )}

      {voice === 'review' && (
        <button
          type="button"
          className="today-row today-row--link"
         
          onClick={() => navigate('/revision')}
        >
          <span className="today-row__glyph" aria-hidden="true">
            <IconQuote size={16} />
          </span>
          <span className="today-row__text">
            <span className="today-row__title">Revisión guiada</span>
            <span className="today-row__sub">
              {reviewDue.length} {reviewDue.length === 1 ? 'meta lista' : 'metas listas'} para revisar · 3 min
            </span>
          </span>
          <IconChevronRight size={16} className="today-row__chev" />
        </button>
      )}

      {voice === 'forgotten' && forgotten && (
        <div className="today-row today-row--stack">
          <span className="today-row__glyph" aria-hidden="true">
            <IconSprout size={16} />
          </span>
          <span className="today-row__text">
            <span className="today-row__title">
              Hace {forgotten.days} días sin {forgotten.goal.title}
            </span>
            <span className="today-row__sub">¿La retomas o la pausas?</span>
            <span className="today-row__actions">
              <button className="btn--link" onClick={() => addSpontaneous(forgotten.goal)}>
                Sesión hoy
              </button>
              <button className="btn--link" onClick={() => pauseForgotten(forgotten.goal)}>
                Pausar
              </button>
              <button className="btn--link" onClick={() => acceptForgotten(forgotten.goal)}>
                Está bien así
              </button>
            </span>
          </span>
        </div>
      )}

      <section className="today-section" aria-label="Más tarde hoy">
        <div className="today-later__head">
          <span className="section-title">Más tarde hoy</span>
          <button
            type="button"
            className="today-later__add"
            aria-label="Agregar algo para hoy"
            aria-expanded={addingTask}
            onClick={() => setAddingTask((v) => !v)}
          >
            <IconPlus size={16} />
          </button>
        </div>

        {addingTask && (
          <form className="row" onSubmit={addTask}>
            <input
              ref={addInputRef}
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
              <IconPlus size={18} />
            </button>
          </form>
        )}

        <ul className="today-list">
          {yesterdayPending.length > 0 && (
            <li className="today-item">
              <span className="today-item__glyph" aria-hidden="true">
                <IconClock size={16} />
              </span>
              <span className="today-item__text">
                <span className="today-item__title">
                  {yesterdayPending.length === 1
                    ? '1 tarea de ayer'
                    : `${yesterdayPending.length} tareas de ayer`}
                </span>
                <span className="today-item__sub">
                  {yesterdayPending.map((t) => t.title).join(' · ')}
                </span>
              </span>
              <span className="today-item__links">
                <button className="btn--link today-item__link" onClick={bringYesterdayTasks}>
                  Traer
                </button>
                <button className="btn--link today-item__link" onClick={dismissYesterdayTasks}>
                  Descartar
                </button>
              </span>
            </li>
          )}
          {laterPending.map(renderLater)}
          {laterPending.length === 0 && yesterdayPending.length === 0 && (
            <li className="today-item today-item--empty">
              <span className="today-item__sub">Nada más por hoy</span>
            </li>
          )}
        </ul>

        {laterDone.length > 0 && (
          <Disclosure summary={`Hecho hoy · ${laterDone.length}`}>
            <ul className="today-list">{laterDone.map(renderLater)}</ul>
            {hasPartialSession && (
              <Hint id="session-partial-2026-06">
                Una sesión <strong>parcial</strong> cuenta lo que hiciste y no rompe tu racha.
                Puedes retomarla para completarla.
              </Hint>
            )}
          </Disclosure>
        )}
      </section>

      {actionError && (
        <div className="alert alert--error" role="alert">
          {actionError}
        </div>
      )}
    </div>
  )
}
