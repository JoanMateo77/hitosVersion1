import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Supabase simulado: cada escritura consume la siguiente respuesta preparada y
 * registra la tabla, la operación y lo que se mandó.
 */
const calls: { table: string; op: string; payload: unknown }[] = []
let results: { data?: unknown; error: { code?: string; message: string } | null }[] = []

const row = (over: Record<string, unknown> = {}) => ({
  id: 'x1',
  user_id: 'u',
  goal_id: null,
  title: 'Revisar la moto',
  notes: null,
  event_date: '2026-11-08',
  plan_date: '2026-11-08',
  start_time: '17:20:00',
  end_time: '18:05:00',
  all_day: false,
  source: 'user',
  status: 'pending',
  created_at: '2026-11-08T20:00:00Z',
  done_at: null,
  ...over,
})

function write(table: string, op: string, payload: unknown) {
  calls.push({ table, op, payload })
  const chain = {
    eq: () => chain,
    select: () => chain,
    single: () => Promise.resolve(results.shift() ?? { data: row(payload as Record<string, unknown>), error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => write(table, 'insert', payload),
      update: (payload: unknown) => write(table, 'update', payload),
    }),
  },
}))

const { createEvent, updateEvent } = await import('./events')
const { createUserTask } = await import('./tasks')

const missingColumn = { error: { code: 'PGRST204', message: "Could not find the 'area' column" } }
const input = {
  title: 'Revisar la moto',
  date: '2026-11-08',
  allDay: false,
  startTime: '17:20',
  endTime: '18:05',
  goalId: null,
  notes: null,
}

beforeEach(() => {
  calls.length = 0
  results = []
})

describe('area on events', () => {
  it('saves the area and reads it back', async () => {
    const ev = await createEvent('u', { ...input, area: 'bienestar' })
    expect(calls[0].payload).toMatchObject({ area: 'bienestar' })
    expect(ev.area).toBe('bienestar')
  })

  it('without migration 0022 saves the event without area instead of failing', async () => {
    results = [missingColumn]
    const ev = await createEvent('u', { ...input, area: 'bienestar' })
    expect(calls).toHaveLength(2)
    expect(calls[1].payload).not.toHaveProperty('area')
    expect(ev.title).toBe('Revisar la moto')
  })

  it('an edit that does not touch the area does not send it', async () => {
    await updateEvent('x1', input)
    expect(calls[0].payload).not.toHaveProperty('area')
  })
})

describe('area on tasks', () => {
  it('saves the area of a new task', async () => {
    const task = await createUserTask('u', 'Pagar la luz', '2026-11-08', 'finanzas')
    expect(calls[0].payload).toMatchObject({ area: 'finanzas' })
    expect(task.area).toBe('finanzas')
  })

  it('without migration 0022 saves the task without area', async () => {
    results = [missingColumn]
    await createUserTask('u', 'Pagar la luz', '2026-11-08', 'finanzas')
    expect(calls[1].payload).not.toHaveProperty('area')
  })

  it('a task created by hand keeps working without area', async () => {
    await createUserTask('u', 'Pagar la luz', '2026-11-08')
    expect(calls[0].payload).not.toHaveProperty('area')
  })
})
