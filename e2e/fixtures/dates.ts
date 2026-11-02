/**
 * Fechas relativas a "hoy" (hora local, igual que src/lib/date.ts). El dataset
 * se arma en cada corrida, así las capturas siempre tienen datos "recientes".
 */

export function iso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return iso(new Date())
}

/** yyyy-mm-dd desplazado `days` días desde hoy (negativo = pasado). */
export function dayOffset(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return iso(d)
}

/** Timestamp ISO completo para ese día a esa hora local ("HH:MM"). */
export function stamp(days: number, time = '12:00'): string {
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

/** Día de la semana con lunes=0 … domingo=6 (convención de la app). */
export function weekdayMon0(days: number): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return (d.getDay() + 6) % 7
}

/** Suma minutos a "HH:MM". */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
