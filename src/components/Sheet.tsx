import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type FormEventHandler,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/** px arrastrados hacia abajo que cierran la hoja al soltar. */
const DISMISS_AT = 80
/**
 * Red de seguridad: si `animationend` no llega (pestaña en segundo plano, el
 * panel se oculta a mitad de camino), la hoja se desmonta igual.
 */
const CLOSE_FALLBACK_MS = 600

/**
 * Hoja inferior con la misma gramática para toda la app: entra desde abajo,
 * SALE animada (no desaparece en cero frames), se arrastra desde el grabber,
 * atrapa el foco, cierra con Escape y bloquea el scroll del fondo.
 *
 * `children` recibe `close()`: es el cierre que anima y recién al terminar
 * llama a `onClose`. Los botones que guardan y hacen que el padre desmonte la
 * hoja siguen llamando a sus propios callbacks (ahí no hay nada que animar).
 */
export function Sheet({
  onClose,
  label,
  panelClassName = 'stack stack--lg',
  as = 'div',
  style,
  onSubmit,
  children,
}: {
  onClose: () => void
  /** aria-label del diálogo: el mismo texto del <h2> de la hoja. */
  label: string
  panelClassName?: string
  as?: 'div' | 'form'
  /** Estilos del panel (p. ej. el acento de nicho). */
  style?: CSSProperties
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** Recibe `close()` para los botones propios de la hoja. */
  children: (close: () => void) => ReactNode
}) {
  const panelRef = useRef<HTMLElement | null>(null)
  // Un callback estable sirve al <div> y al <form> sin castear el ref.
  const setPanel = useCallback((node: HTMLElement | null) => {
    panelRef.current = node
  }, [])
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const close = useCallback(() => setClosing(true), [])
  // Escape cierra por el mismo camino que el botón ✕: animando.
  useFocusTrap(panelRef, close)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => onCloseRef.current(), CLOSE_FALLBACK_MS)
    return () => window.clearTimeout(t)
  }, [closing])

  // Arrastre desde el grabber: el panel sigue al dedo; soltar lejos cierra,
  // cerca vuelve a su sitio con la transición. El gesto nace en el grabber —un
  // elemento real con touch-action: none— y no en el panel, que scrollea con
  // pan-y: si no, iOS se queda el gesto y cancela el puntero antes de empezar.
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (closing || !e.isPrimary) return
    drag.current = { startY: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const panel = panelRef.current
    if (!drag.current || !panel) return
    // Solo hacia abajo: tirar hacia arriba no estira la hoja.
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
    panel.style.transition = 'none'
    panel.style.transform = `translateY(${drag.current.dy}px)`
  }

  function onPointerUp() {
    const panel = panelRef.current
    if (!drag.current) return
    const { dy } = drag.current
    drag.current = null
    if (panel) panel.style.transition = ''
    // Si cierra, el transform inline queda como punto de partida de sheet-down.
    if (dy > DISMISS_AT) close()
    else if (panel) panel.style.transform = ''
  }

  function onAnimationEnd(e: ReactAnimationEvent<HTMLElement>) {
    // Ignoramos las animaciones de los hijos que burbujean hasta el panel.
    if (!closing || e.target !== e.currentTarget) return
    if (e.animationName !== 'sheet-down') return
    onCloseRef.current()
  }

  const panelProps = {
    className: `sheet__panel ${panelClassName}`,
    style,
    onAnimationEnd,
  }

  const grabber = (
    <div
      className="sheet__grabber"
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )

  return (
    <div
      className={`sheet${closing ? ' sheet--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="sheet__backdrop" onClick={close} />
      {as === 'form' ? (
        <form ref={setPanel} {...panelProps} onSubmit={onSubmit}>
          {grabber}
          {children(close)}
        </form>
      ) : (
        <div ref={setPanel} {...panelProps}>
          {grabber}
          {children(close)}
        </div>
      )}
    </div>
  )
}
