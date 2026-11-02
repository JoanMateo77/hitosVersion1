import type { CSSProperties } from 'react'
import type { NicheId } from '@/lib/types'

/**
 * Devuelve un style con el color del área para que el CSS lo use sin conocer el
 * área. Publica:
 * - `--niche`: tono medio (tags, línea de tiempo, acentos sobre gris).
 * - `--vivid`, `--vivid-ink`, `--vivid-lip`: superficie full color, la tinta que
 *   se lee sobre ella (blanca u oscura según el tono) y su relieve (tokens.css).
 * - `--pat`: patrón SVG propio del área.
 * Los valores viven en tokens.css; aquí solo se enlazan.
 *
 *   <article className="fc-card" style={nicheAccent(goal.area)}>…</article>
 */
export function nicheAccent(id: NicheId): CSSProperties {
  // El tipo CSSProperties no contempla custom properties (--*), de ahí el cast.
  return {
    '--niche': `var(--niche-${id})`,
    '--vivid': `var(--vivid-${id})`,
    '--vivid-ink': `var(--vivid-ink-${id})`,
    '--vivid-lip': `var(--vivid-lip-${id})`,
    '--pat': `var(--pat-${id})`,
  } as CSSProperties
}
