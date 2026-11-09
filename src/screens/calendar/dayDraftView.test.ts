import { describe, expect, it } from 'vitest'
import { planDay, planToOps, type DayItem } from '@/domain/dayPlan'
import { appliedLabel, applyLabel, draftSections, isAddOnly } from '@/screens/calendar/dayDraftView'

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

const habit = (slot: number, start: string): DayItem =>
  item({ ref: `habit:h1:${slot}`, source: 'habit', title: 'Beber agua', fixed: false, start, originalStart: start, durationMin: 15 })

describe('draftSections', () => {
  const event = item({ ref: 'event:e1', source: 'event', title: 'Dentista', fixed: true, start: '09:00', originalStart: '09:00', durationMin: 60 })
  const talk = item({ title: 'Hablar con mi pareja', fixed: true, start: '20:30', durationMin: 120 })
  const bank = item({ title: 'Llamar al banco', untimed: true })
  const items = [habit(0, '06:25'), habit(1, '08:00'), habit(2, '11:00'), event, talk, bank]
  const sections = draftSections(planDay({ items, nowMin: null }), items)

  it('puts what will be added first, with its time', () => {
    expect(sections.added.map((r) => [r.item.title, r.start])).toEqual([['Hablar con mi pareja', '20:30']])
    expect(sections.addedUntimed.map((i) => i.title)).toEqual(['Llamar al banco'])
  })

  it('leaves the rest of the day apart, one line per habit with all its times', () => {
    expect(sections.rest).toEqual([
      { key: 'habit:h1', title: 'Beber agua', starts: ['06:25', '08:00', '11:00'] },
      { key: 'event:e1', title: 'Dentista', starts: ['09:00'] },
    ])
  })

  it('lists moved items in their own section', () => {
    const moved = { ...event, start: '15:00' }
    const s = draftSections(planDay({ items: [moved], nowMin: null }), [moved])
    expect(s.moved.map((r) => [r.item.title, r.start, r.from])).toEqual([['Dentista', '15:00', '09:00']])
    expect(s.rest).toEqual([])
  })
})

describe('apply labels', () => {
  const gym = item({ fixed: true, start: '07:00', durationMin: 60 })
  const read = item({ fixed: true, start: '21:00', durationMin: 30 })
  const ev = item({ ref: 'event:e2', source: 'event', fixed: true, start: '10:00', originalStart: '09:00', originalEnd: '10:00', durationMin: 60 })
  const opsOf = (items: DayItem[]) => planToOps(planDay({ items, nowMin: null }), items, [])

  it('says what it adds when it only adds', () => {
    expect(isAddOnly(opsOf([gym]))).toBe(true)
    expect(applyLabel(opsOf([gym]))).toBe('Agregar 1 cosa a mi agenda')
    expect(applyLabel(opsOf([gym, read]))).toBe('Agregar 2 cosas a mi agenda')
  })

  it('says "save changes" when it also moves something you had', () => {
    expect(isAddOnly(opsOf([gym, ev]))).toBe(false)
    expect(applyLabel(opsOf([gym, ev]))).toBe('Guardar 2 cambios')
  })

  it('names what was done after applying', () => {
    expect(appliedLabel(opsOf([gym]))).toBe('Agregué 1 cosa a tu día.')
    expect(appliedLabel(opsOf([gym, ev]))).toBe('Guardé 2 cambios en tu día.')
  })
})
