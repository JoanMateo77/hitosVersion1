import type { NoteItem } from '@/lib/types'

/**
 * Elementos de una lista mientras se editan en la hoja. El id vive solo en
 * pantalla (llave estable para React, foco y arrastre); no se guarda, así
 * guardar no cambia el contenido de la nota.
 */
export interface EditItem {
  id: string
  text: string
  done: boolean
  indented: boolean
}

let idSeq = 0
/** Ids de pantalla para los elementos (no se guardan). */
export function newItemId(): string {
  idSeq += 1
  return `item-${idSeq}`
}

/** Dónde queda el cursor después de una edición. */
export interface ItemFocus {
  index: number
  caret: number
}

export interface ItemEdit {
  items: EditItem[]
  focus: ItemFocus
}

/** El primer elemento no tiene a quién colgarse: nunca lleva sangría. */
function normalize(items: EditItem[]): EditItem[] {
  const first = items[0]
  if (!first?.indented) return items
  return [{ ...first, indented: false }, ...items.slice(1)]
}

export function toEditItems(items: NoteItem[], newId: () => string): EditItem[] {
  return normalize(
    items.map((i) => ({ id: newId(), text: i.text, done: i.done, indented: i.indented === true })),
  )
}

/** Lo que se guarda: sin vacíos, sin ids, la sangría solo si la hay. */
export function fromEditItems(items: EditItem[]): NoteItem[] {
  return normalize(items.filter((i) => i.text.trim() !== '')).map((i) =>
    i.indented ? { text: i.text, done: i.done, indented: true } : { text: i.text, done: i.done },
  )
}

/** Enter: lo que está después del cursor pasa a un elemento nuevo debajo. */
export function splitItem(items: EditItem[], index: number, caret: number, newId: () => string): ItemEdit {
  const item = items[index]
  const head = { ...item, text: item.text.slice(0, caret) }
  const tail: EditItem = { id: newId(), text: item.text.slice(caret), done: false, indented: item.indented }
  return {
    items: [...items.slice(0, index), head, tail, ...items.slice(index + 1)],
    focus: { index: index + 1, caret: 0 },
  }
}

/**
 * Backspace al inicio de `index`: se une con `into` (el anterior visible; puede
 * no ser el anterior guardado si hay marcados en medio). Vacío, simplemente se
 * quita. El cursor queda donde se unieron.
 */
export function mergeBackward(items: EditItem[], index: number, into: number): ItemEdit {
  const target = items[into]
  const caret = target.text.length
  const merged = items
    .map((it, i) => (i === into ? { ...it, text: it.text + items[index].text } : it))
    .filter((_, i) => i !== index)
  return {
    items: normalize(merged),
    focus: { index: index < into ? into - 1 : into, caret },
  }
}

/**
 * Pegar varias líneas: la primera entra en el cursor, cada una de las demás es
 * un elemento nuevo y lo que estaba después del cursor queda al final. Con una
 * sola línea devuelve null: pega el navegador.
 */
export function pasteInto(
  items: EditItem[],
  index: number,
  start: number,
  end: number,
  pasted: string,
  newId: () => string,
): ItemEdit | null {
  const lines = pasted
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  if (lines.length <= 1) return null
  const item = items[index]
  const before = item.text.slice(0, start)
  const after = item.text.slice(end)
  const last = lines.length - 1
  const created = lines.map((line, i) => ({
    id: i === 0 ? item.id : newId(),
    text: (i === 0 ? before : '') + line + (i === last ? after : ''),
    done: i === 0 ? item.done : false,
    indented: item.indented,
  }))
  return {
    items: [...items.slice(0, index), ...created, ...items.slice(index + 1)],
    focus: { index: index + last, caret: lines[last].length },
  }
}

/** Índices de los hijos (con sangría) que siguen a un elemento sin sangría. */
function childrenOf(items: EditItem[], index: number): number[] {
  if (items[index].indented) return []
  const result: number[] = []
  for (let i = index + 1; i < items.length && items[i].indented; i++) result.push(i)
  return result
}

/** Marca o desmarca; un padre arrastra a sus hijos. */
export function toggleItem(items: EditItem[], index: number): EditItem[] {
  const done = !items[index].done
  const touched = new Set([index, ...childrenOf(items, index)])
  return items.map((it, i) => (touched.has(i) ? { ...it, done } : it))
}

export function uncheckAll(items: EditItem[]): EditItem[] {
  return items.map((it) => (it.done ? { ...it, done: false } : it))
}

export function removeChecked(items: EditItem[]): EditItem[] {
  return normalize(items.filter((it) => !it.done))
}

/**
 * Cómo se muestran: sin marcar arriba y marcados abajo, cada grupo en el orden
 * guardado (desmarcar devuelve el elemento a su lugar). `settling`: recién
 * marcados que se quedan arriba un instante para ver el tachado.
 */
export function itemGroups(
  items: EditItem[],
  settling: ReadonlySet<string> = new Set(),
): { open: number[]; done: number[] } {
  const open: number[] = []
  const done: number[] = []
  items.forEach((it, i) => (it.done && !settling.has(it.id) ? done : open).push(i))
  return { open, done }
}

/** Mueve el elemento `from` para que quede en la posición `to`. */
export function moveItem(items: EditItem[], from: number, to: number): EditItem[] {
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return normalize(next)
}

export function setIndented(items: EditItem[], index: number, indented: boolean): EditItem[] {
  if (indented && index === 0) return items
  return items.map((it, i) => (i === index ? { ...it, indented } : it))
}

export interface ItemPreview {
  shown: { index: number; text: string; done: boolean; indented: boolean }[]
  /** Sin marcar que no caben en la tarjeta. */
  hidden: number
  /** Marcados que no se muestran. */
  hiddenDone: number
  done: number
  total: number
}

/**
 * Lo que muestra la tarjeta: primero lo pendiente (hasta `max`), con el índice
 * guardado para poder marcarlo desde ahí. Si todo está marcado, los marcados.
 */
export function previewItems(items: NoteItem[], max: number): ItemPreview {
  const withText = items
    .map((it, index) => ({ index, text: it.text.trim(), done: it.done, indented: it.indented === true }))
    .filter((it) => it.text !== '')
  const open = withText.filter((it) => !it.done)
  const pool = open.length > 0 ? open : withText
  const shown = pool.slice(0, max)
  const shownDone = shown.filter((it) => it.done).length
  return {
    shown,
    hidden: open.length - (shown.length - shownDone),
    hiddenDone: withText.length - open.length - shownDone,
    done: withText.length - open.length,
    total: withText.length,
  }
}

export interface RemovedItem {
  index: number
  item: EditItem
}

/**
 * Deshacer un borrado: cada elemento vuelve a su posición (en orden), aunque
 * después se haya escrito más; si la lista se acortó, va al final.
 */
export function restoreRemoved(items: EditItem[], removed: RemovedItem[]): EditItem[] {
  const next = items.slice()
  for (const r of [...removed].sort((a, b) => a.index - b.index)) {
    next.splice(Math.min(r.index, next.length), 0, r.item)
  }
  return normalize(next)
}

/** Marcar desde la tarjeta: misma regla que en la hoja, sobre lo guardado. */
export function toggleStored(items: NoteItem[], index: number): NoteItem[] {
  return fromEditItems(toggleItem(toEditItems(items, () => ''), index))
}
