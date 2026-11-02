import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isStaleChunkError, reloadOnceForStaleChunk } from './staleChunk'

describe('isStaleChunkError', () => {
  it('reconoce el CSS de una versión anterior (Vite)', () => {
    expect(isStaleChunkError(new Error('Unable to preload CSS for /assets/habitDraft-Bwj_aKRX.css'))).toBe(true)
  })
  it('reconoce el JS de una versión anterior', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: /assets/Habits-x.js'))).toBe(true)
  })
  it('no confunde un error común', () => {
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})

describe('reloadOnceForStaleChunk', () => {
  const store = new Map<string, string>()
  const reload = vi.fn()
  beforeEach(() => {
    store.clear()
    reload.mockClear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    vi.stubGlobal('window', { location: { reload } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('recarga la primera vez', () => {
    expect(reloadOnceForStaleChunk(1_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })
  it('no entra en bucle si falla de nuevo enseguida', () => {
    reloadOnceForStaleChunk(1_000_000)
    expect(reloadOnceForStaleChunk(1_010_000)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })
  it('vuelve a recargar en un deploy posterior de la misma pestaña', () => {
    reloadOnceForStaleChunk(1_000_000)
    expect(reloadOnceForStaleChunk(1_000_000 + 60 * 60_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
