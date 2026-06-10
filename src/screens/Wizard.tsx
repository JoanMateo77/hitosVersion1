import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { createGoal, deleteGoal } from '@/services/goals'
import { createGoalTasks } from '@/services/tasks'
import { detectTemplate, getTemplate, templatesForNiche } from '@/domain/templates'
import { pickAction } from '@/domain/dailyPlan'
import { NICHES, getNiche } from '@/domain/niches'
import type { NicheId, ScheduleBlock } from '@/lib/types'
import { formatLongDate, relativeDeadline, todayISO } from '@/lib/date'
import { isUniqueViolation } from '@/lib/errors'
import { IconBack, IconCalendar, IconLightbulb } from '@/components/icons'
import { OptionRow } from '@/components/OptionRow'
import { Hint } from '@/components/Hint'
import {
  buildMilestonesFromTemplate,
  formatCommitmentSummary,
  validateCommitment,
  type CommitmentBlockDraft,
  type MilestoneDraft,
} from '@/domain/commitment'
import { listScheduleForUser, createScheduleBlocks } from '@/services/schedule'
import { createMilestones } from '@/services/milestones'
import { CommitmentStep } from '@/components/wizard/CommitmentStep'
import { MilestonesStep } from '@/components/wizard/MilestonesStep'

/** Cantidad de pasos del wizard (las 5 preguntas + el tipo de meta). */
const STEPS = 6

const DRAFT_KEY = 'logralo.wizard-draft-v2'

interface WizardDraft {
  step: number
  title: string
  templateKey: string
  why: string
  targetDate: string
  area: NicheId
  criteria: string
  blocks: CommitmentBlockDraft[]
  milestones: MilestoneDraft[]
}

/** Type-guard: ¿el valor es un NicheId válido? Espejo de isTheme en theme.ts. */
function isNiche(value: unknown): value is NicheId {
  return typeof value === 'string' && NICHES.some((n) => n.id === value)
}

/**
 * Lee el borrador de sessionStorage validando campo por campo: no confiamos a
 * ciegas en el JSON (puede estar corrupto o de una versión vieja). El step se
 * acota al rango válido para que un draft roto no rompa el render.
 */
function loadDraft(): Partial<WizardDraft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return {}
    const d = parsed as Record<string, unknown>
    const draft: Partial<WizardDraft> = {}
    if (typeof d.step === 'number' && Number.isFinite(d.step)) {
      draft.step = Math.min(Math.max(Math.trunc(d.step), 0), STEPS - 1)
    }
    if (typeof d.title === 'string') draft.title = d.title
    if (typeof d.templateKey === 'string') draft.templateKey = d.templateKey
    if (typeof d.why === 'string') draft.why = d.why
    if (typeof d.targetDate === 'string') draft.targetDate = d.targetDate
    if (isNiche(d.area)) draft.area = d.area
    if (typeof d.criteria === 'string') draft.criteria = d.criteria
    if (Array.isArray(d.blocks)) {
      draft.blocks = (d.blocks as unknown[]).filter(
        (item): item is CommitmentBlockDraft =>
          item != null &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).weekday === 'number',
      )
    }
    if (Array.isArray(d.milestones)) {
      draft.milestones = (d.milestones as unknown[]).filter(
        (item): item is MilestoneDraft =>
          item != null &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).title === 'string',
      )
    }
    return draft
  } catch {
    return {}
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function Wizard() {
  const { userId, profile } = useSession()
  const navigate = useNavigate()

  const [draft] = useState(loadDraft)
  const [step, setStep] = useState(draft.step ?? 0)
  const [title, setTitle] = useState(draft.title ?? '')
  const [templateKey, setTemplateKey] = useState(draft.templateKey ?? '')
  const [why, setWhy] = useState(draft.why ?? '')
  const [targetDate, setTargetDate] = useState(draft.targetDate ?? '')
  const [area, setArea] = useState<NicheId>(draft.area ?? 'otra')
  const [criteria, setCriteria] = useState(draft.criteria ?? '')
  // Título con el que ya autodetectamos plantilla/área. Evita pisar una elección
  // manual del paso 1 al volver al paso 0 y avanzar sin cambiar el título.
  const [detectedFromTitle, setDetectedFromTitle] = useState(draft.title ?? '')

  const [blocks, setBlocks] = useState<CommitmentBlockDraft[]>(draft.blocks ?? [])
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(draft.milestones ?? [])
  const [existingBlocks, setExistingBlocks] = useState<ScheduleBlock[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carga los bloques de otras metas del usuario (guardia de sobrecompromiso).
  useEffect(() => {
    listScheduleForUser(userId)
      .then(setExistingBlocks)
      .catch(() => setExistingBlocks([]))
  }, [userId])

  // Defaults del compromiso desde el perfil del usuario.
  const defaultMinutes = profile.defaultSessionMinutes ?? 25
  const defaultStart =
    profile.preferredMoment === 'morning'
      ? '08:00'
      : profile.preferredMoment === 'midday'
        ? '13:00'
        : profile.preferredMoment === 'evening'
          ? '19:00'
          : null

  // Persistimos el borrador en cada cambio, salvo el estado vacío inicial.
  useEffect(() => {
    const isEmpty =
      step === 0 &&
      !title &&
      !templateKey &&
      !why &&
      !targetDate &&
      area === 'otra' &&
      !criteria &&
      blocks.length === 0 &&
      milestones.length === 0
    if (isEmpty) return
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, title, templateKey, why, targetDate, area, criteria, blocks, milestones }),
      )
    } catch {
      /* ignore */
    }
  }, [step, title, templateKey, why, targetDate, area, criteria, blocks, milestones])

  function goBack() {
    if (step === 0) {
      navigate('/')
      return
    }
    setStep((s) => s - 1)
  }

  function next() {
    // Al salir del título sugerimos plantilla y área, pero solo si el título cambió
    // desde la última detección: así no pisamos la elección manual del paso 1.
    if (step === 0 && title !== detectedFromTitle) {
      const detected = detectTemplate(title)
      setTemplateKey(detected.key)
      setArea(detected.defaultArea)
      setDetectedFromTitle(title)
    }
    // Al salir del tipo elegido (paso 1 → 2), sembrar los hitos desde la plantilla
    // si el usuario aún no los tocó.
    if (step === 1 && milestones.length === 0) {
      setMilestones(buildMilestonesFromTemplate(getTemplate(templateKey || 'personalizada'), 0))
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    let createdGoalId: string | null = null
    try {
      const goal = await createGoal(userId, {
        title: title.trim(),
        why: why.trim() || null,
        targetDate: targetDate || null,
        area,
        successCriteria: criteria.trim() || null,
        templateKey: templateKey || 'personalizada',
      })
      createdGoalId = goal.id
      await createMilestones(userId, goal.id, milestones.map((m, position) => ({ ...m, position })))
      await createScheduleBlocks(userId, goal.id, blocks)
      // Compatibilidad Fase 1: Today sigue mostrando tareas legacy hasta la Fase 2.
      try {
        await createGoalTasks(userId, todayISO(), [
          { goalId: goal.id, title: pickAction(goal, todayISO()) },
        ])
      } catch (err) {
        // Solo ignoramos el duplicado (ya existía la acción de hoy); el resto sube.
        if (!isUniqueViolation(err)) throw err
      }
      // Le mostramos el camino + la primera acción: la app guía, no solo crea.
      clearDraft()
      navigate(`/meta/creada/${goal.id}`, { replace: true })
    } catch {
      // Si la meta quedó a medias (sin hitos o sin compromiso), la deshacemos:
      // una meta sin contrato es exactamente lo que este rediseño elimina.
      if (createdGoalId) await deleteGoal(userId, createdGoalId).catch(() => {})
      setError('No pudimos crear tu meta. Inténtalo de nuevo en un momento.')
      setSaving(false)
    }
  }

  const commitmentError = validateCommitment(blocks)
  const canContinue =
    step === 0
      ? title.trim().length > 0
      : step === 2
        ? commitmentError === null
        : step === 3
          ? milestones.length > 0 && milestones.every((m) => m.title.trim().length > 0)
          : true
  const isLast = step === STEPS - 1

  return (
    <div className="screen screen--full flow-screen">
      <div className="row" style={{ marginBottom: 'var(--s4)' }}>
        <button className="iconbtn" onClick={goBack} aria-label="Volver">
          <IconBack />
        </button>
        <div className="stepper spacer" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`stepper__dot ${i < step ? 'stepper__dot--done' : i === step ? 'stepper__dot--active' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="stack stack--lg" style={{ flex: 1 }}>
        {step === 0 && (
          <Question title="¿Qué quieres lograr?" hint={'Una frase clara. Ej: "Aprender inglés" o "Bajar 5 kg".'}>
            <input
              className="input"
              autoFocus
              aria-label="¿Qué quieres lograr?"
              placeholder="Escribe tu meta…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="next"
              inputMode="text"
            />
            <button
              type="button"
              className="btn--link row row--sm"
              style={{ alignSelf: 'flex-start', alignItems: 'center' }}
              onClick={() => navigate('/ideas')}
            >
              <IconLightbulb size={14} /> No sé qué poner — ver ideas
            </button>
          </Question>
        )}

        {step === 1 && (
          <Question title="¿Qué tipo de meta es?" hint="Elegimos una por ti según tu meta. Cámbiala si no encaja.">
            <div className="stack stack--sm">
              {templatesForNiche(profile.primaryNiche ?? 'otra').map((t) => (
                <OptionRow
                  key={t.key}
                  emoji={t.emoji}
                  label={t.label}
                  desc={t.description}
                  selected={templateKey === t.key}
                  onClick={() => {
                    setTemplateKey(t.key)
                    setArea(t.defaultArea)
                  }}
                />
              ))}
            </div>
          </Question>
        )}

        {step === 2 && (
          <Question
            title="¿Cuánto y cuándo cada semana?"
            hint="Tu compromiso real: días, cuánto por sesión y, si quieres, a qué hora."
          >
            <CommitmentStep
              blocks={blocks}
              onChange={setBlocks}
              existing={existingBlocks}
              defaultMinutes={defaultMinutes}
              defaultStart={defaultStart}
            />
          </Question>
        )}
        {step === 2 && commitmentError && <p className="faint tiny">{commitmentError}</p>}

        {step === 3 && (
          <Question title="Estas son tus etapas" hint="Las sugerimos según tu tipo de meta. Edítalas a tu medida.">
            <MilestonesStep milestones={milestones} onChange={setMilestones} />
          </Question>
        )}

        {step === 4 && (
          <Question
            title="Tu ancla"
            hint="Por qué lo haces, para cuándo y cómo sabrás que lo lograste. Todo opcional."
          >
            <textarea
              className="textarea"
              autoFocus
              aria-label="¿Por qué quieres lograrlo?"
              placeholder="Porque…"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="enter"
            />
            <Hint id="wizard-why-2026-05">
              Lo escribes una vez y lo verás bajo cada tarea derivada de esta meta. Tu ancla cuando aflojas.
            </Hint>
            <input
              className="input"
              type="date"
              aria-label="¿Para cuándo?"
              min={todayISO()}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
            {targetDate && (
              <button className="btn--link" type="button" onClick={() => setTargetDate('')}>
                Quitar fecha
              </button>
            )}
            <input
              className="input"
              aria-label="¿Cómo vas a saber que lo lograste?"
              placeholder="Lo sabré cuando…"
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              maxLength={200}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="done"
              inputMode="text"
            />
          </Question>
        )}

        {step === 5 && (
          <Question title="Revisa tu meta" hint="Todo listo. Cuando confirmes, crearemos tu meta con su compromiso.">
            <ReviewCard
              title={title}
              templateLabel={getTemplate(templateKey || 'personalizada').label}
              area={area}
              targetDate={targetDate}
              why={why}
              criteria={criteria}
            />
            {blocks.length > 0 && <div className="alert">{formatCommitmentSummary(blocks)}</div>}
          </Question>
        )}
      </div>

      {error && <div className="alert alert--error" style={{ marginBottom: 'var(--s3)' }}>{error}</div>}

      <button
        className="btn btn--primary btn--block"
        disabled={!canContinue || saving}
        onClick={isLast ? submit : next}
      >
        {isLast ? (saving ? 'Creando…' : 'Crear meta') : 'Continuar'}
      </button>
    </div>
  )
}

function Question({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="stack">
      <div>
        <h1 className="screen__title">{title}</h1>
        {hint && <p className="screen__subtitle">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Resumen de la meta antes de crearla, en el último paso. */
function ReviewCard({
  title,
  templateLabel,
  area,
  targetDate,
  why,
  criteria,
}: {
  title: string
  templateLabel: string
  area: NicheId
  targetDate: string
  why: string
  criteria: string
}) {
  const cleanWhy = why.trim()
  const cleanCriteria = criteria.trim()
  const dateLabel = targetDate
    ? `${formatLongDate(targetDate)}${relativeDeadline(targetDate) ? ` · ${relativeDeadline(targetDate)}` : ''}`
    : null
  return (
    <div className="card card--tight stack stack--sm" style={{ marginTop: 'var(--s4)' }}>
      <span className="kicker">Tu meta</span>
      <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)' }}>
        {title || '—'}
      </strong>
      <div className="row wrap">
        <span className="tag">{templateLabel}</span>
        <span className="tag">
          {getNiche(area).emoji} {getNiche(area).label}
        </span>
        {dateLabel && (
          <span className="tag">
            <IconCalendar size={11} /> {dateLabel}
          </span>
        )}
      </div>
      {cleanWhy && (
        <div className="stack stack--sm">
          <span className="kicker">Tu porqué</span>
          <p className="small">{cleanWhy}</p>
        </div>
      )}
      {cleanCriteria && (
        <div className="stack stack--sm">
          <span className="kicker">Lo logras cuando</span>
          <p className="small">{cleanCriteria}</p>
        </div>
      )}
    </div>
  )
}
