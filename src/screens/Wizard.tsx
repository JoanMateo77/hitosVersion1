import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { createGoal } from '@/services/goals'
import { createGoalTasks } from '@/services/tasks'
import { detectTemplate, getTemplate, templatesForNiche } from '@/domain/templates'
import { pickAction } from '@/domain/dailyPlan'
import { NICHES, getNiche } from '@/domain/niches'
import type { NicheId } from '@/lib/types'
import { formatLongDate, relativeDeadline, todayISO } from '@/lib/date'
import { isUniqueViolation } from '@/lib/errors'
import { IconBack, IconCalendar, IconLightbulb } from '@/components/icons'
import { OptionRow } from '@/components/OptionRow'
import { Hint } from '@/components/Hint'

/** Cantidad de pasos del wizard (las 5 preguntas + el tipo de meta). */
const STEPS = 6

const DRAFT_KEY = 'hito.wizard-draft'

interface WizardDraft {
  step: number
  title: string
  templateKey: string
  why: string
  targetDate: string
  area: NicheId
  criteria: string
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

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persistimos el borrador en cada cambio, salvo el estado vacío inicial.
  useEffect(() => {
    const isEmpty =
      step === 0 && !title && !templateKey && !why && !targetDate && area === 'otra' && !criteria
    if (isEmpty) return
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, title, templateKey, why, targetDate, area, criteria }),
      )
    } catch {
      /* ignore */
    }
  }, [step, title, templateKey, why, targetDate, area, criteria])

  function goBack() {
    if (step === 0) {
      navigate('/')
      return
    }
    setStep((s) => s - 1)
  }

  function next() {
    // Al salir del título, sugerimos plantilla y área (Mecanismo F).
    if (step === 0) {
      const detected = detectTemplate(title)
      setTemplateKey(detected.key)
      setArea(detected.defaultArea)
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const goal = await createGoal(userId, {
        title: title.trim(),
        why: why.trim() || null,
        targetDate: targetDate || null,
        area,
        successCriteria: criteria.trim() || null,
        templateKey: templateKey || 'personalizada',
      })
      // Garantizamos la primera acción de hoy, aunque por frecuencia "no toque".
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la meta. Probá de nuevo.')
      setSaving(false)
    }
  }

  const canContinue = step === 0 ? title.trim().length > 0 : true
  const isLast = step === STEPS - 1

  return (
    <div className="screen screen--full flow-screen">
      <div className="row" style={{ marginBottom: 'var(--s4)' }}>
        <button className="iconbtn" onClick={goBack} aria-label="Volver">
          <IconBack />
        </button>
        <div className="stepper spacer">
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
          <Question title="¿Qué querés lograr?" hint="Una frase clara. Ej: “Aprender inglés” o “Bajar 5 kg”.">
            <input
              className="input"
              autoFocus
              aria-label="¿Qué querés lograr?"
              placeholder="Escribí tu meta…"
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
          <Question title="¿Qué tipo de meta es?" hint="Elegimos una por vos según tu meta. Cambiala si no encaja.">
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
            title="¿Por qué querés lograrlo?"
            hint="Tu motivación real. Hito te la recuerda en los días flojos. (opcional)"
          >
            <textarea
              className="textarea"
              autoFocus
              aria-label="¿Por qué querés lograrlo?"
              placeholder="Porque…"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="enter"
            />
            <Hint id="wizard-why-2026-05">
              Lo escribís una vez y lo vas a ver bajo cada tarea derivada de esta meta. Tu ancla
              cuando aflojás.
            </Hint>
          </Question>
        )}

        {step === 3 && (
          <Question title="¿Para cuándo?" hint="Una fecha objetivo le da horizonte a tu meta. (opcional)">
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
          </Question>
        )}

        {step === 4 && (
          <Question title="¿En qué área de tu vida cae?" hint="Nos ayuda a priorizar tu plan del día.">
            <div className="row wrap" role="group" aria-label="¿En qué área de tu vida cae?">
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
          </Question>
        )}

        {step === 5 && (
          <Question
            title="¿Cómo vas a saber que lo lograste?"
            hint="Un criterio observable. Ej: “Tener una conversación de 10 min en inglés”. (opcional)"
          >
            <input
              className="input"
              autoFocus
              aria-label="¿Cómo vas a saber que lo lograste?"
              placeholder="Lo voy a saber cuando…"
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              maxLength={200}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="done"
              inputMode="text"
            />
            <ReviewCard
              title={title}
              templateLabel={getTemplate(templateKey || 'personalizada').label}
              area={area}
              targetDate={targetDate}
              why={why}
              criteria={criteria}
            />
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
          <span className="kicker">Lo lográs cuando</span>
          <p className="small">{cleanCriteria}</p>
        </div>
      )}
    </div>
  )
}
