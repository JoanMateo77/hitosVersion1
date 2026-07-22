import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { createGoal, deleteGoal } from '@/services/goals'
import { detectTemplate, getTemplate, templatesForNiche } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import type { NicheId, ScheduleBlock } from '@/lib/types'
import { formatLongDate, relativeDeadline, todayISO } from '@/lib/date'
import { IconBack, IconCalendar, IconLightbulb } from '@/components/icons'
import { NicheIcon } from '@/components/NicheGlyph'
import { OptionRow } from '@/components/OptionRow'
import { Hint } from '@/components/Hint'
import {
  buildMilestonesFromTemplate,
  formatCommitmentSummary,
  validateCommitment,
  type CommitmentBlockDraft,
  type MilestoneDraft,
} from '@/domain/commitment'
import { listActiveGoalSchedule, createScheduleBlocks } from '@/services/schedule'
import { generateSessionsForDate } from '@/services/sessions'
import { createMilestones } from '@/services/milestones'
import { WIZARD_DRAFT_KEY } from '@/lib/wizardDraft'
import { clearWizardIntent } from '@/app/onboardingIntent'
import { CommitmentStep } from '@/components/wizard/CommitmentStep'
import { MilestonesStep } from '@/components/wizard/MilestonesStep'

/** Pasos del wizard: título · tipo · compromiso · camino · ancla · resumen. */
const STEPS = 6

const DRAFT_KEY = WIZARD_DRAFT_KEY

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
  /** Plantilla con la que se sembraron las etapas (para re-sembrar si cambia). */
  seededFromTemplate: string
  /** true si el usuario editó las etapas: nunca se pisan. */
  milestonesTouched: boolean
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
    if (typeof d.seededFromTemplate === 'string') draft.seededFromTemplate = d.seededFromTemplate
    if (typeof d.milestonesTouched === 'boolean') draft.milestonesTouched = d.milestonesTouched
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
  const [area, setArea] = useState<NicheId>(draft.area ?? profile.primaryNiche ?? 'otra')
  const [criteria, setCriteria] = useState(draft.criteria ?? '')
  // Título con el que ya autodetectamos plantilla/área. Evita pisar una elección
  // manual del paso 1 al volver al paso 0 y avanzar sin cambiar el título.
  const [detectedFromTitle, setDetectedFromTitle] = useState(draft.title ?? '')
  // Nicho que filtra las plantillas del paso 1: el del título si hubo señal, si no
  // el del perfil. Se fija al detectar, así la lista no se reordena al elegir.
  const [templateNiche, setTemplateNiche] = useState<NicheId>(() =>
    draft.templateKey && draft.templateKey !== 'personalizada'
      ? getTemplate(draft.templateKey).defaultArea
      : (profile.primaryNiche ?? 'otra'),
  )
  // Sin señal clara del título, "Personalizada (la armo yo)" va primero.
  const [customFirst, setCustomFirst] = useState(
    () => !draft.templateKey || draft.templateKey === 'personalizada',
  )

  const [blocks, setBlocks] = useState<CommitmentBlockDraft[]>(draft.blocks ?? [])
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(draft.milestones ?? [])
  // Si el usuario cambia de plantilla sin haber editado las etapas, se re-siembran;
  // si las tocó, se respetan siempre (espejo del patrón detectedFromTitle).
  const [seededFromTemplate, setSeededFromTemplate] = useState(draft.seededFromTemplate ?? '')
  const [milestonesTouched, setMilestonesTouched] = useState(draft.milestonesTouched ?? false)
  const [existingBlocks, setExistingBlocks] = useState<ScheduleBlock[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Consumimos la intención del onboarding: si llegamos aquí venimos de "Crear
  // mi primera meta", y ya no queremos que el redirect de /onboarding reaparezca.
  useEffect(() => {
    clearWizardIntent()
  }, [])

  // Carga los bloques de otras metas ACTIVAS del usuario (guardia de
  // sobrecompromiso): las metas logradas o archivadas ya no ocupan agenda.
  useEffect(() => {
    listActiveGoalSchedule(userId)
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
      !criteria &&
      blocks.length === 0 &&
      milestones.length === 0
    if (isEmpty) return
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          title,
          templateKey,
          why,
          targetDate,
          area,
          criteria,
          blocks,
          milestones,
          seededFromTemplate,
          milestonesTouched,
        }),
      )
    } catch {
      /* ignore */
    }
  }, [step, title, templateKey, why, targetDate, area, criteria, blocks, milestones, seededFromTemplate, milestonesTouched])

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
      setTemplateNiche(
        detected.key !== 'personalizada' ? detected.defaultArea : (profile.primaryNiche ?? 'otra'),
      )
      setCustomFirst(detected.key === 'personalizada')
    }
    // Al salir del tipo elegido (paso 1 → 2), sembrar las etapas desde la
    // plantilla. Se re-siembran si la plantilla cambió y el usuario no las editó;
    // las etapas editadas a mano no se pisan nunca.
    if (step === 1) {
      const key = templateKey || 'personalizada'
      if (milestones.length === 0 || (!milestonesTouched && key !== seededFromTemplate)) {
        setMilestones(buildMilestonesFromTemplate(getTemplate(key), 0))
        setSeededFromTemplate(key)
      }
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    // Defensa del invariante central: ninguna meta se crea sin contrato, ni
    // siquiera desde un borrador manipulado o un estado inesperado.
    if (validateCommitment(blocks) !== null || milestones.length === 0) {
      setError('Tu meta necesita un compromiso y al menos una etapa.')
      return
    }
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
      const createdBlocks = await createScheduleBlocks(userId, goal.id, blocks)
      // Si hoy es día comprometido, la sesión aparece en Hoy al instante.
      await generateSessionsForDate(userId, todayISO(), createdBlocks).catch(() => {})
      // Le mostramos el camino + la primera acción: la app guía, no solo crea.
      clearDraft()
      navigate(`/meta/creada/${goal.id}`, { replace: true })
    } catch (err) {
      console.error('No se pudo crear la meta con su contrato:', err)
      // Si la meta quedó a medias (sin hitos o sin compromiso), la deshacemos:
      // una meta sin contrato es exactamente lo que este rediseño elimina.
      if (createdGoalId) await deleteGoal(userId, createdGoalId).catch(() => {})
      setError('No pudimos crear tu meta. Inténtalo de nuevo en un momento.')
      setSaving(false)
    }
  }

  // Lista del paso 1, estable mientras el paso está abierto.
  const stepTemplates = (() => {
    const list = templatesForNiche(templateNiche)
    if (!customFirst) return list
    return [
      ...list.filter((t) => t.key === 'personalizada'),
      ...list.filter((t) => t.key !== 'personalizada'),
    ]
  })()

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
        {/* Orientación explícita: los puntos solos no dicen cuánto falta. */}
        <span className="faint tiny" style={{ flex: 'none' }}>
          Paso {step + 1} de {STEPS}
        </span>
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
              {stepTemplates.map((t) => (
                <OptionRow
                  key={t.key}
                  icon={<NicheIcon area={t.defaultArea} size={20} />}
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
            <MilestonesStep
              milestones={milestones}
              onChange={(ms) => {
                setMilestones(ms)
                setMilestonesTouched(true)
              }}
            />
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
        <span className="tag">{getNiche(area).label}</span>
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
