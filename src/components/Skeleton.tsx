/** Placeholders animados para estados de carga (mejor percepción que un spinner). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack stack--sm" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 66 }} />
      ))}
    </div>
  )
}
