import { describe, expect, it } from 'vitest'
import { currentStreak, findForgottenGoal, goalsDueForReview } from '@/domain/dailyPlan'
import type { Goal } from '@/lib/types'

// 2026-05-25 = lunes · 2026-05-26 = martes · 2026-05-24 = domingo
function goal(p: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    userId: 'u',
    title: 'Meta',
    why: null,
    targetDate: null,
    area: 'salud',
    successCriteria: null,
    templateKey: 'salud_fisico',
    lastReviewedAt: null,
    status: 'active',
    createdAt: '2026-05-01T12:00:00Z',
    completedAt: null,
    ...p,
  }
}

describe('findForgottenGoal', () => {
  it('marca olvidada una meta nunca avanzada y creada hace tiempo', () => {
    const now = new Date('2026-05-25T12:00:00')
    const res = findForgottenGoal([goal({ id: 'g1' })], new Map(), new Set(), now)
    expect(res?.goal.id).toBe('g1')
  })
  it('no molesta si la meta ya tiene sesión hoy', () => {
    const now = new Date('2026-05-25T12:00:00')
    expect(findForgottenGoal([goal({ id: 'g1' })], new Map(), new Set(['g1']), now)).toBeNull()
  })
})

describe('goalsDueForReview', () => {
  it('incluye metas nunca revisadas', () => {
    expect(goalsDueForReview([goal({ lastReviewedAt: null })], new Date('2026-05-25T12:00:00'))).toHaveLength(1)
  })
  it('excluye metas revisadas hace poco', () => {
    const g = goal({ lastReviewedAt: '2026-05-24T12:00:00Z' }) // ayer; reviewEveryDays = 7
    expect(goalsDueForReview([g], new Date('2026-05-25T12:00:00'))).toHaveLength(0)
  })
})

describe('currentStreak', () => {
  it('cuenta días consecutivos incluido hoy', () => {
    expect(currentStreak(['2026-06-01', '2026-05-31', '2026-05-30'], '2026-06-01')).toBe(3)
  })
  it('no se rompe si hoy aún no hubo actividad (cuenta desde ayer)', () => {
    expect(currentStreak(['2026-05-31', '2026-05-30'], '2026-06-01')).toBe(2)
  })
  it('se corta en el primer hueco', () => {
    expect(currentStreak(['2026-06-01', '2026-05-30'], '2026-06-01')).toBe(1)
  })
  it('es 0 si ni hoy ni ayer hubo actividad', () => {
    expect(currentStreak(['2026-05-28'], '2026-06-01')).toBe(0)
  })
})
