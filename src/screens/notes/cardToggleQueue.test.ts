import { describe, expect, it } from 'vitest'
import type { Note, NoteItem } from '@/lib/types'
import { createCardToggleQueue } from './cardToggleQueue'

function note(items: NoteItem[]): Note {
  return {
    id: 'n1',
    userId: 'u1',
    title: 'Lista',
    body: '',
    items,
    place: 'inbox',
    goalId: null,
    area: null,
    pinned: false,
    archivedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  }
}

const three = () =>
  note([
    { text: 'a', done: false },
    { text: 'b', done: false },
    { text: 'c', done: false },
  ])

/** Guardado falso que se resuelve a mano, en orden. */
function fakeSave(fail: Set<number> = new Set()) {
  const calls: { items: NoteItem[]; resolve: () => void }[] = []
  let n = 0
  const save = (id: string, items: NoteItem[]) =>
    new Promise<Note>((resolve, reject) => {
      const call = n++
      calls.push({
        items,
        resolve: () => (fail.has(call) ? reject(new Error('offline')) : resolve({ ...note(items), id, updatedAt: 'server' })),
      })
    })
  return { save, calls }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const doneOf = (n: Note | undefined) => n?.items?.map((i) => i.done)

describe('createCardToggleQueue', () => {
  it('toques seguidos no se pisan: la respuesta del primero no borra el segundo', async () => {
    const { save, calls } = fakeSave()
    const shown: Note[] = []
    const failures: number[] = []
    const q = createCardToggleQueue(save, (n) => shown.push(n), () => failures.push(1))
    const start = three()

    q.toggle(start, 0)
    q.toggle(shown.at(-1)!, 1)
    expect(doneOf(shown.at(-1))).toEqual([true, true, false])

    await flush()

    calls[0].resolve()
    await flush()
    // Lo que se ve sigue con las dos marcas mientras falta guardar la segunda.
    expect(doneOf(shown.at(-1))).toEqual([true, true, false])
    q.toggle(shown.at(-1)!, 2)
    await flush()
    calls[1].resolve()
    await flush()
    await flush()
    calls[2].resolve()
    await flush()

    expect(calls.at(-1)?.items.map((i) => i.done)).toEqual([true, true, true])
    expect(doneOf(shown.at(-1))).toEqual([true, true, true])
    expect(failures).toHaveLength(0)
  })

  it('no cambia la fecha local (la tarjeta no salta)', async () => {
    const { save, calls } = fakeSave()
    const shown: Note[] = []
    const q = createCardToggleQueue(save, (n) => shown.push(n), () => undefined)
    q.toggle(three(), 0)
    await flush()
    calls[0].resolve()
    await flush()
    expect(shown.at(-1)?.updatedAt).toBe('2026-11-01T10:00:00.000Z')
  })

  it('si un guardado falla, vuelve a lo último guardado y avisa', async () => {
    const { save, calls } = fakeSave(new Set([0]))
    const shown: Note[] = []
    const failures: number[] = []
    const q = createCardToggleQueue(save, (n) => shown.push(n), () => failures.push(1))
    q.toggle(three(), 0)
    await flush()
    calls[0].resolve()
    await flush()
    expect(failures).toHaveLength(1)
    expect(doneOf(shown.at(-1))).toEqual([false, false, false])
  })
})
