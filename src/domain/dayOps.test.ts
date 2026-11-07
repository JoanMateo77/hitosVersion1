import { describe, expect, it, vi } from 'vitest'
import type { DayOp } from '@/domain/dayPlan'
import { runOps, undoOps, type DayOpExecutors } from '@/domain/dayOps'

function executors(failOn?: DayOp['kind']) {
  const calls: string[] = []
  let id = 0
  const track =
    (name: string, returnsId = false) =>
    vi.fn(async (arg: unknown) => {
      const label = typeof arg === 'string' ? `${name}:${arg}` : `${name}:${(arg as DayOp).ref}`
      calls.push(label)
      if (failOn && name === failOn) throw new Error('falló')
      return returnsId ? `id${++id}` : undefined
    })
  const ex = {
    createEvent: track('createEvent', true),
    createSession: track('createSession', true),
    createTask: track('createTask', true),
    moveEvent: track('moveEvent'),
    moveSession: track('moveSession'),
    moveHabit: track('moveHabit'),
    deleteEvent: track('deleteEvent'),
    deleteSession: track('deleteSession'),
    deleteTask: track('deleteTask'),
  } as unknown as DayOpExecutors
  return { ex, calls }
}

const ops: DayOp[] = [
  { kind: 'createEvent', ref: 'new:1', title: 'Gimnasio', start: '07:00', end: '08:00' },
  { kind: 'moveSession', ref: 'session:k1', sessionKey: 'k1', start: '18:00', prevStart: '17:00' },
  { kind: 'createTask', ref: 'new:2', title: 'Banco' },
]

describe('runOps', () => {
  it('runOps executes in order and returns created ids', async () => {
    const { ex, calls } = executors()
    const r = await runOps(ops, ex)
    expect(calls).toEqual(['createEvent:new:1', 'moveSession:session:k1', 'createTask:new:2'])
    expect(r.failed).toBeNull()
    expect(r.done.map((d) => d.createdId)).toEqual(['id1', undefined, 'id2'])
  })

  it('runOps stops at the first failure', async () => {
    const { ex, calls } = executors('moveSession')
    const r = await runOps(ops, ex)
    expect(calls).toEqual(['createEvent:new:1', 'moveSession:session:k1'])
    expect(r.done).toHaveLength(1)
    expect(r.failed).toEqual(ops[1])
  })
})

describe('undoOps', () => {
  it('undo reverts only executed ops in reverse', async () => {
    const { ex, calls } = executors('createTask')
    const r = await runOps(ops, ex)
    calls.length = 0
    await undoOps(r.done, ex)
    expect(calls).toEqual(['moveSession:session:k1', 'deleteEvent:id1'])
    expect(ex.moveSession).toHaveBeenLastCalledWith({ ...ops[1], start: '17:00', prevStart: '18:00' })
  })

  it('undo of a moved event restores both previous times', async () => {
    const { ex } = executors()
    const move: DayOp = { kind: 'moveEvent', ref: 'event:e1', eventId: 'e1', start: '10:00', end: '10:45', prevStart: '09:00', prevEnd: '09:45' }
    await undoOps([{ op: move }], ex)
    expect(ex.moveEvent).toHaveBeenCalledWith({ ...move, start: '09:00', end: '09:45', prevStart: '10:00', prevEnd: '10:45' })
  })

  it('undo of a moved event that had no end restores no end', async () => {
    const { ex } = executors()
    const move: DayOp = { kind: 'moveEvent', ref: 'event:e1', eventId: 'e1', start: '10:00', end: null, prevStart: '09:00', prevEnd: null }
    await undoOps([{ op: move }], ex)
    expect(ex.moveEvent).toHaveBeenCalledWith({ ...move, start: '09:00', end: null, prevStart: '10:00', prevEnd: null })
  })

  it('undo of a habit move without previous override clears it', async () => {
    const { ex } = executors()
    const move: DayOp = { kind: 'moveHabit', ref: 'habit:h1', habitId: 'h1', times: ['08:00'], prevTimes: null }
    await undoOps([{ op: move }], ex)
    expect(ex.moveHabit).toHaveBeenCalledWith({ ...move, times: [], prevTimes: ['08:00'] })
  })

  it('undo of a session created from the draft deletes it', async () => {
    const { ex, calls } = executors()
    const create: DayOp = { kind: 'createSession', ref: 'new:3', goalId: 'g1', start: '15:00', durationMin: 60 }
    await undoOps([{ op: create, createdId: 's9' }], ex)
    expect(calls).toEqual(['deleteSession:s9'])
  })
})
