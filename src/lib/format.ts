/** Espacio que no se corta entre el número y el signo. */
const NBSP = ' '

/** Porcentaje como se escribe en español: número, espacio que no se corta y "%". */
export function formatPercent(value: number): string {
  return `${Math.round(value)}${NBSP}%`
}
