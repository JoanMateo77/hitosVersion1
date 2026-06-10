import { describe, expect, it } from 'vitest'
import { isGoalClosed } from '@/domain/goals'

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
