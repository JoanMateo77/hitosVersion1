import { useState } from 'react'
import type { ClarifyingQuestion, GoalPlan, GoalPlanInput, QuestionAnswer } from '@/domain/goalPlan'
import { refineGoalPlan, requestGoalPlan, requestQuestions } from '@/services/goalPlan'
import { IconLightbulb } from '@/components/icons'

interface CoachPanelProps {
  input: GoalPlanInput
  /** Etapas que la persona ya escribió: el coach las analiza y completa, no las repite. */
  stageTitles: readonly string[]
  plan: GoalPlan | null
  onPlan: (plan: GoalPlan) => void
  /** Sugerencias aún no agregadas (para "Agregar todas"). */
  pendingCount: number
  onAddAll: () => void
}

/**
 * Coach de la meta, arriba del camino y siempre a la vista. Máquina de estados:
 * preguntar → analizar/sugerir → pulir. Las sugerencias NO se listan aquí: van
 * dentro del camino, en la posición donde encajan (ver MilestonesStep).
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'asking'; questions: ClarifyingQuestion[] }
  | { kind: 'planned' }

const QUICK_REFINES = ['Más suave', 'Más ambicioso', 'Solo fines de semana', 'Menos etapas']

const key = (titles: readonly string[]) => titles.map((t) => t.trim().toLowerCase()).join('\n')

export function CoachPanel({ input, stageTitles, plan, onPlan, pendingCount, onAddAll }: Readonly<CoachPanelProps>) {
  const [phase, setPhase] = useState<Phase>(plan ? { kind: 'planned' } : { kind: 'idle' })
  const [picked, setPicked] = useState<Record<string, string>>({})
  // Respuestas ya dadas: al revisar de nuevo no se vuelve a preguntar.
  const [answers, setAnswers] = useState<QuestionAnswer[] | null>(null)
  const [signals, setSignals] = useState<string[]>([])
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Camino sobre el que se hizo el último análisis: si cambió, se ofrece revisar.
  const [analyzedKey, setAnalyzedKey] = useState<string | null>(plan ? key(stageTitles) : null)

  const hasStages = stageTitles.length > 0
  const changedSinceAnalysis = plan !== null && analyzedKey !== key(stageTitles)
  const withStages = (extra: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
    ...input,
    answers: answers ?? [],
    currentStages: [...stageTitles],
    ...extra,
  })

  async function run(label: string, task: () => Promise<void>, onFail: Phase) {
    setPhase({ kind: 'loading', label })
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar sugerencias ahora.')
      setPhase(onFail)
    }
  }

  function analyze(given: QuestionAnswer[]) {
    const fallback: Phase = plan ? { kind: 'planned' } : { kind: 'idle' }
    void run(
      hasStages ? 'Revisando tu camino…' : 'Armando tu camino…',
      async () => {
        const result = await requestGoalPlan(withStages({ answers: given }))
        setAnswers(given)
        onPlan(result.plan)
        setSignals(result.signals)
        setAnalyzedKey(key(stageTitles))
        setPhase({ kind: 'planned' })
      },
      fallback,
    )
  }

  function start() {
    // Si ya respondió las preguntas, revisar de nuevo va directo al análisis.
    if (answers) return analyze(answers)
    void run(
      'Pensando qué necesito saber…',
      async () => {
        const questions = await requestQuestions(withStages())
        if (questions.length === 0) return analyze([])
        setPicked({})
        setPhase({ kind: 'asking', questions })
      },
      { kind: 'idle' },
    )
  }

  function submitAnswers(questions: ClarifyingQuestion[]) {
    analyze(
      questions
        .map((q) => ({ question: q.question, answer: picked[q.question]?.trim() ?? '' }))
        .filter((a) => a.answer),
    )
  }

  function refine(text: string) {
    const request = text.trim()
    if (!plan || !request) return
    void run(
      'Ajustando las sugerencias…',
      async () => {
        const result = await refineGoalPlan(withStages(), plan, request)
        onPlan(result.plan)
        setSignals(result.signals)
        setInstruction('')
        setAnalyzedKey(key(stageTitles))
        setPhase({ kind: 'planned' })
      },
      { kind: 'planned' },
    )
  }

  return (
    <section className="coach" aria-label="Coach de tu meta">
      <div className="coach__head">
        <span className="coach__icon" aria-hidden="true">
          <IconLightbulb size={18} />
        </span>
        <div className="stack" style={{ gap: 2 }}>
          <strong>Coach de tu meta</strong>
          <span className="small faint">
            {hasStages
              ? 'Reviso las etapas que escribiste y te sugiero lo que falta, en el lugar donde encaja.'
              : 'Te hago un par de preguntas y te propongo un camino. Tú eliges qué etapas agregar.'}
          </span>
        </div>
      </div>

      {(phase.kind === 'idle' || (phase.kind === 'planned' && changedSinceAnalysis)) && (
        <button type="button" className="btn btn--primary btn--sm coach__cta" onClick={start}>
          {plan ? 'Revisar de nuevo con tus cambios' : hasStages ? 'Revisar mi camino' : 'Armar mi camino'}
        </button>
      )}

      {phase.kind === 'loading' && (
        <p className="small coach__loading" role="status" aria-live="polite">
          {phase.label}
        </p>
      )}

      {error && (
        <p className="tiny faint" role="status">
          {error}
        </p>
      )}

      {phase.kind === 'asking' && (
        <div className="stack">
          {phase.questions.map((q) => (
            <fieldset key={q.question} className="coach__q">
              <legend className="small">{q.question}</legend>
              <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                {q.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`chip ${picked[q.question] === o ? 'chip--selected' : ''}`}
                    aria-pressed={picked[q.question] === o}
                    onClick={() => setPicked((a) => ({ ...a, [q.question]: o }))}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="row wrap" style={{ gap: 'var(--s3)', alignItems: 'center' }}>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => submitAnswers(phase.questions)}>
              {hasStages ? 'Revisar mi camino' : 'Proponer camino'}
            </button>
            <button type="button" className="btn--link" onClick={() => analyze([])}>
              Saltar preguntas
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'planned' && plan && (
        <div className="stack stack--sm">
          {plan.changeNote && <p className="small coach__change">{plan.changeNote}</p>}
          {plan.summary && <p className="small">{plan.summary}</p>}
          {plan.notes && plan.notes.length > 0 && (
            <ul className="coach__notes">
              {plan.notes.map((n) => (
                <li key={n} className="small">
                  {n}
                </li>
              ))}
            </ul>
          )}
          <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s2)' }}>
            <span className="small faint">
              {pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? 'sugerencia marcada' : 'sugerencias marcadas'} con + en tu camino.`
                : 'No hay sugerencias pendientes: tu camino se ve completo.'}
            </span>
            {pendingCount > 1 && (
              <button type="button" className="btn--link" onClick={onAddAll}>
                Agregar todas
              </button>
            )}
          </div>
          {signals.length > 0 && <p className="tiny faint">Tuvimos en cuenta: {signals.join(' ')}</p>}

          <form
            className="stack stack--sm"
            onSubmit={(e) => {
              e.preventDefault()
              refine(instruction)
            }}
          >
            <span className="small faint">¿Lo ajustamos?</span>
            <div className="row wrap" style={{ gap: 'var(--s2)' }}>
              {QUICK_REFINES.map((r) => (
                <button key={r} type="button" className="chip" onClick={() => refine(r)}>
                  {r}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <input
                className="input"
                aria-label="Pídele un ajuste al coach"
                placeholder="Ej: tengo una lesión en la rodilla"
                maxLength={300}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <button type="submit" className="btn btn--ghost btn--sm" disabled={!instruction.trim()}>
                Ajustar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
