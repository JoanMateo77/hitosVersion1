import { describe, expect, it } from 'vitest'
import { looseArea } from '@/domain/looseArea'

describe('looseArea', () => {
  it('uses the saved area when there is one', () => {
    expect(looseArea('Revisar la moto', 'finanzas')).toBe('finanzas')
  })

  it('never falls back to the grey area', () => {
    const titles = ['Revisar la moto', 'Organizar la casa', 'Planear mañana', 'x', '', 'Pagar la factura del celular']
    for (const t of titles) expect(looseArea(t, null)).not.toBe('otra')
    expect(looseArea('Algo', 'otra')).not.toBe('otra')
  })

  it('gives the same title the same color every time', () => {
    expect(looseArea('Organizar la casa', null)).toBe(looseArea('Organizar la casa', null))
  })

  it('spreads different titles over several colors', () => {
    const titles = Array.from({ length: 40 }, (_, i) => `Pendiente ${i}`)
    expect(new Set(titles.map((t) => looseArea(t, null))).size).toBeGreaterThan(3)
  })
})
