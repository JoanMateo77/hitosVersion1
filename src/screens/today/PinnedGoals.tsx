import type { Goal } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'
import { NicheGlyph } from '@/components/NicheGlyph'

interface PinnedGoalsProps {
  goals: Goal[]
  onOpen: (id: string) => void
}

function rowModifier(count: number): string {
  if (count <= 2) return ' today-pinned__row--fit'
  if (count === 3) return ' today-pinned__row--three'
  return ''
}

/** "Tus metas": las metas activas fijadas arriba de Hoy como recordatorio diario. */
export function PinnedGoals({ goals, onOpen }: Readonly<PinnedGoalsProps>) {
  if (goals.length === 0) return null
  return (
    <section className="today-pinned" aria-label="Tus metas">
      <span className="section-title">Tus metas</span>
      {/* 1–2 metas se reparten el ancho (y 3 desde tableta); si no caben, carrusel. */}
      <div className={`today-pinned__row${rowModifier(goals.length)}`}>
        {goals.map((g) => (
          <button
            key={g.id}
            type="button"
            className="fc-card today-pinned__card"
            style={nicheAccent(g.area)}
            onClick={() => onOpen(g.id)}
          >
            {/* Igual que en Metas: la tarjeta lleva el color del área y su tinta
                (versión compacta de .fc-card). */}
            <NicheGlyph area={g.area} size="md" />
            <span className="today-pinned__text">
              <span className="today-pinned__title">{g.title}</span>
              {g.why ? <span className="today-pinned__why">{g.why}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
