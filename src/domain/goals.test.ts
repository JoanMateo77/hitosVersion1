import { describe, expect, it } from 'vitest'
import { clampedStage, isGoalClosed, isPathComplete } from '@/domain/goals'

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

describe('clampedStage', () => {
  it('acota currentMilestone al total de hitos', () => {
    expect(clampedStage(0, 4)).toBe(0)
    expect(clampedStage(2, 4)).toBe(2)
    expect(clampedStage(4, 4)).toBe(4)
    expect(clampedStage(9, 4)).toBe(4) // nunca excede el total
  })

  it('nunca devuelve un valor negativo', () => {
    expect(clampedStage(-3, 4)).toBe(0)
  })
})

describe('isPathComplete', () => {
  it('es true cuando se recorrieron todos los hitos', () => {
    expect(isPathComplete(4, 4)).toBe(true)
    expect(isPathComplete(5, 4)).toBe(true)
  })

  it('es false mientras falte algún hito', () => {
    expect(isPathComplete(0, 4)).toBe(false)
    expect(isPathComplete(3, 4)).toBe(false)
  })
})
