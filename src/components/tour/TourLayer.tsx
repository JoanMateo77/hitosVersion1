import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IA_TOUR } from '@/components/tour/tourState'
import { iaTour, useIaTourIndex } from '@/components/tour/iaTour'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 6
const GAP = 12
const MARGIN = 12
/** Seguir cada fotograma al empezar un paso (la hoja entra en ~320 ms). */
const BURST_MS = 700
/** …y un rato después de cada scroll o cambio de tamaño. */
const WAKE_MS = 300
const POLL_MS = 250
/** Lo que dura el deslizamiento del recuadro entre pasos (--dur-layout). */
const MOVE_MS = 320

/** Elemento visible con ese `data-tour`, o null si no está en pantalla. */
function findTarget(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** ¿Hay otra hoja o diálogo abierto encima (que tapa el elemento)? */
function coveredByDialog(el: HTMLElement): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"]:not(.tour-bubble), [role="alertdialog"]')
  return [...dialogs].some((d) => !d.contains(el))
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  return a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)
}

/**
 * Tour guiado de "Organizar con IA": oscurece la pantalla salvo el elemento del
 * paso y muestra un globo con qué hacer. No es modal: se puede tocar el
 * elemento señalado (el primer paso avanza así). Si el elemento no está en
 * pantalla, espera. Saltar o Escape lo cierra para siempre.
 */
export function TourLayer() {
  const index = useIaTourIndex()
  const step = index === null ? null : IA_TOUR.steps[index]
  const [rect, setRect] = useState<Rect | null>(null)
  const [bubbleHeight, setBubbleHeight] = useState(160)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  // Sigue la posición del elemento. Cada fotograma solo en ráfagas cortas (al
  // cambiar de paso, mientras entra la hoja, al hacer scroll o cambiar el
  // tamaño); el resto del tiempo basta mirar cada 250 ms.
  useEffect(() => {
    if (!step) return
    let frame = 0
    let timer = 0
    let burstUntil = performance.now() + BURST_MS
    let last: Rect | null = null
    const later = IA_TOUR.steps.slice((index ?? 0) + 1)
    const tick = () => {
      const el = findTarget(step.target)
      const r = el && !coveredByDialog(el) ? el.getBoundingClientRect() : null
      // Si el paso no está en pantalla pero uno siguiente sí (la hoja se abrió
      // por otro camino, p. ej. desde Hoy con ?organizar=1), salta a ese.
      const ahead = r ? null : later.find((s) => findTarget(s.target))
      if (ahead) {
        iaTour().start(ahead.target)
        return
      }
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      if (!sameRect(last, next)) {
        last = next
        setRect(next)
      }
      if (performance.now() < burstUntil) frame = requestAnimationFrame(tick)
      else timer = window.setTimeout(tick, POLL_MS)
    }
    const wake = () => {
      const idle = performance.now() >= burstUntil
      burstUntil = performance.now() + WAKE_MS
      if (!idle) return
      window.clearTimeout(timer)
      frame = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', wake, { capture: true, passive: true })
    window.addEventListener('resize', wake)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('scroll', wake, { capture: true })
      window.removeEventListener('resize', wake)
    }
  }, [step, index])

  // El recuadro se desliza solo al cambiar de paso; al seguir un scroll va pegado.
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    if (index === null) return
    setMoving(true)
    const t = window.setTimeout(() => setMoving(false), MOVE_MS)
    return () => window.clearTimeout(t)
  }, [index])

  // Tocar el elemento señalado avanza (paso 1: abre la hoja y sigue adentro).
  useEffect(() => {
    if (!step?.advanceOnTargetClick) return
    const onClick = (e: MouseEvent) => {
      const el = findTarget(step.target)
      if (el && e.target instanceof Node && el.contains(e.target)) iaTour().next()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [step])

  const visible = step !== null && rect !== null
  useEffect(() => {
    // Solo con el globo a la vista: si no, Escape es de la hoja de abajo.
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Que Escape cierre solo el tour, no la hoja que está debajo.
        e.stopPropagation()
        iaTour().finish()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [visible])

  // Alto real del globo (cambia con el texto del paso) para decidir arriba o abajo.
  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleHeight(bubbleRef.current.offsetHeight)
  }, [index, visible])
  // Foco en el globo al llegar a un paso, salvo donde la persona va a escribir.
  useEffect(() => {
    if (visible && !step?.typing) primaryRef.current?.focus({ preventScroll: true })
  }, [visible, step])

  if (!step || !rect || index === null) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(320, vw - MARGIN * 2)
  const below = rect.top + rect.height + PAD + GAP
  const fitsBelow = below + bubbleHeight <= vh - MARGIN
  const top = fitsBelow ? below : Math.max(MARGIN, rect.top - PAD - GAP - bubbleHeight)
  const left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - width / 2), vw - width - MARGIN)
  const last = index === IA_TOUR.steps.length - 1
  const titleId = 'tour-title'

  return (
    // Sin aria-live: el globo es un diálogo y recibe el foco (se anunciaría dos veces).
    <div className="tour">
      <div
        className={`tour-spot${moving ? ' tour-spot--moving' : ''}`}
        aria-hidden="true"
        // Posición por transform (compositor); el tamaño solo cambia entre pasos.
        style={{
          transform: `translate(${rect.left - PAD}px, ${rect.top - PAD}px)`,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
        }}
      />
      <div
        // Un globo por paso: la entrada se repite al avanzar.
        key={index}
        ref={bubbleRef}
        className={`tour-bubble${fitsBelow ? '' : ' tour-bubble--above'}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        style={{ top, left, width }}
      >
        <p className="tour-bubble__count">
          {index + 1} de {IA_TOUR.steps.length}
        </p>
        <p className="tour-bubble__title" id={titleId}>
          {step.title}
        </p>
        <p className="tour-bubble__body">{step.body}</p>
        <div className="tour-bubble__actions">
          <button type="button" className="btn--link tour-bubble__skip" onClick={() => iaTour().finish()}>
            {last ? 'Cerrar' : 'Saltar guía'}
          </button>
          {step.advanceOnTargetClick ? (
            <span className="tour-bubble__hint">Toca el botón para seguir</span>
          ) : (
            <button ref={primaryRef} type="button" className="btn btn--primary btn--sm" onClick={() => iaTour().next()}>
              {last ? 'Entendido' : 'Siguiente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
