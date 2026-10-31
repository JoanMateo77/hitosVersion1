import { describe, expect, it } from 'vitest'
import { computeUserSignals, describeSignals } from './userSignals'

describe('computeUserSignals', () => {
  it('calcula el cumplimiento sin contar saltadas ni pendientes', () => {
    const s = computeUserSignals({
      sessionStatuses: ['done', 'done', 'partial', 'missed', 'missed', 'unconfirmed', 'skipped', 'pending'],
      schedule: [
        { targetKind: 'time', targetValue: 30 },
        { targetKind: 'count', targetValue: 5 },
        { targetKind: 'time', targetValue: 45 },
      ],
      activeGoals: 2,
      preferredMoment: 'morning',
    })
    expect(s.sessionsWithOutcome).toBe(6)
    expect(s.completionRate).toBeCloseTo(0.5)
    expect(s.committedWeeklyMinutes).toBe(75)
    expect(s.preferredMoment).toBe('morning')
  })

  it('no inventa una tasa con pocas sesiones', () => {
    const s = computeUserSignals({ sessionStatuses: ['done'], schedule: [], activeGoals: 0, preferredMoment: 'x' })
    expect(s.completionRate).toBeNull()
    expect(s.preferredMoment).toBeNull()
  })
})

describe('describeSignals', () => {
  it('avisa de un arranque liviano si cumple poco', () => {
    const lines = describeSignals({
      sessionsWithOutcome: 10,
      completionRate: 0.3,
      committedWeeklyMinutes: 120,
      activeGoals: 1,
      preferredMoment: null,
    })
    expect(lines[0]).toContain('30%')
    expect(lines[0]).toContain('más liviano')
    expect(lines[1]).toBe('Ya tienes 1 meta activa con 2 h por semana comprometidas.')
  })

  it('sin señales no dice nada', () => {
    expect(describeSignals(null)).toEqual([])
  })
})
