import { describe, expect, it } from 'vitest'
import {
  applyEffect,
  canOverlap,
  conflictQuestions,
  countChanges,
  mergeAiItems,
  planDay,
  planToOps,
  type DayItem,
} from '@/domain/dayPlan'

let n = 0
function item(over: Partial<DayItem> = {}): DayItem {
  n += 1
  return {
    ref: `new:${n}`,
    source: 'new',
    title: `Ítem ${n}`,
    fixed: false,
    start: null,
    durationMin: 30,
    window: null,
    mode: 'focus',
    goalId: null,
    alongside: null,
    untimed: false,
    ...over,
  }
}

const placedOf = (plan: ReturnType<typeof planDay>, ref: string) => plan.placed.find((p) => p.ref === ref)

describe('canOverlap', () => {
  it('audio overlaps physical and routine, never focus', () => {
    const audio = item({ mode: 'audio' })
    expect(canOverlap(audio, item({ mode: 'physical' }))).toBe(true)
    expect(canOverlap(item({ mode: 'routine' }), audio)).toBe(true)
    expect(canOverlap(audio, item({ mode: 'focus' }))).toBe(false)
    expect(canOverlap(item({ mode: 'focus' }), audio)).toBe(false)
  })

  it('two routine items can overlap; two focus cannot unless alongside', () => {
    expect(canOverlap(item({ mode: 'routine' }), item({ mode: 'routine' }))).toBe(true)
    const a = item({ mode: 'focus' })
    const b = item({ mode: 'focus' })
    expect(canOverlap(a, b)).toBe(false)
    expect(canOverlap(a, { ...b, alongside: a.ref })).toBe(true)
    expect(canOverlap({ ...a, alongside: b.ref }, b)).toBe(true)
  })
})

describe('planDay', () => {
  it('places fixed items at their time', () => {
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120 })
    const plan = planDay({ items: [meeting], nowMin: null })
    expect(placedOf(plan, meeting.ref)).toMatchObject({ start: '09:00', end: '11:00', status: 'new' })
    expect(plan.conflicts).toEqual([])
  })

  it('places flexible in the first gap of its window with buffer', () => {
    const early = item({ fixed: true, start: '06:00', durationMin: 120 })
    const flex = item({ window: 'morning', durationMin: 60 })
    const plan = planDay({ items: [early, flex], nowMin: null })
    expect(placedOf(plan, flex.ref)).toMatchObject({ start: '08:10', end: '09:10' })
    expect(placedOf(plan, flex.ref)?.outsideWindow).toBeFalsy()
  })

  it('falls back outside the window when it does not fit', () => {
    const morning = item({ fixed: true, start: '06:00', durationMin: 360 })
    const flex = item({ window: 'morning', durationMin: 60 })
    const plan = planDay({ items: [morning, flex], nowMin: null })
    const p = placedOf(plan, flex.ref)
    expect(p?.outsideWindow).toBe(true)
    expect(p?.start).toBe('12:10')
  })

  it('places audio on top of a physical item', () => {
    const gym = item({ fixed: true, start: '07:00', durationMin: 60, mode: 'physical', title: 'Gimnasio' })
    const podcast = item({ mode: 'audio', durationMin: 30 })
    const plan = planDay({ items: [gym, podcast], nowMin: null })
    expect(placedOf(plan, podcast.ref)).toMatchObject({ start: '07:00', end: '07:30' })
    expect(placedOf(plan, podcast.ref)?.overlapsWith).toContain(gym.ref)
    expect(placedOf(plan, gym.ref)?.overlapsWith).toContain(podcast.ref)
  })

  it('keeps anchored existing items unless they clash with a fixed one', () => {
    const kept = item({ ref: 'session:a', source: 'session', start: '14:00', originalStart: '14:00' })
    const clashing = item({ ref: 'session:b', source: 'session', start: '09:30', originalStart: '09:30' })
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120 })
    const plan = planDay({ items: [kept, clashing, meeting], nowMin: null })
    expect(placedOf(plan, 'session:a')).toMatchObject({ start: '14:00', status: 'same' })
    const moved = placedOf(plan, 'session:b')
    expect(moved).toMatchObject({ status: 'moved', from: '09:30' })
    expect(moved && moved.start >= '11:00').toBe(true)
  })

  it('marks an existing item as moved when the AI changed its start', () => {
    const habit = item({ ref: 'habit:h:0', source: 'habit', start: '08:30', originalStart: '07:00' })
    const plan = planDay({ items: [habit], nowMin: null })
    expect(placedOf(plan, 'habit:h:0')).toMatchObject({ start: '08:30', status: 'moved', from: '07:00' })
  })

  it('reports fixed_overlap for two incompatible fixed items', () => {
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120 })
    const call = item({ fixed: true, start: '10:00', durationMin: 15 })
    const plan = planDay({ items: [call, meeting], nowMin: null })
    expect(plan.conflicts).toEqual([{ kind: 'fixed_overlap', a: meeting.ref, b: call.ref }])
  })

  it('does not report fixed_overlap when the person confirmed doing both', () => {
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120 })
    const call = item({ fixed: true, start: '10:00', durationMin: 15, alongside: meeting.ref })
    const plan = planDay({ items: [call, meeting], nowMin: null })
    expect(plan.conflicts).toEqual([])
    expect(placedOf(plan, call.ref)?.overlapsWith).toEqual([meeting.ref])
  })

  it('reports no_room with the largest free gap', () => {
    const a = item({ fixed: true, start: '06:00', durationMin: 420 }) // 06–13
    const b = item({ fixed: true, start: '14:00', durationMin: 480 }) // 14–22
    const thesis = item({ durationMin: 120 })
    const plan = planDay({ items: [a, b, thesis], nowMin: null })
    expect(placedOf(plan, thesis.ref)).toBeUndefined()
    // 13:00–14:00 con 10 min de margen a cada lado: 40 min libres.
    expect(plan.conflicts).toEqual([{ kind: 'no_room', ref: thesis.ref, freeMin: 40 }])
  })

  it('places flexible items after now', () => {
    const flex = item({ window: 'morning', durationMin: 60 })
    const plan = planDay({ items: [flex], nowMin: 900 })
    const p = placedOf(plan, flex.ref)
    expect(p?.start).toBe('15:00')
    expect(p?.outsideWindow).toBe(true)
  })

  it('rounds the start of a flexible item after now up to 5 minutes', () => {
    const flex = item({ durationMin: 30 })
    const plan = planDay({ items: [flex], nowMin: 902 })
    expect(placedOf(plan, flex.ref)?.start).toBe('15:05')
  })

  it('extends day bounds to include fixed items outside 06–22', () => {
    const early = item({ fixed: true, start: '05:00', durationMin: 30 })
    const plan = planDay({ items: [early], nowMin: null })
    expect(placedOf(plan, early.ref)).toMatchObject({ start: '05:00', end: '05:30' })
  })

  it('clamps items past midnight', () => {
    const late = item({ fixed: true, start: '23:30', durationMin: 60 })
    const plan = planDay({ items: [late], nowMin: null })
    expect(placedOf(plan, late.ref)).toMatchObject({ start: '23:30', end: '23:59' })
  })

  it('untimed items go to plan.untimed and are not placed', () => {
    const bank = item({ untimed: true })
    const plan = planDay({ items: [bank], nowMin: null })
    expect(plan.untimed).toEqual([bank.ref])
    expect(placedOf(plan, bank.ref)).toBeUndefined()
  })

  it('places windowed items before unwindowed and longer before shorter', () => {
    const short = item({ durationMin: 30 })
    const long = item({ durationMin: 90 })
    const evening = item({ window: 'evening', durationMin: 30 })
    const plan = planDay({ items: [short, long, evening], nowMin: null })
    expect(placedOf(plan, evening.ref)?.start).toBe('18:00')
    expect(placedOf(plan, long.ref)?.start).toBe('06:00')
    expect(placedOf(plan, short.ref)?.start).toBe('07:40')
  })
})

describe('conflictQuestions', () => {
  it('asks whether two clashing fixed items can be done together', () => {
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120, title: 'Reunión' })
    const call = item({ fixed: true, start: '10:00', durationMin: 15, title: 'Llamada al banco' })
    const items = [meeting, call]
    const [q] = conflictQuestions(planDay({ items, nowMin: null }), items)
    expect(q.id).toBe(`conflict:fixed_overlap:${meeting.ref}|${call.ref}`)
    expect(q.from).toBe('plan')
    expect(q.text).toBe('Reunión (9:00 am–11:00 am) y Llamada al banco (10:00 am) chocan. ¿Puedes hacerlas a la vez?')
    expect(q.options.map((o) => o.label)).toEqual([
      'Sí, a la vez',
      'Dejar Llamada al banco sin hora',
      'Quitar Llamada al banco',
    ])
  })

  it('only offers "a la vez" when the later item already existed', () => {
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120, title: 'Reunión' })
    const event = item({ ref: 'event:e1', source: 'event', fixed: true, start: '10:00', originalStart: '10:00', title: 'Cita' })
    const items = [meeting, event]
    const [q] = conflictQuestions(planDay({ items, nowMin: null }), items)
    expect(q.options.map((o) => o.label)).toEqual(['Sí, a la vez'])
  })

  it('offers split, shorten, untimed and drop when an item has no room', () => {
    const a = item({ fixed: true, start: '06:00', durationMin: 420 })
    const b = item({ fixed: true, start: '14:00', durationMin: 480 })
    const thesis = item({ durationMin: 120, title: 'Tesis' })
    const items = [a, b, thesis]
    const [q] = conflictQuestions(planDay({ items, nowMin: null }), items)
    expect(q.text).toBe('Tesis (2 h) no cabe completa hoy. ¿Qué hacemos?')
    // La mitad (60 min) no cabe en el hueco de 40: no se ofrece partirla.
    expect(q.options.map((o) => o.label)).toEqual([
      'Hacer solo 40 min',
      'Dejarla como tarea sin hora',
      'Pasarla a otro día',
    ])
  })

  it('offers splitting when half fits and omits shorten under 15 minutes', () => {
    const a = item({ fixed: true, start: '06:00', durationMin: 420 })
    const b = item({ fixed: true, start: '13:30', durationMin: 510 })
    const thesis = item({ durationMin: 20, title: 'Tesis' })
    const items = [a, b, thesis]
    // Hueco 13:00–13:30 con márgenes: 10 min. La mitad (10) cabe; 10 < 15 → sin "Hacer solo".
    const [q] = conflictQuestions(planDay({ items, nowMin: null }), items)
    expect(q.options.map((o) => o.label)).toEqual([
      'Partirla en dos bloques',
      'Dejarla como tarea sin hora',
      'Pasarla a otro día',
    ])
  })
})

describe('applyEffect', () => {
  it('alongside effect resolves the fixed_overlap', () => {
    const meeting = item({ fixed: true, start: '09:00', durationMin: 120 })
    const call = item({ fixed: true, start: '10:00', durationMin: 15 })
    const items = [meeting, call]
    const [q] = conflictQuestions(planDay({ items, nowMin: null }), items)
    const opt = q.options[0]
    if (!('effect' in opt)) throw new Error('expected effect')
    const next = applyEffect(items, opt.effect)
    expect(planDay({ items: next, nowMin: null }).conflicts).toEqual([])
  })

  it('split creates two halves rounded to 5 minutes', () => {
    const thesis = item({ durationMin: 95, title: 'Tesis' })
    const next = applyEffect([thesis], { kind: 'split', ref: thesis.ref })
    expect(next.map((i) => [i.ref, i.durationMin])).toEqual([
      [`${thesis.ref}#1`, 50],
      [`${thesis.ref}#2`, 50],
    ])
  })

  it('shorten, drop and untimed change the item', () => {
    const x = item({ durationMin: 90 })
    expect(applyEffect([x], { kind: 'shorten', ref: x.ref, minutes: 40 })[0].durationMin).toBe(40)
    expect(applyEffect([x], { kind: 'drop', ref: x.ref })).toEqual([])
    expect(applyEffect([x], { kind: 'untimed', ref: x.ref })[0].untimed).toBe(true)
  })
})

describe('planToOps', () => {
  const ops = (items: DayItem[], habits: Parameters<typeof planToOps>[2] = []) =>
    planToOps(planDay({ items, nowMin: null }), items, habits)

  it('creates an event for a new timed item without goal', () => {
    const gym = item({ fixed: true, start: '07:00', durationMin: 60, title: 'Gimnasio' })
    expect(ops([gym])).toEqual([{ kind: 'createEvent', ref: gym.ref, title: 'Gimnasio', start: '07:00', end: '08:00' }])
  })

  it('creates a session for a new item with goal', () => {
    const thesis = item({ fixed: true, start: '15:00', durationMin: 90, goalId: 'g1' })
    expect(ops([thesis])).toEqual([{ kind: 'createSession', ref: thesis.ref, goalId: 'g1', start: '15:00', durationMin: 90 }])
  })

  it('creates a task for an untimed item', () => {
    const bank = item({ untimed: true, title: 'Llamar al banco' })
    expect(ops([bank])).toEqual([{ kind: 'createTask', ref: bank.ref, title: 'Llamar al banco' }])
  })

  it('moves an event keeping its duration and records previous times', () => {
    const ev = item({
      ref: 'event:e1',
      source: 'event',
      fixed: true,
      start: '10:00',
      originalStart: '09:00',
      originalEnd: '09:45',
      durationMin: 45,
    })
    expect(ops([ev])).toEqual([
      { kind: 'moveEvent', ref: 'event:e1', eventId: 'e1', start: '10:00', end: '10:45', prevStart: '09:00', prevEnd: '09:45' },
    ])
  })

  it('keeps an event without end without end when it moves', () => {
    const ev = item({ ref: 'event:e3', source: 'event', fixed: true, start: '11:00', originalStart: '10:00', originalEnd: null })
    expect(ops([ev])[0]).toMatchObject({ kind: 'moveEvent', start: '11:00', end: null, prevEnd: null })
  })

  it('moves a session', () => {
    const s1 = item({ ref: 'session:k1', source: 'session', start: '18:00', originalStart: '17:00' })
    expect(ops([s1])).toEqual([{ kind: 'moveSession', ref: 'session:k1', sessionKey: 'k1', start: '18:00', prevStart: '17:00' }])
  })

  it('emits one moveHabit with all times when one of several repetitions moves', () => {
    const times = ['07:00', '13:00', '20:00']
    const reps = times.map((t, i) =>
      item({ ref: `habit:h1:${i}`, source: 'habit', start: i === 1 ? '14:00' : t, originalStart: t, durationMin: 15 }),
    )
    expect(ops(reps, [{ habitId: 'h1', times, hasOverride: false }])).toEqual([
      { kind: 'moveHabit', ref: 'habit:h1', habitId: 'h1', times: ['07:00', '14:00', '20:00'], prevTimes: null },
    ])
  })

  it('keeps the previous override as prevTimes', () => {
    const rep = item({ ref: 'habit:h1:0', source: 'habit', start: '09:00', originalStart: '08:00' })
    expect(ops([rep], [{ habitId: 'h1', times: ['08:00'], hasOverride: true }])[0]).toMatchObject({
      prevTimes: ['08:00'],
      times: ['09:00'],
    })
  })

  it('ignores unchanged items and dropped ones', () => {
    const same = item({ ref: 'event:e2', source: 'event', fixed: true, start: '09:00', originalStart: '09:00' })
    const dropped = applyEffect([item({ title: 'x' })], { kind: 'drop', ref: `new:${n}` })
    expect(ops([same, ...dropped])).toEqual([])
    expect(countChanges([])).toBe(0)
  })
})

describe('mergeAiItems', () => {
  it('keeps existing items the reply left out and replaces new ones', () => {
    const ev = item({ ref: 'event:e1', source: 'event', fixed: true, start: '09:00', originalStart: '09:00' })
    const oldNew = item({ ref: 'new:1' })
    const moved = { ...item({ ref: 'session:k', source: 'session', start: '18:00', originalStart: '17:00' }) }
    const prev = [ev, oldNew, { ...moved, start: '17:00' }]
    const fresh = item({ ref: 'new:2' })
    expect(mergeAiItems(prev, [fresh, moved]).map((i) => [i.ref, i.start])).toEqual([
      ['event:e1', '09:00'],
      ['session:k', '18:00'],
      ['new:2', null],
    ])
  })
})

describe('review fixes', () => {
  it('moves a new item with a preferred time before now to after now', () => {
    const gym = item({ start: '10:00', durationMin: 60 })
    const p = planDay({ items: [gym], nowMin: 900 }).placed.find((x) => x.ref === gym.ref)
    expect(p && p.start >= '15:00').toBe(true)
  })

  it('leaves an existing item without time out of the placement (no phantom change)', () => {
    const s1 = item({ ref: 'session:k', source: 'session', start: null, originalStart: null })
    const plan = planDay({ items: [s1], nowMin: null })
    expect(plan.placed).toEqual([])
    expect(plan.untimed).toEqual(['session:k'])
    expect(planToOps(plan, [s1], [])).toEqual([])
  })

  it('places an existing item without time once the AI gives it one', () => {
    const s1 = item({ ref: 'session:k', source: 'session', start: '18:00', originalStart: null })
    expect(planToOps(planDay({ items: [s1], nowMin: null }), [s1], [])).toEqual([
      { kind: 'moveSession', ref: 'session:k', sessionKey: 'k', start: '18:00', prevStart: null },
    ])
  })

  it('does not stack two audio items on the same host', () => {
    const gym = item({ fixed: true, start: '07:00', durationMin: 60, mode: 'physical' })
    const a1 = item({ mode: 'audio', durationMin: 30 })
    const a2 = item({ mode: 'audio', durationMin: 30 })
    const plan = planDay({ items: [gym, a1, a2], nowMin: null })
    const p1 = plan.placed.find((x) => x.ref === a1.ref)
    const p2 = plan.placed.find((x) => x.ref === a2.ref)
    expect(p1?.start).toBe('07:00')
    expect(p2?.start).not.toBe('07:00')
    expect(p2?.overlapsWith ?? []).not.toContain(a1.ref)
  })

  it('does not put an evening audio item on a morning host', () => {
    const gym = item({ fixed: true, start: '07:00', durationMin: 60, mode: 'physical' })
    const pod = item({ mode: 'audio', durationMin: 30, window: 'evening' })
    const p = planDay({ items: [gym, pod], nowMin: null }).placed.find((x) => x.ref === pod.ref)
    expect(p?.start).toBe('18:00')
  })

  it('gives unique ids to two overlap questions about the same later item', () => {
    const a = item({ ref: 'event:a', source: 'event', fixed: true, start: '09:00', durationMin: 120, originalStart: '09:00' })
    const b = item({ ref: 'event:b', source: 'event', fixed: true, start: '10:00', durationMin: 120, originalStart: '10:00' })
    const c = item({ fixed: true, start: '10:30', durationMin: 30 })
    const items = [a, b, c]
    const ids = conflictQuestions(planDay({ items, nowMin: null }), items).map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('offers only executable options for an existing item with no room', () => {
    const wall = item({ fixed: true, start: '06:00', durationMin: 960 })
    const s1 = item({ ref: 'session:k', source: 'session', start: '09:00', originalStart: '09:00', title: 'Inglés' })
    const items = [wall, s1]
    const [q] = conflictQuestions(planDay({ items, nowMin: null }), items)
    expect(q.options.map((o) => o.label)).toEqual(['Dejarla a su hora'])
    const opt = q.options[0]
    if (!('effect' in opt)) throw new Error('expected effect')
    const next = applyEffect(items, opt.effect)
    expect(next.find((i) => i.ref === 'session:k')).toMatchObject({ fixed: true, start: '09:00' })
  })

  it('ignores drop, untimed and shorten on existing sessions and habits', () => {
    const s1 = item({ ref: 'session:k', source: 'session', start: '09:00', originalStart: '09:00', durationMin: 45 })
    expect(applyEffect([s1], { kind: 'drop', ref: 'session:k' })).toEqual([s1])
    expect(applyEffect([s1], { kind: 'untimed', ref: 'session:k' })).toEqual([s1])
    expect(applyEffect([s1], { kind: 'shorten', ref: 'session:k', minutes: 10 })).toEqual([s1])
    const ev = item({ ref: 'event:e', source: 'event', fixed: true, start: '09:00', originalStart: '09:00', durationMin: 60 })
    expect(applyEffect([ev], { kind: 'shorten', ref: 'event:e', minutes: 30 })[0].durationMin).toBe(30)
  })
})
