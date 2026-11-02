/** Espacio que no se corta ("5 kg", "80 %" en una línea), escapado: no-irregular-whitespace. */
export const NBSP = '\u00a0'

/** Porcentaje como se escribe en español: número, espacio que no se corta y "%". */
export function formatPercent(value: number): string {
  return `${Math.round(value)}${NBSP}%`
}
