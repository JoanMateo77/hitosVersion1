import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import {
  itemGroups,
  mergeBackward,
  moveItem,
  pasteInto,
  setIndented,
  splitItem,
  newItemId,
  toggleItem,
  type EditItem,
  type ItemEdit,
} from '@/domain/noteItems'
import { IconCheck, IconChevronRight, IconClose, IconGrip, IconPlus } from '@/components/icons'
import { useItemDrag } from '@/screens/notes/useItemDrag'

/** Lo que el tachado queda a la vista antes de bajar a "Marcados". */
const SETTLE_MS = 650

const FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Update = (update: (prev: EditItem[]) => EditItem[]) => void

/**
 * Lista con casillas de una nota, al estilo Keep: Enter parte el elemento,
 * Backspace al inicio lo une con el anterior, pegar varias líneas crea varios,
 * Tab pone sangría. Lo marcado se tacha y baja a "Marcados (n)"; desmarcarlo lo
 * devuelve a su lugar. Cada fila se arrastra por su asa (o con las flechas).
 */
export function NoteChecklist({
  items,
  setItems,
  newItem,
  setNewItem,
  autoFocusAdd = false,
  onRemove,
}: Readonly<{
  items: EditItem[]
  setItems: Update
  newItem: string
  setNewItem: (text: string) => void
  autoFocusAdd?: boolean
  /** Quitar un elemento (la hoja ofrece deshacer). */
  onRemove: (index: number) => void
}>) {
  const inputs = useRef(new Map<string, HTMLTextAreaElement>())
  const handles = useRef(new Map<string, HTMLButtonElement>())
  const addRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const checks = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<
    { id: string; caret: number } | { handle: string } | { check: string } | null
  >(null)
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set())
  const [doneOpen, setDoneOpen] = useState(true)

  const { open, done } = itemGroups(items, settling)

  // Filas presentes al abrir: no entran animadas. Las que aparecen después
  // (nuevas, o que cambian de grupo) sí.
  const initialKeys = useRef<Set<string> | null>(null)
  if (initialKeys.current === null) {
    initialKeys.current = new Set(items.map((it) => `${it.done ? 'done' : 'open'}:${it.id}`))
  }
  useLayoutEffect(() => {
    const present = new Set([
      ...open.map((i) => `open:${items[i].id}`),
      ...done.map((i) => `done:${items[i].id}`),
    ])
    for (const key of initialKeys.current ?? []) if (!present.has(key)) initialKeys.current?.delete(key)
  })

  // Foco después de una edición (Enter, Backspace, pegar, mover).
  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    if ('handle' in target) {
      handles.current.get(target.handle)?.focus()
      return
    }
    if ('check' in target) {
      checks.current.get(target.check)?.focus()
      return
    }
    const input = inputs.current.get(target.id)
    if (!input) return
    input.focus()
    input.setSelectionRange(target.caret, target.caret)
  })

  // Alto de cada elemento según su texto. Con `field-sizing: content` lo hace el
  // CSS; donde no existe (Safari), se mide aquí para no cortar líneas.
  useLayoutEffect(() => {
    if (FIELD_SIZING) return
    for (const el of inputs.current.values()) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  })

  // Los temporizadores del tachado no sobreviven a la hoja.
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  function apply(edit: ItemEdit) {
    setItems(() => edit.items)
    pendingFocus.current = { id: edit.items[edit.focus.index].id, caret: edit.focus.caret }
  }

  function patch(index: number, text: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, text } : it)))
  }

  /**
   * Marcar o desmarcar. La fila cambia de grupo (arriba ↔ Marcados) y se vuelve
   * a montar: si la casilla tenía el foco, el foco la sigue. Lo recién marcado
   * (con sus hijos) se queda arriba tachado un instante y después baja.
   */
  function toggle(index: number) {
    const item = items[index]
    const next = toggleItem(items, index)
    setItems((prev) => toggleItem(prev, index))
    const focused = document.activeElement === checks.current.get(item.id)
    if (item.done || reducedMotion()) {
      if (focused) pendingFocus.current = { check: item.id }
      return
    }
    const marked = next.filter((it, i) => it.done && !items[i].done).map((it) => it.id)
    setSettling((prev) => new Set([...prev, ...marked]))
    timers.current.push(
      window.setTimeout(() => {
        if (document.activeElement === checks.current.get(item.id)) pendingFocus.current = { check: item.id }
        setSettling((prev) => {
          const rest = new Set(prev)
          for (const id of marked) rest.delete(id)
          return rest
        })
      }, SETTLE_MS),
    )
  }

  /** Posición del elemento entre los que se ven arriba (sin marcar). */
  const openPos = (index: number) => open.indexOf(index)

  function onItemKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (e.nativeEvent.isComposing) return
    const input = e.currentTarget
    const start = input.selectionStart ?? 0
    const atStart = start === 0 && (input.selectionEnd ?? 0) === 0
    const item = items[index]
    if (e.key === 'Enter') {
      e.preventDefault()
      apply(splitItem(items, index, start, newItemId))
    } else if (e.key === 'Backspace' && atStart) {
      // Primero quita la sangría; luego une con el anterior que se ve.
      if (item.indented) {
        e.preventDefault()
        setItems((prev) => setIndented(prev, index, false))
        return
      }
      // El grupo en que se ve (uno recién marcado sigue arriba un instante).
      const group = open.includes(index) ? open : done
      const prev = group[group.indexOf(index) - 1]
      if (prev === undefined) return
      e.preventDefault()
      apply(mergeBackward(items, index, prev))
    } else if (e.key === 'Tab' && !e.shiftKey && !item.indented && index > 0) {
      e.preventDefault()
      setItems((prev) => setIndented(prev, index, true))
    } else if (e.key === 'Tab' && e.shiftKey && item.indented) {
      e.preventDefault()
      setItems((prev) => setIndented(prev, index, false))
    }
  }

  function onItemPaste(e: ClipboardEvent<HTMLTextAreaElement>, index: number) {
    const input = e.currentTarget
    const edit = pasteInto(
      items,
      index,
      input.selectionStart ?? input.value.length,
      input.selectionEnd ?? input.value.length,
      e.clipboardData.getData('text'),
      newItemId,
    )
    if (!edit) return
    e.preventDefault()
    apply(edit)
  }

  function addLines(lines: string[]) {
    const created = lines.map((text) => ({ id: newItemId(), text, done: false, indented: false }))
    setItems((prev) => [...prev, ...created])
    setNewItem('')
  }

  function onAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (newItem.trim() !== '') addLines([newItem.trim()])
    } else if (e.key === 'Backspace' && newItem === '' && open.length > 0) {
      // Desde la fila vacía de agregar, Backspace vuelve al último elemento.
      e.preventDefault()
      const last = items[open[open.length - 1]]
      const input = inputs.current.get(last.id)
      input?.focus()
      input?.setSelectionRange(last.text.length, last.text.length)
    }
  }

  function onAddPaste(e: ClipboardEvent<HTMLInputElement>) {
    const lines = e.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '')
    if (lines.length <= 1) return
    e.preventDefault()
    addLines(newItem.trim() === '' ? lines : [newItem.trim() + lines[0], ...lines.slice(1)])
  }

  // Reordenar: por arrastre o con flechas sobre el asa.
  const drag = useItemDrag(listRef, (id, toId, indent) => {
    setItems((prev) => {
      let next = prev
      if (toId !== null) next = moveItem(next, next.findIndex((it) => it.id === id), next.findIndex((it) => it.id === toId))
      if (indent !== null) next = setIndented(next, next.findIndex((it) => it.id === id), indent)
      return next
    })
  })

  function onHandleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const pos = openPos(index)
    const id = items[index].id
    let to: number | undefined
    if (e.key === 'ArrowUp') to = open[pos - 1]
    else if (e.key === 'ArrowDown') to = open[pos + 1]
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setItems((prev) => setIndented(prev, index, e.key === 'ArrowRight'))
      return
    } else return
    e.preventDefault()
    if (to === undefined) return
    const target = to
    setItems((prev) => moveItem(prev, index, target))
    pendingFocus.current = { handle: id }
  }

  const rowClass = (it: EditItem, group: 'open' | 'done') => {
    const fresh = !initialKeys.current?.has(`${group}:${it.id}`)
    return [
      'note-items__row',
      it.indented ? 'is-indented' : '',
      fresh ? 'is-new' : '',
      drag.draggingId === it.id ? 'is-dragging' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  // Numeración según se ve (arriba y luego Marcados), no según el orden guardado.
  const shownOrder = [...open, ...done]
  const row = (index: number, group: 'open' | 'done') => {
    const it = items[index]
    const position = shownOrder.indexOf(index) + 1
    const label = it.text.trim() || `elemento ${position}`
    return (
      <li key={it.id} className={rowClass(it, group)} data-item-id={group === 'open' ? it.id : undefined}>
        {group === 'open' && (
          <button
            type="button"
            ref={(el) => {
              if (el) handles.current.set(it.id, el)
              else handles.current.delete(it.id)
            }}
            className="note-items__grip"
            aria-label={`Mover: ${label}`}
            aria-description="Arrastra, o usa las flechas: arriba y abajo para mover, a los lados para la sangría."
            onKeyDown={(e) => onHandleKeyDown(e, index)}
            {...drag.handleProps(it.id)}
          >
            <IconGrip size={16} />
          </button>
        )}
        <button
          type="button"
          ref={(el) => {
            if (el) checks.current.set(it.id, el)
            else checks.current.delete(it.id)
          }}
          className={`check note-items__check${it.done ? ' check--done' : ''}`}
          aria-label={it.done ? `Desmarcar: ${label}` : `Marcar: ${label}`}
          aria-pressed={it.done}
          onClick={() => toggle(index)}
        >
          <IconCheck size={16} />
        </button>
        {/* Varias líneas a la vista si el texto es largo; Enter crea otro elemento. */}
        <textarea
          ref={(el) => {
            if (el) inputs.current.set(it.id, el)
            else inputs.current.delete(it.id)
          }}
          rows={1}
          className={`note-items__text note-items__multi${it.done ? ' is-done' : ''}`}
          aria-label={`Elemento ${position}`}
          enterKeyHint="next"
          value={it.text}
          onChange={(e) => patch(index, e.target.value.replace(/\r?\n/g, ' '))}
          onKeyDown={(e) => onItemKeyDown(e, index)}
          onPaste={(e) => onItemPaste(e, index)}
        />
        <button
          type="button"
          className="iconbtn iconbtn--sm note-items__remove"
          aria-label={`Quitar: ${label}`}
          onClick={() => onRemove(index)}
        >
          <IconClose size={16} />
        </button>
      </li>
    )
  }

  return (
    <div className="note-list">
      <ul className={`note-items${drag.draggingId ? ' note-items--dragging' : ''}`} ref={listRef}>
        {open.map((i) => row(i, 'open'))}
        <li className="note-items__row note-items__add">
          <span className="note-items__plus" aria-hidden="true">
            <IconPlus size={16} />
          </span>
          <input
            ref={addRef}
            className="note-items__text"
            placeholder="Agregar elemento"
            aria-label="Agregar elemento"
            enterKeyHint="next"
            autoFocus={autoFocusAdd}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={onAddKeyDown}
            onPaste={onAddPaste}
          />
        </li>
      </ul>

      {done.length > 0 && (
        <section className="note-done" aria-label="Marcados">
          <button
            type="button"
            className="note-done__toggle"
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen((v) => !v)}
          >
            <IconChevronRight size={16} className="note-done__chevron" />
            Marcados ({done.length})
          </button>
          <div className={`note-done__body${doneOpen ? ' is-open' : ''}`} inert={!doneOpen}>
            <ul className="note-items note-items--done">{done.map((i) => row(i, 'done'))}</ul>
          </div>
        </section>
      )}
    </div>
  )
}
