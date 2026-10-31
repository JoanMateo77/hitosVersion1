import { useState } from 'react'
import type { ClarifyingQuestion, GoalPlan, GoalPlanInput } from '@/domain/goalPlan'
import { refineGoalPlan, requestGoalPlan, requestQuestions } from '@/services/goalPlan'
import { IconLightbulb, IconPlus } from '@/components/icons'

interface StageSuggestionsProps {
  input: GoalPlanInput
  /** Etapas típicas de la plantilla: se ofrecen como ideas, no como contenido. */
  templateTitles: readonly string[]
  /** Títulos ya agregados (para no ofrecerlos de nuevo). */
  addedTitles: readonly string[]
  plan: GoalPlan | null
  onPlan: (plan: GoalPlan) => void
  onAdd: (titles: string[]) => void
}

/**
 * Flujo del coach como máquina de estados: preguntar → planear → pulir. Cada
 * paso puede fallar sin bloquear: las ideas de plantilla y escribir a mano
 * siguen disponibles siempre.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'asking'; questions: ClarifyingQuestion[] }
  | { kind: 'planned' }

const QUICK_REFINES = ['Más suave', 'Más ambicioso', 'Solo fines de semana', 'Menos etapas']

const normalize = (t: string) => t.trim().toLowerCase()

export function StageSuggestions({
  input,
  templateTitles,
  addedTitles,
  plan,
  onPlan,
  onAdd,
}: Readonly<StageSuggestionsProps>) {
  const [phase, setPhase] = useState<Phase>(plan ? { kind: 'planned' } : { kind: 'idle' })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [signals, setSignals] = useState<string[]>([])
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState<string | null>(null)

  const added = new Set(addedTitles.map(normalize))
  const aiStages = plan?.stages.filter((s) => !added.has(normalize(s.title))) ?? []
  const ideas = templateTitles.filter((t) => !added.has(normalize(t)))

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

  function start() {
    void run(
      'Pensando qué necesito saber…',
      async () => {
        const questions = await requestQuestions(input)
        // Sin preguntas útiles, vamos directo al plan.
        if (questions.length === 0) return generate([])
        setAnswers({})
        setPhase({ kind: 'asking', questions })
      },
      { kind: 'idle' },
    )
  }

  function generate(questions: ClarifyingQuestion[]) {
    const answered = questions
      .map((q) => ({ question: q.question, answer: answers[q.question]?.trim() ?? '' }))
      .filter((a) => a.answer)
    return run(
      'Armando tu camino…',
      async () => {
        const result = await requestGoalPlan({ ...input, answers: answered })
        onPlan(result.plan)
        setSignals(result.signals)
        setPhase({ kind: 'planned' })
      },
      questions.length > 0 ? { kind: 'asking', questions } : { kind: 'idle' },
    )
  }

  function refine(text: string) {
    const request = text.trim()
    if (!plan || !request) return
    void run(
      'Ajustando el plan…',
      async () => {
        const result = await refineGoalPlan(input, plan, request)
        onPlan(result.plan)
        setSignals(result.signals)
        setInstruction('')
        setPhase({ kind: 'planned' })
      },
      { kind: 'planned' },
    )
  }

  return (
    <div className="stage-suggest stack stack--sm">
      {phase.kind === 'idle' && (
        <button type="button" className="btn btn--ghost stage-suggest__ai" onClick={start}>
          <IconLightbulb size={16} />
          Armar mi camino con IA
        </button>
      )}

      {phase.kind === 'loading' && (
        <p className="small faint" role="status" aria-live="polite">
          {phase.label}
        </p>
      )}

      {error && (
        <p className="faint tiny" role="status">
          {error}
        </p>
      )}

      {phase.kind === 'asking' && (
        <section className="stack" aria-label="Preguntas del coach">
          <span className="kicker">Para afinar tu plan</span>
          {phase.questions.map((q) => (
            <fieldset key={q.question} className="stage-suggest__q">
              <legend className="small">{q.question}</legend>
              <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                {q.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`chip ${answers[q.question] === o ? 'chip--selected' : ''}`}
                    aria-pressed={answers[q.question] === o}
                    onClick={() => setAnswers((a) => ({ ...a, [q.question]: o }))}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="row wrap" style={{ gap: 'var(--s3)', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void generate(phase.questions)}
            >
              Generar mi plan
            </button>
            <button type="button" className="btn--link" onClick={() => void generate([])}>
              Saltar preguntas
            </button>
          </div>
        </section>
      )}

      {phase.kind === 'planned' && plan && (
        <section className="stack stack--sm" aria-label="Plan sugerido por la IA">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="kicker">Tu camino sugerido</span>
            {aiStages.length > 0 && (
              <button
                type="button"
                className="btn--link"
                onClick={() => onAdd(aiStages.map((s) => s.title))}
              >
                Agregar todas
              </button>
            )}
          </div>
          {plan.changeNote && <p className="small stage-suggest__change">{plan.changeNote}</p>}
          {plan.summary && <p className="small faint">{plan.summary}</p>}
          {signals.length > 0 && (
            <p className="tiny faint">Tuvimos en cuenta: {signals.join(' ')}</p>
          )}
          {aiStages.length > 0 ? (
            <ul className="stage-suggest__list">
              {aiStages.map((s) => (
                <li key={s.title}>
                  <button type="button" className="stage-suggest__card" onClick={() => onAdd([s.title])}>
                    <IconPlus size={16} className="stage-suggest__plus" />
                    <span className="stage-suggest__text">
                      <strong>{s.title}</strong>
                      <span className="faint tiny">
                        {s.objective} · ~{s.weeks} {s.weeks === 1 ? 'semana' : 'semanas'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny faint">Ya agregaste todas las etapas sugeridas.</p>
          )}

          <form
            className="stack stack--sm stage-suggest__refine"
            onSubmit={(e) => {
              e.preventDefault()
              refine(instruction)
            }}
          >
            <label className="small" htmlFor="refine-plan">
              ¿Lo ajustamos?
            </label>
            <div className="row wrap" style={{ gap: 'var(--s2)' }}>
              {QUICK_REFINES.map((r) => (
                <button key={r} type="button" className="chip" onClick={() => refine(r)}>
                  {r}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <input
                id="refine-plan"
                className="input"
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
        </section>
      )}

      {ideas.length > 0 && (
        <section className="stack stack--sm" aria-label="Ideas de etapas">
          <span className="kicker">Ideas para empezar</span>
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            {ideas.map((t) => (
              <button key={t} type="button" className="chip" onClick={() => onAdd([t])}>
                + {t}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
