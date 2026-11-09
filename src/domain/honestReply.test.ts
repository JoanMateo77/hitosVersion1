import { describe, expect, it } from 'vitest'
import { honestReply } from './honestReply'

describe('honestReply', () => {
  it('leaves a proposal untouched', () => {
    expect(honestReply('Te propongo quitar la etapa de ergonomía.')).toBe('Te propongo quitar la etapa de ergonomía.')
  })

  it('rewrites a leading claim as a proposal', () => {
    expect(honestReply('Agregué etapas para pausas activas.')).toBe('Te propongo etapas para pausas activas.')
    expect(honestReply('Listo, quité la etapa de ergonomía.')).toBe('Te propongo la etapa de ergonomía.')
  })

  it('rewrites claims in the middle of the reply', () => {
    expect(honestReply('Entiendo. Ya he registrado tu avance.')).toBe('Entiendo. Te propongo tu avance.')
    expect(honestReply('Como pediste, cambié el orden.')).toBe('Como pediste, propongo el orden.')
  })

  it('covers the verbs the goal coach uses for a whole path', () => {
    expect(honestReply('Te armé el camino completo hasta tener tus gafas.')).toBe('Te propongo el camino completo hasta tener tus gafas.')
    expect(honestReply('He preparado el camino completo.')).toBe('Te propongo el camino completo.')
    expect(honestReply('Te armo el camino paso a paso.')).toBe('Te armo el camino paso a paso.')
  })

  it('does not touch words that only contain a claim verb', () => {
    expect(honestReply('Un camino bien organizado ayuda.')).toBe('Un camino bien organizado ayuda.')
  })
})
