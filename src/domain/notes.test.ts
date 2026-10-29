import { describe, expect, it } from 'vitest'
import type { Note } from '@/lib/types'
import { notePlace, notesForGoal, visibleNotes } from './notes'

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    userId: 'u1',
    title: null,
    body: '',
    items: null,
    place: 'inbox',
    goalId: null,
    area: null,
    pinned: false,
    archivedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...over,
  }
}

describe('notePlace', () => {
  it('devuelve el lugar guardado', () => {
    expect(notePlace(note({ place: 'ideas' }))).toBe('ideas')
    expect(notePlace(note({ place: 'goal', goalId: 'g1' }))).toBe('goal')
  })

  it('una nota de meta sin meta (borrada) vuelve a la bandeja', () => {
    expect(notePlace(note({ place: 'goal', goalId: null }))).toBe('inbox')
  })
})

describe('visibleNotes', () => {
  it('fijadas primero aunque sean más viejas; luego por updatedAt desc', () => {
    const vieja = note({ id: 'a', pinned: true, updatedAt: '2026-01-01T00:00:00.000Z' })
    const nueva = note({ id: 'b', updatedAt: '2026-10-05T00:00:00.000Z' })
    const media = note({ id: 'c', updatedAt: '2026-09-01T00:00:00.000Z' })
    expect(visibleNotes([media, nueva, vieja], 'inbox', '').map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it("'inbox' no incluye archivadas ni las de meta", () => {
    const ok = note({ id: 'ok' })
    const arch = note({ id: 'arch', archivedAt: '2026-10-02T00:00:00.000Z' })
    const deMeta = note({ id: 'meta', place: 'goal', goalId: 'g1' })
    const huerfana = note({ id: 'huerfana', place: 'goal', goalId: null })
    expect(visibleNotes([ok, arch, deMeta, huerfana], 'inbox', '').map((n) => n.id).sort()).toEqual([
      'huerfana',
      'ok',
    ])
    expect(visibleNotes([ok, arch, deMeta], 'archived', '').map((n) => n.id)).toEqual(['arch'])
  })

  it('filtra por metas, áreas e ideas', () => {
    const g = note({ id: 'g', place: 'goal', goalId: 'g1' })
    const a = note({ id: 'a', place: 'area', area: 'salud' })
    const i = note({ id: 'i', place: 'ideas' })
    expect(visibleNotes([g, a, i], 'goals', '').map((n) => n.id)).toEqual(['g'])
    expect(visibleNotes([g, a, i], 'areas', '').map((n) => n.id)).toEqual(['a'])
    expect(visibleNotes([g, a, i], 'ideas', '').map((n) => n.id)).toEqual(['i'])
  })

  it('busca sin tildes ni mayúsculas, en título, cuerpo e ítems', () => {
    const t = note({ id: 't', title: 'Café de la mañana' })
    const b = note({ id: 'b', body: 'comprar CAFÉ' })
    const it = note({ id: 'it', items: [{ text: 'molino de café', done: false }] })
    const otra = note({ id: 'o', body: 'té verde' })
    expect(visibleNotes([t, b, it, otra], 'inbox', 'cafe').map((n) => n.id).sort()).toEqual(['b', 'it', 't'])
  })
})

describe('notesForGoal', () => {
  it('devuelve las no archivadas de la meta con el mismo orden', () => {
    const a = note({ id: 'a', place: 'goal', goalId: 'g1', updatedAt: '2026-10-01T00:00:00.000Z' })
    const b = note({ id: 'b', place: 'goal', goalId: 'g1', updatedAt: '2026-10-03T00:00:00.000Z' })
    const arch = note({ id: 'x', place: 'goal', goalId: 'g1', archivedAt: '2026-10-04T00:00:00.000Z' })
    const otra = note({ id: 'y', place: 'goal', goalId: 'g2' })
    expect(notesForGoal([a, b, arch, otra], 'g1').map((n) => n.id)).toEqual(['b', 'a'])
  })
})
