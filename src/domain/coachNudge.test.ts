import { describe, expect, it } from 'vitest'
import { coachNudge } from './coachNudge'

const base = { committed: 3, done: 3, weekday: 4, pendingStages: 2, ageDays: 10, doneStages: 1 }

describe('coachNudge', () => {
  it('avisa desde el jueves si va por debajo de la mitad', () => {
    expect(coachNudge({ ...base, done: 1 })).toBe('Esta semana llevas 1 de 3 sesiones. ¿Lo revisamos juntos?')
  })
  it('no avisa a comienzo de semana ni con buen ritmo', () => {
    expect(coachNudge({ ...base, done: 0, weekday: 1 })).toBeNull()
    expect(coachNudge({ ...base, done: 2 })).toBeNull()
  })
  it('sugiere partir la primera etapa tras 3 semanas sin avances', () => {
    expect(coachNudge({ ...base, ageDays: 25, doneStages: 0 })).toContain('primera etapa')
  })
  it('no avisa si no hay compromiso ni etapas pendientes', () => {
    expect(coachNudge({ ...base, committed: 0, done: 0, ageDays: 30, doneStages: 0, pendingStages: 0 })).toBeNull()
  })
})
