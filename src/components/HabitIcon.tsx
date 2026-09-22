import type { Habit, HabitColor } from '@/lib/types'
import { habitColor, habitIcon } from '@/domain/habits'

/**
 * Azulejo de identidad de un hábito: el emoji sobre su degradado. Es el ancla
 * visual de Hábitos, del detalle y de las filas de Hoy.
 *
 * El color NO se pasa por style: se declara con `data-color` y las reglas de
 * `habits.css` setean `--hab-a`/`--hab-g1`/`--hab-g2`. Así el contenedor que
 * lleve el mismo atributo tiñe también anillos, barras y números de la fila.
 *
 * Tamaños: sm 36 · md 42 (el de las listas) · lg 64 (héroe del detalle) ·
 * xl 88 (paso 1 de la hoja, con sombra de su propio color).
 */
export function HabitIcon({
  habit,
  icon,
  color,
  size = 'md',
}: {
  habit?: Habit
  /** Emoji explícito (borrador de la hoja, sugerencias): gana al del hábito. */
  icon?: string
  /** Color explícito; si no, el del hábito o el de su área. */
  color?: HabitColor
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const emoji = icon ?? (habit ? habitIcon(habit) : '✨')
  const key = color ?? (habit ? habitColor(habit) : 'gray')
  return (
    <span className={`hab-icon hab-icon--${size}`} data-color={key} aria-hidden="true">
      {emoji}
    </span>
  )
}
