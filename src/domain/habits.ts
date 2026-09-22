import type { Habit, HabitCheck, HabitColor, HabitSkip, NicheId } from '@/lib/types'
import { weekdayMon0 } from '@/domain/commitment'
import { currentStreakCommitted } from '@/domain/sessions'
import { NICHES } from '@/domain/niches'
import { addDays, daysUntil, parseISO, startOfMonth, todayISO } from '@/lib/date'

/**
 * Hábitos diarios: lógica pura, sin I/O ni React.
 *
 * Un hábito es una rutina de un toque: aplica ciertos días de la semana
 * (lunes=0 … domingo=6; vacío = todos) y se cumple marcándolo. `timesPerDay`
 * dice cuántas repeticiones pide el día y `times` son solo las horas de
 * recordatorio (la repetición i tiene hora únicamente si existe `times[i]`).
 * Un hábito puede estar pausado (`pausedUntil`) o tener días saltados: esos
 * días no aplican, así que no rompen la racha ni salen en "Por hacer".
 */

/** Todos los índices de día, para tratar "weekdays vacío" como diario. */
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/* ===== Saltos ("saltar hoy") ============================================== */

/** Clave de un salto dentro del Set que reciben las funciones de abajo. */
export function skipKey(habitId: string, dateISO: string): string {
  return `${habitId}|${dateISO}`
}

/** Set de claves listo para habitAppliesOn / habitsDueOn / rachas. */
export function skipSetOf(skips: HabitSkip[]): Set<string> {
  const out = new Set<string>()
  for (const s of skips) out.add(skipKey(s.habitId, s.date))
  return out
}

/** ¿El hábito está pausado esa fecha? (pausado hasta pausedUntil inclusive) */
function isPausedOn(habit: Habit, dateISO: string): boolean {
  return habit.pausedUntil !== null && dateISO <= habit.pausedUntil
}

/**
 * Aplicabilidad sin mirar la pausa: días de la semana (vacío = todos) y saltos.
 * La usan las rachas y el mes para que una pausa no borre el pasado: solo
 * guardamos `pausedUntil` (no desde cuándo), así que hacia atrás la pausa se
 * ignora en cuanto se cruza el último día cumplido.
 */
function appliesByWeekday(habit: Habit, dateISO: string, skips?: Set<string>): boolean {
  if (skips?.has(skipKey(habit.id, dateISO))) return false
  if (habit.weekdays.length === 0) return true
  return habit.weekdays.includes(weekdayMon0(dateISO))
}

/**
 * ¿El hábito toca en esta fecha? weekdays vacío = aplica todos los días.
 * Una pausa vigente o un salto de ese día lo dejan fuera.
 */
export function habitAppliesOn(habit: Habit, dateISO: string, skips?: Set<string>): boolean {
  if (isPausedOn(habit, dateISO)) return false
  return appliesByWeekday(habit, dateISO, skips)
}

/**
 * Hábitos que tocan en una fecha: solo los no archivados que aplican ese día,
 * en orden de creación ascendente (estable para la lista de Hoy).
 */
export function habitsDueOn(habits: Habit[], dateISO: string, skips?: Set<string>): Habit[] {
  return habits
    .filter((h) => h.archivedAt === null && habitAppliesOn(h, dateISO, skips))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/* ===== Identidad (icono y color) ========================================== */

/** Las 8 claves de la paleta de identidad, en el orden del selector. */
export const HABIT_COLORS: readonly HabitColor[] = [
  'cyan',
  'green',
  'blue',
  'purple',
  'orange',
  'yellow',
  'pink',
  'gray',
]

/**
 * Catálogo de emojis del selector: primero los 7 del mockup (los que cubren
 * casi todo hábito diario) y detrás el resto, que se despliega con "···".
 */
export const HABIT_ICONS: readonly string[] = [
  '💧', '🏃', '📖', '🧘', '💤', '🥗', '✍️',
  '🚶', '🏋️', '🧹', '🎨', '🎸', '🧠', '💬', '🙏', '🌱', '🍎', '💊', '🦷', '🧴',
  '☀️', '🌙', '📵', '💰', '📝', '🎯', '🧘‍♀️', '🚭', '🚴', '🏊', '🎹', '📚', '🗣️', '🧊',
]

const ICON_BY_AREA: Record<NicheId, string> = {
  salud: '💪',
  finanzas: '💰',
  carrera: '💼',
  aprendizaje: '📖',
  relaciones: '💬',
  creatividad: '🎨',
  bienestar: '🌱',
  otra: '✨',
}

const COLOR_BY_AREA: Record<NicheId, HabitColor> = {
  salud: 'green',
  finanzas: 'yellow',
  carrera: 'blue',
  aprendizaje: 'purple',
  relaciones: 'orange',
  creatividad: 'pink',
  bienestar: 'cyan',
  otra: 'gray',
}

/** Icono por defecto del área (para hábitos viejos y para la hoja nueva). */
export function defaultIconFor(area: NicheId): string {
  return ICON_BY_AREA[area] ?? ICON_BY_AREA.otra
}

/** Color por defecto del área. */
export function defaultColorFor(area: NicheId): HabitColor {
  return COLOR_BY_AREA[area] ?? COLOR_BY_AREA.otra
}

/** Emoji del azulejo del hábito, con el fallback por área. */
export function habitIcon(habit: Habit): string {
  return habit.icon && habit.icon.length > 0 ? habit.icon : defaultIconFor(habit.area)
}

/** Color del azulejo del hábito, con el fallback por área. */
export function habitColor(habit: Habit): HabitColor {
  return habit.color ?? defaultColorFor(habit.area)
}

/** Hábito sugerido: se ofrece en el primer uso y como chip del paso 1. */
export interface HabitSuggestion {
  title: string
  icon: string
  color: HabitColor
  area: NicheId
  timesPerDay: number
  unit: string | null
  weekdays: number[]
}

/** Sugerencias de arranque (las 4 primeras salen en el primer uso). */
export const HABIT_SUGGESTIONS: readonly HabitSuggestion[] = [
  { title: 'Beber agua', icon: '💧', color: 'cyan', area: 'salud', timesPerDay: 5, unit: 'vasos', weekdays: [] },
  { title: 'Leer 20 páginas', icon: '📖', color: 'blue', area: 'aprendizaje', timesPerDay: 1, unit: null, weekdays: [] },
  { title: 'Meditar 10 minutos', icon: '🧘', color: 'yellow', area: 'bienestar', timesPerDay: 1, unit: null, weekdays: [] },
  { title: 'Caminar 8.000 pasos', icon: '🚶', color: 'green', area: 'salud', timesPerDay: 1, unit: null, weekdays: [0, 1, 2, 3, 4] },
  { title: 'Dormir antes de 11', icon: '💤', color: 'purple', area: 'bienestar', timesPerDay: 1, unit: null, weekdays: [] },
  { title: 'Comer verdura', icon: '🥗', color: 'green', area: 'salud', timesPerDay: 1, unit: null, weekdays: [] },
  { title: 'Escribir 3 gratitudes', icon: '🙏', color: 'yellow', area: 'bienestar', timesPerDay: 1, unit: null, weekdays: [] },
  { title: 'Escribir a alguien querido', icon: '💬', color: 'orange', area: 'relaciones', timesPerDay: 1, unit: null, weekdays: [] },
]

/* ===== Repeticiones del día =============================================== */

/**
 * Veces que hay que cumplir el hábito en un día. Manda `timesPerDay`; si la
 * migración 0016 todavía no corrió (o el valor llegó raro), cae al número de
 * horas como hasta ahora.
 */
export function habitTarget(habit: Habit): number {
  if (Number.isFinite(habit.timesPerDay) && habit.timesPerDay >= 1) {
    return Math.floor(habit.timesPerDay)
  }
  return habit.times && habit.times.length > 0 ? habit.times.length : 1
}

/**
 * El hábito con las horas efectivas de UNA fecha: si el día tiene excepción
 * (0015, "reorganizar el día"), sus horas reemplazan a las de siempre; el
 * resto del hábito queda intacto. Sin excepción, devuelve el mismo objeto.
 */
export function habitWithDayTimes(
  habit: Habit,
  override?: { times: string[] } | null,
): Habit {
  if (!override) return habit
  const times = [...override.times].sort()
  return { ...habit, times: times.length > 0 ? times : null }
}

/** Repeticiones ya marcadas de un hábito en una fecha. */
export function habitDoneCount(checks: HabitCheck[], habitId: string, dateISO: string): number {
  let count = 0
  for (const c of checks) if (c.habitId === habitId && c.date === dateISO) count++
  return count
}

/** ¿El hábito quedó COMPLETO ese día? (todas sus repeticiones marcadas) */
export function habitIsComplete(habit: Habit, checks: HabitCheck[], dateISO: string): boolean {
  return habitDoneCount(checks, habit.id, dateISO) >= habitTarget(habit)
}

/**
 * Primer slot sin marcar del hábito en una fecha (el que sigue al tocar el
 * check), o null si el día ya está completo.
 */
export function nextSlot(habit: Habit, checks: HabitCheck[], dateISO: string): number | null {
  const done = new Set<number>()
  for (const c of checks) if (c.habitId === habit.id && c.date === dateISO) done.add(c.slot)
  const target = habitTarget(habit)
  for (let slot = 0; slot < target; slot++) if (!done.has(slot)) return slot
  return null
}

/** Avance del hábito en un día: hechas, objetivo y si el día está cumplido. */
export interface HabitDayProgress {
  done: number
  target: number
  complete: boolean
}

export function habitDayProgress(
  habit: Habit,
  checks: HabitCheck[],
  dateISO: string,
): HabitDayProgress {
  const target = habitTarget(habit)
  const done = Math.min(habitDoneCount(checks, habit.id, dateISO), target)
  return { done, target, complete: done >= target }
}

/** Cómo se ve un hábito en la agenda de un día: UNA sola fila. */
export interface HabitDayRow {
  doneCount: number
  target: number
  complete: boolean
  /** Hora de la próxima repetición pendiente; si está completo, la última.
   *  null cuando esa repetición no tiene hora (slot i >= times.length). */
  time: string | null
}

export function habitDayRow(habit: Habit, checks: HabitCheck[], dateISO: string): HabitDayRow {
  const { done: doneCount, target, complete } = habitDayProgress(habit, checks, dateISO)
  const times = habit.times ?? []
  let time: string | null = null
  if (times.length > 0) {
    const next = nextSlot(habit, checks, dateISO)
    // Completo: la hora de la última repetición que sí tiene hora.
    const slot = next === null ? Math.min(target, times.length) - 1 : next
    time = slot >= 0 && slot < times.length ? times[slot] : null
  }
  return { doneCount, target, complete, time }
}

/**
 * Qué slot tocar al marcar desde una fila única: la siguiente repetición
 * pendiente; si el día ya está completo, se desmarca la ÚLTIMA (simétrico).
 * Es la misma regla que usa el check de Hoy.
 */
export function habitTogglePlan(
  habit: Habit,
  checks: HabitCheck[],
  dateISO: string,
): { slot: number; add: boolean } {
  const next = nextSlot(habit, checks, dateISO)
  if (next !== null) return { slot: next, add: true }
  const own = checks.filter((c) => c.habitId === habit.id && c.date === dateISO)
  const last = own.length > 0 ? Math.max(...own.map((c) => c.slot)) : 0
  return { slot: last, add: false }
}

/**
 * Fechas en las que el hábito quedó COMPLETO (todas sus repeticiones): es el
 * Set que esperan habitStreak y habitWeek. Para hábitos de una vez al día
 * equivale a "fechas con marca", como siempre.
 */
export function habitCompleteDates(habit: Habit, checks: HabitCheck[]): Set<string> {
  const target = habitTarget(habit)
  const byDate = new Map<string, number>()
  for (const c of checks) {
    if (c.habitId !== habit.id) continue
    byDate.set(c.date, (byDate.get(c.date) ?? 0) + 1)
  }
  const complete = new Set<string>()
  for (const [date, count] of byDate) if (count >= target) complete.add(date)
  return complete
}

/* ===== Rachas ============================================================= */

/**
 * Racha actual del hábito contando SOLO días aplicables: los días en que no
 * toca no la rompen ni la suman, y el hoy sin marcar todavía no rompe (queda
 * "en juego" hasta fin del día). Es la misma semántica que la racha de
 * sesiones comprometidas, así que la reutilizamos mapeando "vacío = diario".
 *
 * `checkDates` son las fechas en que el hábito quedó COMPLETO (todas sus
 * repeticiones): para multi-slot, pásalo desde habitCompleteDates.
 */
export function habitStreak(checkDates: Set<string>, weekdays: number[], todayISO: string): number {
  const applicable = new Set(weekdays.length === 0 ? ALL_WEEKDAYS : weekdays)
  return currentStreakCommitted(checkDates, applicable, todayISO)
}

/** Tope de días que se recorren hacia atrás al calcular rachas (un año). */
const STREAK_WINDOW = 365

/**
 * Racha actual del hábito respetando pausa y saltos: los días en que no toca
 * (o que están pausados o saltados) se saltan sin romperla, y hoy sin marcar
 * tampoco rompe.
 *
 * Lo cumplido manda: un día completo suma aunque hoy el hábito esté pausado.
 * Y en cuanto el recorrido hacia atrás cruza el primer día cumplido deja de
 * aplicar la pausa, porque de ahí para atrás es historia anterior a ella.
 */
export function habitStreakOf(
  habit: Habit,
  checks: HabitCheck[],
  skips: Set<string>,
  today: string,
): number {
  const done = habitCompleteDates(habit, checks)
  let cursor = today
  if (!done.has(cursor)) cursor = addDays(cursor, -1)
  let streak = 0
  let pastPause = false
  for (let i = 0; i < STREAK_WINDOW; i++) {
    if (done.has(cursor)) {
      streak++
      pastPause = true
    } else if (appliesOnWalk(habit, cursor, skips, pastPause)) {
      break
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Aplicabilidad durante un recorrido hacia atrás (ver habitStreakOf). */
function appliesOnWalk(
  habit: Habit,
  dateISO: string,
  skips: Set<string>,
  pastPause: boolean,
): boolean {
  return pastPause
    ? appliesByWeekday(habit, dateISO, skips)
    : habitAppliesOn(habit, dateISO, skips)
}

/**
 * Mejor racha histórica dentro de [fromISO, toISO]. Recorre la ventana hacia
 * atrás (misma regla de pausa que habitStreakOf) y se queda con el tramo más
 * largo de días cumplidos sin ningún día aplicable sin marcar en medio.
 */
export function habitBestStreak(
  habit: Habit,
  checks: HabitCheck[],
  skips: Set<string>,
  fromISO: string,
  toISO: string,
): number {
  if (fromISO > toISO) return 0
  const done = habitCompleteDates(habit, checks)
  let best = 0
  let run = 0
  let pastPause = false
  let cursor = toISO
  while (cursor >= fromISO) {
    if (done.has(cursor)) {
      run++
      if (run > best) best = run
      pastPause = true
    } else if (appliesOnWalk(habit, cursor, skips, pastPause)) {
      run = 0
    }
    cursor = addDays(cursor, -1)
  }
  return best
}

/* ===== Mes (estadísticas y cuadrícula) ==================================== */

/** Todas las fechas del mes que contiene monthISO, en orden. */
function datesOfMonth(monthISO: string): string[] {
  const first = startOfMonth(monthISO)
  const month = first.slice(0, 7)
  const out: string[] = []
  let cursor = first
  while (cursor.slice(0, 7) === month) {
    out.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return out
}

/** Cumplimiento del mes: hechos sobre días aplicables YA transcurridos. */
export interface HabitMonthStats {
  done: number
  applicable: number
  /** 0–1; 0 cuando el mes todavía no tuvo días aplicables. */
  ratio: number
}

/**
 * Aplicabilidad para el historial (mes): la pausa solo esconde de hoy en
 * adelante. Hacia atrás manda el día de la semana, para que pausar no borre
 * los meses anteriores (no guardamos desde cuándo empezó la pausa).
 */
function appliesInHistory(
  habit: Habit,
  dateISO: string,
  skips: Set<string>,
  today: string,
): boolean {
  return dateISO >= today
    ? habitAppliesOn(habit, dateISO, skips)
    : appliesByWeekday(habit, dateISO, skips)
}

export function habitMonthStats(
  habit: Habit,
  checks: HabitCheck[],
  skips: Set<string>,
  monthISO: string,
  today: string,
): HabitMonthStats {
  const complete = habitCompleteDates(habit, checks)
  let done = 0
  let applicable = 0
  for (const date of datesOfMonth(monthISO)) {
    if (date > today) break
    // Lo cumplido cuenta siempre, aunque después se saltara o se pausara.
    const hecho = complete.has(date)
    if (!hecho && !appliesInHistory(habit, date, skips, today)) continue
    applicable++
    if (hecho) done++
  }
  return { done, applicable, ratio: applicable === 0 ? 0 : done / applicable }
}

/**
 * Estado de una celda del mes:
 * - done: completo · partial: alguna repetición · missed: aplicaba y pasó
 * - free: no aplica (no toca o pausado) · skipped: el usuario lo saltó
 * - future: aplica pero todavía no llega · blank: hueco antes del día 1
 */
export type HabitCellState =
  | 'done'
  | 'partial'
  | 'missed'
  | 'free'
  | 'skipped'
  | 'future'
  | 'blank'

export interface HabitMonthCell {
  /** null solo en los huecos (`blank`) previos al día 1. */
  date: string | null
  state: HabitCellState
}

/** Cuadrícula del mes con la semana empezando en lunes (huecos incluidos). */
export function habitMonthGrid(
  habit: Habit,
  checks: HabitCheck[],
  skips: Set<string>,
  monthISO: string,
  today: string,
): HabitMonthCell[] {
  const dates = datesOfMonth(monthISO)
  const cells: HabitMonthCell[] = []
  for (let i = 0; i < weekdayMon0(dates[0]); i++) cells.push({ date: null, state: 'blank' })
  const target = habitTarget(habit)
  for (const date of dates) {
    const count = habitDoneCount(checks, habit.id, date)
    let state: HabitCellState
    if (count >= target) state = 'done'
    else if (skips.has(skipKey(habit.id, date))) state = 'skipped'
    else if (!appliesInHistory(habit, date, skips, today)) state = 'free'
    else if (count > 0) state = 'partial'
    // Hoy sin marcar todavía se puede cumplir: misma regla que habitWeek.
    else if (date >= today) state = 'future'
    else state = 'missed'
    cells.push({ date, state })
  }
  return cells
}

/* ===== Textos (una sola voz para las tres pantallas) ====================== */

/** "Una vez al día" / "5 veces al día". */
export function frequencyLabel(habit: Habit): string {
  const target = habitTarget(habit)
  return target === 1 ? 'Una vez al día' : `${target} veces al día`
}

const DAY_ABBR = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

/** "Todos los días" / "Lu a Vi" / "Fin de semana" / "Ma · Ju · Sa". */
export function daysLabel(weekdays: number[]): string {
  const days = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (days.length === 0 || days.length === 7) return 'Todos los días'
  if (days.length === 2 && days[0] === 5 && days[1] === 6) return 'Fin de semana'
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  if (contiguous && days.length >= 3) return `${DAY_ABBR[days[0]]} a ${DAY_ABBR[days[days.length - 1]]}`
  return days.map((d) => DAY_ABBR[d]).join(' · ')
}

/** "9:00, 13:00, 17:00" / "Sin recordatorios". */
export function remindersLabel(times: string[] | null): string {
  if (!times || times.length === 0) return 'Sin recordatorios'
  // Sin el cero de la izquierda ("09:00" → "9:00"): es como lo pide el mockup.
  return times.map((t) => t.replace(/^0/, '')).join(', ')
}

/** "1 de 5 vasos" (con unidad) / "1 de 5". */
export function progressLabel(habit: Habit, done: number): string {
  const base = `${done} de ${habitTarget(habit)}`
  return habit.unit && habit.unit.length > 0 ? `${base} ${habit.unit}` : base
}

const MONTH_NAME = new Intl.DateTimeFormat('es', { month: 'long' })

/** Nombre del mes en minúscula ("julio"), con el año si no es el de hoy. */
function archivedMonth(dateISO: string, today: string): string {
  const name = MONTH_NAME.format(parseISO(dateISO))
  const year = dateISO.slice(0, 4)
  return year === today.slice(0, 4) ? name : `${name} de ${year}`
}

/**
 * Pie de la tarjeta de archivados: cuándo se archivó y su mejor racha.
 * "Archivado hoy · mejor racha 64 días", "Archivado en julio".
 */
export function archivedCaption(habit: Habit, bestStreak: number, today: string): string {
  const when = habit.archivedAt ? habit.archivedAt.slice(0, 10) : today
  const days = Math.max(0, -daysUntil(when, today))
  let head: string
  if (days === 0) head = 'Archivado hoy'
  else if (days === 1) head = 'Archivado hace 1 día'
  else if (days < 7) head = `Archivado hace ${days} días`
  else if (days < 30) {
    const weeks = Math.max(1, Math.round(days / 7))
    head = `Archivado hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
  } else if (days < 90) {
    const months = Math.max(1, Math.round(days / 30))
    head = `Archivado hace ${months} ${months === 1 ? 'mes' : 'meses'}`
  } else head = `Archivado en ${archivedMonth(when, today)}`
  if (bestStreak <= 0) return head
  return `${head} · mejor racha ${bestStreak} ${bestStreak === 1 ? 'día' : 'días'}`
}

/* ===== Agrupaciones y resúmenes =========================================== */

/** Hábitos agrupados por área, en el orden del catálogo y sin áreas vacías. */
export interface HabitAreaGroup {
  area: NicheId
  label: string
  habits: Habit[]
}

export function groupHabitsByArea(habits: Habit[]): HabitAreaGroup[] {
  const groups: HabitAreaGroup[] = []
  for (const niche of NICHES) {
    const own = habits.filter((h) => h.area === niche.id)
    if (own.length > 0) groups.push({ area: niche.id, label: niche.label, habits: own })
  }
  return groups
}

/** Un día de la franja semanal: cuánto se cumplió y en qué momento está. */
export interface HabitWeekRing {
  date: string
  /** Hábitos completos sobre aplicables (0 si ese día no aplica ninguno). */
  ratio: number
  phase: 'past' | 'today' | 'future'
}

/**
 * Hábitos que cuentan ese día: los activos que aplican MÁS los que quedaron
 * completos igual (el trabajo hecho se respeta aunque luego se pause o se
 * salte el día).
 */
function habitsCountingOn(
  habits: Habit[],
  checks: HabitCheck[],
  dateISO: string,
  skips: Set<string>,
): Habit[] {
  return habits.filter(
    (h) =>
      h.archivedAt === null &&
      (habitAppliesOn(h, dateISO, skips) || habitIsComplete(h, checks, dateISO)),
  )
}

export function weekRings(
  habits: Habit[],
  checks: HabitCheck[],
  skips: Set<string>,
  weekStartISO: string,
  today: string,
): HabitWeekRing[] {
  const rings: HabitWeekRing[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStartISO, i)
    const due = habitsCountingOn(habits, checks, date, skips)
    const done = due.filter((h) => habitIsComplete(h, checks, date)).length
    const phase = date < today ? 'past' : date === today ? 'today' : 'future'
    rings.push({ date, ratio: due.length === 0 ? 0 : done / due.length, phase })
  }
  return rings
}

/** Estado de un día completo: todos los aplicables hechos, alguno pendiente
 *  o ninguno aplicable (ese día ni suma ni rompe). */
function dayCompletion(
  habits: Habit[],
  checks: HabitCheck[],
  skips: Set<string>,
  date: string,
): 'complete' | 'incomplete' | 'none' {
  const due = habitsCountingOn(habits, checks, date, skips)
  if (due.length === 0) return 'none'
  return due.every((h) => habitIsComplete(h, checks, date)) ? 'complete' : 'incomplete'
}

/**
 * Días seguidos (hacia atrás) con TODOS los hábitos aplicables completos. Los
 * días sin hábitos aplicables se saltan y hoy incompleto no rompe la racha.
 */
export function habitsDayStreak(
  habits: Habit[],
  checks: HabitCheck[],
  skips: Set<string>,
  today: string,
): number {
  if (habits.every((h) => h.archivedAt !== null)) return 0
  let cursor = today
  if (dayCompletion(habits, checks, skips, cursor) !== 'complete') cursor = addDays(cursor, -1)
  let streak = 0
  for (let i = 0; i < STREAK_WINDOW; i++) {
    const state = dayCompletion(habits, checks, skips, cursor)
    if (state === 'complete') streak++
    else if (state === 'incomplete') break
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Fracción del subtítulo de la cabecera: hábitos completos hoy / aplicables. */
export function todayHeadline(
  habits: Habit[],
  checks: HabitCheck[],
  skips: Set<string>,
  today: string,
): { done: number; total: number } {
  const due = habitsCountingOn(habits, checks, today, skips)
  const done = due.filter((h) => habitIsComplete(h, checks, today)).length
  return { done, total: due.length }
}

/**
 * Estado de los 7 días de la semana (lunes primero) para la franja semanal.
 * `checkDates` = fechas con el hábito COMPLETO (ver habitCompleteDates):
 * - done: completo (gana incluso si el día ya no aplica: el trabajo hecho se respeta)
 * - free: no aplica ese día
 * - due: aplica y es hoy o futuro sin marcar (todavía se puede cumplir)
 * - missed: aplicaba, el día pasó y no se marcó
 */
export function habitWeek(
  checkDates: Set<string>,
  habit: Habit,
  weekStartISO: string,
): ('done' | 'missed' | 'due' | 'free')[] {
  const today = todayISO()
  const week: ('done' | 'missed' | 'due' | 'free')[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStartISO, i)
    if (checkDates.has(date)) week.push('done')
    else if (!habitAppliesOn(habit, date)) week.push('free')
    else if (date >= today) week.push('due')
    else week.push('missed')
  }
  return week
}
