import type { Habit, HabitColor, NicheId } from '@/lib/types'
import { defaultColorFor, defaultIconFor, type HabitSuggestion } from '@/domain/habits'

/**
 * Borrador de un hábito tal como lo edita la hoja "Nuevo hábito" (3 pasos).
 * `times` son SOLO las horas de recordatorio; `weekdays` vacío = todos los días.
 */
export interface HabitDraft {
  title: string
  icon: string
  color: HabitColor
  area: NicheId
  timesPerDay: number
  unit: string | null
  weekdays: number[]
  times: string[]
  goalId: string | null
}

export function emptyDraft(over: Partial<HabitDraft> = {}): HabitDraft {
  const area = over.area ?? 'otra'
  return {
    title: '',
    icon: defaultIconFor(area),
    color: defaultColorFor(area),
    area,
    timesPerDay: 1,
    unit: null,
    weekdays: [],
    times: [],
    goalId: null,
    ...over,
  }
}

export function draftFromHabit(h: Habit): HabitDraft {
  return {
    title: h.title,
    icon: h.icon ?? defaultIconFor(h.area),
    color: h.color ?? defaultColorFor(h.area),
    area: h.area,
    timesPerDay: h.timesPerDay,
    unit: h.unit,
    weekdays: h.weekdays,
    times: h.times ?? [],
    goalId: h.goalId,
  }
}

export function draftFromSuggestion(s: HabitSuggestion): HabitDraft {
  return {
    title: s.title,
    icon: s.icon,
    color: s.color,
    area: s.area,
    timesPerDay: s.timesPerDay,
    unit: s.unit,
    weekdays: s.weekdays,
    times: [],
    goalId: null,
  }
}
