import { describe, expect, it } from 'vitest'
import { parseNoteDraft, serializeNoteDraft, type NoteDraft } from './noteDraft'

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
