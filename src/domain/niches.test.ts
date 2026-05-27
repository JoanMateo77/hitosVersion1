import { describe, expect, it } from 'vitest'
import { getNiche, scoreNiche } from '@/domain/niches'
import type { NicheId } from '@/lib/types'

describe('scoreNiche', () => {
  it('gana el más votado', () => {
    expect(scoreNiche(['salud', 'salud', 'finanzas'])).toBe('salud')
  })
  it('ante empate, prioriza la primera respuesta', () => {
    expect(scoreNiche(['finanzas', 'salud'])).toBe('finanzas')
  })
  it('sin respuestas -> "otra"', () => {
    expect(scoreNiche([])).toBe('otra')
  })
})

describe('getNiche', () => {
  it('resuelve un nicho válido', () => {
    expect(getNiche('salud').label).toBeTruthy()
  })
  it('cae en "otra" para un id desconocido', () => {
    expect(getNiche('zzz' as NicheId).id).toBe('otra')
  })
})
