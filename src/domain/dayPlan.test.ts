import { describe, expect, it } from 'vitest'
import { canOverlap, planDay, type DayItem } from '@/domain/dayPlan'

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
