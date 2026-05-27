import { describe, expect, it } from 'vitest'
import {
  WEEKDAY_LABELS,
  compareEvents,
  groupByDate,
  inSameMonth,
  monthGrid,
  weekDays,
} from '@/domain/calendar'
import type { CalendarEvent } from '@/lib/types'

function ev(partial: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u',
    goalId: null,
    title: 'evento',
    notes: null,
    date: '2026-05-25',
    startTime: null,
    endTime: null,
    allDay: true,
    createdAt: '',
    ...partial,
  }
}

describe('calendar', () => {
  it('weekDays: 7 días arrancando el lunes', () => {
    const w = weekDays('2026-05-27')
    expect(w).toHaveLength(7)
    expect(w[0]).toBe('2026-05-25') // lunes
    expect(w[6]).toBe('2026-05-31') // domingo
  })

  it('monthGrid: 6 semanas × 7 días, arranca en lunes', () => {
    const g = monthGrid('2026-05-10')
    expect(g).toHaveLength(6)
    expect(g.every((week) => week.length === 7)).toBe(true)
    // mayo 2026 arranca viernes -> la grilla arranca el lunes anterior (27 abr)
    expect(g[0][0]).toBe('2026-04-27')
  })

  it('inSameMonth', () => {
    expect(inSameMonth('2026-05-31', '2026-05-01')).toBe(true)
    expect(inSameMonth('2026-04-30', '2026-05-01')).toBe(false)
  })

  it('compareEvents: día completo primero, luego por hora', () => {
    const allDay = ev({ allDay: true, startTime: null })
    const at9 = ev({ allDay: false, startTime: '09:00' })
    const at18 = ev({ allDay: false, startTime: '18:00' })
    const sorted = [at18, at9, allDay].sort(compareEvents)
    expect(sorted).toEqual([allDay, at9, at18])
  })

  it('groupByDate agrupa por fecha y ordena dentro del día', () => {
    const timed = ev({ date: '2026-05-25', allDay: false, startTime: '10:00' })
    const full = ev({ date: '2026-05-25', allDay: true })
    const other = ev({ date: '2026-05-26' })
    const map = groupByDate([timed, full, other])
    expect(map.get('2026-05-25')).toEqual([full, timed])
    expect(map.get('2026-05-26')).toHaveLength(1)
  })

  it('WEEKDAY_LABELS arranca en Lun y tiene 7', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Lun')
    expect(WEEKDAY_LABELS).toHaveLength(7)
  })
})
