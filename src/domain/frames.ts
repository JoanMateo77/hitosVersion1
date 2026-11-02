/**
 * Marcos por racha: anillos que se ganan cumpliendo los días comprometidos.
 *
 * Se calculan sobre la racha ACTUAL (currentStreakCommitted, src/domain/sessions.ts),
 * no sobre la mejor histórica: si la racha se corta, el marco se pierde. Eso es
 * deliberado — el marco es identidad de constancia viva, no una medalla de museo,
 * e incentiva volver cada día.
 */

export type FrameId = 'bronce' | 'plata' | 'oro' | 'leyenda'

export interface Frame {
  id: FrameId
  /** Etiqueta que ve el usuario. */
  label: string
  /** Días de racha (comprometidos cumplidos) necesarios para ganarlo. */
  minStreak: number
  /**
   * Color del anillo (y del punto que lo representa). Nunca es color de texto:
   * Plata y Oro no llegan a 4.5:1 sobre blanco; la etiqueta va en --text.
   * Leyenda usa --text (negro en claro, blanco en oscuro): el azul es de acción.
   */
  color: string
}

/** Los 4 marcos, en orden ascendente de exigencia. */
export const FRAMES: Frame[] = [
  { id: 'bronce', label: 'Bronce', minStreak: 3, color: '#b0793a' },
  { id: 'plata', label: 'Plata', minStreak: 7, color: '#9aa5b1' },
  { id: 'oro', label: 'Oro', minStreak: 21, color: '#d9a514' },
  { id: 'leyenda', label: 'Leyenda', minStreak: 50, color: 'var(--text)' },
]

/** El marco ganado más alto para una racha dada, o null si aún no gana ninguno. */
export function frameForStreak(streak: number): Frame | null {
  let earned: Frame | null = null
  for (const frame of FRAMES) {
    if (streak >= frame.minStreak) earned = frame
  }
  return earned
}
