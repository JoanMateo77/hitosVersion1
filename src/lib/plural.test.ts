import { describe, expect, it } from 'vitest'
import { countLabel } from './plural'

describe('countLabel', () => {
  it('singular solo con 1', () => {
    expect(countLabel(1, 'etapa', 'etapas')).toBe('1 etapa')
    expect(countLabel(0, 'etapa', 'etapas')).toBe('0 etapas')
    expect(countLabel(3, 'sesión cumplida', 'sesiones cumplidas')).toBe('3 sesiones cumplidas')
  })
})
