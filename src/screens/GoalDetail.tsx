import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { getGoal, setGoalStatus, updateGoal, type GoalEdit } from '@/services/goals'
import {
  addMilestone,
  deleteMilestone,
  listMilestones,
  reorderMilestones,
  setMilestoneDone,
  updateMilestoneFields,
} from '@/services/milestones'
import { listActiveGoalSchedule, listScheduleForGoal, replaceSchedule } from '@/services/schedule'
import {
  generateSessionsForDate,
  listSessionsInRange,
  sessionStatsForGoal,
} from '@/services/sessions'
import { minutesByGoalInRange } from '@/services/events'
import { getTemplate } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import { nicheAccent } from '@/lib/nicheAccent'
import { isGoalClosed } from '@/domain/goals'
import { milestoneProgress, weekConsistency } from '@/domain/sessions'
import {
  WEEKDAY_LABELS,
  formatCommitmentSummary,
  validateCommitment,
  type CommitmentBlockDraft,
} from '@/domain/commitment'
import {
  addDays,
  formatDuration,
  formatLongDate,
  formatTime12,
  relativeDeadline,
  startOfWeek,
  todayISO,
} from '@/lib/date'
import type { Goal, GoalStatus, Milestone, NicheId, ScheduleBlock, Session } from '@/lib/types'
import { LoadingScreen } from '@/components/LoadingScreen'
import { MilestoneChecklist } from '@/components/MilestoneChecklist'
import { CommitmentStep } from '@/components/wizard/CommitmentStep'
import { useToast } from '@/app/toast'
import { shareAchievement } from '@/lib/shareCard'
import {
  IconBack,
  IconCelebrate,
  IconClock,
  IconCompass,
  IconQuote,
} from '@/components/icons'

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>()
  const { userId } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  // Volver al origen real (Hoy/Agenda/Metas). En un deep-link directo (sin
  // historial in-app) location.key === 'default': caemos a /metas.
  const goBack = () => (location.key === 'default' ? navigate('/metas') : navigate(-1))

  const [goal, setGoal] = useState<Goal | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [weekSessions, setWeekSessions] = useState<Session[]>([])
  const [stats, setStats] = useState({ done: 0, minutes: 0 })
  const [weekMinutes, setWeekMinutes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)
  // Editor de compromiso inline: null = cerrado.
  const [commitDraft, setCommitDraft] = useState<CommitmentBlockDraft[] | null>(null)
  const [otherBlocks, setOtherBlocks] = useState<ScheduleBlock[]>([])
  // Camino completo recién: ofrecemos cerrar la meta (nunca se cierra sola).
  const [offerAchieve, setOfferAchieve] = useState(false)
  // Confirmación al lograr con etapas pendientes.
  const [confirmAchieve, setConfirmAchieve] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        const id = goalId ?? ''
        const weekStart = startOfWeek(todayISO())
        const [g, ms, blks, weekSess, st, mins] = await Promise.all([
          getGoal(id),
          listMilestones(id),
          listScheduleForGoal(id),
          listSessionsInRange(userId, weekStart, addDays(weekStart, 6)),
          sessionStatsForGoal(id),
          minutesByGoalInRange(userId, weekStart, addDays(weekStart, 6)),
        ])
        if (!active) return
        setGoal(g)
        setMilestones(ms)
        setBlocks(blks)
        setWeekSessions(weekSess.filter((s) => s.goalId === id))
        setStats(st)
        setWeekMinutes(mins.get(id) ?? 0)
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
    setMoreOpen(false)
    setConfirmAchieve(false)
    try {
      const updated = await setGoalStatus(goal.id, status)
      setGoal(updated)
      if (status === 'active') {
        // Al reactivar, si hoy es día comprometido la sesión vuelve a Hoy.
        await generateSessionsForDate(userId, todayISO(), blocks).catch(() => {})
        toast('Reactivada. Si hoy es tu día comprometido, la sesión ya está en Hoy.', 'success')
      } else if (status === 'paused') {
        toast('Pausada. La retomas cuando quieras.')
      } else if (status === 'done') {
        setOfferAchieve(false)
        toast('¡Meta lograda! Bien ahí. 🎉', 'success')
      } else if (status === 'archived') {
        toast('Archivada.')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar la meta.', 'warning')
    } finally {
      setUpdating(false)
    }
  }

  /** Marcar lograda respetando la regla: con pendientes, pide confirmación. */
  function requestAchieve() {
    const pending = milestones.filter((m) => m.doneAt === null)
    if (pending.length === 0) void changeStatus('done')
    else {
      setMoreOpen(false)
      setConfirmAchieve(true)
    }
  }

  async function achieveMarkingPending() {
    setUpdating(true)
    try {
      const pending = milestones.filter((m) => m.doneAt === null)
      for (const m of pending) await setMilestoneDone(m.id, true)
      setMilestones((prev) =>
        prev.map((m) => (m.doneAt === null ? { ...m, doneAt: new Date().toISOString() } : m)),
      )
    } catch {
      /* si alguna falla, igual cerramos: el usuario decidió lograrla */
    } finally {
      setUpdating(false)
    }
    void changeStatus('done')
  }

  // ----- Camino -----
  const sortedMilestones = [...milestones].sort((a, b) => a.position - b.position)

  async function toggleMilestone(m: Milestone) {
    const willBeDone = m.doneAt === null
    try {
      const updated = await setMilestoneDone(m.id, willBeDone)
      const next = milestones.map((x) => (x.id === m.id ? updated : x))
      setMilestones(next)
      if (willBeDone) {
        const pendingLeft = next.filter((x) => x.doneAt === null).length
        if (pendingLeft === 0) setOfferAchieve(true)
        else toast('Etapa cumplida. 🎉', 'success')
      } else {
        setOfferAchieve(false)
      }
    } catch {
      toast('No se pudo guardar el cambio.', 'warning')
    }
  }

  async function renameMilestone(m: Milestone, title: string) {
    const updated = await updateMilestoneFields(m.id, { title }).catch(() => null)
    if (updated) setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)))
  }

  async function dateMilestone(m: Milestone, date: string | null) {
    const updated = await updateMilestoneFields(m.id, { targetDate: date }).catch(() => null)
    if (updated) setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)))
  }

  async function moveMilestone(m: Milestone, dir: -1 | 1) {
    const list = sortedMilestones
    const index = list.findIndex((x) => x.id === m.id)
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[index], next[j]] = [next[j], next[index]]
    const renumbered = next.map((x, position) => ({ ...x, position }))
    setMilestones(renumbered)
    await reorderMilestones(renumbered.map((x) => ({ id: x.id, position: x.position }))).catch(() =>
      toast('No se pudo reordenar.', 'warning'),
    )
  }

  async function removeMilestone(m: Milestone) {
    setMilestones((prev) => prev.filter((x) => x.id !== m.id))
    await deleteMilestone(m.id).catch(() => toast('No se pudo quitar la etapa.', 'warning'))
  }

  async function appendMilestone(title: string) {
    if (!goal) return
    const created = await addMilestone(userId, goal.id, title, milestones.length).catch(() => null)
    if (created) setMilestones((prev) => [...prev, created])
  }

  // ----- Compromiso -----
  async function openCommitmentEditor() {
    setCommitDraft(
      blocks.map((b) => ({
        weekday: b.weekday,
        targetKind: b.targetKind,
        targetValue: b.targetValue,
        unit: b.unit,
        startTime: b.startTime,
      })),
    )
    const others = await listActiveGoalSchedule(userId).catch(() => [])
    setOtherBlocks(others.filter((b) => b.goalId !== goal?.id))
  }

  async function saveCommitment() {
    if (!goal || !commitDraft) return
    if (validateCommitment(commitDraft) !== null) return
    setUpdating(true)
    try {
      const next = await replaceSchedule(userId, goal.id, commitDraft)
      setBlocks(next)
      setCommitDraft(null)
      await generateSessionsForDate(userId, todayISO(), next).catch(() => {})
      toast('Compromiso actualizado.', 'success')
    } catch {
      toast('No se pudo guardar el compromiso.', 'warning')
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
  const niche = getNiche(goal.area)
  const deadline = isGoalClosed(goal.status) ? null : relativeDeadline(goal.targetDate)
  const progress = milestoneProgress(sortedMilestones)
  const consistency = weekConsistency(blocks, weekSessions, startOfWeek(todayISO()))
  const isActive = goal.status === 'active'

  return (
    <div className="screen" style={nicheAccent(goal.area)}>
      <BackButton onClick={goBack} />

      <header className="screen__header" style={{ marginTop: 'var(--s4)' }}>
        <div className="row" style={{ marginBottom: 'var(--s2)', alignItems: 'center' }}>
          <span className="goal-card__emoji" aria-hidden="true">
            {template.emoji}
          </span>
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

      <div className="detail-grid">
        <div className="detail-grid__main stack stack--lg">
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

          {/* ----- Progreso calculado: etapas + consistencia + invertido ----- */}
          <div className="card stack stack--sm">
            <div className="row row--between">
              <span className="kicker">Tu progreso</span>
              <span className="tag">
                {progress.total > 0 ? `Etapa ${Math.min(progress.done + 1, progress.total)} de ${progress.total}` : 'Sin etapas'}
              </span>
            </div>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${progress.ratio * 100}%` }} />
            </div>
            <div className="row wrap" style={{ gap: 'var(--s5)', marginTop: 'var(--s2)' }}>
              <Stat value={`${consistency.done}/${consistency.committed}`} label="sesiones esta semana" />
              <Stat value={String(stats.done)} label="sesiones totales" />
              <Stat value={formatDuration(stats.minutes)} label="invertidas" />
            </div>
          </div>

          {/* ----- Tu compromiso, visible y editable (backlog smoke #3) ----- */}
          <div className="card stack stack--sm">
            <div className="row row--between">
              <span className="kicker">Tu compromiso</span>
              {isActive && commitDraft === null && (
                <button className="btn--link" style={{ fontSize: 'var(--fs-xs)' }} onClick={() => void openCommitmentEditor()}>
                  Editar
                </button>
              )}
            </div>
            {commitDraft === null ? (
              blocks.length > 0 ? (
                <>
                  <div className="row wrap">
                    {blocks.map((b) => (
                      <span key={b.id} className="tag">
                        {WEEKDAY_LABELS[b.weekday]}
                        {b.startTime ? ` ${formatTime12(b.startTime)}` : ''} ·{' '}
                        {b.targetKind === 'time' ? `${b.targetValue} min` : `${b.targetValue} ${b.unit ?? ''}`}
                      </span>
                    ))}
                  </div>
                  <p className="small muted" style={{ margin: 0 }}>
                    {formatCommitmentSummary(blocks)}
                  </p>
                </>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>
                  Sin compromiso definido. {isActive ? 'Edítalo para que tus sesiones aparezcan en Hoy.' : ''}
                </p>
              )
            ) : (
              <>
                <CommitmentStep
                  blocks={commitDraft}
                  onChange={setCommitDraft}
                  existing={otherBlocks}
                  defaultMinutes={25}
                  defaultStart={null}
                />
                <div className="row" style={{ marginTop: 'var(--s2)' }}>
                  <button
                    className="btn btn--primary btn--sm"
                    style={{ flex: 1 }}
                    disabled={updating || validateCommitment(commitDraft) !== null}
                    onClick={() => void saveCommitment()}
                  >
                    Guardar
                  </button>
                  <button className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setCommitDraft(null)}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>


          {/* ----- El camino: checklist real ----- */}
          <div>
            <div className="row row--between" style={{ marginBottom: 'var(--s3)' }}>
              <h2 style={{ fontSize: 'var(--fs-lg)' }}>El camino</h2>
            </div>
            <MilestoneChecklist
              milestones={sortedMilestones}
              disabled={!isActive || updating}
              onToggle={(m) => void toggleMilestone(m)}
              onRename={(m, t) => void renameMilestone(m, t)}
              onSetDate={(m, d) => void dateMilestone(m, d)}
              onMove={(m, d) => void moveMilestone(m, d)}
              onDelete={(m) => void removeMilestone(m)}
              onAdd={(t) => void appendMilestone(t)}
            />
            {offerAchieve && isActive && (
              <div className="focus-card stack stack--sm" style={{ marginTop: 'var(--s4)' }}>
                <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
                  <IconCelebrate size={14} /> Recorriste todo el camino
                </span>
                <p className="small">Cumpliste todas las etapas. ¿La damos por lograda?</p>
                <div className="row wrap">
                  <button className="btn btn--primary btn--sm" disabled={updating} onClick={() => void changeStatus('done')}>
                    Sí, lograda 🎉
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setOfferAchieve(false)}>
                    Todavía no
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="detail-grid__side stack stack--lg">
          <div className="card stack">
            <InfoRow label="Área" value={`${niche.emoji} ${niche.label}`} />
            <InfoRow label="Tipo" value={template.label} />
            {goal.targetDate && (
              <InfoRow
                label="Para cuándo"
                value={`${formatLongDate(goal.targetDate)}${deadline ? ` · ${deadline}` : ''}`}
              />
            )}
            {goal.successCriteria && <InfoRow label="Lo logras cuando" value={goal.successCriteria} />}
            {weekMinutes > 0 && (
              <InfoRow label="Agendado esta semana" value={`${formatDuration(weekMinutes)} en tu agenda`} />
            )}
          </div>

          {weekMinutes === 0 && (
            <p className="faint tiny row row--sm" style={{ alignItems: 'center' }}>
              <IconClock size={14} /> También puedes bloquear tiempo extra en tu{' '}
              <button className="btn--link" style={{ padding: 0 }} onClick={() => navigate('/calendario')}>
                agenda
              </button>{' '}
              y vincularlo a esta meta.
            </p>
          )}

          <div className="stack stack--sm">
            {isActive && (
              <>
                <button className="btn btn--ghost btn--block" disabled={updating} onClick={() => changeStatus('paused')}>
                  Pausar esta meta
                </button>
                <button
                  className="btn btn--subtle btn--block"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  ⋯ Más
                </button>
                {moreOpen && (
                  <div className="stack stack--sm">
                    <button className="btn btn--ghost btn--block" disabled={updating} onClick={requestAchieve}>
                      Marcar como lograda 🎉
                    </button>
                    <button className="btn btn--ghost btn--block" disabled={updating} onClick={() => changeStatus('archived')}>
                      Archivar
                    </button>
                  </div>
                )}
                {confirmAchieve && (
                  <div className="card card--tight stack stack--sm" style={{ borderColor: 'var(--warning)' }}>
                    <strong className="small">
                      Te quedan {milestones.filter((m) => m.doneAt === null).length} etapas sin marcar.
                    </strong>
                    <div className="stack stack--sm">
                      <button className="btn btn--primary btn--sm" disabled={updating} onClick={() => void achieveMarkingPending()}>
                        Ya las cumplí — márcalas y lograla
                      </button>
                      <button className="btn btn--ghost btn--sm" disabled={updating} onClick={() => void changeStatus('done')}>
                        Cerrarla igual
                      </button>
                      <button className="btn btn--subtle btn--sm" onClick={() => setConfirmAchieve(false)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
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
                  onClick={() =>
                    void shareAchievement({
                      kicker: 'Logré mi meta',
                      title: goal.title,
                      stats: [
                        progress.total > 0 ? `${progress.done} etapas` : null,
                        stats.done > 0 ? `${stats.done} sesiones` : null,
                        stats.minutes > 0 ? `${formatDuration(stats.minutes)} invertidas` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Cumplida con compromiso',
                    }).then((r) => toast(r === 'shared' ? 'Compartido 🎉' : 'Imagen descargada.'))
                  }
                >
                  Compartir mi logro 🧡
                </button>
                <button className="btn btn--ghost btn--block" onClick={() => navigate(`/ideas?area=${goal.area}`)}>
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
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{value}</div>
      <div className="faint tiny">{label}</div>
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
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo.')
      setSaving(false)
    })
  }

  return (
    <div className="stack stack--lg">
      <div className="field">
        <label className="field__label" htmlFor="edit-title">
          ¿Qué quieres lograr?
        </label>
        <input
          id="edit-title"
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
        <label className="field__label" htmlFor="edit-why">
          ¿Por qué? (opcional)
        </label>
        <textarea
          id="edit-why"
          className="textarea"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="enter"
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="edit-date">
          ¿Para cuándo? (opcional)
        </label>
        <input
          id="edit-date"
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
        <span className="field__label" id="edit-area-label">
          Área
        </span>
        <div className="row wrap" role="group" aria-labelledby="edit-area-label">
          {NICHES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`chip${area === n.id ? ' chip--selected' : ''}`}
              aria-pressed={area === n.id}
              onClick={() => setArea(n.id)}
            >
              <span aria-hidden="true">{n.emoji}</span> {n.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="edit-criteria">
          Lo logras cuando… (opcional)
        </label>
        <input
          id="edit-criteria"
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
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <div className="stack stack--sm">
        <button className="btn btn--primary btn--block" disabled={!title.trim() || saving} onClick={submit}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="btn btn--ghost btn--block" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
