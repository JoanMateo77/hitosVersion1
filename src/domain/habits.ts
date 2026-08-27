import type { Habit, HabitCheck } from '@/lib/types'
import { weekdayMon0 } from '@/domain/commitment'
import { currentStreakCommitted } from '@/domain/sessions'
import { addDays, todayISO } from '@/lib/date'

/**
 * Hábitos diarios (zona nueva): lógica pura, sin I/O.
 *
 * Un hábito es una rutina de un toque: aplica ciertos días de la semana
 * (lunes=0 … domingo=6; vacío = todos) y se cumple marcándolo. Puede tener
 * horas del día (`times`): cada hora es una repetición y el día se cumple
 * completándolas todas. La racha y la vista semanal solo consideran los días
 * aplicables: descansar un día que no toca no castiga.
 */

/** Todos los índices de día, para tratar "weekdays vacío" como diario. */
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/** ¿El hábito toca en esta fecha? weekdays vacío = aplica todos los días. */
export function habitAppliesOn(habit: Habit, dateISO: string): boolean {
  if (habit.weekdays.length === 0) return true
  return habit.weekdays.includes(weekdayMon0(dateISO))
}

/**
 * Hábitos que tocan en una fecha: solo los no archivados que aplican ese día,
 * en orden de creación ascendente (estable para la lista de Hoy).
 */
export function habitsDueOn(habits: Habit[], dateISO: string): Habit[] {
  return habits
    .filter((h) => h.archivedAt === null && habitAppliesOn(h, dateISO))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Veces que hay que cumplir el hábito en un día: una por hora, o 1 sin horas. */
export function habitTarget(habit: Habit): number {
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

/**
 * Fechas en las que el hábito quedó COMPLETO (todas sus repeticiones): es el
 * Set que esperan habitStreak y habitWeek. Para hábitos sin horas equivale a
 * "fechas con marca", como siempre.
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
