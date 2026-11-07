/**
 * Aritmética de horas "HH:MM" sin dependencias: la usan el cliente y el
 * servidor (dayPlan.ts corre en la función de Vercel; imports relativos .js).
 */

/** "08:30" → 510. Asume formato HH:MM válido (inputs nativos). */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 510 → "08:30". Envuelve sobre medianoche para horas derivadas. */
export function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Intervalos libres dentro de [dayStartMin, dayEndMin), incluidos el hueco
 * antes del primer ítem y después del último (que freeGapsMinutes no da).
 * `busy` puede venir desordenado y con solapes; lo que cae fuera del día se recorta.
 */
export function freeIntervals(
  busy: Array<{ startMin: number; endMin: number }>,
  dayStartMin: number,
  dayEndMin: number,
): Array<{ startMin: number; endMin: number }> {
  const sorted = busy
    .map((b) => ({ startMin: Math.max(b.startMin, dayStartMin), endMin: Math.min(b.endMin, dayEndMin) }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin)
  const free: Array<{ startMin: number; endMin: number }> = []
  let cursor = dayStartMin
  for (const b of sorted) {
    if (b.startMin > cursor) free.push({ startMin: cursor, endMin: b.startMin })
    cursor = Math.max(cursor, b.endMin)
  }
  if (cursor < dayEndMin) free.push({ startMin: cursor, endMin: dayEndMin })
  return free
}
