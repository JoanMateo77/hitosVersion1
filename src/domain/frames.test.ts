import { describe, expect, it } from 'vitest'
import { FRAMES, frameForStreak } from '@/domain/frames'

describe('frameForStreak', () => {
  it('sin racha suficiente no hay marco', () => {
    expect(frameForStreak(0)).toBeNull()
    expect(frameForStreak(1)).toBeNull()
    expect(frameForStreak(2)).toBeNull()
  })

  it('devuelve el marco ganado más alto en cada umbral', () => {
    expect(frameForStreak(3)?.id).toBe('bronce')
    expect(frameForStreak(6)?.id).toBe('bronce')
    expect(frameForStreak(7)?.id).toBe('plata')
    expect(frameForStreak(20)?.id).toBe('plata')
    expect(frameForStreak(21)?.id).toBe('oro')
    expect(frameForStreak(49)?.id).toBe('oro')
    expect(frameForStreak(50)?.id).toBe('leyenda')
    expect(frameForStreak(365)?.id).toBe('leyenda')
  })

  it('los marcos están en orden ascendente de exigencia (el algoritmo lo asume)', () => {
    for (let i = 1; i < FRAMES.length; i++) {
      expect(FRAMES[i].minStreak).toBeGreaterThan(FRAMES[i - 1].minStreak)
    }
  })
})
