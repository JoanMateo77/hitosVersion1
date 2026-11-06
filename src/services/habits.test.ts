import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Supabase simulado: cada llamada a la tabla consume la siguiente respuesta
 * preparada y registra la operación con sus filtros.
 */
const calls: { op: string; payload?: unknown; filters: [string, unknown][] }[] = []
let results: { error: { code?: string; message: string } | null }[] = []

function builder(op: string, payload?: unknown) {
  const call = { op, payload, filters: [] as [string, unknown][] }
  calls.push(call)
  const result = () => Promise.resolve(results.shift() ?? { error: null })
  const chain = {
    eq(col: string, value: unknown) {
      call.filters.push([col, value])
      return chain
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (payload: unknown) => builder('insert', payload),
      delete: () => builder('delete'),
    }),
  },
}))

const { setHabitCheck } = await import('./habits')

const missingColumn = { error: { code: '42703', message: 'column "slot" does not exist' } }
const duplicate = { error: { code: '23505', message: 'duplicate key' } }

beforeEach(() => {
  calls.length = 0
  results = []
})

describe('setHabitCheck', () => {
  it('marca con el slot', async () => {
    await setHabitCheck('u', 'h', '2026-11-06', true, 2)
    expect(calls).toEqual([{ op: 'insert', payload: { user_id: 'u', habit_id: 'h', date: '2026-11-06', slot: 2 }, filters: [] }])
  })

  it('un duplicado al marcar significa "ya estaba": no falla', async () => {
    results = [duplicate]
    await expect(setHabitCheck('u', 'h', '2026-11-06', true)).resolves.toBeUndefined()
  })

  it('sin la columna slot (migración 0013 pendiente) reintenta sin ella, también al desmarcar', async () => {
    results = [missingColumn, { error: null }]
    await setHabitCheck('u', 'h', '2026-11-06', true)
    expect(calls[1]).toEqual({ op: 'insert', payload: { user_id: 'u', habit_id: 'h', date: '2026-11-06' }, filters: [] })

    calls.length = 0
    results = [missingColumn, { error: null }]
    await setHabitCheck('u', 'h', '2026-11-06', false)
    expect(calls.map((c) => c.filters)).toEqual([
      [['habit_id', 'h'], ['date', '2026-11-06'], ['slot', 0]],
      [['habit_id', 'h'], ['date', '2026-11-06']],
    ])
  })

  it('con un slot distinto de 0 no reintenta sin la columna: propaga el error', async () => {
    results = [missingColumn]
    await expect(setHabitCheck('u', 'h', '2026-11-06', true, 1)).rejects.toThrow('slot')
    expect(calls).toHaveLength(1)
  })

  it('otro error al desmarcar se propaga', async () => {
    results = [{ error: { code: '500', message: 'boom' } }]
    await expect(setHabitCheck('u', 'h', '2026-11-06', false)).rejects.toThrow('boom')
  })
})
