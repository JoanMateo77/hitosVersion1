import { describe, expect, it } from 'vitest'
import type { DayItem } from '@/domain/dayPlan'
import { buildDayPrompt, parseDayReply, readDayItem, type DayAiContext } from '@/domain/dayPlanAi'

const session: DayItem = {
  ref: 'session:k1',
  source: 'session',
  title: 'Inglés',
  fixed: false,
  start: '19:00',
  originalStart: '19:00',
  durationMin: 30,
  window: null,
  mode: 'focus',
  goalId: 'g1',
  alongside: null,
  untimed: false,
}

const ctx = (over: Partial<DayAiContext> = {}): DayAiContext => ({
  date: '2026-11-09',
  now: '08:15',
  dayStart: '06:00',
  dayEnd: '22:00',
  items: [session],
  goals: [{ id: 'g1', title: 'Hablar inglés' }],
  ...over,
})

const newItem = (over: Record<string, unknown> = {}) => ({
  ref: 'new:1',
  title: 'Reunión',
  fixed: true,
  start: '09:00',
  durationMin: 120,
  mode: 'focus',
  untimed: false,
  ...over,
})

const reply = (over: Record<string, unknown> = {}) => ({
  reply: 'Listo, armé tu día.',
  items: [newItem()],
  questions: [],
  assumptions: [],
  ...over,
})

describe('buildDayPrompt', () => {
  it('includes date, weekday, now, limits and item refs', () => {
    const p = buildDayPrompt(ctx(), [], 'reunión de 9 a 11')
    expect(p).toContain('2026-11-09')
    expect(p).toContain('lunes')
    expect(p).toContain('08:15')
    expect(p).toContain('06:00')
    expect(p).toContain('22:00')
    expect(p).toContain('session:k1')
    expect(p).toContain('g1')
  })

  it('includes the conversation and the latest message', () => {
    const p = buildDayPrompt(ctx(), [{ role: 'user', text: 'tengo gimnasio' }, { role: 'coach', text: '¿A qué hora?' }], 'a las 7')
    expect(p).toContain('tengo gimnasio')
    expect(p).toContain('¿A qué hora?')
    expect(p).toContain('a las 7')
  })
})

describe('parseDayReply', () => {
  it('parses a valid reply into new items with defaults', () => {
    const r = parseDayReply(reply({ items: [newItem({ ref: 'new:2', title: 'Gimnasio', fixed: false, start: undefined, durationMin: undefined, mode: 'physical' })] }), ctx())
    const gym = r?.items.find((i) => i.ref === 'new:2')
    expect(gym).toMatchObject({ source: 'new', durationMin: 30, fixed: false, start: null, window: null, goalId: null, alongside: null })
    expect(r?.assumptions).toContain('Supuse 30 min para Gimnasio')
  })

  it('does not add a default assumption when one already names the item', () => {
    const r = parseDayReply(
      reply({ items: [newItem({ title: 'Gimnasio', durationMin: undefined })], assumptions: ['Supuse 1 h para el gimnasio'] }),
      ctx(),
    )
    expect(r?.assumptions).toEqual(['Supuse 1 h para el gimnasio'])
  })

  it('rejects invalid times and clamps durations to 5–600', () => {
    const r = parseDayReply(
      reply({ items: [newItem({ start: '25:00', fixed: false, durationMin: 2 }), newItem({ ref: 'new:2', start: '9:00', fixed: false, durationMin: 900 })] }),
      ctx(),
    )
    expect(r?.items.find((i) => i.ref === 'new:1')).toMatchObject({ start: null, durationMin: 5 })
    expect(r?.items.find((i) => i.ref === 'new:2')).toMatchObject({ start: null, durationMin: 600 })
  })

  it('turns a fixed item without start into a flexible one', () => {
    const r = parseDayReply(reply({ items: [newItem({ start: undefined })] }), ctx())
    expect(r?.items.find((i) => i.ref === 'new:1')).toMatchObject({ fixed: false, start: null })
  })

  it('drops items whose ref is neither new:N nor in the context', () => {
    const r = parseDayReply(reply({ items: [newItem({ ref: 'event:inventado' }), newItem({ ref: 'x' })] }), ctx())
    expect(r?.items.map((i) => i.ref)).toEqual(['session:k1'])
  })

  it('nulls goalId not present in ctx.goals', () => {
    const r = parseDayReply(reply({ items: [newItem({ goalId: 'ajena' }), newItem({ ref: 'new:2', goalId: 'g1' })] }), ctx())
    expect(r?.items.find((i) => i.ref === 'new:1')?.goalId).toBeNull()
    expect(r?.items.find((i) => i.ref === 'new:2')?.goalId).toBe('g1')
  })

  it('keeps context items the AI did not return', () => {
    const r = parseDayReply(reply(), ctx())
    expect(r?.items[0]).toEqual(session)
  })

  it('drops previous new items the AI did not return', () => {
    const old: DayItem = { ...session, ref: 'new:7', source: 'new', title: 'Llamada', goalId: null, originalStart: undefined }
    const r = parseDayReply(reply(), ctx({ items: [session, old] }))
    expect(r?.items.map((i) => i.ref)).toEqual(['session:k1', 'new:1'])
  })

  it('merges a returned existing item over its context version', () => {
    const r = parseDayReply(reply({ items: [{ ref: 'session:k1', title: 'Otro', fixed: false, start: '20:00', mode: 'focus', untimed: true }] }), ctx())
    expect(r?.items[0]).toEqual({ ...session, start: '20:00' })
  })

  it('keeps the previous duration of a draft item when the AI omits it', () => {
    const old: DayItem = { ...session, ref: 'new:1', source: 'new', title: 'Tesis', goalId: null, durationMin: 120, originalStart: undefined }
    const r = parseDayReply(reply({ items: [newItem({ title: 'Tesis', durationMin: undefined })] }), ctx({ items: [old] }))
    expect(r?.items[0].durationMin).toBe(120)
    expect(r?.assumptions).toEqual([])
  })

  it('accepts alongside only for known refs', () => {
    const r = parseDayReply(
      reply({ items: [newItem({ alongside: 'session:k1' }), newItem({ ref: 'new:2', alongside: 'nada' })] }),
      ctx(),
    )
    expect(r?.items.find((i) => i.ref === 'new:1')?.alongside).toBe('session:k1')
    expect(r?.items.find((i) => i.ref === 'new:2')?.alongside).toBeNull()
  })

  it('caps items at 20 and questions at 3, options at 2–4 (drops questions with fewer than 2)', () => {
    const many = Array.from({ length: 25 }, (_, i) => newItem({ ref: `new:${i + 1}` }))
    const qs = [
      { text: 'a', options: ['1'] },
      { text: 'b', options: ['1', '2', '3', '4', '5'] },
      { text: 'c', options: ['1', '2'] },
      { text: 'd', options: ['1', '2'] },
      { text: 'e', options: ['1', '2'] },
    ]
    const r = parseDayReply(reply({ items: many, questions: qs }), ctx())
    expect(r?.items.filter((i) => i.source === 'new')).toHaveLength(20)
    expect(r?.questions.map((q) => q.text)).toEqual(['b', 'c', 'd'])
    expect(r?.questions[0].options).toHaveLength(4)
  })

  it('returns null for empty reply or non-object input', () => {
    expect(parseDayReply(reply({ reply: '  ' }), ctx())).toBeNull()
    expect(parseDayReply('hola', ctx())).toBeNull()
    expect(parseDayReply(null, ctx())).toBeNull()
  })

  it('falls back to focus for an unknown mode and null for an unknown window', () => {
    const r = parseDayReply(reply({ items: [newItem({ mode: 'volar', window: 'madrugada' })] }), ctx())
    expect(r?.items.find((i) => i.ref === 'new:1')).toMatchObject({ mode: 'focus', window: null })
  })
})

describe('readDayItem', () => {
  it('reads a well-formed item and keeps original times', () => {
    expect(readDayItem({ ...session, originalEnd: '19:30' })).toEqual({ ...session, originalEnd: '19:30' })
  })

  it('rejects unknown sources, missing titles and missing durations', () => {
    expect(readDayItem({ ...session, source: 'task' })).toBeNull()
    expect(readDayItem({ ...session, title: ' ' })).toBeNull()
    expect(readDayItem({ ...session, durationMin: 'mucho' })).toBeNull()
    expect(readDayItem('x')).toBeNull()
  })

  it('normalizes invalid times, modes and windows', () => {
    expect(readDayItem({ ...session, fixed: true, start: '7pm', mode: 'x', window: 'x' })).toMatchObject({
      fixed: false,
      start: null,
      mode: 'focus',
      window: null,
    })
  })
})
