interface RoadmapProps {
  milestones: string[]
  /** Índice del hito en el que está el usuario ahora (resaltado). */
  currentIndex?: number
  /** Si se pasa, cada hito es tocable para fijar el avance en ese punto. */
  onSelect?: (index: number) => void
}

const STEP_H = 64
const PADDING_Y = 16
const NODE_X = 18
const ZIG_X = 8
const SVG_WIDTH = 36
const NODE_R = 9
const HALO_R = 16

/**
 * "El camino": muestra los hitos como pasos conectados por una curva ondulante.
 *
 * Vivo como SVG (path + nodos) + una lista de labels posicionados absolutamente
 * al lado de cada nodo. Mantenemos la lista accesible (con botones cuando onSelect)
 * y la curva como decoración. La parte verde del camino refleja el progreso real.
 */
export function Roadmap({ milestones, currentIndex = 0, onSelect }: RoadmapProps) {
  const n = milestones.length
  if (n === 0) return null

  // Posiciones: zigzag horizontal sutil para que el camino "respire", no sea regla.
  const points = milestones.map((_, i) => ({
    x: NODE_X + (i % 2) * ZIG_X,
    y: PADDING_Y + i * STEP_H,
  }))

  const totalHeight = PADDING_Y * 2 + Math.max(0, n - 1) * STEP_H

  // Path de Bezier cúbica entre nodos consecutivos: las tangentes son verticales,
  // así la curva fluye natural y no zigzaguea brusco.
  const pathD = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`
      const prev = points[i - 1]
      const dy = STEP_H * 0.5
      return `C ${prev.x} ${prev.y + dy} ${p.x} ${p.y - dy} ${p.x} ${p.y}`
    })
    .join(' ')

  // Progreso del camino "iluminado" como % de la longitud total.
  const progressPct = n > 1 ? (Math.min(currentIndex, n - 1) / (n - 1)) * 100 : 0

  return (
    <div className="roadmap" style={{ height: totalHeight }}>
      <svg
        className="roadmap__svg"
        width={SVG_WIDTH}
        height={totalHeight}
        viewBox={`0 0 ${SVG_WIDTH} ${totalHeight}`}
        aria-hidden="true"
      >
        <path d={pathD} className="roadmap__path roadmap__path--base" />
        <path
          d={pathD}
          className="roadmap__path roadmap__path--done"
          pathLength={100}
          strokeDasharray={`${progressPct} 100`}
        />
        {points.map((p, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'
          return (
            <g key={i} className={`roadmap__svg-step roadmap__svg-step--${state}`}>
              {state === 'current' && (
                <circle cx={p.x} cy={p.y} r={HALO_R} className="roadmap__halo" />
              )}
              <circle cx={p.x} cy={p.y} r={NODE_R} className="roadmap__circle" />
              {state === 'done' && (
                <path
                  d={`M ${p.x - 3.5} ${p.y + 0.5} L ${p.x - 0.5} ${p.y + 3} L ${p.x + 4} ${p.y - 2.5}`}
                  className="roadmap__tick"
                />
              )}
            </g>
          )
        })}
      </svg>
      <ol className="roadmap__labels">
        {milestones.map((m, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'
          const top = PADDING_Y + i * STEP_H - 14
          const content = (
            <span className={`roadmap__label roadmap__label--${state}`}>{m}</span>
          )
          return (
            <li key={i} className="roadmap__label-row" style={{ top }}>
              {onSelect ? (
                <button
                  type="button"
                  className="roadmap__label-hit"
                  onClick={() => onSelect(i)}
                  aria-label={`Etapa ${i + 1}: ${m}`}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
