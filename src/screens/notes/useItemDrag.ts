import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

/** px hacia los lados que ponen o quitan la sangría al soltar. */
const INDENT_AT = 28
/** Cuánto se deja ver el desplazamiento lateral mientras se arrastra. */
const INDENT_PEEK = 24

interface Drag {
  id: string
  pointerId: number
  startX: number
  startY: number
  /** Filas sin marcar, en el orden en que se ven, con su posición al empezar. */
  rows: { id: string; el: HTMLElement; top: number; height: number }[]
  from: number
  to: number
  indent: boolean | null
}

/**
 * Arrastre de una fila por su asa dentro de `listRef` (filas con
 * `data-item-id`). La fila sigue al dedo; las demás se corren para hacerle
 * lugar. Al soltar llama `onDrop(id, toId, indent)`: `toId` es la fila cuyo
 * lugar ocupa (null si no se movió) e `indent` true/false si se arrastró hacia
 * un lado (null si no). Todo el movimiento va por transform.
 */
export function useItemDrag(
  listRef: RefObject<HTMLElement | null>,
  onDrop: (id: string, toId: string | null, indent: boolean | null) => void,
) {
  const drag = useRef<Drag | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function reset() {
    for (const row of drag.current?.rows ?? []) row.el.style.transform = ''
    drag.current = null
    setDraggingId(null)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>, id: string) {
    const list = listRef.current
    if (!list || !e.isPrimary || drag.current) return
    const rows = [...list.querySelectorAll<HTMLElement>('[data-item-id]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { id: el.dataset.itemId ?? '', el, top: r.top, height: r.height }
    })
    const from = rows.findIndex((r) => r.id === id)
    if (from === -1) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, rows, from, to: from, indent: null }
    setDraggingId(id)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const dy = e.clientY - d.startY
    const dx = e.clientX - d.startX
    const me = d.rows[d.from]
    const center = me.top + me.height / 2 + dy
    let to = 0
    d.rows.forEach((r, i) => {
      if (i !== d.from && r.top + r.height / 2 < center) to++
    })
    d.to = to
    d.indent = dx > INDENT_AT ? true : dx < -INDENT_AT ? false : null
    const step = me.height + gapOf(d.rows)
    d.rows.forEach((r, i) => {
      if (i === d.from) {
        const peek = Math.max(-INDENT_PEEK, Math.min(INDENT_PEEK, dx))
        r.el.style.transform = `translate(${peek}px, ${dy}px)`
      } else if (i > d.from && i <= to) r.el.style.transform = `translateY(${-step}px)`
      else if (i < d.from && i >= to) r.el.style.transform = `translateY(${step}px)`
      else r.el.style.transform = ''
    })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const toId = d.to === d.from ? null : d.rows[d.to].id
    const { id, indent } = d
    reset()
    if (toId !== null || indent !== null) onDrop(id, toId, indent)
  }

  return {
    draggingId,
    handleProps: (id: string) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, id),
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    }),
  }
}

/** Separación entre filas (la del gap del contenedor), medida de las dos primeras. */
function gapOf(rows: Drag['rows']): number {
  if (rows.length < 2) return 0
  return Math.max(0, rows[1].top - (rows[0].top + rows[0].height))
}
