import { flushSync } from 'react-dom'

type WithVT = Document & { startViewTransition?: (cb: () => void) => unknown }

/** Ejecuta `fn` dentro de una View Transition si el navegador la soporta y el usuario no pidió menos movimiento. */
export function withViewTransition(fn: () => void): void {
  const doc = document as WithVT
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fn()
    return
  }
  doc.startViewTransition(() => {
    flushSync(fn)
  })
}
