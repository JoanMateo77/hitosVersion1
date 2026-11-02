/**
 * Foto de portada decorativa (alt="") con la capa oscura degradada que deja el
 * texto blanco legible. Va como primer hijo de una superficie `.fc-cover`.
 */
export function GoalCover({ url }: Readonly<{ url: string }>) {
  return (
    <span className="fc-cover__media" aria-hidden="true">
      <img className="fc-cover__img" src={url} alt="" decoding="async" />
    </span>
  )
}
