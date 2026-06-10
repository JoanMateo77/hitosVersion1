import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, Task, TaskStatus } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalStatus } from '@/services/goals'
import {
  countDoneByGoalInRange,
  createGoalTasks,
  createUserTask,
  deleteTask,
  lastDoneByGoal,
  listActiveDates,
  listTasksForDate,
  setTaskStatus,
  updateTaskTitle,
} from '@/services/tasks'
import { listEventsInRange } from '@/services/events'
import { compareEvents } from '@/domain/calendar'
import {
  actionsPerWeek,
  currentStreak,
  deriveGoalActions,
  findForgottenGoal,
  goalsDueForReview,
  pickAction,
  planningGoals,
  weeklyFocus,
} from '@/domain/dailyPlan'
import { getTemplate } from '@/domain/templates'
import { addDays, endOfWeek, formatWeekday, startOfWeek, todayISO } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { TaskItem } from '@/components/TaskItem'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import {
  IconCalendar,
  IconChevronRight,
  IconCompass,
  IconPlus,
  IconQuote,
  IconSparkles,
  IconSprout,
  IconStar,
} from '@/components/icons'
import { useCheer } from '@/hooks/useCheer'
import { useToast } from '@/app/toast'
import { ensureCommitmentBackfill } from '@/services/backfill'

export function Today() {
  const { userId, profile } = useSession()
  const navigate = useNavigate()
  const today = todayISO()

  const [goals, setGoals] = useState<Goal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [lastDone, setLastDone] = useState<Map<string, string>>(new Map())
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [focusActions, setFocusActions] = useState(0)
  const [showFocusPicker, setShowFocusPicker] = useState(false)
  const [activeDates, setActiveDates] = useState<string[]>([])
  const { cheerMessage, cheer } = useCheer()
  const { toast } = useToast()

  // Racha de días activos: momentum sutil ("tu esfuerzo se acumula").
  useEffect(() => {
    let active = true
    listActiveDates(userId, addDays(today, -60))
      .then((dates) => {
        if (active) setActiveDates(dates)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [userId, today])

  // Override manual del foco semanal: se persiste por semana (key = lunes ISO).
  // Cuando empieza una semana nueva, el override viejo deja de aplicar.
  const weekStart = startOfWeek(today)
  const overrideKey = `hito.focus-override.${weekStart}`
  const [focusOverride, setFocusOverrideState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(overrideKey)
    } catch {
      return null
    }
  })
  function setFocusOverride(goalId: string | null) {
    try {
      if (goalId) localStorage.setItem(overrideKey, goalId)
      else localStorage.removeItem(overrideKey)
    } catch {
      /* ignore */
    }
    setFocusOverrideState(goalId)
  }

  // Garantiza que la auto-generación del plan corra una sola vez por día
  // (incluso con el doble-render de StrictMode en desarrollo).
  const genGuard = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const shouldGenerate = genGuard.current !== today
    if (shouldGenerate) genGuard.current = today

    async function init() {
      try {
        setLoading(true)
        setError(null)
        const [loadedGoals, loadedLastDone, loadedEvents] = await Promise.all([
          listGoals(userId),
          lastDoneByGoal(userId),
          listEventsInRange(userId, today, today),
        ])
        let loadedTasks = await listTasksForDate(userId, today)

        if (shouldGenerate) {
          // En modo enfocado planificamos una sola meta; en multi, todas (§3.1.1).
          const planGoals = planningGoals(loadedGoals, profile.focusMode, profile.primaryNiche)
          let toCreate = deriveGoalActions(planGoals, loadedTasks, today)
          // Si el plan quedaría vacío y hay metas para planificar, garantizamos al
          // menos una acción: nunca dejar al usuario en blanco / sin guía.
          if (toCreate.length === 0 && loadedTasks.length === 0 && planGoals.length > 0) {
            toCreate = deriveGoalActions(planGoals, loadedTasks, today, { force: true })
          }
          if (toCreate.length > 0) {
            try {
              await createGoalTasks(userId, today, toCreate)
            } catch {
              // Posible carrera/duplicado: ignoramos y releemos el estado real.
            }
            loadedTasks = await listTasksForDate(userId, today)
          }
        }

        // Migración perezosa al modelo de compromiso (Fase 1). No bloquea el plan:
        // si falla, la app vieja sigue funcionando y se reintenta en la próxima sesión.
        void ensureCommitmentBackfill(userId, loadedGoals).catch(() => {})

        if (active) {
          setGoals(loadedGoals)
          setTasks(loadedTasks)
          setEvents(loadedEvents)
          setLastDone(loadedLastDone)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar tu plan.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void init()
    return () => {
      active = false
    }
  }, [userId, today, refreshKey, profile])

  // Al volver a la app (cambiar de pestaña, reabrir la PWA) refrescamos el plan.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])
  const visibleTasks = useMemo(() => tasks.filter((t) => t.status !== 'postponed'), [tasks])
  const doneCount = visibleTasks.filter((t) => t.status === 'done').length
  // Si ya hiciste algo hoy, hoy cuenta para la racha aunque la DB aún no sincronice.
  const streak = currentStreak(doneCount > 0 ? [today, ...activeDates] : activeDates, today)
  const todayEvents = useMemo(() => [...events].sort(compareEvents), [events])
  const reviewDue = useMemo(() => goalsDueForReview(goals), [goals])
  // Modo enfocado con varias metas: avisamos que el plan prioriza una sola.
  const singleMode = profile.focusMode === 'single' && activeGoals.length > 1

  // Foco semanal: override manual > computado por scoring. Mostramos siempre que
  // haya al menos 1 meta activa (incluido single-mode con 1 sola meta).
  const computedFocus = activeGoals.length >= 1 ? weeklyFocus(goals, profile.primaryNiche) : null
  const overrideGoal =
    focusOverride && activeGoals.find((g) => g.id === focusOverride) ? activeGoals.find((g) => g.id === focusOverride) : null
  const focus = overrideGoal ?? computedFocus
  const focusTarget = focus ? actionsPerWeek(getTemplate(focus.templateKey).cadence) : 0

  // Cargar acciones hechas para el foco esta semana. Se recalcula cuando cambia
  // el foco, el rango de la semana, o cuando termina una tarea (refreshKey).
  useEffect(() => {
    let active = true
    if (!focus) {
      setFocusActions(0)
      return
    }
    countDoneByGoalInRange(userId, focus.id, weekStart, endOfWeek(today))
      .then((n) => {
        if (active) setFocusActions(n)
      })
      .catch(() => {
        /* error no crítico, dejamos el contador en 0 */
      })
    return () => {
      active = false
    }
  }, [userId, focus, weekStart, today, refreshKey, tasks])

  // Alerta de meta olvidada (5.2): la más estancada, para preguntar amablemente.
  const forgotten = useMemo(
    () => findForgottenGoal(goals, lastDone, tasks),
    [goals, lastDone, tasks],
  )

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

  function toggle(task: Task) {
    const prevStatus = task.status
    const wasPending = task.status !== 'done'
    const nextStatus: TaskStatus = wasPending ? 'done' : 'pending'
    patchTask(task.id, { status: nextStatus }) // optimista
    if (wasPending) {
      const currentlyDone = visibleTasks.filter((t) => t.status === 'done').length
      const total = visibleTasks.length
      const willBeDone = currentlyDone + 1
      if (willBeDone === 1 && total > 0) cheer('Ese es el hito de hoy.')
      else if (willBeDone === total && total > 1) cheer('Terminaste tu plan de hoy. Mañana seguimos.')
    }
    void withErrorHandling(
      async () => {
        const updated = await setTaskStatus(task.id, nextStatus)
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
      if (task.source === 'user') {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
        await deleteTask(task.id)
        toast('Tarea borrada.')
      } else {
        // Las acciones de metas se posponen (no se borran): así no reaparecen hoy.
        patchTask(task.id, { status: 'postponed' })
        await setTaskStatus(task.id, 'postponed')
        toast('Saltada por hoy. Volvé si toca por frecuencia.')
      }
    })
  }

  function acceptForgotten(goal: Goal) {
    void withErrorHandling(async () => {
      const updated = await markGoalReviewed(goal.id)
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)))
      toast('Listo. Te lo recordamos más adelante.')
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

  function proposePlan() {
    setNotice(null)
    setGenerating(true)
    void withErrorHandling(async () => {
      const missing = deriveGoalActions(
        planningGoals(goals, profile.focusMode, profile.primaryNiche),
        tasks,
        today,
        { force: true },
      )
      if (missing.length === 0) {
        setNotice('Ya tenés una acción para cada meta hoy 💪')
        return
      }
      const created = await createGoalTasks(userId, today, missing)
      setTasks((prev) => [...prev, ...created])
    }).finally(() => setGenerating(false))
  }

  function addForgottenToToday(goal: Goal) {
    void withErrorHandling(async () => {
      const created = await createGoalTasks(userId, today, [
        { goalId: goal.id, title: pickAction(goal, today) },
      ])
      setTasks((prev) => [...prev, ...created])
    })
  }

  function pauseForgotten(goal: Goal) {
    void withErrorHandling(async () => {
      const updated = await setGoalStatus(goal.id, 'paused')
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)))
      toast('Pausada. La retomás cuando quieras.')
    })
  }

  if (loading) {
    return (
      <div className="screen">
        <header className="screen__header">
          <p className="muted small">{formatWeekday(today)}</p>
          <h1 className="screen__title">Tu plan de hoy</h1>
        </header>
        <SkeletonList rows={4} />
      </div>
    )
  }
  if (error) return <LoadingScreen error={error} />

  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">
          {formatWeekday(today)}
          {streak >= 2 && ` · 🔥 ${streak} días seguidos`}
        </p>
        <h1 className="screen__title">Tu plan de hoy</h1>
        {visibleTasks.length > 0 && (
          <p className="screen__subtitle">
            {doneCount === visibleTasks.length
              ? `¡Listo por hoy! 🙌 ${doneCount} de ${visibleTasks.length} hechas.`
              : doneCount === 0
                ? `Tenés ${visibleTasks.length} ${visibleTasks.length === 1 ? 'cosa' : 'cosas'} para hoy. Empezá por la primera 👇`
                : `${doneCount} de ${visibleTasks.length} hechas. Seguí con la próxima 👇`}
          </p>
        )}
      </header>

      {cheerMessage && (
        <div className="cheer" role="status" aria-live="polite">
          {cheerMessage}
        </div>
      )}

      {visibleTasks.length > 0 ? (
        <ul className="stack stack--sm">
          {visibleTasks.map((task) => {
            const goal = task.goalId ? goalById.get(task.goalId) : null
            return (
              <TaskItem
                key={task.id}
                task={task}
                goalTitle={goal ? goal.title : null}
                goalWhy={goal ? goal.why : null}
                isFocus={focus !== null && task.goalId === focus.id}
                onToggle={() => toggle(task)}
                onEdit={(title) => editTask(task, title)}
                onRemove={() => removeTask(task)}
              />
            )
          })}
        </ul>
      ) : (
        <p className="muted center" style={{ padding: 'var(--s5) 0' }}>
          {activeGoals.length === 0
            ? 'Hito brilla con una meta — y también podés anotar algo del día acá abajo.'
            : 'Sin acciones pendientes hoy. Sumá lo que quieras hacer 👇'}
        </p>
      )}

      <form className="row" style={{ marginTop: 'var(--s4)' }} onSubmit={addTask}>
        <input
          className="input"
          placeholder="Agregar algo que querés hacer hoy…"
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

      {visibleTasks.length > 0 && doneCount === visibleTasks.length && (
        <div className="card stack stack--sm" style={{ marginTop: 'var(--s5)', alignItems: 'flex-start' }}>
          <strong>Cerraste tu plan de hoy 🙌</strong>
          <p className="small muted" style={{ margin: 0 }}>
            Mañana seguimos. ¿Querés sumar una meta nueva o ver cómo venís?
          </p>
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/meta/nueva')}>
              <IconPlus size={16} /> Sumar una meta
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/progreso')}>
              Ver mi progreso
            </button>
          </div>
        </div>
      )}

      {focus && (
        <div
          className="focus-card stack stack--sm"
          style={{ ...nicheAccent(focus.area), marginTop: 'var(--s6)', marginBottom: 'var(--s5)' }}
        >
          <div className="row row--between" style={{ alignItems: 'center' }}>
            <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconStar size={12} /> Foco de la semana
            </span>
            <button
              type="button"
              className="btn--link"
              style={{ padding: 0, fontSize: 'var(--fs-xs)' }}
              onClick={() => setShowFocusPicker((v) => !v)}
            >
              {showFocusPicker ? 'Cerrar' : 'Cambiar'}
            </button>
          </div>
          <button
            className="focus-card__main"
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
            onClick={() => navigate(`/metas/${focus.id}`)}
          >
            <strong style={{ fontSize: 'var(--fs-xl)' }}>{focus.title}</strong>
            {focus.why && (
              <div className="small muted" style={{ marginTop: 4 }}>
                Tu porqué: {focus.why}
              </div>
            )}
          </button>
          {focusTarget > 0 && (
            <div className="stack stack--sm">
              <div className="row row--between small">
                <span className="muted">
                  Esta semana — <strong>{Math.min(focusActions, focusTarget)}/{focusTarget}</strong>{' '}
                  {focusTarget === 1 ? 'acción' : 'acciones'}
                </span>
                {focusActions >= focusTarget && (
                  <span className="tag" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    cumplida
                  </span>
                )}
              </div>
              <div className="progress">
                <div
                  className="progress__bar"
                  style={{ width: `${Math.min(100, (focusActions / focusTarget) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {showFocusPicker && (
            <div className="stack stack--sm" style={{ marginTop: 'var(--s2)' }}>
              <span className="kicker">Elegí qué meta priorizar esta semana</span>
              {activeGoals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`option${g.id === focus.id ? ' option--selected' : ''}`}
                  onClick={() => {
                    setFocusOverride(g.id === computedFocus?.id ? null : g.id)
                    setShowFocusPicker(false)
                    toast('Foco actualizado para esta semana.', 'success')
                  }}
                >
                  <span className="option__emoji">{getTemplate(g.templateKey).emoji}</span>
                  <span className="option__body">
                    <span className="option__label">{g.title}</span>
                    {g.id === computedFocus?.id && (
                      <span className="option__desc">Sugerida por la app</span>
                    )}
                  </span>
                </button>
              ))}
              {focusOverride && (
                <button
                  type="button"
                  className="btn--link"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    setFocusOverride(null)
                    setShowFocusPicker(false)
                    toast('Volvió a la sugerencia automática.')
                  }}
                >
                  Volver a la sugerencia automática
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {actionError && (
        <div className="alert alert--error" role="alert" style={{ marginTop: 'var(--s3)' }}>
          {actionError}
        </div>
      )}
      {notice && (
        <p className="muted center small" role="status" aria-live="polite" style={{ marginTop: 'var(--s3)' }}>
          {notice}
        </p>
      )}

      {activeGoals.length === 0 && (
        <div
          className="card stack stack--sm center"
          style={{ marginTop: 'var(--s5)', alignItems: 'center' }}
        >
          <IconCompass size={32} className="muted" />
          <p className="small muted center">
            Cuando estés, le ponés una meta y armo tu plan diario alrededor de ella.
          </p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/ideas')}>
              Ver ideas para empezar
            </button>
            <button className="btn--link" onClick={() => navigate('/meta/nueva')}>
              Escribir mi propia
            </button>
          </div>
        </div>
      )}

      {activeGoals.length > 0 && (
        // "Proponé vos" queda deshabilitado a propósito: esta función va a armar el
        // plan del día con IA (no con heurísticas). Hasta que la IA esté lista, se
        // muestra como "próximamente" para no prometer algo que todavía no hacemos
        // bien. Conservamos proposePlan/generating cableados para enchufarlos luego.
        <button
          className="btn btn--ghost btn--block"
          style={{ marginTop: 'var(--s5)' }}
          onClick={proposePlan}
          disabled
          title="Pronto vas a poder pedirme el plan del día con IA."
        >
          <IconSparkles size={18} />
          {generating ? 'Armando tu plan…' : 'Proponé mi plan con IA — pronto ✨'}
        </button>
      )}

      {/* Avisos secundarios DEBAJO del plan: lo primero que ve el usuario es su
          plan de hoy, no una pila de tarjetas que lo empuja abajo del fold. */}
      {reviewDue.length > 0 && (
        <button
          className="card card--tight row row--between"
          style={{
            width: '100%',
            textAlign: 'left',
            marginTop: 'var(--s5)',
          }}
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

      {forgotten && (
        <div
          className="card card--tight stack stack--sm"
          style={{ borderColor: 'var(--warning)', marginTop: 'var(--s4)' }}
        >
          <span className="row row--sm small" style={{ alignItems: 'flex-start' }}>
            <IconSprout size={16} className="muted" style={{ marginTop: 2, flex: 'none' }} />
            <span>
              Hace {forgotten.days} días que no tocás <strong>“{forgotten.goal.title}”</strong>.
              ¿La retomamos o la pausamos sin culpa?
            </span>
          </span>
          {forgotten.goal.why && (
            <span className="small muted">Porque {forgotten.goal.why}</span>
          )}
          <div className="row wrap">
            <button className="btn btn--sm btn--primary" onClick={() => addForgottenToToday(forgotten.goal)}>
              Sumar al plan
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

      {todayEvents.length > 0 && (
        <div className="card card--tight stack stack--sm" style={{ marginTop: 'var(--s4)' }}>
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

      {singleMode && (
        <p className="muted small row row--sm" style={{ marginTop: 'var(--s4)', alignItems: 'center' }}>
          <IconStar size={14} /> Modo enfocado: tu plan prioriza una meta a la vez. Cambialo en Perfil.
        </p>
      )}
    </div>
  )
}
