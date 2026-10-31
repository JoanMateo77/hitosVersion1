import { describe, expect, it } from 'vitest'
import { buildGoalPlanPrompt, parseGoalPlan } from './goalPlan'

const stage = (title: string) => ({
  title,
  objective: 'Algo cambia',
  weeks: 2,
  firstActions: ['Hacer una cosa'],
  successSignal: 'Se nota',
})

describe('parseGoalPlan', () => {
  it('acepta un plan válido y normaliza espacios', () => {
    const plan = parseGoalPlan({
      summary: '  Enfoque   claro ',
      weeklyMinutes: 150,
      stages: [stage('Uno'), stage('Dos'), stage('Tres')],
    })
    expect(plan?.schemaVersion).toBe(1)
    expect(plan?.summary).toBe('Enfoque claro')
    expect(plan?.stages.map((s) => s.title)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('rechaza menos de 3 etapas válidas', () => {
    expect(
      parseGoalPlan({ summary: 'x', weeklyMinutes: 60, stages: [stage('Uno'), { title: '' }, stage('Dos')] }),
    ).toBeNull()
  })

  it('recorta a 6 etapas y a 3 acciones por etapa', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...stage(`E${i}`),
      firstActions: ['a', 'b', 'c', 'd'],
    }))
    const plan = parseGoalPlan({ summary: 'x', weeklyMinutes: 60, stages: many })
    expect(plan?.stages).toHaveLength(6)
    expect(plan?.stages[0].firstActions).toEqual(['a', 'b', 'c'])
  })

  it('descarta etapas sin acciones o con semanas no positivas', () => {
    const plan = parseGoalPlan({
      summary: 'x',
      weeklyMinutes: 60,
      stages: [stage('A'), { ...stage('B'), firstActions: [] }, { ...stage('C'), weeks: 0 }, stage('D'), stage('E')],
    })
    expect(plan?.stages.map((s) => s.title)).toEqual(['A', 'D', 'E'])
  })

  it('rechaza lo que no es objeto', () => {
    expect(parseGoalPlan(null)).toBeNull()
    expect(parseGoalPlan('texto')).toBeNull()
    expect(parseGoalPlan({ stages: 'no' })).toBeNull()
  })
})

describe('buildGoalPlanPrompt', () => {
  it('incluye la meta como dato delimitado y omite campos vacíos', () => {
    const prompt = buildGoalPlanPrompt({ title: 'Correr  10K', typeLabel: 'Salud', why: '  ' })
    expect(prompt).toContain('<meta>Correr 10K</meta>')
    expect(prompt).toContain('<tipo>Salud</tipo>')
    expect(prompt).not.toContain('<motivo>')
    expect(prompt).not.toContain('<fecha_limite>')
  })

  it('recorta textos largos del usuario', () => {
    const prompt = buildGoalPlanPrompt({ title: 'x'.repeat(500), typeLabel: 'T' })
    expect(prompt).toContain(`<meta>${'x'.repeat(200)}</meta>`)
  })
})
