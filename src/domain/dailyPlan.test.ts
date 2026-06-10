import { describe, expect, it } from 'vitest'
import {
  currentStreak,
  deriveGoalActions,
  findForgottenGoal,
  goalsDueForReview,
  isDueToday,
  pickAction,
  planningGoals,
  weeklyFocus,
} from '@/domain/dailyPlan'
import { getTemplate } from '@/domain/templates'
import type { Goal, Task } from '@/lib/types'

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
    currentMilestone: 0,
    lastReviewedAt: null,
    status: 'active',
    createdAt: '2026-05-01T12:00:00Z',
    completedAt: null,
    ...p,
  }
}

function task(p: Partial<Task> = {}): Task {
  return {
    id: 't1',
    userId: 'u',
    goalId: null,
    title: 'x',
    planDate: '2026-05-25',
    source: 'goal',
    status: 'pending',
    createdAt: '',
    doneAt: null,
    ...p,
  }
}

describe('isDueToday', () => {
  it('daily: siempre', () => {
    expect(isDueToday('daily', '2026-05-24')).toBe(true)
  })
  it('weekdays: lun-vie sí, finde no', () => {
    expect(isDueToday('weekdays', '2026-05-25')).toBe(true)
    expect(isDueToday('weekdays', '2026-05-24')).toBe(false)
  })
  it('thrice_week: lun/mié/vie', () => {
    expect(isDueToday('thrice_week', '2026-05-25')).toBe(true)
    expect(isDueToday('thrice_week', '2026-05-26')).toBe(false)
  })
  it('weekly: solo lunes', () => {
    expect(isDueToday('weekly', '2026-05-25')).toBe(true)
    expect(isDueToday('weekly', '2026-05-26')).toBe(false)
  })
})

describe('pickAction', () => {
  it('devuelve una acción no vacía del pool', () => {
    const a = pickAction(goal(), '2026-05-25')
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
  })
  it('es determinístico para misma meta y día', () => {
    expect(pickAction(goal(), '2026-05-25')).toBe(pickAction(goal(), '2026-05-25'))
  })
  it('en la primera etapa (currentMilestone 0) usa el pool de arranque', () => {
    const t = getTemplate('salud_fisico')
    expect(t.kickoffActions).toBeDefined()
    const a = pickAction(goal({ currentMilestone: 0 }), '2026-05-25')
    expect(t.kickoffActions).toContain(a)
  })
  it('en etapas avanzadas usa el pool de régimen, no el de arranque', () => {
    const t = getTemplate('salud_fisico')
    const a = pickAction(goal({ currentMilestone: 2 }), '2026-05-25')
    expect(t.actions).toContain(a)
  })
})

describe('deriveGoalActions', () => {
  it('omite metas no activas', () => {
    expect(deriveGoalActions([goal({ status: 'paused' })], [], '2026-05-25', { force: true })).toHaveLength(0)
  })
  it('no duplica si la meta ya tiene tarea hoy', () => {
    const out = deriveGoalActions([goal({ id: 'g1' })], [task({ goalId: 'g1' })], '2026-05-25', {
      force: true,
    })
    expect(out).toHaveLength(0)
  })
  it('force incluye metas que hoy no tocan; sin force las omite', () => {
    const g = goal({ id: 'g1', templateKey: 'finanzas' }) // thrice_week (lun/mié/vie)
    expect(deriveGoalActions([g], [], '2026-05-26')).toHaveLength(0) // martes
    expect(deriveGoalActions([g], [], '2026-05-26', { force: true })).toHaveLength(1)
  })
})

describe('planningGoals', () => {
  it('single: a lo sumo una meta', () => {
    expect(planningGoals([goal({ id: 'a' }), goal({ id: 'b' })], 'single', 'salud')).toHaveLength(1)
  })
  it('multi: todas las activas', () => {
    const out = planningGoals([goal({ id: 'a' }), goal({ id: 'b', status: 'paused' })], 'multi', null)
    expect(out).toHaveLength(1)
  })
})

describe('weeklyFocus', () => {
  it('prioriza la meta del nicho principal', () => {
    const a = goal({ id: 'a', area: 'salud' })
    const b = goal({ id: 'b', area: 'finanzas' })
    expect(weeklyFocus([a, b], 'finanzas')?.id).toBe('b')
  })
  it('null si no hay activas', () => {
    expect(weeklyFocus([goal({ status: 'done' })], null)).toBeNull()
  })
})

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
