import type { Goal } from '@/lib/types'
import { coverAccent, goalAccent, goalTone } from '@/lib/goalAccent'
import { NicheGlyph } from '@/components/NicheGlyph'
import { GoalCover } from '@/components/GoalCover'
import { useCoverUrl } from '@/hooks/useCoverUrl'

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
          <PinnedGoalCard key={g.id} goal={g} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

/** Tarjeta compacta: color de la meta (propio o del área) y, si se pidió, su portada. */
function PinnedGoalCard({ goal, onOpen }: Readonly<{ goal: Goal; onOpen: (id: string) => void }>) {
  const coverUrl = useCoverUrl(goal.coverOnCard ? goal.coverPath : null)
  return (
    <button
      type="button"
      className={`fc-card today-pinned__card${coverUrl ? ' fc-cover' : ''}`}
      style={coverUrl ? coverAccent(goal) : goalAccent(goal)}
      onClick={() => onOpen(goal.id)}
    >
      {coverUrl && <GoalCover url={coverUrl} />}
      {/* Igual que en Metas: la tarjeta lleva el color de la meta y su tinta
          (versión compacta de .fc-card). */}
      <NicheGlyph area={goal.area} tone={goalTone(goal)} size="md" />
      <span className="today-pinned__text">
        <span className="today-pinned__title">{goal.title}</span>
        {goal.why ? <span className="today-pinned__why">{goal.why}</span> : null}
      </span>
    </button>
  )
}
