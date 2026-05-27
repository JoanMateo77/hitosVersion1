import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysUntil,
  formatDuration,
  isToday,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '@/lib/date'

describe('date utils', () => {
  it('addDays cruza fin de mes en ambos sentidos', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addMonths fija el día 1 y evita desbordes (31 + 1 mes)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-05-15', -2)).toBe('2026-03-01')
  })

  it('startOfWeek devuelve el lunes de la semana', () => {
    expect(startOfWeek('2026-05-25')).toBe('2026-05-25') // lunes -> sí mismo
    expect(startOfWeek('2026-05-27')).toBe('2026-05-25') // miércoles
    expect(startOfWeek('2026-05-31')).toBe('2026-05-25') // domingo
  })

  it('startOfMonth y dayOfMonth', () => {
    expect(startOfMonth('2026-05-27')).toBe('2026-05-01')
    expect(dayOfMonth('2026-05-27')).toBe(27)
  })

  it('daysUntil cuenta días con signo', () => {
    expect(daysUntil('2026-05-27', '2026-05-25')).toBe(2)
    expect(daysUntil('2026-05-25', '2026-05-27')).toBe(-2)
  })

  it('isToday', () => {
    expect(isToday(todayISO())).toBe(true)
    expect(isToday('1999-01-01')).toBe(false)
  })

  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(150)).toBe('2 h 30 min')
  })
})
