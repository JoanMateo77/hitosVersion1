import type { Habit } from '@/lib/types'
import { weekdayMon0 } from '@/domain/commitment'
import { currentStreakCommitted } from '@/domain/sessions'
import { addDays, todayISO } from '@/lib/date'

/**
 * Hábitos diarios (zona nueva): lógica pura, sin I/O.
 *
 * Un hábito es una rutina de un toque: aplica ciertos días de la semana
 * (lunes=0 … domingo=6; vacío = todos) y se cumple marcándolo. La racha y la
 * vista semanal solo consideran los días aplicables: descansar un día que no
 * toca no castiga.
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

/**
 * Racha actual del hábito contando SOLO días aplicables: los días en que no
 * toca no la rompen ni la suman, y el hoy sin marcar todavía no rompe (queda
 * "en juego" hasta fin del día). Es la misma semántica que la racha de
 * sesiones comprometidas, así que la reutilizamos mapeando "vacío = diario".
 */
export function habitStreak(checkDates: Set<string>, weekdays: number[], todayISO: string): number {
  const applicable = new Set(weekdays.length === 0 ? ALL_WEEKDAYS : weekdays)
  return currentStreakCommitted(checkDates, applicable, todayISO)
}

/**
 * Estado de los 7 días de la semana (lunes primero) para la franja semanal:
 * - done: marcado (gana incluso si el día ya no aplica: el trabajo hecho se respeta)
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
