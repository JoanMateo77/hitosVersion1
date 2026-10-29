import { describe, expect, it } from 'vitest'
import { goalsInView, isGoalClosed } from '@/domain/goals'
import type { Goal } from '@/lib/types'

describe('isGoalClosed', () => {
  it('marca como cerradas las metas logradas y archivadas', () => {
    expect(isGoalClosed('done')).toBe(true)
    expect(isGoalClosed('archived')).toBe(true)
  })

  it('NO marca como cerradas las activas ni las pausadas (siguen pudiendo estar vencidas)', () => {
    expect(isGoalClosed('active')).toBe(false)
    expect(isGoalClosed('paused')).toBe(false)
  })
})

function mkGoal(id: string, status: Goal['status'], createdAt: string): Goal {
  return {
    id,
    userId: 'u',
    title: id,
    why: null,
    targetDate: null,
    area: 'salud',
    successCriteria: null,
    templateKey: 'custom',
    lastReviewedAt: null,
    status,
    createdAt,
    completedAt: null,
  }
}

describe('goalsInView', () => {
  it('excluye metas pausadas, logradas y archivadas', () => {
    const goals = [
      mkGoal('a', 'active', '2026-01-01'),
      mkGoal('p', 'paused', '2026-01-02'),
      mkGoal('d', 'done', '2026-01-03'),
      mkGoal('x', 'archived', '2026-01-04'),
    ]
    expect(goalsInView(goals, null).map((g) => g.id)).toEqual(['a'])
  })

  it('pone primero la prioritaria aunque sea la más vieja', () => {
    const goals = [mkGoal('new', 'active', '2026-03-01'), mkGoal('old', 'active', '2026-01-01')]
    expect(goalsInView(goals, 'old').map((g) => g.id)).toEqual(['old', 'new'])
  })

  it('sin prioritaria, las más recientes primero', () => {
    const goals = [
      mkGoal('a', 'active', '2026-01-01'),
      mkGoal('c', 'active', '2026-03-01'),
      mkGoal('b', 'active', '2026-02-01'),
    ]
    expect(goalsInView(goals, null).map((g) => g.id)).toEqual(['c', 'b', 'a'])
  })
})
