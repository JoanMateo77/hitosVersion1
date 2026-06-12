import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/lib/formDraft'

/** Mock mínimo de sessionStorage para el entorno Node de los tests. */
function installSessionStorage() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as Record<string, unknown>).sessionStorage = mock
  return store
}

describe('formDraft', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = installSessionStorage()
  })
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).sessionStorage
  })

  it('guarda y recupera un borrador', () => {
    saveFormDraft('k', { title: 'Hola', allDay: true })
    expect(loadFormDraft<{ title: string; allDay: boolean }>('k')).toEqual({
      title: 'Hola',
      allDay: true,
    })
  })

  it('devuelve null si no hay borrador', () => {
    expect(loadFormDraft('nada')).toBeNull()
  })

  it('devuelve null con JSON corrupto o no-objeto', () => {
    store.set('roto', '{no es json')
    expect(loadFormDraft('roto')).toBeNull()
    store.set('numero', '42')
    expect(loadFormDraft('numero')).toBeNull()
  })

  it('clear borra el borrador', () => {
    saveFormDraft('k', { a: 1 })
    clearFormDraft('k')
    expect(loadFormDraft('k')).toBeNull()
  })

  it('sin sessionStorage no lanza (Safari privado)', () => {
    delete (globalThis as Record<string, unknown>).sessionStorage
    expect(() => saveFormDraft('k', { a: 1 })).not.toThrow()
    expect(loadFormDraft('k')).toBeNull()
    expect(() => clearFormDraft('k')).not.toThrow()
  })
})
