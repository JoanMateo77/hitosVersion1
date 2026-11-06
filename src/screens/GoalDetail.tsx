import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { deleteGoal, getGoal, setGoalStatus, updateGoal, type GoalEdit } from '@/services/goals'
import {
  addMilestone,
  deleteMilestone,
  listMilestones,
  reorderMilestones,
  setMilestoneDone,
  updateMilestoneFields,
} from '@/services/milestones'
import { listActiveGoalSchedule, listScheduleForGoal, applyScheduleChange } from '@/services/schedule'
import {
  createSpontaneousSession,
  finishSession,
  generateSessionsForDate,
  listAccomplishments,
  listSessionsInRange,
  sessionStatsForGoal,
  setSessionAccomplishment,
} from '@/services/sessions'
import { minutesByGoalInRange } from '@/services/events'
import { listHabitChecksInRange, listHabits, setHabitCheck } from '@/services/habits'
import { habitDoneCount, habitIsComplete, habitTarget, nextSlot } from '@/domain/habits'
import { getTemplate } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import { formatPercent } from '@/lib/format'
import { coverAccent, goalAccent, goalTone, parseGoalColor } from '@/lib/goalAccent'
import { friendlyError } from '@/lib/errors'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/lib/formDraft'
import { isGoalClosed } from '@/domain/goals'
import { appendAccomplishment, milestoneProgress, sessionForNote, weekConsistency } from '@/domain/sessions'
import {
  blockTimeLabel,
  preferredStartTime,
  validateCommitment,
  weekdayMon0,
  type CommitmentBlockDraft,
} from '@/domain/commitment'
import {
  addDays,
  formatAmount,
  formatDuration,
  formatLongDate,
  relativeDeadline,
  startOfWeek,
  todayISO,
} from '@/lib/date'
import type { Goal, GoalColor, GoalStatus, Habit, HabitCheck, Milestone, NicheId, ScheduleBlock, Session } from '@/lib/types'
import { LoadingScreen } from '@/components/LoadingScreen'
import { GoalCover } from '@/components/GoalCover'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { discardGoalCover } from '@/services/goalCovers'
import { GoalAppearance } from '@/screens/goal/GoalAppearance'
import { Celebration } from '@/components/Celebration'
import { MilestoneChecklist } from '@/components/MilestoneChecklist'
import { CommitmentStep } from '@/components/wizard/CommitmentStep'
import { useToast } from '@/app/toast'
import { shareAchievement } from '@/lib/shareCard'
import { successHaptic } from '@/lib/haptics'
import {
  IconCalendar,
  IconChevronLeft,
  IconCelebrate,
  IconCheck,
  IconDots,
  IconQuote,
  IconShare,
} from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'
import { PathIllustration } from '@/components/PathIllustration'
import { Disclosure } from '@/components/Disclosure'
import { GoalNotes } from '@/screens/notes/GoalNotes'
import { sessionCache } from '@/lib/sessionCache'
import { useCacheMirror } from '@/hooks/useCacheMirror'
import { getGoalAi, type GoalAi } from '@/services/goalCoach'
import { applyStageChanges, type ChatContext, type StageChange } from '@/domain/coachChat'
import { coachNudge } from '@/domain/coachNudge'
import type { GoalPlanStage } from '@/domain/goalPlan'
import { GoalCoach } from '@/components/coach/GoalCoach'
import { WEEKDAY_SHORT } from '@/domain/weekdays'
import { countLabel } from '@/lib/plural'

/**
 * Saca una meta borrada del cache de sesión: sin esto, /metas y Hoy la pintan
 * desde el cache hasta revalidar (y la conservan si la revalidación falla).
 */
function forgetGoalInCache(userId: string, goalId: string) {
  sessionCache.delete(`goal:${goalId}`)
  sessionCache.delete(`today:${userId}:${todayISO()}`)
  const goalsKey = `goals:${userId}`
  const list = sessionCache.get<{ goals: Goal[] }>(goalsKey)
  if (list) sessionCache.set(goalsKey, { ...list, goals: list.goals.filter((g) => g.id !== goalId) })
}

const STATUS_TAG: Record<Exclude<GoalStatus, 'active'>, string> = {
  done: 'Lograda',
  paused: 'Pausada',
  archived: 'Archivada',
}

/** Clase del tramo de la barra segmentada para una etapa. */
function segClass(m: Milestone, justDone: boolean, currentStage: Milestone | null): string {
  if (justDone) return 'just-done'
  if (m.doneAt !== null) return 'done'
  if (m === currentStage) return 'current'
  return ''
}

/** Título de la tarjeta "Ahora": la etapa actual o el estado del camino. */
function nowStageTitle(currentStage: Milestone | null, total: number): string {
  if (currentStage) return currentStage.title
  return total > 0 ? 'Cumpliste todas las etapas' : 'Arma tu camino abajo'
}

/** Rótulo corto del punto del camino: "Etapa 2 de 5", "Sin etapas"… */
function stageLabelFor(sorted: Milestone[], currentStage: Milestone | null, total: number): string {
  if (total === 0) return 'Sin etapas'
  if (!currentStage) return 'Camino completo'
  return `Etapa ${sorted.indexOf(currentStage) + 1} de ${total}`
}

/** Instantánea de datos cacheada por sesión para pintar el detalle al instante. */
type GoalSnapshot = {
  goal: Goal | null
  milestones: Milestone[]
  blocks: ScheduleBlock[]
  weekSessions: Session[]
  advances: Session[]
  stats: { done: number; minutes: number }
  weekMinutes: number
  habits: Habit[]
  habitChecks: HabitCheck[]
}

/** Aviso del coach para una meta activa, según su ritmo de la semana y su camino. */
function goalNudge(
  goal: Goal,
  consistency: { committed: number; done: number },
  progress: { done: number; total: number },
): string | null {
  const ageDays = Math.floor((Date.now() - Date.parse(goal.createdAt)) / 86_400_000)
  return coachNudge({
    committed: consistency.committed,
    done: consistency.done,
    weekday: weekdayMon0(todayISO()),
    pendingStages: progress.total - progress.done,
    doneStages: progress.done,
    ageDays: Number.isFinite(ageDays) ? ageDays : 0,
  })
}

/** Todo lo que muestra el detalle de una meta, en paralelo. */
async function loadGoalDetail(userId: string, id: string) {
  const weekStart = startOfWeek(todayISO())
  const [g, ms, blks, weekSess, st, mins, adv, allHabits, checks] = await Promise.all([
    getGoal(id),
    listMilestones(id),
    listScheduleForGoal(id),
    listSessionsInRange(userId, weekStart, addDays(weekStart, 6)),
    sessionStatsForGoal(id),
    minutesByGoalInRange(userId, weekStart, addDays(weekStart, 6)),
    listAccomplishments(id),
    // Integraciones: degradan a vacío sin romper el detalle.
    listHabits(userId).catch(() => [] as Habit[]),
    listHabitChecksInRange(userId, addDays(todayISO(), -119), todayISO()).catch(() => [] as HabitCheck[]),
  ])
  return { g, ms, blks, weekSess, st, mins, adv, allHabits, checks }
}

/** Aplica los cambios del coach a las etapas guardadas y devuelve la lista final ordenada. */
async function applyChangesToMilestones(
  userId: string,
  goalId: string,
  list: Milestone[],
  changes: StageChange[],
): Promise<Milestone[]> {
  const norm = (t: string) => t.trim().toLowerCase()
  for (const c of changes) {
    const m = list.find((x) => norm(x.title) === norm(c.title))
    if (c.kind === 'remove' && m) await deleteMilestone(m.id)
    else if (c.kind === 'rename' && m) await updateMilestoneFields(m.id, { title: c.newTitle })
    else if (c.kind === 'add' && !m) await addMilestone(userId, goalId, c.title, list.length)
  }
  // El orden final sale de la misma función pura que usa el asistente.
  const fresh = await listMilestones(goalId)
  const order = applyStageChanges(
    list.map((m) => m.title),
    changes,
  )
  const placed = order
    .map((t) => fresh.find((f) => norm(f.title) === norm(t)))
    .filter((m): m is Milestone => m !== undefined)
  const final = [...placed, ...fresh.filter((f) => !placed.includes(f))].map((m, position) => ({ ...m, position }))
  await reorderMilestones(final.map((m) => ({ id: m.id, position: m.position })))
  return final
}

/**
 * Guarda la nota de avance del coach. Si hoy ya hay una sesión de esta meta,
 * la nota se suma a su avance. Si no, el paso del coach fue el trabajo del día:
 * se crea una sesión espontánea y se cierra como hecha, igual que "La completé"
 * (actualValue = su objetivo).
 */
async function saveProgressNote(
  userId: string,
  goalId: string,
  blocks: ScheduleBlock[],
  defaultMinutes: number,
  note: string,
): Promise<void> {
  const today = todayISO()
  // Idempotente: si hoy es día comprometido y la sesión aún no existía, la
  // crea (así no queda una espontánea duplicada junto a la del horario).
  const sessions = await generateSessionsForDate(userId, today, blocks)
  const existing = sessionForNote(sessions, goalId, today)
  if (existing) {
    await setSessionAccomplishment(existing.id, appendAccomplishment(existing.accomplishment, note))
    return
  }
  const ownBlock = blocks.find((b) => b.weekday === weekdayMon0(today)) ?? blocks[0]
  const created = await createSpontaneousSession(userId, goalId, today, {
    targetKind: ownBlock?.targetKind ?? 'time',
    targetValue: ownBlock?.targetValue ?? defaultMinutes,
    unit: ownBlock?.unit ?? null,
  })
  await finishSession(created.id, { status: 'done', actualValue: created.targetValue })
  await setSessionAccomplishment(created.id, appendAccomplishment(null, note))
}

/** Etiqueta del check de un hábito vinculado: desmarcar, siguiente repetición o marcar. */
function linkedHabitLabel(title: string, done: boolean, doneCount: number, target: number): string {
  if (done) return `Desmarcar hábito de hoy: ${title}`
  if (target > 1) return `Marcar repetición ${doneCount + 1} de ${target}: ${title}`
  return `Marcar hábito de hoy: ${title}`
}

/** "Tu compromiso": la agenda de la meta, con editarla o sacarla de la agenda. */
function CommitmentSection({
  isActive,
  blocks,
  commitDraft,
  otherBlocks,
  defaultMinutes,
  defaultStart,
  updating,
  confirmUnschedule,
  onConfirmUnschedule,
  onOpenEditor,
  onDraft,
  onSave,
  onUnschedule,
}: Readonly<{
  isActive: boolean
  blocks: ScheduleBlock[]
  commitDraft: CommitmentBlockDraft[] | null
  otherBlocks: ScheduleBlock[]
  defaultMinutes: number
  defaultStart: string | null
  updating: boolean
  confirmUnschedule: boolean
  onConfirmUnschedule: (value: boolean) => void
  onOpenEditor: () => void
  onDraft: (draft: CommitmentBlockDraft[] | null) => void
  onSave: () => void
  onUnschedule: () => void
}>) {
  return (
    <div className="card stack stack--sm">
      <div className="row row--between">
        <span className="section-title">Tu compromiso</span>
        {isActive && commitDraft === null && blocks.length > 0 && (
          <button className="btn--link" style={{ fontSize: 'var(--fs-xs)' }} onClick={onOpenEditor}>
            Editar
          </button>
        )}
      </div>
      {commitDraft === null && blocks.length > 0 && (
        <>
          <div className="row wrap">
            {blocks.map((b) => (
              <span key={b.id} className="tag">
                {WEEKDAY_SHORT[b.weekday]} · {blockTimeLabel(b)}
              </span>
            ))}
          </div>
          {isActive &&
            (!confirmUnschedule ? (
              <button
                className="btn--link"
                style={{ fontSize: 'var(--fs-xs)', alignSelf: 'flex-start' }}
                onClick={() => onConfirmUnschedule(true)}
              >
                Sacar de la agenda
              </button>
            ) : (
              <div className="card card--tight stack stack--sm" style={{ borderColor: 'var(--danger)' }}>
                <p className="small" style={{ margin: 0 }}>
                  La meta queda sin horario; la seguirás viendo arriba en Hoy. Tu historial se conserva.
                </p>
                <div className="row wrap">
                  <button
                    className="btn btn--danger btn--sm"
                    disabled={updating}
                    onClick={onUnschedule}
                  >
                    Sacar de la agenda
                  </button>
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={updating}
                    onClick={() => onConfirmUnschedule(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
        </>
      )}
      {commitDraft === null && blocks.length === 0 && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Sin agenda
          </p>
          {isActive && (
            <button
              className="btn btn--secondary btn--sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={onOpenEditor}
            >
              Agregar agenda
            </button>
          )}
        </>
      )}
      {commitDraft !== null && (
        <>
          <CommitmentStep
            blocks={commitDraft}
            onChange={onDraft}
            existing={otherBlocks}
            defaultMinutes={defaultMinutes}
            defaultStart={defaultStart}
          />
          <div className="row" style={{ marginTop: 'var(--s2)' }}>
            <button
              className="btn btn--primary btn--sm"
              style={{ flex: 1 }}
              disabled={updating || validateCommitment(commitDraft) !== null}
              onClick={onSave}
            >
              Guardar
            </button>
            <button className="btn btn--secondary btn--sm" style={{ flex: 1 }} onClick={() => onDraft(null)}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Eliminar la meta, con confirmación en dos pasos. */
function DeleteGoal({
  confirming,
  deleting,
  onConfirm,
  onDelete,
}: Readonly<{ confirming: boolean; deleting: boolean; onConfirm: (value: boolean) => void; onDelete: () => void }>) {
  return (
    <>
      {!confirming ? (
      <button
        className="btn btn--danger-link"
        style={{ alignSelf: 'center' }}
        onClick={() => onConfirm(true)}
      >
        Eliminar meta
      </button>
    ) : (
      <div className="card card--tight stack stack--sm" style={{ borderColor: 'var(--danger)' }}>
        <strong className="small">¿Eliminar esta meta para siempre?</strong>
        <p className="small muted" style={{ margin: 0 }}>
          Se borran sus etapas, su agenda, sus sesiones y sus tareas. Las notas, eventos y hábitos vinculados se
          conservan, sin vínculo. Si solo quieres sacarla de la vista, mejor archívala.
        </p>
        <div className="row wrap">
          <button className="btn btn--danger btn--sm" onClick={onDelete} disabled={deleting}>
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => onConfirm(false)} disabled={deleting}>
            Cancelar
          </button>
        </div>
      </div>
    )}
    </>
  )
}

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>()
  const { userId, profile, setProfile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  // Volver al origen real (Hoy/Agenda/Metas). En un deep-link directo (sin
  // historial in-app) location.key === 'default': caemos a /metas.
  const goBack = () => (location.key === 'default' ? navigate('/metas') : navigate(-1))

  // Cache de sesión: al volver al detalle se pinta al instante lo último y se revalida
  // por detrás (sin skeleton). Clave por meta; siempre se entra desde otra pantalla.
  const cacheKey = `goal:${goalId ?? ''}`
  const cached = sessionCache.get<GoalSnapshot>(cacheKey)

  const [goal, setGoal] = useState<Goal | null>(cached?.goal ?? null)
  const [milestones, setMilestones] = useState<Milestone[]>(cached?.milestones ?? [])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(cached?.blocks ?? [])
  const [weekSessions, setWeekSessions] = useState<Session[]>(cached?.weekSessions ?? [])
  /** Diario de avances: sesiones con nota de qué se logró. */
  const [advances, setAdvances] = useState<Session[]>(cached?.advances ?? [])
  const [stats, setStats] = useState(cached?.stats ?? { done: 0, minutes: 0 })
  const [weekMinutes, setWeekMinutes] = useState(cached?.weekMinutes ?? 0)
  // Integración entre zonas: hábitos vinculados y eventos de la semana de ESTA meta.
  const [habits, setHabits] = useState<Habit[]>(cached?.habits ?? [])
  const [habitChecks, setHabitChecks] = useState<HabitCheck[]>(cached?.habitChecks ?? [])
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)
  // Editor de compromiso inline: null = cerrado.
  const [commitDraft, setCommitDraft] = useState<CommitmentBlockDraft[] | null>(null)
  const [otherBlocks, setOtherBlocks] = useState<ScheduleBlock[]>([])
  // Confirmación antes de sacar la meta de la agenda (queda sin bloques).
  const [confirmUnschedule, setConfirmUnschedule] = useState(false)
  // Camino completo recién: ofrecemos cerrar la meta (nunca se cierra sola).
  const [offerAchieve, setOfferAchieve] = useState(false)
  // Confirmación al lograr con etapas pendientes.
  const [confirmAchieve, setConfirmAchieve] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Momento focal: la meta quedó lograda. El velo se va solo (won-out).
  const [won, setWon] = useState<string | null>(null)
  // Portada: URL firmada (1 h, cacheada en memoria); null sin foto o mientras carga.
  const coverUrl = useCoverUrl(goal?.coverPath ?? null)
  // Etapa recién cumplida: se enciende 700 ms y se apaga.
  const [justDoneId, setJustDoneId] = useState<string | null>(null)
  const flashTimer = useRef<number | null>(null)
  // Plan y respuestas que guardó el coach al crear la meta (migración 0018).
  const [ai, setAi] = useState<GoalAi>({ plan: null, answers: [] })

  useEffect(() => {
    if (!goalId) return
    let active = true
    void getGoalAi(goalId).then((value) => {
      if (active) setAi(value)
    })
    return () => {
      active = false
    }
  }, [goalId])

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  useEffect(() => {
    let active = true
    async function load() {
      try {
        // Solo skeleton en carga en frío (sin cache): al volver ya hay datos que mostrar.
        if (sessionCache.get(cacheKey) === undefined) setLoading(true)
        const id = goalId ?? ''
        const { g, ms, blks, weekSess, st, mins, adv, allHabits, checks } = await loadGoalDetail(userId, id)
        if (!active) return
        setGoal(g)
        setMilestones(ms)
        setBlocks(blks)
        setWeekSessions(weekSess.filter((s) => s.goalId === id))
        setStats(st)
        setWeekMinutes(mins.get(id) ?? 0)
        setAdvances(adv)
        setHabits(allHabits)
        setHabitChecks(checks)
      } catch (err) {
        if (active) setError(friendlyError(err, 'No se pudo cargar la meta.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [userId, goalId, cacheKey])

  // Mantiene el cache al día con lo mostrado (incluidos cambios optimistas). El guard
  // `goal.id === goalId` evita escribir datos de otra meta bajo esta clave.
  useCacheMirror(cacheKey, !loading && !error && !deleting && goal?.id === goalId, {
    goal,
    milestones,
    blocks,
    weekSessions,
    advances,
    stats,
    weekMinutes,
    habits,
    habitChecks,
  })

  async function handleDelete() {
    if (!goal || deleting) return
    setDeleting(true)
    try {
      await deleteGoal(userId, goal.id)
      // La foto se intenta borrar sin bloquear (best effort).
      void discardGoalCover(goal.coverPath)
      forgetGoalInCache(userId, goal.id)
      // La BD ya dejó la prioritaria en null (on delete set null); el perfil en memoria también.
      if (profile.priorityGoalId === goal.id) setProfile({ ...profile, priorityGoalId: null })
      toast('Meta eliminada.', 'success')
      navigate('/metas', { replace: true })
    } catch {
      toast('No se pudo eliminar la meta.', 'warning')
      setDeleting(false)
    }
  }

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
        setWon('¡Meta lograda!')
        toast('¡Meta lograda! Bien hecho.', 'success')
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
      await Promise.all(pending.map((m) => setMilestoneDone(m.id, true)))
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
    // Guard: el checklist se deshabilita mientras el cambio viaja, para que un
    // doble tap no dispare dos requests con estado viejo.
    setUpdating(true)
    try {
      const updated = await setMilestoneDone(m.id, willBeDone)
      const next = milestones.map((x) => (x.id === m.id ? updated : x))
      setMilestones(next)
      if (willBeDone) {
        // La etapa se enciende un instante: el logro se ve donde ocurrió, no
        // solo en el toast (o el velo de celebración) que sigue después. Esto
        // vale también para la última etapa, la que dispara offerAchieve.
        setJustDoneId(m.id)
        successHaptic()
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
        flashTimer.current = window.setTimeout(() => setJustDoneId(null), 700)
        const pendingLeft = next.filter((x) => x.doneAt === null).length
        if (pendingLeft === 0) setOfferAchieve(true)
        else toast('Etapa cumplida.', 'success')
      } else {
        setOfferAchieve(false)
      }
    } catch {
      toast('No se pudo guardar el cambio.', 'warning')
    } finally {
      setUpdating(false)
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
    // Confirmar antes de borrar: quitar una etapa es destructivo y no hay deshacer.
    if (!window.confirm(`¿Quitar la etapa “${m.title}”? No se puede deshacer.`)) return
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
        id: b.id,
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
      const today = todayISO()
      const next = await applyScheduleChange(userId, goal.id, commitDraft, today)
      setBlocks(next)
      setCommitDraft(null)
      await generateSessionsForDate(userId, today, next).catch(() => {})
      toast('Compromiso actualizado.', 'success')
    } catch {
      // Un guardado a medias pudo dejar cambios: la pantalla refleja lo que quedó.
      const reloaded = await listScheduleForGoal(goal.id).catch(() => null)
      if (reloaded) setBlocks(reloaded)
      toast('No se pudo guardar el compromiso.', 'warning')
    } finally {
      setUpdating(false)
    }
  }

  /** Saca la meta de la agenda: sin bloques, sigue activa y conserva su historial. */
  async function removeFromAgenda() {
    if (!goal) return
    setUpdating(true)
    try {
      setBlocks(await applyScheduleChange(userId, goal.id, [], todayISO()))
      setConfirmUnschedule(false)
      toast('La meta quedó sin agenda.', 'success')
    } catch {
      const reloaded = await listScheduleForGoal(goal.id).catch(() => null)
      if (reloaded) setBlocks(reloaded)
      toast('No se pudo sacar la meta de la agenda.', 'warning')
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

  /** Aplica a las etapas reales los cambios que la persona aceptó en el chat. */
  async function applyCoachChanges(changes: StageChange[]) {
    if (!goal) return
    setMilestones(await applyChangesToMilestones(userId, goal.id, sortedMilestones, changes))
    toast('Camino actualizado.', 'success')
  }

  /** Registra el avance que la persona aceptó en el chat y refresca lo que depende de él. */
  async function logCoachProgress(note: string) {
    if (!goal) return
    await saveProgressNote(userId, goal.id, blocks, profile.defaultSessionMinutes ?? 25, note)
    const weekStart = startOfWeek(todayISO())
    const [adv, st, weekSess] = await Promise.all([
      listAccomplishments(goal.id),
      sessionStatsForGoal(goal.id),
      listSessionsInRange(userId, weekStart, addDays(weekStart, 6)),
    ])
    setAdvances(adv)
    setStats(st)
    setWeekSessions(weekSess.filter((x) => x.goalId === goal.id))
    toast('Avance registrado.', 'success')
  }

  if (loading) return <LoadingScreen />
  if (error && !goal) return <LoadingScreen error={error} />
  if (!goal) {
    return (
      <div className="screen">
        <BackButton label="Metas" onClick={() => navigate('/metas')} />
        <div className="empty">
          <PathIllustration width={180} done={0} />
          <p className="empty__title">No encontramos esa meta</p>
          <p className="muted" style={{ marginBottom: 'var(--s4)' }}>
            Puede que la hayas eliminado. Tus otras metas siguen en su lugar.
          </p>
          <button className="btn btn--primary" onClick={() => navigate('/metas')}>
            Ver mis metas
          </button>
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="screen">
        <BackButton
          label="Atrás"
          onClick={() => {
            // Volver atrás es descartar a propósito: el borrador no debe volver.
            clearFormDraft(`logralo.goal-edit.${goal.id}`)
            setEditing(false)
          }}
        />
        <header className="screen__header" style={{ marginTop: 'var(--s4)' }}>
          <h1 className="screen__title">Editar meta</h1>
        </header>
        <GoalEditor goal={goal} onCancel={() => setEditing(false)} onSave={saveEdit} onGoalChange={setGoal} />
      </div>
    )
  }

  const template = getTemplate(goal.templateKey)
  const niche = getNiche(goal.area)
  const deadline = isGoalClosed(goal.status) ? null : relativeDeadline(goal.targetDate)
  const progress = milestoneProgress(sortedMilestones)
  const consistency = weekConsistency(blocks, weekSessions, startOfWeek(todayISO()))
  const isActive = goal.status === 'active'
  const currentStage = sortedMilestones.find((m) => m.doneAt === null) ?? null
  const stageLabel = stageLabelFor(sortedMilestones, currentStage, progress.total)
  const planFor = (title: string): GoalPlanStage | undefined =>
    ai.plan?.stages.find((st) => st.title.trim().toLowerCase() === title.trim().toLowerCase())
  const currentPlan = currentStage ? planFor(currentStage.title) : undefined
  const weekProgress =
    consistency.committed > 0 ? `${consistency.done} de ${consistency.committed} sesiones esta semana` : null
  const nudge = isActive ? goalNudge(goal, consistency, progress) : null
  const coachContext = (): ChatContext => ({
    title: goal.title,
    typeLabel: getTemplate(goal.templateKey).label,
    area: goal.area,
    why: goal.why,
    targetDate: goal.targetDate,
    successCriteria: goal.successCriteria,
    answers: ai.answers,
    weekProgress,
    stages: sortedMilestones.map((m) => ({ title: m.title, done: m.doneAt !== null })),
    canLogProgress: true,
  })

  // Hábitos que suman a esta meta — la zona de hábitos deja de ser una isla.
  const linkedHabits = habits.filter((h) => h.goalId === goal.id && h.archivedAt === null)
  // El hábito de hoy se marca aquí mismo, sin salir de la meta.
  const todayDate = todayISO()
  const habitAppliesToday = (h: Habit) =>
    h.weekdays.length === 0 || h.weekdays.includes(weekdayMon0(todayDate))
  const habitDoneToday = (h: Habit) => habitIsComplete(h, habitChecks, todayDate)

  /**
   * Avanza el hábito de HOY (optimista): marca la siguiente repetición y, si
   * ya está completo, desmarca la última — la misma semántica que en Hoy.
   */
  function toggleLinkedHabit(h: Habit) {
    const slotToAdd = nextSlot(h, habitChecks, todayDate)
    if (slotToAdd !== null) {
      setHabitChecks((prev) => [...prev, { habitId: h.id, date: todayDate, slot: slotToAdd }])
      setHabitCheck(userId, h.id, todayDate, true, slotToAdd).catch(() => {
        setHabitChecks((prev) =>
          prev.filter((c) => !(c.habitId === h.id && c.date === todayDate && c.slot === slotToAdd)),
        )
        toast('No se pudo guardar el hábito.', 'warning')
      })
    } else {
      const lastSlot = Math.max(
        ...habitChecks.filter((c) => c.habitId === h.id && c.date === todayDate).map((c) => c.slot),
      )
      setHabitChecks((prev) =>
        prev.filter((c) => !(c.habitId === h.id && c.date === todayDate && c.slot === lastSlot)),
      )
      setHabitCheck(userId, h.id, todayDate, false, lastSlot).catch(() => {
        setHabitChecks((prev) => [...prev, { habitId: h.id, date: todayDate, slot: lastSlot }])
        toast('No se pudo guardar el hábito.', 'warning')
      })
    }
  }

  return (
    <div
      className={`screen goal-detail${isActive ? ' screen--with-fab' : ''}`}
      style={goalAccent(goal)}
    >
      {won && <Celebration title={won} onDone={() => setWon(null)} />}

      {/* Cabecera full color: la tarjeta de la lista "se convierte" en ella
          (mismo view-transition-name que el peek de /metas). */}
      <header
        className={`fc-hero goal-hero${coverUrl ? ' fc-cover' : ''}`}
        style={heroStyle(goal, coverUrl)}
      >
        {coverUrl && <GoalCover url={coverUrl} />}
        <div className="goal-hero__bar">
          <BackButton label="Atrás" onClick={goBack} />
          <button className="goal-hero__edit" onClick={() => setEditing(true)}>
            Editar
          </button>
        </div>
        <NicheGlyph area={goal.area} tone={goalTone(goal)} size="xl" />
        <h1 className="goal-hero__title">{goal.title}</h1>
        <div className="goal-hero__tags">
          <span className="tag">{niche.label}</span>
          {goal.status !== 'active' && (
            <span className="tag">
              {STATUS_TAG[goal.status]}
            </span>
          )}
          {deadline && (
            <span className="tag">
              <IconCalendar size={12} /> {deadline}
            </span>
          )}
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-grid__main stack stack--lg">
          {/* ----- Ahora: la etapa actual y qué hacer, lo primero que se ve ----- */}
          <article className="now-card" aria-label="Ahora">
            <div>
              <span className="now-card__kicker">{currentStage ? `Ahora: ${stageLabel.toLowerCase()}` : stageLabel}</span>
              <h2 className="now-card__stage">
                {nowStageTitle(currentStage, progress.total)}
              </h2>
            </div>
            {currentPlan && (
              <ul className="now-card__actions" aria-label="Primeros pasos de esta etapa">
                {currentPlan.firstActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {currentPlan && <p className="small muted" style={{ margin: 0 }}>Sabrás que está cuando: {currentPlan.successSignal}</p>}
            {progress.total > 0 && (
              <>
                <div className="now-card__progress">
                  <span>
                    <b>{formatPercent(progress.ratio * 100)}</b>del camino
                  </span>
                  {weekProgress && <span>{weekProgress}</span>}
                </div>
                <div className="segbar" aria-hidden="true">
                  {sortedMilestones.map((m) => {
                    // La etapa recién cumplida se llena de izquierda a derecha y
                    // suelta un destello del color del área (una vez).
                    const justDone = m.id === justDoneId && m.doneAt !== null
                    return (
                      <span key={m.id} className={segClass(m, justDone, currentStage)}>
                        {justDone && (
                          <>
                            <i className="segbar__fill fc-seg-fill" />
                            <i className="fc-spark segbar__spark" />
                          </>
                        )}
                      </span>
                    )
                  })}
                </div>
              </>
            )}
            {currentStage && isActive && (
              <button
                type="button"
                className="btn now-card__done fc-press"
                disabled={updating}
                onClick={() => void toggleMilestone(currentStage)}
              >
                <IconCheck size={16} /> Marcar esta etapa como cumplida
              </button>
            )}
          </article>

          {/* ----- Tu compromiso, visible y editable (backlog smoke #3) ----- */}
          <CommitmentSection
            isActive={isActive}
            blocks={blocks}
            commitDraft={commitDraft}
            otherBlocks={otherBlocks}
            defaultMinutes={profile.defaultSessionMinutes ?? 25}
            defaultStart={preferredStartTime(profile.preferredMoment)}
            updating={updating}
            confirmUnschedule={confirmUnschedule}
            onConfirmUnschedule={setConfirmUnschedule}
            onOpenEditor={() => void openCommitmentEditor()}
            onDraft={setCommitDraft}
            onSave={() => void saveCommitment()}
            onUnschedule={() => void removeFromAgenda()}
          />


          {/* ----- El camino: checklist real ----- */}
          <div>
            <div className="section-head">
              <h2 className="section-title">El camino</h2>
            </div>
            <MilestoneChecklist
              milestones={sortedMilestones}
              disabled={!isActive || updating}
              justDoneId={justDoneId}
              onToggle={(m) => void toggleMilestone(m)}
              onRename={(m, t) => void renameMilestone(m, t)}
              onSetDate={(m, d) => void dateMilestone(m, d)}
              onMove={(m, d) => void moveMilestone(m, d)}
              onDelete={(m) => void removeMilestone(m)}
              onAdd={(t) => void appendMilestone(t)}
            />
            {ai.plan && sortedMilestones.some((m) => planFor(m.title)) && (
              <div style={{ marginTop: 'var(--s3)' }}>
                <Disclosure summary="Ver el plan del coach por etapa">
                  <div className="stack plan-details">
                    {sortedMilestones.map((m) => {
                      const st = planFor(m.title)
                      if (!st) return null
                      return (
                        <div key={m.id} className="stack stack--sm">
                          <strong className="small">{m.title}</strong>
                          <dl>
                            <dt>Objetivo</dt>
                            <dd>{st.objective}</dd>
                            <dt>Sabrás que está</dt>
                            <dd>{st.successSignal}</dd>
                            <dt>Primeros pasos</dt>
                            <dd>{st.firstActions.join(' · ')}</dd>
                            <dt>Tiempo</dt>
                            <dd>{st.weeks === 1 ? '1 semana' : `${st.weeks} semanas`}</dd>
                          </dl>
                        </div>
                      )
                    })}
                  </div>
                </Disclosure>
              </div>
            )}
            {offerAchieve && isActive && (
              <div className="focus-card stack stack--sm" style={{ marginTop: 'var(--s4)' }}>
                <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
                  <IconCelebrate size={14} /> Recorriste todo el camino
                </span>
                <p className="small">Cumpliste todas las etapas. ¿La damos por lograda?</p>
                <div className="row wrap">
                  <button className="btn btn--primary btn--sm" disabled={updating} onClick={() => void changeStatus('done')}>
                    Sí, lograda
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setOfferAchieve(false)}>
                    Todavía no
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ----- Tus avances: el diario de lo que lograste sesión a sesión ----- */}
          {advances.length > 0 && (
            <div>
              <div className="section-head">
                <h2 className="section-title">Tus avances</h2>
                <span className="small muted">{advances.length}</span>
              </div>
              <AdvancesTimeline items={advances.slice(0, 3)} />
              {advances.length > 3 && (
                <Disclosure summary={`Ver más (${advances.length - 3})`}>
                  <AdvancesTimeline items={advances.slice(3)} />
                </Disclosure>
              )}
            </div>
          )}

          {/* ----- Notas de esta meta ----- */}
          <GoalNotes goalId={goal.id} />
        </div>

        <div className="detail-grid__side stack stack--lg">
          {goal.why && (
            <div className="focus-card stack stack--sm">
              <span className="focus-card__kicker row row--sm" style={{ alignItems: 'center' }}>
                <IconQuote size={12} /> Tu porqué
              </span>
              <p style={{ fontWeight: 500, fontSize: 'var(--fs-md)', lineHeight: 1.4 }}>{goal.why}</p>
            </div>
          )}
          {goal.successCriteria && (
            <div className="card stack stack--sm">
              <span className="section-title">Así sabrás que lo lograste</span>
              <p className="small" style={{ margin: 0 }}>
                {goal.successCriteria}
              </p>
            </div>
          )}
          <div className="card card--tight">
            <Disclosure summary={<span className="section-title">Detalles</span>}>
              <div className="stack">
                <InfoRow label="Área" value={niche.label} />
                <InfoRow label="Tipo" value={template.label} />
                {goal.targetDate && (
                  <InfoRow label="Para cuándo" value={formatLongDate(goal.targetDate)} />
                )}
                <InfoRow label="Sesiones" value={`${stats.done} en total`} />
                {stats.minutes > 0 && <InfoRow label="Tiempo invertido" value={formatDuration(stats.minutes)} />}
                {weekMinutes > 0 && (
                  <InfoRow label="Agendado esta semana" value={`${formatDuration(weekMinutes)} en tu agenda`} />
                )}
              </div>
            </Disclosure>
          </div>

          {linkedHabits.length > 0 && (
            <div className="card stack stack--sm">
              <span className="section-title">Hábitos que suman</span>
              {linkedHabits.map((h) => {
                const done = habitDoneToday(h)
                const target = habitTarget(h)
                const doneCount = habitDoneCount(habitChecks, h.id, todayDate)
                return (
                  <div key={h.id} className="row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
                    {habitAppliesToday(h) && (
                      <button
                        className={`check${done ? ' check--done' : ''}`}
                        onClick={() => toggleLinkedHabit(h)}
                        aria-label={linkedHabitLabel(h.title, done, doneCount, target)}
                        aria-pressed={done}
                      >
                        <IconCheck size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="row row--between goal-detail__habit"
                      aria-label={`Ver hábito: ${h.title}`}
                      onClick={() => navigate('/habitos')}
                    >
                      <span className="small nowrap-ellipsis">{h.title}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="stack stack--sm">
            {isActive && (
              <>
                <button className="btn btn--secondary btn--block" disabled={updating} onClick={() => changeStatus('paused')}>
                  Pausar esta meta
                </button>
                <button
                  className="btn btn--secondary btn--block"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  <IconDots size={16} /> Más opciones
                </button>
                {moreOpen && (
                  <div className="stack stack--sm">
                    <button className="btn btn--secondary btn--block" disabled={updating} onClick={requestAchieve}>
                      Marcar como lograda
                    </button>
                    <button className="btn btn--secondary btn--block" disabled={updating} onClick={() => changeStatus('archived')}>
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
                        Ya las cumplí — márcalas y lógrala
                      </button>
                      <button className="btn btn--secondary btn--sm" disabled={updating} onClick={() => void changeStatus('done')}>
                        Cerrarla igual
                      </button>
                      <button className="btn btn--secondary btn--sm" onClick={() => setConfirmAchieve(false)}>
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
                        progress.total > 0 ? countLabel(progress.done, 'etapa', 'etapas') : null,
                        stats.done > 0 ? countLabel(stats.done, 'sesión', 'sesiones') : null,
                        stats.minutes > 0 ? `${formatDuration(stats.minutes)} invertidas` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Cumplida con compromiso',
                    }).then((r) => toast(r === 'shared' ? 'Compartido.' : 'Imagen descargada.'))
                  }
                >
                  <IconShare size={16} /> Compartir mi logro
                </button>
                <button className="btn btn--secondary btn--block" onClick={() => navigate(`/ideas?area=${goal.area}`)}>
                  Ver ideas para tu próxima meta
                </button>
              </div>
            )}
            {(goal.status === 'done' || goal.status === 'archived') && (
              <button className="btn btn--secondary btn--block" disabled={updating} onClick={() => changeStatus('active')}>
                Reactivar
              </button>
            )}
            <DeleteGoal
              confirming={confirmDelete}
              deleting={deleting}
              onConfirm={setConfirmDelete}
              onDelete={() => void handleDelete()}
            />
          </div>
        </div>
      </div>
      {isActive && (
        <GoalCoach
          userId={userId}
          goalId={goal.id}
          subtitle={[stageLabel, weekProgress].filter(Boolean).join(', ')}
          nudge={nudge}
          getContext={coachContext}
          onApply={applyCoachChanges}
          onLogProgress={logCoachProgress}
        />
      )}
    </div>
  )
}

/** Diario de avances: una entrada por sesión con nota de qué se logró. */
function AdvancesTimeline({ items }: Readonly<{ items: Session[] }>) {
  return (
    <ul className="timeline">
      {items.map((s) => (
        <li key={s.id} className="timeline__item">
          <span className="timeline__dot timeline__dot--done" aria-hidden="true" />
          <div className="timeline__card" style={{ cursor: 'default' }}>
            <span className="timeline__title">{s.accomplishment}</span>
            <span className="faint tiny">
              {formatLongDate(s.date)}
              {s.actualValue ? ` · ${formatAmount(s.targetKind, s.actualValue, s.unit)}` : ''}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Atrás canónico (.back-link). Es botón: vuelve por historial o descarta la edición. */
/**
 * Estilo de la cabecera: mismo view-transition-name que la tarjeta de /metas.
 * Con foto, la tinta pasa a blanco (capa oscura de .fc-cover).
 */
function heroStyle(goal: Goal, coverUrl: string | null): CSSProperties {
  const accent = coverUrl ? coverAccent(goal) : {}
  return { ...accent, viewTransitionName: `goal-${goal.id}` } as CSSProperties
}

function BackButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button type="button" className="back-link" onClick={onClick}>
      <IconChevronLeft size={18} />
      {label}
    </button>
  )
}

function InfoRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="row row--between" style={{ alignItems: 'flex-start', gap: 'var(--s4)' }}>
      <span className="faint small" style={{ flex: 'none' }}>
        {label}
      </span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/** "Mostrar en la tarjeta" a guardar: solo si hay foto y cambió (undefined = no tocar). */
function appearanceToggle(goal: Goal, coverOnCard: boolean): boolean | undefined {
  if (!goal.coverPath || coverOnCard === goal.coverOnCard) return undefined
  return coverOnCard
}

/** Formulario para editar los campos de una meta ya creada. */
function GoalEditor({
  goal,
  onCancel,
  onSave,
  onGoalChange,
}: Readonly<{
  goal: Goal
  onCancel: () => void
  onSave: (edit: GoalEdit) => Promise<void>
  /** La foto se guarda al subirla/quitarla: la meta cambia sin pulsar "Guardar". */
  onGoalChange: (g: Goal) => void
}>) {
  // Borrador a prueba de la recarga automática de la PWA (espejo del Wizard):
  // restaura campo por campo validando tipos; guardar o cancelar lo limpia.
  const draftKey = `logralo.goal-edit.${goal.id}`
  const [draft] = useState(() =>
    loadFormDraft<{
      title: string
      why: string
      targetDate: string
      area: NicheId
      criteria: string
      color: GoalColor | null
      coverOnCard: boolean
    }>(draftKey),
  )
  const [title, setTitle] = useState(typeof draft?.title === 'string' ? draft.title : goal.title)
  const [why, setWhy] = useState(typeof draft?.why === 'string' ? draft.why : (goal.why ?? ''))
  const [targetDate, setTargetDate] = useState(
    typeof draft?.targetDate === 'string' ? draft.targetDate : (goal.targetDate ?? ''),
  )
  const [area, setArea] = useState<NicheId>(
    draft && NICHES.some((n) => n.id === draft.area) ? (draft.area as NicheId) : goal.area,
  )
  const [criteria, setCriteria] = useState(
    typeof draft?.criteria === 'string' ? draft.criteria : (goal.successCriteria ?? ''),
  )
  // Color: un borrador solo cuenta si trae la clave (null = color del área) y es de la paleta.
  const [color, setColor] = useState<GoalColor | null>(
    draft && 'color' in draft ? parseGoalColor(draft.color) : goal.color,
  )
  const [coverOnCard, setCoverOnCard] = useState(
    typeof draft?.coverOnCard === 'boolean' ? draft.coverOnCard : goal.coverOnCard,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    saveFormDraft(draftKey, { title, why, targetDate, area, criteria, color, coverOnCard })
  }, [draftKey, title, why, targetDate, area, criteria, color, coverOnCard])

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
      // Solo lo que cambió: así editar funciona aunque falte la migración 0019.
      color: color === goal.color ? undefined : color,
      coverOnCard: appearanceToggle(goal, coverOnCard),
    })
      .then(() => clearFormDraft(draftKey))
      .catch((e: unknown) => {
        setError(friendlyError(e, 'No se pudo guardar. Inténtalo de nuevo.'))
        setSaving(false)
      })
  }

  function cancel() {
    clearFormDraft(draftKey)
    onCancel()
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
        <fieldset className="row wrap" aria-labelledby="edit-area-label">
          {NICHES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`chip${area === n.id ? ' chip--selected' : ''}`}
              aria-pressed={area === n.id}
              onClick={() => setArea(n.id)}
            >
              {n.label}
            </button>
          ))}
        </fieldset>
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
      <GoalAppearance
        goal={goal}
        area={area}
        color={color}
        onColorChange={setColor}
        coverOnCard={coverOnCard}
        onCoverOnCardChange={setCoverOnCard}
        onGoalChange={onGoalChange}
      />
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <div className="stack stack--sm">
        <button className="btn btn--primary btn--block" disabled={!title.trim() || saving} onClick={submit}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="btn btn--secondary btn--block" disabled={saving} onClick={cancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
