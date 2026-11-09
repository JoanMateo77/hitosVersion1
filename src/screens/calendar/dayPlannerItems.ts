/**
 * Lo que ya hay en un día de la agenda, convertido en ítems del borrador
 * (dayPlan.ts). Las mismas fuentes que la hoja "Reorganizar el día".
 */
import { rangeMinutes } from '@/domain/commitment'
import { DAY_DEFAULTS, type DayContextHabit, type DayItem } from '@/domain/dayPlan'
import type { CalendarEvent, Habit } from '@/lib/types'
import type { DayAgendaSession } from '@/screens/calendar/agendaItems'

/** Duración supuesta de una repetición de hábito (suelen ser cortas). */
const HABIT_MINUTES = 15

export interface DayPlannerHabitRow {
  habit: Habit
  /** El hábito con las horas efectivas de ese día (excepción incluida). */
  effective: Habit
  hasOverride: boolean
}

const base = { window: null, mode: 'focus', together: null, untimed: false } as const

function sessionMinutes(s: DayAgendaSession): number {
  const target = s.session ?? s.block
  return target?.targetKind === 'time' ? target.targetValue : DAY_DEFAULTS.durationMin
}

export function buildDayPlannerContext(input: {
  sessions: DayAgendaSession[]
  habitRows: DayPlannerHabitRow[]
  events: CalendarEvent[]
}): { items: DayItem[]; habits: DayContextHabit[] } {
  const items: DayItem[] = []
  for (const s of input.sessions) {
    items.push({
      ...base,
      ref: `session:${s.key}`,
      source: 'session',
      title: s.goal.title,
      fixed: false,
      start: s.time,
      originalStart: s.time,
      durationMin: sessionMinutes(s),
      goalId: s.goal.id,
    })
  }
  for (const e of input.events) {
    if (e.allDay || !e.startTime) continue
    items.push({
      ...base,
      ref: `event:${e.id}`,
      source: 'event',
      title: e.title,
      fixed: true,
      start: e.startTime,
      originalStart: e.startTime,
      originalEnd: e.endTime,
      durationMin: (e.endTime && rangeMinutes(e.startTime, e.endTime)) || DAY_DEFAULTS.durationMin,
      goalId: e.goalId ?? null,
    })
  }
  const habits: DayContextHabit[] = []
  for (const r of input.habitRows) {
    const times = r.effective.times ?? []
    if (times.length === 0) continue
    habits.push({ habitId: r.habit.id, times: [...times], hasOverride: r.hasOverride })
    times.forEach((t, i) =>
      items.push({
        ...base,
        ref: `habit:${r.habit.id}:${i}`,
        source: 'habit',
        title: r.habit.title,
        fixed: false,
        start: t,
        originalStart: t,
        durationMin: HABIT_MINUTES,
        goalId: null,
      }),
    )
  }
  return { items, habits }
}
