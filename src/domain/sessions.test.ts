import { describe, expect, it } from 'vitest'
import {
  currentStreakCommitted,
  elapsedSeconds,
  isStaleRunning,
  isTimeReached,
  milestoneProgress,
  pickSuggestion,
  remainingSeconds,
  weekConsistency,
} from '@/domain/sessions'
import type { Milestone, ScheduleBlock, Session } from '@/lib/types'
import { getTemplate } from '@/domain/templates'

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    goalId: 'g1',
    userId: 'u1',
    scheduleId: 'b1',
    date: '2026-06-10',
    targetKind: 'time',
    targetValue: 25,
    unit: null,
    plannedTime: null,
    startedAt: null,
    endedAt: null,
    actualValue: null,
    status: 'pending',
    pausedAt: null,
    pausedTotalSeconds: 0,
    createdAt: '2026-06-10T00:00:00Z',
    ...over,
  }
}

function block(weekday: number, over: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: `b-${weekday}-${over.startTime ?? 'x'}`,
    goalId: 'g1',
    userId: 'u1',
    weekday,
    targetKind: 'time',
    targetValue: 25,
    unit: null,
    startTime: null,
    createdAt: '2026-06-01T00:00:00Z',
    ...over,
  }
}

function milestone(done: boolean, position: number): Milestone {
  return {
    id: `m${position}`,
    goalId: 'g1',
    userId: 'u1',
    title: `Etapa ${position}`,
    position,
    targetDate: null,
    doneAt: done ? '2026-06-01T00:00:00Z' : null,
    createdAt: '2026-05-01T00:00:00Z',
  }
}

describe('elapsedSeconds', () => {
  it('sin arrancar es 0', () => {
    expect(elapsedSeconds(session(), new Date('2026-06-10T10:30:00Z'))).toBe(0)
  })
  it('cuenta desde started_at descontando pausas acumuladas', () => {
    const s = session({ startedAt: '2026-06-10T10:00:00Z', pausedTotalSeconds: 300, status: 'running' })
    expect(elapsedSeconds(s, new Date('2026-06-10T10:30:00Z'))).toBe(1500)
  })
  it('en pausa, el reloj queda congelado en paused_at', () => {
    const s = session({
      startedAt: '2026-06-10T10:00:00Z',
      pausedAt: '2026-06-10T10:20:00Z',
      status: 'running',
    })
    // now muy posterior: no importa, está pausada
    expect(elapsedSeconds(s, new Date('2026-06-10T11:00:00Z'))).toBe(1200)
  })
  it('cerrada, cuenta hasta ended_at', () => {
    const s = session({
      startedAt: '2026-06-10T10:00:00Z',
      endedAt: '2026-06-10T10:10:00Z',
      status: 'done',
    })
    expect(elapsedSeconds(s, new Date('2026-06-10T12:00:00Z'))).toBe(600)
  })
  it('nunca negativo', () => {
    const s = session({ startedAt: '2026-06-10T10:00:00Z', pausedTotalSeconds: 9999, status: 'running' })
    expect(elapsedSeconds(s, new Date('2026-06-10T10:01:00Z'))).toBe(0)
  })
})

describe('remainingSeconds / isTimeReached', () => {
  const s = session({ startedAt: '2026-06-10T10:00:00Z', status: 'running' }) // 25 min
  it('restan target*60 - transcurrido, con piso en 0', () => {
    expect(remainingSeconds(s, new Date('2026-06-10T10:10:00Z'))).toBe(900)
    expect(remainingSeconds(s, new Date('2026-06-10T11:00:00Z'))).toBe(0)
  })
  it('isTimeReached al cumplir el objetivo', () => {
    expect(isTimeReached(s, new Date('2026-06-10T10:24:59Z'))).toBe(false)
    expect(isTimeReached(s, new Date('2026-06-10T10:25:00Z'))).toBe(true)
  })
  it('count nunca "alcanza por tiempo"', () => {
    const c = session({ targetKind: 'count', targetValue: 10, startedAt: '2026-06-10T10:00:00Z' })
    expect(isTimeReached(c, new Date('2026-06-11T10:00:00Z'))).toBe(false)
  })
})

describe('isStaleRunning', () => {
  it('corriendo con fecha anterior a hoy', () => {
    expect(isStaleRunning(session({ status: 'running', date: '2026-06-09' }), '2026-06-10')).toBe(true)
    expect(isStaleRunning(session({ status: 'running', date: '2026-06-10' }), '2026-06-10')).toBe(false)
    expect(isStaleRunning(session({ status: 'pending', date: '2026-06-09' }), '2026-06-10')).toBe(false)
  })
})

describe('pickSuggestion', () => {
  const template = getTemplate('salud_fisico')
  it('estable para mismo día y meta', () => {
    expect(pickSuggestion(template, 'g1', '2026-06-10')).toBe(pickSuggestion(template, 'g1', '2026-06-10'))
  })
  it('siempre sale del pool de la plantilla', () => {
    expect(template.actions).toContain(pickSuggestion(template, 'g1', '2026-06-10'))
  })
  it('rota entre días', () => {
    const days = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13']
    const picks = new Set(days.map((d) => pickSuggestion(template, 'g1', d)))
    expect(picks.size).toBeGreaterThan(1)
  })
})

describe('milestoneProgress', () => {
  it('cuenta cumplidos sobre total', () => {
    const ms = [milestone(true, 0), milestone(true, 1), milestone(false, 2), milestone(false, 3)]
    expect(milestoneProgress(ms)).toEqual({ done: 2, total: 4, ratio: 0.5 })
  })
  it('sin hitos: ratio 0', () => {
    expect(milestoneProgress([])).toEqual({ done: 0, total: 0, ratio: 0 })
  })
})

describe('weekConsistency', () => {
  // Semana del lunes 2026-06-08 al domingo 2026-06-14
  const blocks = [block(0), block(2), block(4)]
  it('cumplidas (done|partial) sobre comprometidas', () => {
    const sessions = [
      session({ date: '2026-06-08', status: 'done' }),
      session({ date: '2026-06-10', status: 'partial' }),
      session({ date: '2026-06-12', status: 'pending' }),
      session({ date: '2026-06-01', status: 'done' }), // fuera de la semana
    ]
    expect(weekConsistency(blocks, sessions, '2026-06-08')).toEqual({ done: 2, committed: 3 })
  })
  it('las espontáneas cumplidas también cuentan como hechas', () => {
    const sessions = [session({ date: '2026-06-09', status: 'done', scheduleId: null })]
    expect(weekConsistency(blocks, sessions, '2026-06-08')).toEqual({ done: 1, committed: 3 })
  })
})

describe('currentStreakCommitted', () => {
  const committed = new Set([0, 2, 4]) // Lu, Mi, Vi
  it('cuenta días comprometidos cumplidos; el finde no comprometido no rompe', () => {
    // hoy sábado 13; Vi 12, Mi 10 y Lu 8 hechos
    const done = new Set(['2026-06-12', '2026-06-10', '2026-06-08'])
    expect(currentStreakCommitted(done, committed, '2026-06-13')).toBe(3)
  })
  it('se corta en un día comprometido sin sesión hecha', () => {
    const done = new Set(['2026-06-12', '2026-06-08']) // falta el miércoles 10
    expect(currentStreakCommitted(done, committed, '2026-06-13')).toBe(1)
  })
  it('hoy comprometido sin hacer todavía no rompe (queda en juego)', () => {
    // hoy viernes 12 sin hacer; Mi 10 y Lu 8 hechos
    const done = new Set(['2026-06-10', '2026-06-08'])
    expect(currentStreakCommitted(done, committed, '2026-06-12')).toBe(2)
  })
  it('hoy hecho y comprometido cuenta', () => {
    const done = new Set(['2026-06-12', '2026-06-10'])
    expect(currentStreakCommitted(done, committed, '2026-06-12')).toBe(2)
  })
  it('sin días comprometidos no hay racha', () => {
    expect(currentStreakCommitted(new Set(['2026-06-12']), new Set(), '2026-06-13')).toBe(0)
  })
})
