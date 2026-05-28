import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { getGoal, setGoalMilestone, setGoalStatus, updateGoal, type GoalEdit } from '@/services/goals'
import { countDoneByGoal, createGoalTasks } from '@/services/tasks'
import { minutesByGoalInRange } from '@/services/events'
import { getTemplate } from '@/domain/templates'
import { pickAction } from '@/domain/dailyPlan'
import { NICHES, getNiche } from '@/domain/niches'
import { addDays, formatDuration, formatLongDate, relativeDeadline, startOfWeek, todayISO } from '@/lib/date'
import type { Goal, GoalStatus, NicheId } from '@/lib/types'
import { LoadingScreen } from '@/components/LoadingScreen'
import { Roadmap } from '@/components/Roadmap'
import { Hint } from '@/components/Hint'
import { useToast } from '@/app/toast'
import {
  IconBack,
  IconCelebrate,
  IconCheck,
  IconClock,
  IconCompass,
  IconFlag,
  IconQuote,
} from '@/components/icons'

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>()
  const { userId } = useSession()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [doneCount, setDoneCount] = useState(0)
  const [weekMinutes, setWeekMinutes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        const weekStart = startOfWeek(todayISO())
        const [g, counts, mins] = await Promise.all([
          getGoal(goalId ?? ''),
          countDoneByGoal(userId),
          minutesByGoalInRange(userId, weekStart, addDays(weekStart, 6)),
        ])
        if (!active) return
        setGoal(g)
        setDoneCount(counts.get(goalId ?? '') ?? 0)
        setWeekMinutes(mins.get(goalId ?? '') ?? 0)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar la meta.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [userId, goalId])

  async function changeStatus(status: GoalStatus) {
    if (!goal) return
    setUpdating(true)
    setError(null)
    try {
      const updated = await setGoalStatus(goal.id, status)
      setGoal(updated)
      // Al reactivar, re-sembramos la acción de hoy (si no existe) para no dejar
      // la meta "viva" pero sin nada en el plan.
      if (status === 'active') {
        try {
          await createGoalTasks(userId, todayISO(), [
            { goalId: updated.id, title: pickAction(updated, todayISO()) },
          ])
        } catch {
          /* ya había una acción de esta meta hoy */
        }
        toast('Reactivada. Te sumé una acción para hoy.', 'success')
      } else if (status === 'paused') {
        toast('Pausada. La retomás cuando quieras.')
      } else if (status === 'done') {
        toast('¡Meta lograda! Bien ahí.', 'success')
      } else if (status === 'archived') {
        toast('Archivada.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la meta.')
    } finally {
      setUpdating(false)
    }
  }

  async function updateMilestone(index: number) {
    if (!goal) return
    const max = getTemplate(goal.templateKey).milestones.length
    const clamped = Math.max(0, Math.min(index, max))
    const previous = goal.currentMilestone
    setUpdating(true)
    setError(null)
    try {
      const updated = await setGoalMilestone(goal.id, clamped)
      setGoal(updated)
      // Sólo celebramos cuando AVANZÁS (no al corregir hacia atrás).
      if (clamped > previous) {
        const total = getTemplate(updated.templateKey).milestones.length
        if (clamped >= total) toast('Recorriste todo el camino.', 'success')
        else toast(`Etapa ${clamped} cumplida.`, 'success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar tu avance.')
    } finally {
      setUpdating(false)
    }
  }

  async function saveEdit(edit: GoalEdit) {
    if (!goal) return
    const updated = await updateGoal(goal.id, edit)
    setGoal(updated)
    setEditing(false)
    toast('Meta actualizada.')
  }

  if (loading) return <LoadingScreen />
  if (error && !goal) return <LoadingScreen error={error} />
  if (!goal) {
    return (
      <div className="screen">
        <BackButton onClick={() => navigate('/metas')} />
        <div className="empty">
          <IconCompass size={44} className="muted" />
          <p className="empty__title" style={{ marginTop: 'var(--s4)' }}>
            No encontramos esa meta
          </p>
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="screen">
        <BackButton onClick={() => setEditing(false)} />
        <header className="screen__header" style={{ marginTop: 'var(--s4)' }}>
          <h1 className="screen__title">Editar meta</h1>
        </header>
        <GoalEditor goal={goal} onCancel={() => setEditing(false)} onSave={saveEdit} />
      </div>
    )
  }

  const template = getTemplate(goal.templateKey)
  const milestones = template.milestones
  const niche = getNiche(goal.area)
  const deadline = relativeDeadline(goal.targetDate)

  return (
    <div className="screen">
      <BackButton onClick={() => navigate('/metas')} />

      <header className="screen__header" style={{ marginTop: 'var(--s4)' }}>
        <div className="row" style={{ marginBottom: 'var(--s2)' }}>
          <span style={{ fontSize: 28 }}>{template.emoji}</span>
          {goal.status !== 'active' && (
            <span className="tag">
              {goal.status === 'done' ? 'Lograda 🎉' : goal.status === 'paused' ? 'Pausada' : 'Archivada'}
            </span>
          )}
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
        </div>
        <h1 className="screen__title">{goal.title}</h1>
      </header>

      <div className="stack stack--lg">
        {goal.why && (
          <div className="focus-card stack stack--sm">
            <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconQuote size={12} /> Tu porqué
            </span>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', lineHeight: 1.35 }}>
              {goal.why}
            </p>
          </div>
        )}

        <div className="card stack">
          <InfoRow label="Área" value={`${niche.emoji} ${niche.label}`} />
          <InfoRow label="Tipo" value={template.label} />
          {goal.targetDate && (
            <InfoRow
              label="Para cuándo"
              value={`${formatLongDate(goal.targetDate)}${deadline ? ` · ${deadline}` : ''}`}
            />
          )}
          {goal.successCriteria && <InfoRow label="Lo logro cuando" value={goal.successCriteria} />}
          <InfoRow
            label="Avance"
            value={`${doneCount} ${doneCount === 1 ? 'acción completada' : 'acciones completadas'}`}
          />
          {weekMinutes > 0 && (
            <InfoRow label="Esta semana" value={`${formatDuration(weekMinutes)} agendadas`} />
          )}
        </div>

        {weekMinutes === 0 && (
          <p className="faint tiny row row--sm" style={{ alignItems: 'center' }}>
            <IconClock size={14} /> Ligá bloques de tu{' '}
            <button
              className="btn--link"
              style={{ padding: 0 }}
              onClick={() => navigate('/calendario')}
            >
              agenda
            </button>{' '}
            a esta meta y vas a ver acá cuánto tiempo le dedicás por semana.
          </p>
        )}

        <div>
          <div className="row row--between" style={{ marginBottom: 'var(--s3)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>El camino</h2>
            <span className="tag">
              {goal.currentMilestone >= milestones.length
                ? 'Camino completo'
                : `Etapa ${goal.currentMilestone + 1} de ${milestones.length}`}
            </span>
          </div>
          <Roadmap
            milestones={milestones}
            currentIndex={Math.min(goal.currentMilestone, milestones.length)}
            onSelect={goal.status === 'active' ? updateMilestone : undefined}
          />
          {goal.status === 'active' && goal.currentMilestone === 0 && (
            <div style={{ marginTop: 'var(--s4)' }}>
              <Hint id="goal-milestone-click-2026-05">
                Tocá un hito del camino para marcarlo cumplido o ajustar dónde estás.
              </Hint>
            </div>
          )}
          {goal.status === 'active' && (
            <div className="stack stack--sm" style={{ marginTop: 'var(--s4)' }}>
              {goal.currentMilestone < milestones.length ? (
                <button
                  className="btn btn--ghost btn--block"
                  disabled={updating}
                  onClick={() => updateMilestone(goal.currentMilestone + 1)}
                >
                  <IconCheck size={18} /> Completé esta etapa
                </button>
              ) : (
                <div className="focus-card stack stack--sm">
                  <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
                    <IconFlag size={12} /> Recorriste todo el camino
                  </span>
                  <p className="small">Cumpliste todos los hitos. Si ya está, marcala como lograda abajo.</p>
                </div>
              )}
              <p className="faint tiny center">Tocá un hito para ajustar dónde estás.</p>
            </div>
          )}
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="stack stack--sm">
          {goal.status === 'active' && (
            <>
              <button className="btn btn--primary btn--block" disabled={updating} onClick={() => changeStatus('done')}>
                Marcar como lograda 🎉
              </button>
              <button className="btn btn--ghost btn--block" disabled={updating} onClick={() => changeStatus('paused')}>
                Pausar esta meta
              </button>
            </>
          )}
          {goal.status === 'paused' && (
            <button className="btn btn--primary btn--block" disabled={updating} onClick={() => changeStatus('active')}>
              Reactivar
            </button>
          )}
          {goal.status === 'done' && (
            <div className="focus-card stack stack--sm">
              <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
                <IconCelebrate size={14} /> ¡Meta lograda!
              </span>
              <p className="small">¿Vas por la próxima? Te paso ideas para seguir avanzando.</p>
              <button
                className="btn btn--primary btn--block"
                onClick={() => navigate(`/ideas?area=${goal.area}`)}
              >
                Ver ideas para tu próxima meta
              </button>
            </div>
          )}
          {(goal.status === 'done' || goal.status === 'archived') && (
            <button className="btn btn--ghost btn--block" disabled={updating} onClick={() => changeStatus('active')}>
              Reactivar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="iconbtn" onClick={onClick} aria-label="Volver">
      <IconBack />
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row row--between" style={{ alignItems: 'flex-start', gap: 'var(--s4)' }}>
      <span className="faint small" style={{ flex: 'none' }}>
        {label}
      </span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/** Formulario para editar los campos de una meta ya creada. */
function GoalEditor({
  goal,
  onCancel,
  onSave,
}: {
  goal: Goal
  onCancel: () => void
  onSave: (edit: GoalEdit) => Promise<void>
}) {
  const [title, setTitle] = useState(goal.title)
  const [why, setWhy] = useState(goal.why ?? '')
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '')
  const [area, setArea] = useState<NicheId>(goal.area)
  const [criteria, setCriteria] = useState(goal.successCriteria ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    onSave({
      title: title.trim(),
      why: why.trim() || null,
      targetDate: targetDate || null,
      area,
      successCriteria: criteria.trim() || null,
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
      setSaving(false)
    })
  }

  return (
    <div className="stack stack--lg">
      <div className="field">
        <span className="field__label">¿Qué querés lograr?</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="done"
          inputMode="text"
        />
      </div>
      <div className="field">
        <span className="field__label">¿Por qué? (opcional)</span>
        <textarea
          className="textarea"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="enter"
        />
      </div>
      <div className="field">
        <span className="field__label">¿Para cuándo? (opcional)</span>
        <input
          className="input"
          type="date"
          min={todayISO()}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        {targetDate && (
          <button className="btn--link" type="button" onClick={() => setTargetDate('')}>
            Quitar fecha
          </button>
        )}
      </div>
      <div className="field">
        <span className="field__label">Área</span>
        <div className="row wrap">
          {NICHES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`chip${area === n.id ? ' chip--selected' : ''}`}
              onClick={() => setArea(n.id)}
            >
              {n.emoji} {n.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field__label">Lo logro cuando… (opcional)</span>
        <input
          className="input"
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          maxLength={200}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="done"
          inputMode="text"
        />
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      <div className="stack stack--sm">
        <button
          className="btn btn--primary btn--block"
          disabled={!title.trim() || saving}
          onClick={submit}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="btn btn--ghost btn--block" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
