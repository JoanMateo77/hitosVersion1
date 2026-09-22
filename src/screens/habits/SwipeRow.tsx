import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { IconCheck } from '@/components/icons'

/**
 * Fila que se desliza, con la gramática de iOS:
 * - A la IZQUIERDA revela acciones de 88px ancladas a la derecha (saltar hoy,
 *   archivar). Solo una fila abierta a la vez; tocar fuera la cierra.
 * - A la DERECHA descubre "✓ Hecho": al soltar pasados 96px se marca.
 *
 * El eje se decide con los primeros 8px de movimiento: si manda el vertical se
 * suelta el gesto y la pantalla scrollea normal (`touch-action: pan-y` hace lo
 * propio con el scroll nativo). Ninguna acción vive SOLO aquí: todas están
 * también en el detalle del hábito, porque un gesto no se puede descubrir ni
 * usar con teclado.
 */

/** Ancho de cada acción revelada (mockup). */
const ACTION_WIDTH = 88
/** Desde cuánto arrastre a la derecha se marca al soltar. */
const COMPLETE_AT = 96
/** Arrastre que decide el eje del gesto. */
const AXIS_LOCK = 8

export interface SwipeAction {
  key: string
  label: string
  icon: ReactNode
  /** `danger` pinta la acción en rojo (archivar). */
  tone?: 'neutral' | 'danger'
  onAction: () => void
}

interface SwipeRowProps {
  /** Acciones reveladas al deslizar a la izquierda (0–2). */
  actions: SwipeAction[]
  /** Si se pasa, deslizar a la derecha marca el hábito. */
  onComplete?: () => void
  /** La fila abierta la decide el padre: así solo hay una a la vez. */
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** ¿El usuario pidió menos movimiento? Entonces el retorno es instantáneo. */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SwipeRow({ actions, onComplete, open, onOpenChange, children }: SwipeRowProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const axisRef = useRef<'x' | 'y' | null>(null)
  const movedRef = useRef(false)
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)

  const openX = -actions.length * ACTION_WIDTH

  // El aviso al padre se lee siempre del render actual: así el listener del
  // documento no se vuelve a suscribir por una función nueva en cada render.
  const notifyRef = useRef(onOpenChange)
  useEffect(() => {
    notifyRef.current = onOpenChange
  })

  // El reposo lo manda el padre: si cierra la fila desde fuera, vuelve sola.
  useEffect(() => {
    setSettling(!prefersReducedMotion())
    setDx(open ? openX : 0)
  }, [open, openX])

  // Tocar fuera cierra la fila abierta (la misma regla que una hoja).
  useEffect(() => {
    if (!open) return
    function onDocumentDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      notifyRef.current(false)
    }
    document.addEventListener('pointerdown', onDocumentDown)
    return () => document.removeEventListener('pointerdown', onDocumentDown)
  }, [open])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    startRef.current = { x: event.clientX, y: event.clientY }
    axisRef.current = null
    movedRef.current = false
    setSettling(false)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current
    if (start === null) return
    const moveX = event.clientX - start.x
    const moveY = event.clientY - start.y
    if (axisRef.current === null) {
      if (Math.abs(moveX) < AXIS_LOCK && Math.abs(moveY) < AXIS_LOCK) return
      if (Math.abs(moveY) >= Math.abs(moveX)) {
        // Manda el vertical: soltamos el gesto y la pantalla scrollea.
        startRef.current = null
        axisRef.current = 'y'
        return
      }
      axisRef.current = 'x'
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    movedRef.current = true
    const base = open ? openX : 0
    setDx(clamp(base + moveX, openX, onComplete ? COMPLETE_AT + 24 : 0))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    startRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (axisRef.current !== 'x') return
    axisRef.current = null
    setSettling(!prefersReducedMotion())
    if (onComplete && dx >= COMPLETE_AT) {
      setDx(0)
      onOpenChange(false)
      onComplete()
      return
    }
    // Media acción arrastrada ya cuenta como "quiero verlas".
    if (actions.length > 0 && dx <= -ACTION_WIDTH / 2) {
      setDx(openX)
      onOpenChange(true)
      return
    }
    setDx(0)
    onOpenChange(false)
  }

  /** Un arrastre no es un toque, y con la fila abierta el toque solo cierra. */
  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (movedRef.current) {
      movedRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (open) {
      event.preventDefault()
      event.stopPropagation()
      onOpenChange(false)
    }
  }

  return (
    <div className="hab-swipe" ref={rootRef}>
      {onComplete && (
        <div className="hab-swipe__done" aria-hidden="true">
          <IconCheck size={22} />
          <span>Hecho</span>
        </div>
      )}
      {actions.length > 0 && (
        <div className="hab-swipe__actions" aria-hidden={!open}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`hab-swipe__action${action.tone === 'danger' ? ' hab-swipe__action--danger' : ''}`}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onOpenChange(false)
                action.onAction()
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className={`hab-swipe__front${settling ? ' is-settling' : ''}`}
        style={{ '--hab-dx': `${dx}px` } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  )
}
