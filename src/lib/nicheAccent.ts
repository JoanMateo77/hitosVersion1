import type { CSSProperties } from 'react'
import type { NicheId } from '@/lib/types'

/**
 * Devuelve un style que setea la variable `--niche` al color del área. Sirve para
 * teñir por nicho tarjetas de meta, tags, el foco de la semana y la línea de
 * tiempo, dándole significado al color (cada área tiene su tono). El color real
 * vive en tokens.css (`--niche-<id>`) y se adapta a cada tema.
 *
 *   <span className="tag tag--niche" style={nicheAccent(goal.area)}>…</span>
 */
export function nicheAccent(id: NicheId): CSSProperties {
  // El tipo CSSProperties no contempla custom properties (--*), de ahí el cast.
  return { '--niche': `var(--niche-${id})` } as CSSProperties
}
