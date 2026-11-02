import type { CSSProperties } from 'react'
import type { Goal, GoalColor, NicheId } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'

/**
 * Paleta cerrada del color propio de una meta (spec 2026-11-02-color-y-portada).
 * Son los 8 tonos de área ya verificados por `npm run check:contrast`, así que
 * la clave es la misma que la del área: el CSS reutiliza `--vivid-*-{clave}`.
 * El nombre es el del tono (no el del área): es lo que lee un lector de pantalla.
 * Es la única fuente de verdad del cliente; la BD repite la lista en su `check`
 * (migración 0019).
 */
export const GOAL_COLORS: readonly { id: GoalColor; label: string }[] = [
  { id: 'salud', label: 'Lima' },
  { id: 'finanzas', label: 'Amarillo' },
  { id: 'bienestar', label: 'Celeste' },
  { id: 'carrera', label: 'Petróleo' },
  { id: 'aprendizaje', label: 'Violeta' },
  { id: 'relaciones', label: 'Frambuesa' },
  { id: 'creatividad', label: 'Magenta' },
  { id: 'otra', label: 'Pizarra' },
]

const COLOR_IDS = new Set<string>(GOAL_COLORS.map((c) => c.id))

/** ¿Es una clave de la paleta? (valida lo que llega de la BD o de un borrador). */
export function isGoalColor(value: unknown): value is GoalColor {
  return typeof value === 'string' && COLOR_IDS.has(value)
}

/** Clave válida o null (= usa el color del área). Nunca deja pasar un valor libre. */
export function parseGoalColor(value: unknown): GoalColor | null {
  return isGoalColor(value) ? value : null
}

/** Nombre accesible de un tono ("Lima", "Violeta"…). */
export function goalColorLabel(id: GoalColor): string {
  return GOAL_COLORS.find((c) => c.id === id)?.label ?? id
}

/** Tono con el que se pinta la meta: su color propio o, si no tiene, el de su área. */
export function goalTone(goal: Readonly<Pick<Goal, 'area' | 'color'>>): NicheId {
  return parseGoalColor(goal.color) ?? goal.area
}

/**
 * Igual que `nicheAccent`, pero para una meta: publica `--vivid`, `--vivid-ink`,
 * `--vivid-lip` y `--pat` del color elegido (o del área si no eligió).
 *
 *   <article className="fc-card" style={goalAccent(goal)}>…</article>
 */
export function goalAccent(goal: Readonly<Pick<Goal, 'area' | 'color'>>): CSSProperties {
  return nicheAccent(goalTone(goal))
}

/**
 * Variante para una superficie con foto de portada: el color de la meta queda
 * en el relieve y la barra, y la tinta pasa a blanco (sobre la capa oscura de
 * `.fc-cover`, que garantiza ≥ 4.5:1 incluso con una foto blanca).
 */
export function coverAccent(goal: Readonly<Pick<Goal, 'area' | 'color'>>): CSSProperties {
  return { ...goalAccent(goal), '--vivid-ink': 'var(--ink-light)' } as CSSProperties
}
