import { describe, expect, it } from 'vitest'
import { formatPercent } from './format'

describe('formatPercent', () => {
  it('redondea y separa el signo con un espacio que no se corta', () => {
    expect(formatPercent(33.4)).toBe('33 %')
    expect(formatPercent(0)).toBe('0 %')
  })
})
