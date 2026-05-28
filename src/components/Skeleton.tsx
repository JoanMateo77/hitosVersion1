/** Placeholders animados para estados de carga.
 *
 * Skeleton "estructural": imita la forma de un .task (check + 2 líneas + botones)
 * para que la transición a contenido real sea continua y no un parpadeo de cajas. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack stack--sm" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-task">
          <span className="skeleton-task__check" />
          <span className="skeleton-task__body">
            <span className="skeleton-line" style={{ width: '64%' }} />
            <span className="skeleton-line" style={{ width: '38%' }} />
          </span>
          <span className="skeleton-task__btn" />
          <span className="skeleton-task__btn" />
        </div>
      ))}
    </div>
  )
}
