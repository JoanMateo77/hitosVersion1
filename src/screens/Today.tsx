import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, Task, TaskStatus } from '@/lib/types'
import { listGoals, setGoalStatus } from '@/services/goals'
import {
  createGoalTasks,
  createUserTask,
  deleteTask,
  lastDoneByGoal,
  listTasksForDate,
  setTaskStatus,
  updateTaskTitle,
} from '@/services/tasks'
import { listEventsInRange } from '@/services/events'
import { compareEvents } from '@/domain/calendar'
import {
  deriveGoalActions,
  findForgottenGoal,
  goalsDueForReview,
  pickAction,
  planningGoals,
  weeklyFocus,
} from '@/domain/dailyPlan'
import { formatWeekday, todayISO } from '@/lib/date'
import { TaskItem } from '@/components/TaskItem'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SkeletonList } from '@/components/Skeleton'
import { IconPlus, IconSparkles } from '@/components/icons'

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
  const todayEvents = useMemo(() => [...events].sort(compareEvents), [events])
  const reviewDue = useMemo(() => goalsDueForReview(goals), [goals])
  // Modo enfocado con varias metas: avisamos que el plan prioriza una sola.
  const singleMode = profile.focusMode === 'single' && activeGoals.length > 1

  // El "foco de la semana" solo aporta cuando hay varias metas en juego.
  const focus = activeGoals.length >= 2 ? weeklyFocus(goals, profile.primaryNiche) : null

  // Alerta de meta olvidada (5.2): la más estancada, para preguntar amablemente.
  const forgotten = useMemo(
    () => findForgottenGoal(goals, lastDone, tasks),
    [goals, lastDone, tasks],
  )

  function patchTask(id: string, changes: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)))
  }

  async function withErrorHandling(fn: () => Promise<void>) {
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.')
    }
  }

  function toggle(task: Task) {
    const nextStatus: TaskStatus = task.status === 'done' ? 'pending' : 'done'
    patchTask(task.id, { status: nextStatus }) // optimista
    void withErrorHandling(async () => {
      const updated = await setTaskStatus(task.id, nextStatus)
      patchTask(task.id, updated)
    })
  }

  function editTask(task: Task, title: string) {
    patchTask(task.id, { title })
    void withErrorHandling(async () => {
      await updateTaskTitle(task.id, title)
    })
  }

  function removeTask(task: Task) {
    void withErrorHandling(async () => {
      if (task.source === 'user') {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
        await deleteTask(task.id)
      } else {
        // Las acciones de metas se posponen (no se borran): así no reaparecen hoy.
        patchTask(task.id, { status: 'postponed' })
        await setTaskStatus(task.id, 'postponed')
      }
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
        <p className="muted small">{formatWeekday(today)}</p>
        <h1 className="screen__title">Tu plan de hoy</h1>
        {visibleTasks.length > 0 && (
          <p className="screen__subtitle">
            {doneCount} de {visibleTasks.length} {visibleTasks.length === 1 ? 'hecha' : 'hechas'}
          </p>
        )}
      </header>

      {focus && (
        <button
          className="focus-card stack stack--sm"
          style={{ width: '100%', textAlign: 'left', marginBottom: 'var(--s5)' }}
          onClick={() => navigate(`/metas/${focus.id}`)}
        >
          <span className="focus-card__kicker">⭐ Foco de la semana</span>
          <strong style={{ fontSize: 'var(--fs-lg)' }}>{focus.title}</strong>
          {focus.why && <span className="small muted">Tu porqué: {focus.why}</span>}
        </button>
      )}

      {reviewDue.length > 0 && (
        <button
          className="card card--tight row row--between"
          style={{
            width: '100%',
            textAlign: 'left',
            marginBottom: 'var(--s5)',
            borderColor: 'var(--primary)',
          }}
          onClick={() => navigate('/revision')}
        >
          <span className="small">
            🗓️ <strong>Revisión guiada</strong> — {reviewDue.length}{' '}
            {reviewDue.length === 1 ? 'meta para revisar' : 'metas para revisar'}
          </span>
          <span className="faint">›</span>
        </button>
      )}

      {forgotten && (
        <div
          className="card card--tight stack stack--sm"
          style={{ borderColor: 'var(--warning)', marginBottom: 'var(--s5)' }}
        >
          <span className="small">
            🔔 <strong>Hace {forgotten.days} días sin avances</strong> en “{forgotten.goal.title}”.
          </span>
          {forgotten.goal.why && (
            <span className="small muted">Lo empezaste porque: {forgotten.goal.why}</span>
          )}
          <div className="row">
            <button className="btn btn--sm btn--primary" onClick={() => addForgottenToToday(forgotten.goal)}>
              Sumar al plan de hoy
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => pauseForgotten(forgotten.goal)}>
              Pausar
            </button>
          </div>
        </div>
      )}

      {todayEvents.length > 0 && (
        <div className="card card--tight stack stack--sm" style={{ marginBottom: 'var(--s5)' }}>
          <div className="row row--between">
            <span className="faint tiny">📅 TU AGENDA DE HOY</span>
            <button className="btn--link" onClick={() => navigate('/calendario')}>
              Ver agenda
            </button>
          </div>
          {todayEvents.map((e) => (
            <button key={e.id} className="ev" onClick={() => navigate('/calendario')}>
              <span className="ev__time">{e.allDay ? 'Día' : e.startTime}</span>
              <span className="ev__title">{e.title}</span>
            </button>
          ))}
        </div>
      )}

      {singleMode && (
        <p className="muted small" style={{ marginBottom: 'var(--s4)' }}>
          🎯 Modo enfocado: tu plan prioriza una meta a la vez. Cambialo en Perfil.
        </p>
      )}

      {activeGoals.length === 0 && visibleTasks.length === 0 ? (
        <div className="empty">
          <div className="empty__emoji">🧭</div>
          <p className="empty__title">Empecemos por tu primera meta</p>
          <p className="muted" style={{ marginBottom: 'var(--s4)' }}>
            Hito arma tu plan diario a partir de lo que te proponés.
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
          {visibleTasks.length > 0 ? (
            <ul className="stack stack--sm">
              {visibleTasks.map((task) => {
                const goal = task.goalId ? goalById.get(task.goalId) : null
                return (
                  <TaskItem
                    key={task.id}
                    task={task}
                    goalTitle={goal ? goal.title : null}
                    onToggle={() => toggle(task)}
                    onEdit={(title) => editTask(task, title)}
                    onRemove={() => removeTask(task)}
                  />
                )
              })}
            </ul>
          ) : (
            <p className="muted center" style={{ padding: 'var(--s5) 0' }}>
              Sin acciones pendientes hoy. Sumá una o pedí una propuesta 👇
            </p>
          )}

          <form className="row" style={{ marginTop: 'var(--s4)' }} onSubmit={addTask}>
            <input
              className="input"
              placeholder="Agregar algo que querés hacer hoy…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={300}
            />
            <button className="iconbtn" type="submit" aria-label="Agregar tarea" disabled={!newTitle.trim()}>
              <IconPlus size={22} />
            </button>
          </form>

          {actionError && (
            <div className="alert alert--error" style={{ marginTop: 'var(--s3)' }}>
              {actionError}
            </div>
          )}
          {notice && (
            <p className="muted center small" style={{ marginTop: 'var(--s3)' }}>
              {notice}
            </p>
          )}

          {activeGoals.length > 0 && (
            <button
              className="btn btn--ghost btn--block"
              style={{ marginTop: 'var(--s5)' }}
              onClick={proposePlan}
              disabled={generating}
            >
              <IconSparkles size={18} />
              {generating ? 'Armando tu plan…' : 'No sé qué hacer hoy — proponé vos'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
