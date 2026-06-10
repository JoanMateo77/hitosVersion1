import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, Milestone } from '@/lib/types'
import { listGoals, markGoalReviewed, setGoalStatus } from '@/services/goals'
import { listMilestones, setMilestoneDone } from '@/services/milestones'
import { getTemplate } from '@/domain/templates'
import { goalsDueForReview } from '@/domain/dailyPlan'
import { LoadingScreen } from '@/components/LoadingScreen'
import { useToast } from '@/app/toast'
import { Roadmap } from '@/components/Roadmap'
import { IconCelebrate, IconCheck, IconSprout } from '@/components/icons'

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
  const [index, setIndex] = useState(0)
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
    listGoals(userId)
      .then(async (gs) => {
        const due = goalsDueForReview(gs)
        // Hitos reales de cada meta a revisar (pocas): el avance se marca ahí.
        const lists = await Promise.all(due.map((g) => listMilestones(g.id)))
        if (!active) return
        setGoals(due)
        setMilestonesByGoal(new Map(due.map((g, i) => [g.id, lists[i]])))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus metas.')
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
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.'),
      )
      .finally(() => setWorking(false))
  }

  if (loading) return <LoadingScreen />

  const total = goals.length
  const goal = goals[index]

  if (total === 0) {
    return (
      <div className="screen">
        <header className="screen__header">
          <h1 className="screen__title">Revisión guiada</h1>
        </header>
        <div className="empty">
          <IconSprout size={48} className="muted" />
          <p className="empty__title" style={{ marginTop: 'var(--s4)' }}>
            Nada para revisar por ahora
          </p>
          <p className="muted" style={{ marginBottom: 'var(--s4)' }}>
            Cuando una de tus metas toque revisión, la repasamos acá.
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
      tally.advanced > 0 && `🎯 ${tally.advanced} ${tally.advanced === 1 ? 'avanzada' : 'avanzadas'}`,
      tally.achieved > 0 && `🎉 ${tally.achieved} ${tally.achieved === 1 ? 'lograda' : 'logradas'}`,
      tally.kept > 0 && `✓ ${tally.kept} en marcha`,
      tally.paused > 0 && `⏸ ${tally.paused} en pausa`,
    ].filter(Boolean) as string[]

    return (
      <div className="screen">
        <div className="empty">
          <IconCelebrate size={56} style={{ color: 'var(--primary)' }} />
          <h1 className="screen__title" style={{ marginTop: 'var(--s4)' }}>
            Revisión lista
          </h1>
          <p className="muted">
            Repasaste {total} {total === 1 ? 'meta' : 'metas'}. Así se mantiene el rumbo.
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

  const template = getTemplate(goal.templateKey)
  const goalMilestones = [...(milestonesByGoal.get(goal.id) ?? [])].sort(
    (a, b) => a.position - b.position,
  )
  const milestones = goalMilestones.map((m) => m.title)
  const stage = goalMilestones.filter((m) => m.doneAt !== null).length
  const firstPending = goalMilestones.find((m) => m.doneAt === null) ?? null
  const canAdvance = firstPending !== null

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
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">
          Revisión guiada · Meta {index + 1} de {total}
        </p>
        <h1 className="screen__title">
          <span aria-hidden="true">{template.emoji}</span> {goal.title}
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
                  toast('¡Meta lograda! Recorriste todo el camino. 🎉', 'success')
                }, 'achieved')
              }
            >
              Logré la meta 🎉
            </button>
          ) : (
            <button
              className="btn btn--ghost btn--block"
              disabled={working}
              onClick={() =>
                act(async () => {
                  await markPendingDone(firstPending)
                  await markGoalReviewed(goal.id)
                  toast(`Etapa cumplida: ${firstPending.title} 🎉`, 'success')
                }, 'advanced')
              }
            >
              Cumplí la etapa “{firstPending.title}” 🎯
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
                toast('¡Meta lograda! 🎉', 'success')
              }, 'achieved')
            }
          >
            Marcar como lograda 🎉
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
      </div>
    </div>
  )
}
