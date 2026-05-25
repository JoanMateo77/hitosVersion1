interface RoadmapProps {
  milestones: string[]
  /** Índice del hito en el que está el usuario ahora (resaltado). */
  currentIndex?: number
  /** Si se pasa, cada hito es tocable para fijar el avance en ese punto. */
  onSelect?: (index: number) => void
}

/** "El camino": muestra los hitos como pasos conectados, con el actual resaltado. */
export function Roadmap({ milestones, currentIndex = 0, onSelect }: RoadmapProps) {
  return (
    <ol className="roadmap">
      {milestones.map((milestone, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'
        const node = <span className="roadmap__node">{state === 'done' ? '✓' : i + 1}</span>
        const label = <span className="roadmap__label">{milestone}</span>
        return (
          <li key={milestone} className={`roadmap__step roadmap__step--${state}`}>
            {onSelect ? (
              <button type="button" className="roadmap__hit" onClick={() => onSelect(i)}>
                {node}
                {label}
              </button>
            ) : (
              <>
                {node}
                {label}
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}
