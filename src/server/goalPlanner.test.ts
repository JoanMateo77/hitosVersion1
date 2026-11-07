import { describe, expect, it, vi } from 'vitest'
import type { ModelChain, ModelRequest } from './aiChain'
import { createGoalPlanner } from './goalPlanner'
import { PlannerError } from './plannerError'
import { DAY_SYSTEM } from '../domain/dayPlanAi'
import { COACH_SYSTEM } from '../domain/planningMethod'

const input = { title: 'Correr 10K', typeLabel: 'Salud', weeklyMinutes: 60, currentStages: ['Trotar'] }
// Pide más minutos de los comprometidos: dispara la revisión de realismo.
const greedy = { summary: 'Plan', weeklyMinutes: 500, stages: [] }

function fakeChain(...outcomes: (unknown | Error)[]) {
  const requests: ModelRequest[] = []
  const chain: ModelChain = {
    run: vi.fn(async (req: ModelRequest, parse: (raw: unknown) => unknown) => {
      requests.push(req)
      const next = outcomes.shift()
      if (next instanceof Error) throw next
      return parse(next)
    }) as ModelChain['run'],
  }
  return { chain, requests }
}

describe('createGoalPlanner', () => {
  it('pide la corrección con presupuesto corto y la usa si llega', async () => {
    const { chain, requests } = fakeChain(greedy, { ...greedy, weeklyMinutes: 60 })
    const plan = await createGoalPlanner(chain).plan(input, [])
    expect(plan.weeklyMinutes).toBe(60)
    expect(requests[0].budgetMs).toBeUndefined()
    expect(requests[1].budgetMs).toBe(15_000)
  })

  it('si la corrección cae, conserva el primer plan', async () => {
    const { chain } = fakeChain(greedy, new PlannerError('Ningún modelo respondió'))
    const plan = await createGoalPlanner(chain).plan(input, [])
    expect(plan.weeklyMinutes).toBe(500)
  })

  it('si cae el primer plan, propaga el error', async () => {
    const { chain } = fakeChain(new PlannerError('Ningún modelo respondió'))
    await expect(createGoalPlanner(chain).plan(input, [])).rejects.toThrow(PlannerError)
  })
})

describe('day', () => {
  const ctx = { date: '2026-11-09', now: '08:00', dayStart: '06:00', dayEnd: '22:00', items: [], goals: [] }

  it('day uses DAY_SYSTEM and the day schema', async () => {
    const { chain, requests } = fakeChain({ reply: 'Listo.', items: [], questions: [], assumptions: [] })
    const r = await createGoalPlanner(chain).day(ctx, [], 'reunión de 9 a 11')
    expect(r.reply).toBe('Listo.')
    expect(requests[0].system).toBe(DAY_SYSTEM)
    expect(requests[0].prompt).toContain('reunión de 9 a 11')
  })

  it('chat still uses COACH_SYSTEM', async () => {
    const { chain, requests } = fakeChain({ reply: 'Hola', proposalSummary: '', changes: [], progress: '' })
    await createGoalPlanner(chain).chat({ ...input, stages: [] }, [], 'hola', [])
    expect(requests[0].system).toBe(COACH_SYSTEM)
  })
})
