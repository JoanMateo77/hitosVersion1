import { describe, expect, it } from 'vitest'
import { draftMatches, parseNoteDraft, serializeNoteDraft, type NoteDraft } from './noteDraft'

const draft: NoteDraft = {
  noteId: 'n1',
  goalId: null,
  title: 'Viaje',
  body: '',
  items: [{ text: 'Pasaporte', done: true }],
}

describe('noteDraft', () => {
  it('ida y vuelta conserva el borrador', () => {
    expect(parseNoteDraft(serializeNoteDraft(draft))).toEqual(draft)
  })

  it('sin borrador o con JSON roto devuelve null', () => {
    expect(parseNoteDraft(null)).toBeNull()
    expect(parseNoteDraft('{roto')).toBeNull()
    expect(parseNoteDraft('42')).toBeNull()
  })

  it('descarta campos con tipos inválidos', () => {
    expect(parseNoteDraft(JSON.stringify({ ...draft, body: 3 }))).toBeNull()
    expect(
      parseNoteDraft(JSON.stringify({ ...draft, items: [{ text: 'a' }, { text: 'b', done: false }] })),
    ).toEqual({ ...draft, items: [{ text: 'b', done: false }] })
  })

  it('acepta nota nueva (sin id) y texto (items null)', () => {
    const fresh: NoteDraft = { noteId: null, goalId: 'g1', title: '', body: 'hola', items: null }
    expect(parseNoteDraft(serializeNoteDraft(fresh))).toEqual(fresh)
  })
})

describe('draftMatches', () => {
  it('una nota existente se recupera solo al abrir esa misma nota', () => {
    expect(draftMatches(draft, 'n1', null)).toBe(true)
    expect(draftMatches(draft, 'n1', 'g9')).toBe(true)
    expect(draftMatches(draft, 'n2', null)).toBe(false)
    expect(draftMatches(draft, null, null)).toBe(false)
  })

  it('una nota nueva se recupera solo desde la misma pantalla (misma meta o la bandeja)', () => {
    const fromGoal: NoteDraft = { ...draft, noteId: null, goalId: 'g1' }
    expect(draftMatches(fromGoal, null, 'g1')).toBe(true)
    expect(draftMatches(fromGoal, null, null)).toBe(false)
    expect(draftMatches(fromGoal, null, 'g2')).toBe(false)
    const fromInbox: NoteDraft = { ...draft, noteId: null, goalId: null }
    expect(draftMatches(fromInbox, null, null)).toBe(true)
    expect(draftMatches(fromInbox, null, 'g1')).toBe(false)
    expect(draftMatches(fromInbox, 'n1', null)).toBe(false)
  })
})
