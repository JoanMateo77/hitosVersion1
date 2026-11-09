import { describe, expect, it } from 'vitest'
import type { NoteItem } from '@/lib/types'
import {
  fromEditItems,
  itemGroups,
  mergeBackward,
  moveItem,
  pasteInto,
  previewItems,
  removeChecked,
  restoreRemoved,
  setIndented,
  splitItem,
  toEditItems,
  toggleItem,
  toggleStored,
  uncheckAll,
  type EditItem,
} from './noteItems'

function ids() {
  let n = 0
  return () => `n${n++}`
}

function edit(spec: string): EditItem[] {
  // "a, [x]b, >c" → a; b marcado; c con sangría.
  return spec.split(',').map((raw, i) => {
    let text = raw.trim()
    const indented = text.startsWith('>')
    if (indented) text = text.slice(1)
    const done = text.startsWith('[x]')
    if (done) text = text.slice(3)
    return { id: `i${i}`, text, done, indented }
  })
}

const texts = (items: EditItem[]) => items.map((i) => i.text)

describe('toEditItems / fromEditItems', () => {
  it('da un id a cada elemento y el primero nunca queda con sangría', () => {
    const items: NoteItem[] = [
      { text: 'a', done: false, indented: true },
      { text: 'b', done: true, indented: true },
    ]
    expect(toEditItems(items, ids())).toEqual([
      { id: 'n0', text: 'a', done: false, indented: false },
      { id: 'n1', text: 'b', done: true, indented: true },
    ])
  })

  it('al guardar quita los vacíos, no guarda ids y solo escribe la sangría si la hay', () => {
    expect(fromEditItems(edit('a, ,  >b, [x]c'))).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: false, indented: true },
      { text: 'c', done: true },
    ])
  })

  it('al guardar, si el primero con texto tenía sangría, la pierde', () => {
    expect(fromEditItems(edit(' , >b'))).toEqual([{ text: 'b', done: false }])
  })
})

describe('splitItem (Enter)', () => {
  it('parte en el cursor y lo de después va a un elemento nuevo debajo', () => {
    const r = splitItem(edit('leche y pan, huevos'), 0, 6, ids())
    expect(texts(r.items)).toEqual(['leche ', 'y pan', 'huevos'])
    expect(r.items[1]).toMatchObject({ id: 'n0', done: false })
    expect(r.focus).toEqual({ index: 1, caret: 0 })
  })

  it('al final del texto crea un elemento vacío y conserva la sangría', () => {
    const r = splitItem(edit('a, >b'), 1, 1, ids())
    expect(texts(r.items)).toEqual(['a', 'b', ''])
    expect(r.items[2].indented).toBe(true)
  })
})

describe('mergeBackward (Backspace al inicio)', () => {
  it('un elemento vacío se quita y el foco va al final del anterior', () => {
    const r = mergeBackward(edit('pan, '), 1, 0)
    expect(texts(r.items)).toEqual(['pan'])
    expect(r.focus).toEqual({ index: 0, caret: 3 })
  })

  it('con texto, se une al anterior y el cursor queda en la unión', () => {
    const r = mergeBackward(edit('pan, queso'), 1, 0)
    expect(texts(r.items)).toEqual(['panqueso'])
    expect(r.focus).toEqual({ index: 0, caret: 3 })
  })

  it('se une con el anterior visible aunque haya marcados en medio', () => {
    const r = mergeBackward(edit('a, [x]b, c'), 2, 0)
    expect(texts(r.items)).toEqual(['ac', 'b'])
    expect(r.focus).toEqual({ index: 0, caret: 1 })
  })
})

describe('pasteInto', () => {
  it('una sola línea no cambia nada (pega el navegador)', () => {
    expect(pasteInto(edit('a'), 0, 1, 1, 'hola', ids())).toBeNull()
  })

  it('varias líneas: la primera se pega en el cursor y el resto son elementos nuevos', () => {
    const r = pasteInto(edit('compr|ar, z'.replace('|', '')), 0, 5, 5, 'leche\r\n\npan\nhuevos', ids())
    expect(r && texts(r.items)).toEqual(['comprleche', 'pan', 'huevosar', 'z'])
    expect(r?.focus).toEqual({ index: 2, caret: 6 })
  })

  it('reemplaza lo seleccionado', () => {
    const r = pasteInto(edit('xxBORRARxx'), 0, 2, 8, 'a\nb', ids())
    expect(r && texts(r.items)).toEqual(['xxa', 'bxx'])
  })
})

describe('toggleItem', () => {
  it('marca un elemento', () => {
    expect(toggleItem(edit('a, b'), 1)[1].done).toBe(true)
  })

  it('marcar un padre marca sus hijos; desmarcarlo los desmarca', () => {
    const marked = toggleItem(edit('a, >b, >c, d'), 0)
    expect(marked.map((i) => i.done)).toEqual([true, true, true, false])
    expect(toggleItem(marked, 0).map((i) => i.done)).toEqual([false, false, false, false])
  })

  it('marcar un hijo no toca al padre ni a sus hermanos', () => {
    expect(toggleItem(edit('a, >b, >c'), 1).map((i) => i.done)).toEqual([false, true, false])
  })
})

describe('uncheckAll / removeChecked', () => {
  it('desmarca todo', () => {
    expect(uncheckAll(edit('[x]a, b, [x]c')).every((i) => !i.done)).toBe(true)
  })

  it('borra los marcados y el nuevo primero pierde la sangría', () => {
    const r = removeChecked(edit('[x]a, >b, c'))
    expect(texts(r)).toEqual(['b', 'c'])
    expect(r[0].indented).toBe(false)
  })
})

describe('itemGroups', () => {
  it('separa sin marcar y marcados conservando el orden guardado', () => {
    expect(itemGroups(edit('a, [x]b, c, [x]d'))).toEqual({ open: [0, 2], done: [1, 3] })
  })

  it('un elemento recién marcado que sigue asentándose se queda arriba', () => {
    expect(itemGroups(edit('a, [x]b'), new Set(['i1']))).toEqual({ open: [0, 1], done: [] })
  })
})

describe('moveItem', () => {
  it('mueve un elemento a otra posición', () => {
    expect(texts(moveItem(edit('a, b, c'), 0, 2))).toEqual(['b', 'c', 'a'])
    expect(texts(moveItem(edit('a, b, c'), 2, 0))).toEqual(['c', 'a', 'b'])
  })

  it('el que queda primero pierde la sangría', () => {
    const r = moveItem(edit('a, >b'), 1, 0)
    expect(texts(r)).toEqual(['b', 'a'])
    expect(r[0].indented).toBe(false)
  })
})

describe('setIndented', () => {
  it('pone y quita la sangría', () => {
    expect(setIndented(edit('a, b'), 1, true)[1].indented).toBe(true)
    expect(setIndented(edit('a, >b'), 1, false)[1].indented).toBe(false)
  })

  it('el primero no puede tener sangría', () => {
    expect(setIndented(edit('a, b'), 0, true)[0].indented).toBe(false)
  })
})

describe('previewItems (tarjeta)', () => {
  const items: NoteItem[] = [
    { text: 'a', done: true },
    { text: 'b', done: false },
    { text: '', done: false },
    { text: 'c', done: false },
    { text: 'd', done: false },
    { text: 'e', done: false },
    { text: 'f', done: false },
  ]

  it('muestra hasta 4 sin marcar, con su índice real, y cuenta lo demás', () => {
    const p = previewItems(items, 4)
    expect(p.shown.map((s) => [s.index, s.text])).toEqual([
      [1, 'b'],
      [3, 'c'],
      [4, 'd'],
      [5, 'e'],
    ])
    expect(p).toMatchObject({ hidden: 1, hiddenDone: 1, done: 1, total: 6 })
  })

  it('si todo está marcado, muestra los marcados', () => {
    const p = previewItems(
      [
        { text: 'a', done: true },
        { text: 'b', done: true },
      ],
      4,
    )
    expect(p.shown.map((s) => s.text)).toEqual(['a', 'b'])
    expect(p).toMatchObject({ hidden: 0, hiddenDone: 0, done: 2, total: 2 })
  })
})

describe('restoreRemoved (deshacer)', () => {
  it('devuelve cada elemento quitado a su lugar aunque la lista haya cambiado', () => {
    const before = edit('a, [x]b, c, [x]d')
    const removed = [
      { index: 1, item: before[1] },
      { index: 3, item: before[3] },
    ]
    const after = [...removeChecked(before), { id: 'z', text: 'e', done: false, indented: false }]
    expect(texts(restoreRemoved(after, removed))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('si la lista se acortó, el elemento vuelve al final', () => {
    const r = restoreRemoved(edit('a'), [{ index: 5, item: edit('x')[0] }])
    expect(texts(r)).toEqual(['a', 'x'])
  })
})

describe('toggleStored (marcar desde la tarjeta)', () => {
  it('marca por índice guardado y arrastra a los hijos', () => {
    expect(
      toggleStored(
        [
          { text: 'a', done: false },
          { text: 'b', done: false, indented: true },
          { text: 'c', done: false },
        ],
        0,
      ),
    ).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: true, indented: true },
      { text: 'c', done: false },
    ])
  })
})
