import { describe, expect, it } from 'vitest'
import {
  buildGoalPlanPrompt,
  buildQuestionsPrompt,
  buildRefinePrompt,
  checkPlanRealism,
  parseGoalPlan,
  parseQuestions,
  type GoalPlan,
} from './goalPlan'

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

describe('parseQuestions', () => {
  it('acepta hasta 3 preguntas con 2–4 opciones y descarta las rotas', () => {
    const qs = parseQuestions({
      questions: [
        { question: '¿Cuánto corres hoy?', options: ['Nada', '2–3 km', '5 km+', 'Más', 'Extra'] },
        { question: 'Sin opciones', options: ['solo una'] },
        { question: '¿Tienes reloj?', options: ['Sí', 'No'] },
        { question: 'Q3', options: ['a', 'b'] },
        { question: 'Q4', options: ['a', 'b'] },
      ],
    })
    expect(qs?.map((q) => q.question)).toEqual(['¿Cuánto corres hoy?', '¿Tienes reloj?', 'Q3'])
    expect(qs?.[0].options).toHaveLength(4)
  })

  it('null si no hay ninguna pregunta usable', () => {
    expect(parseQuestions({ questions: [] })).toBeNull()
    expect(parseQuestions('x')).toBeNull()
  })
})

describe('prompts del coach', () => {
  const input = {
    title: 'Correr 10K',
    typeLabel: 'Salud',
    area: 'salud',
    weeklyMinutes: 120,
    answers: [{ question: '¿Cuánto corres hoy?', answer: 'Nada' }],
  }

  it('usan la guía del área, el tiempo comprometido, las respuestas y el historial', () => {
    const p = buildGoalPlanPrompt(input, ['Completas el 40% de tus sesiones.'])
    expect(p).toContain('Salud/deporte')
    expect(p).toContain('<tiempo_semanal_comprometido>120 minutos')
    expect(p).toContain('<respuesta pregunta="¿Cuánto corres hoy?">Nada</respuesta>')
    expect(p).toContain('<historial_en_la_app>Completas el 40%')
  })

  it('las preguntas no repiten lo que ya se sabe', () => {
    expect(buildQuestionsPrompt(input)).toContain('No preguntes lo que ya está en los datos')
  })

  it('el pulido incluye el plan actual y el pedido delimitados', () => {
    const plan: GoalPlan = { schemaVersion: 1, summary: 's', weeklyMinutes: 90, stages: [] }
    const p = buildRefinePrompt(input, plan, 'más suave', [])
    expect(p).toContain('<plan_actual>{"summary":"s"')
    expect(p).toContain('<pedido>más suave</pedido>')
  })
})

describe('checkPlanRealism', () => {
  const plan = (weeklyMinutes: number, weeks: number[]): GoalPlan => ({
    schemaVersion: 1,
    summary: 's',
    weeklyMinutes,
    stages: weeks.map((w, i) => ({ ...stage(`E${i}`), weeks: w })),
  })
  const today = new Date('2026-10-31T00:00:00Z')

  it('sin problemas si cabe en tiempo y fecha', () => {
    expect(checkPlanRealism(plan(120, [2, 2, 2]), { title: 't', typeLabel: 't', weeklyMinutes: 120, targetDate: '2026-12-31' }, today)).toEqual([])
  })

  it('detecta exceso de minutos y de semanas', () => {
    const issues = checkPlanRealism(
      plan(300, [4, 4, 4]),
      { title: 't', typeLabel: 't', weeklyMinutes: 120, targetDate: '2026-11-28' },
      today,
    )
    expect(issues).toHaveLength(2)
    expect(issues[0]).toContain('300 min')
    expect(issues[1]).toContain('12 semanas')
  })
})
