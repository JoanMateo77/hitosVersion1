/**
 * Formatos de hora y duración para mostrar. Viven en el dominio para que los
 * use también el servidor (imports .js); src/lib/date.ts los reexporta.
 */

/** Minutos → texto humano: "2 h 30 min", "45 min", "3 h". */
export function formatDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/** "20:02" → "8:02 pm" (formato 12 horas para mostrar; los inputs siguen nativos). */
export function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  let h = Number(hStr)
  const suffix = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${mStr} ${suffix}`
}
