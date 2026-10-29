import type { Goal } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'

interface PinnedGoalsProps {
  goals: Goal[]
  onOpen: (id: string) => void
}

/** "Tus metas": las metas activas fijadas arriba de Hoy como recordatorio diario. */
export function PinnedGoals({ goals, onOpen }: PinnedGoalsProps) {
  if (goals.length === 0) return null
  return (
    <section className="today-pinned" aria-label="Tus metas">
      <span className="kicker today-kicker">Tus metas</span>
      <div className="today-pinned__row">
        {goals.map((g) => (
          <button
            key={g.id}
            type="button"
            className="today-pinned__card"
            style={nicheAccent(g.area)}
            onClick={() => onOpen(g.id)}
          >
            <span className="today-pinned__title">{g.title}</span>
            {g.why ? <span className="today-pinned__why">{g.why}</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}
