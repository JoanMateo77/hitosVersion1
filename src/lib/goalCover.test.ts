import { describe, expect, it } from 'vitest'
import {
  COVER_MAX_PX,
  coverDimensions,
  coverInputError,
  coverPath,
  isOwnCoverPath,
} from '@/lib/goalCover'

const UID = '00000000-0000-4000-8000-00000000a001'
const GOAL = '00000000-0000-4000-8001-000000000001'

describe('coverDimensions (reducción a 1600 px de lado mayor)', () => {
  it('reduce una foto horizontal grande conservando la proporción', () => {
    expect(coverDimensions(4032, 3024)).toEqual({ width: 1600, height: 1200 })
  })

  it('reduce una foto vertical por su alto', () => {
    expect(coverDimensions(3000, 6000)).toEqual({ width: 800, height: 1600 })
  })

  it('no agranda una foto pequeña', () => {
    expect(coverDimensions(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('el lado mayor nunca pasa del máximo y ningún lado queda en 0', () => {
    const d = coverDimensions(20000, 3)
    expect(Math.max(d.width, d.height)).toBe(COVER_MAX_PX)
    expect(d.height).toBeGreaterThanOrEqual(1)
  })

  it('rechaza dimensiones inválidas', () => {
    expect(() => coverDimensions(0, 100)).toThrow()
    expect(() => coverDimensions(Number.NaN, 100)).toThrow()
    expect(() => coverDimensions(100, Number.POSITIVE_INFINITY)).toThrow()
    expect(() => coverDimensions(Number.NaN, 100)).toThrow()
  })
})

describe('coverPath (ruta del objeto en el bucket)', () => {
  it('arma {uid}/{goalId}-{timestamp}.webp', () => {
    expect(coverPath(UID, GOAL, 1730000000000)).toBe(`${UID}/${GOAL}-1730000000000.webp`)
  })

  it('usa .jpg cuando el navegador solo pudo codificar JPEG', () => {
    expect(coverPath(UID, GOAL, 1, 'image/jpeg')).toBe(`${UID}/${GOAL}-1.jpg`)
  })

  it('rechaza segmentos que podrían salir de la carpeta del usuario', () => {
    expect(() => coverPath('../otro', GOAL, 1)).toThrow()
    expect(() => coverPath(`${UID}/x`, GOAL, 1)).toThrow()
    expect(() => coverPath(UID, 'a/b', 1)).toThrow()
    expect(() => coverPath(UID, 'foto.png', 1)).toThrow()
    expect(() => coverPath('', GOAL, 1)).toThrow()
    expect(() => coverPath(UID, GOAL, -1)).toThrow()
    expect(() => coverPath(UID, GOAL, 1.5)).toThrow()
  })

  it('isOwnCoverPath solo admite rutas dentro de la carpeta del usuario', () => {
    expect(isOwnCoverPath(UID, `${UID}/${GOAL}-1.webp`)).toBe(true)
    expect(isOwnCoverPath(UID, `otro-uid/${GOAL}-1.webp`)).toBe(false)
    expect(isOwnCoverPath(UID, `${UID}/../otro/x.webp`)).toBe(false)
    expect(isOwnCoverPath('', '/x.webp')).toBe(false)
  })
})

describe('coverInputError (archivo elegido)', () => {
  it('acepta una imagen de hasta 10 MB', () => {
    expect(coverInputError({ type: 'image/jpeg', size: 5_000_000 })).toBeNull()
    expect(coverInputError({ type: 'image/heic', size: 10 * 1024 * 1024 })).toBeNull()
  })

  it('rechaza lo que no es imagen o pesa más de 10 MB', () => {
    expect(coverInputError({ type: 'application/pdf', size: 1000 })).toMatch(/imagen/)
    expect(coverInputError({ type: 'image/png', size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/)
  })
})
