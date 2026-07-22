/**
 * Utilidades de fecha. Todo el plan diario trabaja con fechas locales en
 * formato ISO corto (yyyy-mm-dd) para no arrastrar zonas horarias ni horas.
 */

/** Fecha local de hoy como yyyy-mm-dd (NO usa UTC para no "saltar" de día). */
export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parsea un yyyy-mm-dd como fecha local (mediodía evita corrimientos por DST). */
export function parseISO(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00`)
}

const LONG_DATE = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const SHORT_DATE = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** "12 de junio de 2026" */
export function formatLongDate(dateISO: string): string {
  return LONG_DATE.format(parseISO(dateISO))
}

/** "lunes 25 de mayo" (capitalizada) */
export function formatWeekday(dateISO: string): string {
  const s = SHORT_DATE.format(parseISO(dateISO))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Días enteros desde hoy hasta la fecha dada (negativo si ya pasó). */
export function daysUntil(dateISO: string, from: string = todayISO()): number {
  const ms = parseISO(dateISO).getTime() - parseISO(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** Texto humano del horizonte de una meta: "faltan 8 días", "vence hoy", "vencida". */
export function relativeDeadline(dateISO: string | null): string | null {
  if (!dateISO) return null
  const d = daysUntil(dateISO)
  if (d < 0) return `vencida hace ${Math.abs(d)} ${Math.abs(d) === 1 ? 'día' : 'días'}`
  if (d === 0) return 'vence hoy'
  if (d === 1) return 'falta 1 día'
  if (d < 45) return `faltan ${d} días`
  const weeks = Math.round(d / 7)
  if (weeks < 9) return `faltan ${weeks} semanas`
  const months = Math.round(d / 30)
  return `faltan ${months} meses`
}

/** Suma (o resta, si n<0) días a una fecha ISO; devuelve otra fecha ISO local. */
export function addDays(dateISO: string, n: number): string {
  const d = parseISO(dateISO)
  d.setDate(d.getDate() + n)
  return todayISO(d)
}

/** Suma (o resta) meses, fijando el día 1 para evitar desbordes (31 + 1 mes). */
export function addMonths(dateISO: string, n: number): string {
  const d = parseISO(dateISO)
  d.setMonth(d.getMonth() + n, 1)
  return todayISO(d)
}

/** Lunes de la semana que contiene la fecha (la semana arranca el lunes). */
export function startOfWeek(dateISO: string): string {
  const dow = (parseISO(dateISO).getDay() + 6) % 7 // 0 = lunes … 6 = domingo
  return addDays(dateISO, -dow)
}

/** Domingo de la semana que contiene la fecha. */
export function endOfWeek(dateISO: string): string {
  return addDays(startOfWeek(dateISO), 6)
}

/** Primer día del mes de la fecha dada (yyyy-mm-01). */
export function startOfMonth(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`
}

const MONTH_YEAR = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })

/** "Mayo de 2026" (capitalizado). */
export function formatMonthYear(dateISO: string): string {
  const s = MONTH_YEAR.format(parseISO(dateISO))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const DAY_MONTH = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const DAY_ONLY = new Intl.DateTimeFormat('es', { day: 'numeric' })

/**
 * Rango de una semana, legible aunque cruce de mes o de año:
 *   misma quincena de mes → "14–20 de julio de 2026"
 *   cruza de mes          → "28 jul – 3 ago 2026"
 * Distinto de formatMonthYear (que titula la vista Mes), para que Semana y Mes
 * no compartan el mismo título.
 */
export function formatWeekRange(startISO: string, endISO: string): string {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  const year = end.getFullYear()
  if (start.getMonth() === end.getMonth()) {
    const s = `${DAY_ONLY.format(start)}–${DAY_ONLY.format(end)} de ${MONTH_YEAR.format(end)}`
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)} ${year}`.replace('.', '')
}

/** ¿La fecha ISO es hoy? */
export function isToday(dateISO: string): boolean {
  return dateISO === todayISO()
}

/** Día del mes como número (1–31). */
export function dayOfMonth(dateISO: string): number {
  return Number(dateISO.slice(8, 10))
}

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
