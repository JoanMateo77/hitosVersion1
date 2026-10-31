import { useState } from 'react'
import type { GoalPlan, GoalPlanInput } from '@/domain/goalPlan'
import { requestGoalPlan } from '@/services/goalPlan'
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

const normalize = (t: string) => t.trim().toLowerCase()

/**
 * Sugerencias para el paso de etapas: el plan de la IA (a pedido) y las ideas de
 * la plantilla. Todo se agrega con un clic; nada llega pre-cargado.
 */
export function StageSuggestions({
  input,
  templateTitles,
  addedTitles,
  plan,
  onPlan,
  onAdd,
}: Readonly<StageSuggestionsProps>) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const added = new Set(addedTitles.map(normalize))
  const aiStages = plan?.stages.filter((s) => !added.has(normalize(s.title))) ?? []
  const ideas = templateTitles.filter((t) => !added.has(normalize(t)))

  async function suggest() {
    setLoading(true)
    setError(null)
    try {
      onPlan(await requestGoalPlan(input))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar sugerencias ahora.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stage-suggest stack stack--sm">
      {!plan && (
        <button
          type="button"
          className="btn btn--ghost stage-suggest__ai"
          onClick={suggest}
          disabled={loading}
          aria-busy={loading}
        >
          <IconLightbulb size={16} />
          {loading ? 'Pensando tus etapas…' : 'Sugerir etapas con IA'}
        </button>
      )}
      {error && (
        <p className="faint tiny" role="status">
          {error}
        </p>
      )}

      {plan && aiStages.length > 0 && (
        <section className="stack stack--sm" aria-label="Etapas sugeridas por la IA">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="kicker">Sugeridas para tu meta</span>
            <button
              type="button"
              className="btn--link"
              onClick={() => onAdd(aiStages.map((s) => s.title))}
            >
              Agregar todas
            </button>
          </div>
          {plan.summary && <p className="small faint">{plan.summary}</p>}
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
