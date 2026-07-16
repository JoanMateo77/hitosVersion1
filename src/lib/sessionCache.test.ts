import { afterEach, describe, expect, it } from 'vitest'
import { sessionCache } from '@/lib/sessionCache'

describe('sessionCache', () => {
  afterEach(() => sessionCache.clear())

  it('guarda y recupera un valor', () => {
    sessionCache.set('k', { n: 1 })
    expect(sessionCache.get<{ n: number }>('k')).toEqual({ n: 1 })
  })

  it('devuelve undefined si la clave no existe', () => {
    expect(sessionCache.get('nada')).toBeUndefined()
  })

  it('has refleja la presencia de la clave', () => {
    expect(sessionCache.has('k')).toBe(false)
    sessionCache.set('k', 1)
    expect(sessionCache.has('k')).toBe(true)
  })

  it('claves distintas no se pisan', () => {
    sessionCache.set('a', 1)
    sessionCache.set('b', 2)
    expect(sessionCache.get('a')).toBe(1)
    expect(sessionCache.get('b')).toBe(2)
  })

  it('set sobreescribe el valor anterior', () => {
    sessionCache.set('k', 1)
    sessionCache.set('k', 2)
    expect(sessionCache.get('k')).toBe(2)
  })

  it('clear vacía todo', () => {
    sessionCache.set('a', 1)
    sessionCache.set('b', 2)
    sessionCache.clear()
    expect(sessionCache.get('a')).toBeUndefined()
    expect(sessionCache.has('b')).toBe(false)
  })
})
