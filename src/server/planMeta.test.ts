import { describe, expect, it, vi } from 'vitest'
import { createMemoryQuota, handlePlanMeta, type PlanMetaDeps } from './planMeta'
import type { GoalPlan } from '../domain/goalPlan'

const plan: GoalPlan = { schemaVersion: 1, summary: 's', weeklyMinutes: 60, stages: [] }

const refund = vi.fn()

function deps(over: Partial<PlanMetaDeps> = {}): PlanMetaDeps {
  return {
    verifyUser: async (t) => (t === 'ok' ? 'user-1' : null),
    planner: {
      plan: vi.fn(async () => plan),
      questions: vi.fn(async () => [{ question: '¿Nivel?', options: ['Bajo', 'Alto'] }]),
      refine: vi.fn(async () => ({ ...plan, changeNote: 'Más suave' })),
      chat: vi.fn(async () => ({ reply: 'Hola', proposal: null })),
      criteria: vi.fn(async () => [{ text: 'Tengo la moto', why: 'Resultado' }]),
      goalType: vi.fn(async () => ({ key: 'finanzas', reason: 'Quieres comprar algo', alternatives: [] })),
      day: vi.fn(async () => ({ reply: 'Armé tu día.', items: [], questions: [], assumptions: [] })),
    },
    takeQuota: () => refund,
    loadSignals: vi.fn(async () => ['Completas el 80% de tus sesiones.']),
    ...over,
  }
}

function req(body: unknown, token: string | null = 'ok', method = 'POST') {
  return new Request('http://x/api/plan-meta', {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

describe('handlePlanMeta', () => {
  it('devuelve el plan a un usuario autenticado', async () => {
    const res = await handlePlanMeta(req({ title: 'Correr 10K', typeLabel: 'Salud' }), deps())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan, signals: ['Completas el 80% de tus sesiones.'] })
  })

  it('devuelve preguntas y pule un plan existente', async () => {
    const q = await handlePlanMeta(req({ action: 'questions', title: 'x' }), deps())
    expect((await q.json()).questions[0].question).toBe('¿Nivel?')
    const validPlan = {
      summary: 's',
      weeklyMinutes: 60,
      stages: ['a', 'b', 'c'].map((t) => ({ title: t, objective: 'o', weeks: 1, firstActions: ['x'], successSignal: 'y' })),
    }
    const r = await handlePlanMeta(req({ action: 'refine', title: 'x', plan: validPlan, instruction: 'más suave' }), deps())
    expect((await r.json()).plan.changeNote).toBe('Más suave')
  })

  it('conversa con el contexto de etapas y propone criterios', async () => {
    const d = deps()
    const c = await handlePlanMeta(
      req({
        action: 'chat',
        title: 'Moto',
        message: 'Ya tengo la licencia',
        history: [{ role: 'user', text: 'hola' }, 'basura'],
        stages: [{ title: 'Licencia', done: false }],
      }),
      d,
    )
    expect(await c.json()).toMatchObject({ reply: 'Hola', proposal: null })
    expect(d.planner?.chat).toHaveBeenCalledWith(
      expect.objectContaining({ stages: [{ title: 'Licencia', done: false }] }),
      [{ role: 'user', text: 'hola' }],
      'Ya tengo la licencia',
      expect.any(Array),
    )
    const k = await handlePlanMeta(req({ action: 'criteria', title: 'Moto', hint: 'sin deudas' }), d)
    expect((await k.json()).options[0].text).toBe('Tengo la moto')
    expect(d.planner?.criteria).toHaveBeenCalledWith(expect.anything(), 'sin deudas', expect.any(Array))
  })

  it('sugiere el tipo de meta sin cargar la memoria de comportamiento', async () => {
    const d = deps()
    const res = await handlePlanMeta(req({ action: 'type', title: 'Comprar una moto', why: 'ir al trabajo' }), d)
    expect(await res.json()).toEqual({ type: { key: 'finanzas', reason: 'Quieres comprar algo', alternatives: [] } })
    expect(d.planner?.goalType).toHaveBeenCalledWith('Comprar una moto', 'ir al trabajo')
    expect(d.loadSignals).not.toHaveBeenCalled()
  })

  it('rechaza chat sin mensaje', async () => {
    expect((await handlePlanMeta(req({ action: 'chat', title: 'x' }), deps())).status).toBe(400)
  })

  it('rechaza refine sin plan válido o sin pedido, y acciones desconocidas', async () => {
    expect((await handlePlanMeta(req({ action: 'refine', title: 'x', instruction: 'y' }), deps())).status).toBe(400)
    expect((await handlePlanMeta(req({ action: 'borrar', title: 'x' }), deps())).status).toBe(400)
  })

  it('rechaza sin token o con token inválido (401) sin llamar a la IA', async () => {
    const d = deps()
    expect((await handlePlanMeta(req({ title: 'x' }, null), d)).status).toBe(401)
    expect((await handlePlanMeta(req({ title: 'x' }, 'malo'), d)).status).toBe(401)
    expect(d.planner?.plan).not.toHaveBeenCalled()
  })

  it('valida el cuerpo (400) y el método (405)', async () => {
    expect((await handlePlanMeta(req({ title: '  ' }), deps())).status).toBe(400)
    expect((await handlePlanMeta(req(null, 'ok', 'GET'), deps())).status).toBe(405)
  })

  it('rechaza una acción que no es texto o que no existe', async () => {
    expect((await handlePlanMeta(req({ title: 'x', action: { plan: true } }), deps())).status).toBe(400)
    expect((await handlePlanMeta(req({ title: 'x', action: 'borrar' }), deps())).status).toBe(400)
  })

  it('aplica el límite diario (429)', async () => {
    const res = await handlePlanMeta(req({ title: 'x' }), deps({ takeQuota: () => null }))
    expect(res.status).toBe(429)
  })

  it('503 si no hay clave configurada y 502 si el modelo falla', async () => {
    expect((await handlePlanMeta(req({ title: 'x' }), deps({ planner: null }))).status).toBe(503)
    const boom = async () => Promise.reject(new Error('boom'))
    const failing = deps({ planner: { plan: boom, questions: boom, refine: boom, chat: boom, criteria: boom, goalType: boom } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handlePlanMeta(req({ title: 'x' }), failing)).status).toBe(502)
    // El fallo de la IA no le gasta el uso a la persona.
    expect(refund).toHaveBeenCalledTimes(1)
  })

  it('no devuelve cuota cuando la respuesta sale bien', async () => {
    refund.mockClear()
    await handlePlanMeta(req({ title: 'x' }), deps())
    expect(refund).not.toHaveBeenCalled()
  })
})

describe('createMemoryQuota', () => {
  const D1 = new Date('2026-10-31T10:00:00Z')

  it('permite N usos por usuario y día', () => {
    let day = D1
    const take = createMemoryQuota(2, () => day)
    expect([take('a'), take('a'), take('a'), take('b')].map(Boolean)).toEqual([true, true, false, true])
    day = new Date('2026-11-01T10:00:00Z')
    expect(take('a')).not.toBeNull()
  })

  it('la devolución libera el uso cobrado, una sola vez', () => {
    const take = createMemoryQuota(1, () => D1)
    const refund = take('a')!
    expect(take('a')).toBeNull()
    refund()
    refund()
    expect(take('a')).not.toBeNull()
    expect(take('a')).toBeNull()
  })

  it('devuelve al día en que se cobró aunque ya sea otro día', () => {
    let day = new Date('2026-10-31T23:59:50Z')
    const take = createMemoryQuota(1, () => day)
    const refund = take('a')!
    day = new Date('2026-11-01T00:00:30Z')
    expect(take('a')).not.toBeNull()
    refund()
    // El día nuevo sigue cobrado; el anterior quedó libre.
    expect(take('a')).toBeNull()
    day = new Date('2026-10-31T23:59:59Z')
    expect(take('a')).not.toBeNull()
  })

  it('limita las devoluciones por día para que fallar en bucle no sea gratis', () => {
    const take = createMemoryQuota(100, () => D1, 2)
    for (let i = 0; i < 3; i++) take('a')!()
    // 3 cobros, solo 2 devueltos: queda 1 uso gastado.
    let left = 0
    while (take('a')) left++
    expect(left).toBe(99)
  })
})

describe('acción day', () => {
  const dayBody = (over: Record<string, unknown> = {}) => ({
    action: 'day',
    date: '2026-11-09',
    now: '08:15',
    items: [
      { ref: 'event:e1', source: 'event', title: 'Cita', fixed: true, start: '10:00', durationMin: 30, window: null, mode: 'focus', goalId: null, alongside: null, untimed: false },
      { ref: 'malo' },
    ],
    goals: [{ id: 'g1', title: 'Tesis' }, { id: 3 }],
    history: [{ role: 'user', text: 'hola' }],
    message: 'reunión de 9 a 11',
    ...over,
  })

  it('day returns the parsed reply without a goal title', async () => {
    const d = deps()
    const res = await handlePlanMeta(req(dayBody()), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reply: 'Armé tu día.', items: [], questions: [], assumptions: [] })
    expect(d.planner?.day).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-11-09',
        now: '08:15',
        dayStart: '06:00',
        dayEnd: '22:00',
        goals: [{ id: 'g1', title: 'Tesis' }],
        items: [expect.objectContaining({ ref: 'event:e1', start: '10:00' })],
      }),
      [{ role: 'user', text: 'hola' }],
      'reunión de 9 a 11',
    )
    expect(d.loadSignals).not.toHaveBeenCalled()
  })

  it('day drops item goals that are not among the active goals and caps goal ids', async () => {
    const d = deps()
    const items = [{ ...(dayBody().items as object[])[0], goalId: 'ajena' }]
    await handlePlanMeta(req(dayBody({ items, goals: [{ id: 'x'.repeat(5000), title: 'Larga' }] })), d)
    const ctx = (d.planner!.day as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(ctx.items[0].goalId).toBeNull()
    expect(ctx.goals[0].id.length).toBeLessThanOrEqual(120)
  })

  it('day without message is 400', async () => {
    expect((await handlePlanMeta(req(dayBody({ message: ' ' })), deps())).status).toBe(400)
  })

  it('day with a message over 1500 chars is 400', async () => {
    expect((await handlePlanMeta(req(dayBody({ message: 'a'.repeat(1501) })), deps())).status).toBe(400)
  })

  it('day with an invalid date or time is 400', async () => {
    expect((await handlePlanMeta(req(dayBody({ date: 'mañana' })), deps())).status).toBe(400)
    expect((await handlePlanMeta(req(dayBody({ now: '8:15' })), deps())).status).toBe(400)
  })

  it('day charges quota and refunds it when the planner fails', async () => {
    const take = vi.fn(() => refund)
    refund.mockClear()
    const d = deps({ takeQuota: take })
    ;(d.planner!.day as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('caída'))
    const res = await handlePlanMeta(req(dayBody()), d)
    expect(res.status).toBe(502)
    expect(take).toHaveBeenCalledTimes(1)
    expect(refund).toHaveBeenCalledTimes(1)
  })
})
