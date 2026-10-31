import { describe, expect, it, vi } from 'vitest'
import { createMemoryQuota, handlePlanMeta, type PlanMetaDeps } from './planMeta'
import type { GoalPlan } from '../domain/goalPlan'

const plan: GoalPlan = { schemaVersion: 1, summary: 's', weeklyMinutes: 60, stages: [] }

function deps(over: Partial<PlanMetaDeps> = {}): PlanMetaDeps {
  return {
    verifyUser: async (t) => (t === 'ok' ? 'user-1' : null),
    planner: { plan: vi.fn(async () => plan) },
    takeQuota: () => true,
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
    expect(await res.json()).toEqual({ plan })
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
    const failing = deps({ planner: { plan: async () => Promise.reject(new Error('boom')) } })
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
