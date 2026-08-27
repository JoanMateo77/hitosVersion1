import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, Habit, HabitCheck, Milestone, Session } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalStatus } from '@/services/goals'
import { listMilestones, setMilestoneDone } from '@/services/milestones'
import { listSessionsInRange } from '@/services/sessions'
import { listHabitChecksInRange, listHabits } from '@/services/habits'
import { goalsDueForReview } from '@/domain/dailyPlan'
import { habitCompleteDates } from '@/domain/habits'
import { addDays, formatWeekday, startOfWeek, todayISO } from '@/lib/date'
import { LoadingScreen } from '@/components/LoadingScreen'
import { useToast } from '@/app/toast'
import { Roadmap } from '@/components/Roadmap'
import { IconCelebrate, IconCheck, IconSprout } from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'

/**
 * Revisión semanal guiada (Sección 6): recorre tus metas activas una por una y
 * te deja confirmar que sigues, avanzar de etapa o pausarla. Cada confirmación
 * marca la meta como revisada (last_reviewed_at), así no vuelve a pedirla hasta
 * que pase su frecuencia de revisión.
 *
 * Vive dentro del AppShell (con el menú lateral), igual que Hoy y Metas: es una
 * tarea más de la app, no un flujo aparte que flota en el vacío.
 */
type TallyKey = 'kept' | 'advanced' | 'achieved' | 'paused'

export function Review() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [goals, setGoals] = useState<Goal[]>([])
  const [milestonesByGoal, setMilestonesByGoal] = useState<Map<string, Milestone[]>>(new Map())
  // Sesiones de los últimos 30 días: contexto para decidir con datos, no de memoria.
  const [sessions, setSessions] = useState<Session[]>([])
  // Hábitos vinculados a metas + sus marcas de esta semana: también cuentan.
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitChecks, setHabitChecks] = useState<HabitCheck[]>([])
  const [index, setIndex] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  // Tally de lo que hiciste en esta sesión, para el resumen final.
  const [tally, setTally] = useState<Record<TallyKey, number>>({
    kept: 0,
    advanced: 0,
    achieved: 0,
    paused: 0,
  })

  useEffect(() => {
    let active = true
    const today = todayISO()
    Promise.all([
      listGoals(userId),
      listSessionsInRange(userId, addDays(today, -29), today),
      listHabits(userId).catch(() => [] as Habit[]),
      listHabitChecksInRange(userId, startOfWeek(today), today).catch(() => [] as HabitCheck[]),
    ])
      .then(async ([gs, sess, allHabits, checks]) => {
        const due = goalsDueForReview(gs)
        // Hitos reales de cada meta a revisar (pocas): el avance se marca ahí.
        const lists = await Promise.all(due.map((g) => listMilestones(g.id)))
        if (!active) return
        setGoals(due)
        setSessions(sess)
        setHabits(allHabits)
        setHabitChecks(checks)
        setMilestonesByGoal(new Map(due.map((g, i) => [g.id, lists[i]])))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        console.error('Fallo al cargar la revisión:', err)
        setError('No se pudieron cargar tus metas. Inténtalo de nuevo en un momento.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  function act(fn: () => Promise<unknown>, key: TallyKey) {
    setWorking(true)
    setError(null)
    fn()
      .then(() => {
        setTally((t) => ({ ...t, [key]: t[key] + 1 }))
        setIndex((i) => i + 1)
      })
      .catch((err: unknown) => {
        // Nunca mostramos el mensaje crudo del servidor (llegaba a pintarse el
        // error de Postgres en inglés). Copy propio, siempre en español.
        console.error('Fallo al guardar la revisión:', err)
        setError('No se pudo guardar tu revisión. Inténtalo de nuevo en un momento.')
      })
      .finally(() => setWorking(false))
  }

  if (loading) return <LoadingScreen />

  const total = goals.length
  const goal = goals[index]

  if (total === 0) {
    return (
      <div className="screen review-focus">
        <header className="screen__header">
          <h1 className="screen__title">Revisión guiada</h1>
        </header>
        <div className="empty">
          <span className="empty__icon">
            <IconSprout size={32} />
          </span>
          <p className="empty__title">Nada para revisar por ahora</p>
          <p className="muted" style={{ marginBottom: 'var(--s4)' }}>
            Cuando una de tus metas toque revisión, la repasamos aquí.
          </p>
          <button className="btn btn--primary" onClick={() => navigate('/')}>
            Volver a hoy
          </button>
        </div>
      </div>
    )
  }

  if (!goal) {
    const chips = [
      tally.advanced > 0 && `${tally.advanced} ${tally.advanced === 1 ? 'avanzada' : 'avanzadas'}`,
      tally.achieved > 0 && `${tally.achieved} ${tally.achieved === 1 ? 'lograda' : 'logradas'}`,
      tally.kept > 0 && `${tally.kept} en marcha`,
      tally.paused > 0 && `${tally.paused} en pausa`,
      skipped > 0 && `${skipped} para después`,
    ].filter(Boolean) as string[]

    // Solo celebramos si de verdad revisaste algo: si saltaste todo, un cierre
    // neutro (nada que festejar) en vez de confeti inmerecido.
    const reviewedCount = total - skipped
    const reviewedAny = reviewedCount > 0

    return (
      <div className="screen review-focus">
        <div className="empty">
          {reviewedAny ? (
            <IconCelebrate size={56} style={{ color: 'var(--primary)' }} />
          ) : (
            <IconSprout size={56} style={{ color: 'var(--muted)' }} />
          )}
          <h1 className="screen__title" style={{ marginTop: 'var(--s4)' }}>
            {reviewedAny ? 'Revisión lista' : 'Lo dejaste para después'}
          </h1>
          <p className="muted">
            {reviewedAny
              ? `Repasaste ${reviewedCount} de ${total} ${total === 1 ? 'meta' : 'metas'}. Así se mantiene el rumbo.`
              : 'No revisaste ninguna meta esta vez. Cuando quieras, la retomas desde aquí.'}
          </p>
          {chips.length > 0 && (
            <div
              className="row wrap"
              style={{ justifyContent: 'center', gap: 'var(--s2)', marginTop: 'var(--s3)' }}
            >
              {chips.map((c) => (
                <span key={c} className="tag">
                  {c}
                </span>
              ))}
            </div>
          )}
          <div
            className="stack stack--sm"
            style={{ marginTop: 'var(--s6)', width: 'min(340px, 100%)' }}
          >
            <button className="btn btn--primary btn--block" onClick={() => navigate('/progreso')}>
              Ver cómo vas
            </button>
            <button className="btn--link" onClick={() => navigate('/')}>
              Volver a hoy
            </button>
          </div>
        </div>
      </div>
    )
  }

  const goalMilestones = [...(milestonesByGoal.get(goal.id) ?? [])].sort(
    (a, b) => a.position - b.position,
  )
  const milestones = goalMilestones.map((m) => m.title)
  const stage = goalMilestones.filter((m) => m.doneAt !== null).length
  const firstPending = goalMilestones.find((m) => m.doneAt === null) ?? null
  const canAdvance = firstPending !== null

  // Contexto para decidir: cuánto trabajaste esta meta últimamente.
  const goalDone = sessions.filter(
    (s) => s.goalId === goal.id && (s.status === 'done' || s.status === 'partial'),
  )
  const weekCount = goalDone.filter((s) => s.date >= startOfWeek(todayISO())).length
  const lastDoneDate = goalDone.map((s) => s.date).sort().pop() ?? null
  // Los hábitos vinculados a esta meta también cuentan en el contexto. Un día
  // suma solo si el hábito quedó completo (todas sus repeticiones).
  const linkedHabits = habits.filter((h) => h.goalId === goal.id && h.archivedAt === null)
  const habitDaysDone = linkedHabits.reduce(
    (acc, h) => acc + habitCompleteDates(h, habitChecks).size,
    0,
  )

  function markPendingDone(m: Milestone) {
    return setMilestoneDone(m.id, true).then((updated) => {
      setMilestonesByGoal((prev) => {
        const next = new Map(prev)
        next.set(
          goal.id,
          (next.get(goal.id) ?? []).map((x) => (x.id === updated.id ? updated : x)),
        )
        return next
      })
    })
  }

  return (
    <div className="screen review-focus">
      <button
        type="button"
        className="btn--link"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/')}
      >
        ← Tu día
      </button>
      <header className="screen__header">
        <p className="muted small">
          Revisión guiada · Meta {index + 1} de {total}
        </p>
        <h1 className="screen__title row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
          <NicheGlyph area={goal.area} size="md" /> {goal.title}
        </h1>
        {goal.why && <p className="screen__subtitle">Tu porqué: {goal.why}</p>}
      </header>

      <div className="card stack">
        <span className="faint tiny">
          {stage >= milestones.length
            ? 'CAMINO COMPLETO'
            : `ETAPA ${stage + 1} DE ${milestones.length}`}
        </span>
        <Roadmap milestones={milestones} currentIndex={stage} />
        <span className="faint tiny">
          {weekCount > 0
            ? `${weekCount} ${weekCount === 1 ? 'sesión cumplida' : 'sesiones cumplidas'} esta semana`
            : 'Sin sesiones esta semana'}
          {lastDoneDate
            ? ` · última el ${formatWeekday(lastDoneDate)}`
            : ' · ninguna en los últimos 30 días'}
          {linkedHabits.length > 0 &&
            ` · hábitos vinculados: ${habitDaysDone} ${
              habitDaysDone === 1 ? 'día completo' : 'días completos'
            } esta semana`}
        </span>
      </div>

      {error && (
        <div className="alert alert--error" role="alert" style={{ marginTop: 'var(--s4)' }}>
          {error}
        </div>
      )}

      <div className="stack stack--sm" style={{ marginTop: 'var(--s5)' }}>
        <button
          className="btn btn--primary btn--block"
          disabled={working}
          onClick={() =>
            act(async () => {
              await markGoalReviewed(goal.id)
              toast('Revisada. Seguimos.', 'success')
            }, 'kept')
          }
        >
          <IconCheck size={18} /> Sigo con esto
        </button>
        {canAdvance && firstPending ? (
          stage + 1 >= milestones.length ? (
            <button
              className="btn btn--ghost btn--block"
              disabled={working}
              onClick={() =>
                act(async () => {
                  // Completar la última etapa cierra el ciclo: camino completo + meta lograda.
                  await markPendingDone(firstPending)
                  await setGoalStatus(goal.id, 'done')
                  toast('¡Meta lograda! Recorriste todo el camino.', 'success')
                }, 'achieved')
              }
            >
              Logré la meta
            </button>
          ) : (
            <button
              className="btn btn--ghost btn--block"
              disabled={working}
              onClick={() =>
                act(async () => {
                  await markPendingDone(firstPending)
                  await markGoalReviewed(goal.id)
                  toast(`Etapa cumplida: ${firstPending.title}`, 'success')
                }, 'advanced')
              }
            >
              Cumplí la etapa “{firstPending.title}”
            </button>
          )
        ) : (
          <button
            className="btn btn--ghost btn--block"
            disabled={working}
            onClick={() =>
              act(async () => {
                // Camino ya completo pero la meta seguía activa: cerramos el ciclo.
                await setGoalStatus(goal.id, 'done')
                toast('¡Meta lograda!', 'success')
              }, 'achieved')
            }
          >
            Marcar como lograda
          </button>
        )}
        <button
          className="btn btn--subtle btn--block"
          disabled={working}
          onClick={() =>
            act(async () => {
              await setGoalStatus(goal.id, 'paused')
              toast('Pausada. La retomas cuando quieras.')
            }, 'paused')
          }
        >
          Pausar esta meta
        </button>
        <button
          className="btn--link"
          style={{ alignSelf: 'center' }}
          disabled={working}
          onClick={() => {
            // Saltar no marca revisada: la meta vuelve a pedir revisión la próxima vez.
            setSkipped((n) => n + 1)
            setIndex((i) => i + 1)
          }}
        >
          Saltar por ahora
        </button>
      </div>
    </div>
  )
}
