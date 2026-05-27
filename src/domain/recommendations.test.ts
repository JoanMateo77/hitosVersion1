import { describe, expect, it } from 'vitest'
import { suggestionsForNiche } from '@/domain/recommendations'

describe('recommendations', () => {
  it('sugiere metas concretas por nicho', () => {
    const s = suggestionsForNiche('salud')
    expect(s.length).toBeGreaterThanOrEqual(2)
    expect(s.every((seed) => seed.title.length > 0 && seed.templateKey.length > 0)).toBe(true)
  })

  it('siempre devuelve al menos una sugerencia (fallback "otra")', () => {
    expect(suggestionsForNiche('otra').length).toBeGreaterThan(0)
  })
})
