import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Goal, Habit } from '@/lib/types'
import type { DayAgendaSession } from '@/screens/calendar/agendaItems'
import { buildDayPlannerContext } from '@/screens/calendar/dayPlannerItems'

const goal = { id: 'g1', title: 'Tesis' } as Goal

const session = (over: Partial<DayAgendaSession> = {}): DayAgendaSession =>
  ({
    key: 's1',
    goal,
    time: '19:00',
    span: { start: '19:00', end: '19:45' },
    state: 'pending',
    targetLabel: '45 min',
    session: { targetKind: 'time', targetValue: 45 },
    block: null,
    ...over,
  }) as DayAgendaSession

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id: 'e1', title: 'Cita médica', startTime: '10:00', endTime: '10:40', allDay: false, ...over }) as CalendarEvent

const habit = { id: 'h1', title: 'Tomar agua', times: ['08:00', '14:00'] } as Habit

describe('buildDayPlannerContext', () => {
  it('maps a time session to an anchored flexible item with its duration', () => {
    const { items } = buildDayPlannerContext({ sessions: [session()], habitRows: [], events: [] })
    expect(items[0]).toEqual({
      ref: 'session:s1',
      source: 'session',
      title: 'Tesis',
      fixed: false,
      start: '19:00',
      originalStart: '19:00',
      durationMin: 45,
      window: null,
      mode: 'focus',
      goalId: 'g1',
      alongside: null,
      untimed: false,
    })
  })

  it('uses 30 minutes for count sessions and projected ones without session', () => {
    const projected = session({ key: 'p-b1-2026-11-09', session: null, block: { targetKind: 'count', targetValue: 10 } as DayAgendaSession['block'] })
    const { items } = buildDayPlannerContext({ sessions: [projected], habitRows: [], events: [] })
    expect(items[0]).toMatchObject({ ref: 'session:p-b1-2026-11-09', durationMin: 30 })
  })

  it('maps a timed event to a fixed item keeping its original end', () => {
    const { items } = buildDayPlannerContext({ sessions: [], habitRows: [], events: [event()] })
    expect(items[0]).toMatchObject({ ref: 'event:e1', fixed: true, start: '10:00', originalEnd: '10:40', durationMin: 40 })
  })

  it('uses 30 minutes for an event without end', () => {
    const { items } = buildDayPlannerContext({ sessions: [], habitRows: [], events: [event({ endTime: null })] })
    expect(items[0]).toMatchObject({ durationMin: 30, originalEnd: null })
  })

  it('creates one item per timed habit repetition and the habit context', () => {
    const { items, habits } = buildDayPlannerContext({
      sessions: [],
      habitRows: [{ habit, effective: habit, hasOverride: true }],
      events: [],
    })
    expect(items.map((i) => [i.ref, i.start, i.durationMin])).toEqual([
      ['habit:h1:0', '08:00', 15],
      ['habit:h1:1', '14:00', 15],
    ])
    expect(habits).toEqual([{ habitId: 'h1', times: ['08:00', '14:00'], hasOverride: true }])
  })
})
