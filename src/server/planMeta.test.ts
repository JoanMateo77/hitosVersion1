import { describe, expect, it, vi } from 'vitest'
import { createMemoryQuota, handlePlanMeta, type PlanMetaDeps } from './planMeta'
import type { GoalPlan } from '../domain/goalPlan'

const plan: GoalPlan = { schemaVersion: 1, summary: 's', weeklyMinutes: 60, stages: [] }

function deps(over: Partial<PlanMetaDeps> = {}): PlanMetaDeps {
  return {
    verifyUser: async (t) => (t === 'ok' ? 'user-1' : null),
    planner: {
      plan: vi.fn(async () => plan),
      questions: vi.fn(async () => [{ question: '¿Nivel?', options: ['Bajo', 'Alto'] }]),
      refine: vi.fn(async () => ({ ...plan, changeNote: 'Más suave' })),
    },
    takeQuota: () => true,
    loadSignals: async () => ['Completas el 80% de tus sesiones.'],
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

  it('aplica el límite diario (429)', async () => {
    const res = await handlePlanMeta(req({ title: 'x' }), deps({ takeQuota: () => false }))
    expect(res.status).toBe(429)
  })

  it('503 si no hay clave configurada y 502 si el modelo falla', async () => {
    expect((await handlePlanMeta(req({ title: 'x' }), deps({ planner: null }))).status).toBe(503)
    const boom = async () => Promise.reject(new Error('boom'))
    const failing = deps({ planner: { plan: boom, questions: boom, refine: boom } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handlePlanMeta(req({ title: 'x' }), failing)).status).toBe(502)
  })
})

describe('createMemoryQuota', () => {
  it('permite N usos por usuario y día', () => {
    let day = new Date('2026-10-31T10:00:00Z')
    const take = createMemoryQuota(2, () => day)
    expect([take('a'), take('a'), take('a'), take('b')]).toEqual([true, true, false, true])
    day = new Date('2026-11-01T10:00:00Z')
    expect(take('a')).toBe(true)
  })
})
