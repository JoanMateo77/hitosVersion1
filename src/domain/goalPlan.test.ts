import { describe, expect, it } from 'vitest'
import {
  anchorSuggestions,
  buildGoalPlanPrompt,
  buildQuestionsPrompt,
  buildRefinePrompt,
  checkPlanRealism,
  parseGoalPlan,
  parseQuestions,
  resolveInsertIndex,
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

  it('dicen la fecha de hoy y las semanas que quedan hasta la fecha límite', () => {
    const today = new Date('2026-11-06T15:00:00Z')
    const dated = { ...input, targetDate: '2027-03-01' }
    for (const p of [buildGoalPlanPrompt(dated, [], today), buildQuestionsPrompt(dated, [], today)]) {
      expect(p).toContain('<hoy>2026-11-06</hoy>')
      expect(p).toContain('<semanas_disponibles>16</semanas_disponibles>')
    }
    // Sin fecha límite no se inventan semanas.
    expect(buildGoalPlanPrompt(input, [], today)).not.toMatch(/<semanas_disponibles>\d/)
  })

  it('el plan pide cuentas con números, usar cada respuesta, cubrir el plazo y una prueba real', () => {
    const p = buildGoalPlanPrompt(input)
    expect(p).toContain('ritmo necesario')
    expect(p).toContain('Cada respuesta de la persona')
    expect(p).toContain('semanas_disponibles')
    expect(p).toContain('prueba real')
  })

  it('las preguntas piden el punto de partida de una meta medible', () => {
    expect(buildQuestionsPrompt(input)).toContain('cuánto lleva')
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

  it('detecta un camino que deja sin usar buena parte del plazo', () => {
    // 6 semanas de etapas cuando quedan 34.
    const issues = checkPlanRealism(plan(60, [2, 2, 2]), { title: 't', typeLabel: 't', targetDate: '2027-06-26' }, today)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('6 semanas')
    expect(issues[0]).toContain('34')
  })

  it('con etapas propias no juzga la suma de semanas', () => {
    const input = { title: 't', typeLabel: 't', targetDate: '2027-06-26', currentStages: ['Una'] }
    expect(checkPlanRealism(plan(60, [1]), input, today)).toEqual([])
  })
})

describe('anchorSuggestions', () => {
  const s = (title: string, insertAfter?: number) => ({ ...stage(title), insertAfter })
  const plan = (stages: ReturnType<typeof s>[]): GoalPlan => ({ schemaVersion: 1, summary: '', weeklyMinutes: 0, stages })

  it('ancla por título y encadena varias sugerencias del mismo hueco', () => {
    const input = { title: 't', typeLabel: 't', currentStages: ['A', 'B', 'C'] }
    const out = anchorSuggestions(plan([s('X', 0), s('Y', 2), s('Z', 2), s('W', 9)]), input)
    expect(out.stages.map((st) => [st.title, st.afterTitle])).toEqual([
      ['X', null],
      ['Y', 'B'],
      ['Z', 'Y'],
      ['W', 'C'],
    ])
  })

  it('sin etapas propias, forma una cadena desde el inicio', () => {
    const out = anchorSuggestions(plan([s('X', 0), s('Y', 0)]), { title: 't', typeLabel: 't' })
    expect(out.stages.map((st) => st.afterTitle)).toEqual([null, 'X'])
  })

  it('descarta las que repiten literalmente una etapa existente', () => {
    const out = anchorSuggestions(plan([s('b', 1), s('Nueva', 1)]), { title: 't', typeLabel: 't', currentStages: ['A', 'B'] })
    expect(out.stages.map((st) => st.title)).toEqual(['Nueva'])
  })
})

describe('parseGoalPlan con etapas propias', () => {
  it('acepta 0 sugerencias si el mínimo es 0 y conserva notas', () => {
    const plan = parseGoalPlan({ summary: 'ok', weeklyMinutes: 60, stages: [], notes: ['La 2 es vaga', 'x', 'y'] }, 0)
    expect(plan?.stages).toEqual([])
    expect(plan?.notes).toEqual(['La 2 es vaga', 'x'])
  })
})

describe('resolveInsertIndex', () => {
  const sug = (title: string, afterTitle: string | null) => ({ ...stage(title), afterTitle })

  it('null al inicio, título existente después de él, sin ancla al final', () => {
    expect(resolveInsertIndex(null, ['A', 'B'], [])).toBe(0)
    expect(resolveInsertIndex('a', ['A', 'B'], [])).toBe(1)
    expect(resolveInsertIndex(undefined, ['A', 'B'], [])).toBe(2)
    expect(resolveInsertIndex('Borrada', ['A', 'B'], [])).toBe(2)
  })

  it('se resuelve en cadena a través de sugerencias no agregadas', () => {
    const suggestions = [sug('X', 'A'), sug('Y', 'X')]
    expect(resolveInsertIndex('X', ['A', 'B'], suggestions)).toBe(1)
    // Cuando X ya se agregó, Y va justo después de X.
    expect(resolveInsertIndex('X', ['A', 'X', 'B'], suggestions)).toBe(2)
  })
})
