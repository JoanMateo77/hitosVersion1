import { describe, expect, it } from 'vitest'
import { GOAL_COLORS, coverAccent, goalAccent, goalColorLabel, goalTone, isGoalColor, parseGoalColor } from '@/lib/goalAccent'
import { nicheAccent } from '@/lib/nicheAccent'
import { NICHES } from '@/domain/niches'

const vars = (style: object) => style as Record<string, string>

describe('paleta de color de la meta', () => {
  it('son exactamente los 8 tonos de área (verificados por check:contrast), sin repetir', () => {
    const ids = GOAL_COLORS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(NICHES.map((n) => n.id).sort())
  })

  it('cada tono tiene nombre accesible propio (no el del área)', () => {
    expect(goalColorLabel('salud')).toBe('Lima')
    expect(goalColorLabel('carrera')).toBe('Petróleo')
    expect(new Set(GOAL_COLORS.map((c) => c.label)).size).toBe(GOAL_COLORS.length)
  })
})

describe('validación de la clave de color', () => {
  it('acepta solo claves de la paleta', () => {
    expect(isGoalColor('aprendizaje')).toBe(true)
    expect(isGoalColor('Aprendizaje')).toBe(false)
    expect(isGoalColor('#ff0000')).toBe(false)
    expect(isGoalColor('red; background:url(x)')).toBe(false)
    expect(isGoalColor(null)).toBe(false)
    expect(isGoalColor(3)).toBe(false)
  })

  it('parseGoalColor deja pasar la clave válida y convierte lo demás en null', () => {
    expect(parseGoalColor('relaciones')).toBe('relaciones')
    expect(parseGoalColor('violeta')).toBeNull()
    expect(parseGoalColor(undefined)).toBeNull()
    expect(parseGoalColor('')).toBeNull()
  })
})

describe('goalAccent', () => {
  it('usa el color elegido en lugar del área', () => {
    const style = vars(goalAccent({ area: 'finanzas', color: 'carrera' }))
    expect(style['--vivid']).toBe('var(--vivid-carrera)')
    expect(style['--vivid-ink']).toBe('var(--vivid-ink-carrera)')
    expect(style['--vivid-lip']).toBe('var(--vivid-lip-carrera)')
    expect(style['--pat']).toBe('var(--pat-carrera)')
    expect(goalTone({ area: 'finanzas', color: 'carrera' })).toBe('carrera')
  })

  it('sin color propio cae al área (igual que nicheAccent)', () => {
    expect(goalAccent({ area: 'salud', color: null })).toEqual(nicheAccent('salud'))
    expect(goalTone({ area: 'salud', color: null })).toBe('salud')
  })

  it('una clave inválida (dato corrupto) cae al área', () => {
    const goal = { area: 'bienestar', color: 'rojo' } as unknown as Parameters<typeof goalAccent>[0]
    expect(goalAccent(goal)).toEqual(nicheAccent('bienestar'))
    expect(goalTone(goal)).toBe('bienestar')
  })

  it('sobre una portada la tinta pasa a blanco y el relieve conserva el color de la meta', () => {
    const style = vars(coverAccent({ area: 'finanzas', color: 'aprendizaje' }))
    expect(style['--vivid-ink']).toBe('var(--ink-light)')
    expect(style['--vivid-lip']).toBe('var(--vivid-lip-aprendizaje)')
  })
})
